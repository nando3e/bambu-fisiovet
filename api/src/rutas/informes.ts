// Informes por voz: notas dictadas, propuestas de informe (con IA o a mano),
// regenerar, editar, confirmar e informes publicados. Nada sale sin
// confirmar (principio duro 3): proponer/confirmar con lease atómico, editar
// es volver a proponer y el modelo no tiene forma de confirmar.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exigirSesion, ROLES_BAMBU } from '../auth/permisos.ts';
import type { Sesion } from '../auth/sesion.ts';
import { enTransaccion, type Consultable } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import { decidirTransicion } from '../dominio/estados-caso.ts';
import { ambitoCaso } from '../dominio/visibilidad.ts';
import { conflicto, datosIncorrectos, ErrorHttp, noEncontrado } from '../errores.ts';
import { esquemaInforme, ESQUEMA_JSON, informeVacio, TIPOS_INFORME, type DatosInforme, type TipoInforme } from '../informes/esquema.ts';
import { anonimizar } from '../informes/anonimizar.ts';
import { construirPrompt } from '../informes/prompt.ts';
import { renderInforme, TITULO_INFORME } from '../informes/render.ts';
import { modelosDisponibles } from '../llm/factory.ts';
import { ErrorModelo } from '../llm/tipos.ts';
import { avisarCaso, casoVisible, nombrePersona, tocarActividad } from '../servicios/casos.ts';
import { mensajeSistema } from '../servicios/hilo.ts';
import { idDeRuta, validar, type Deps } from './index.ts';

const TAMANO_MAXIMO_AUDIO = 10 * 1024 * 1024;

/** Términos del oficio que ayudan al transcriptor (además del paciente). */
const VOCABULARIO_BASE = [
  'TENS', 'làser', 'hidroteràpia', 'cinta subaquàtica', 'propiocepció', 'goniometria', 'TPLO', 'TTA',
  'hèrnia discal', 'displàsia', 'artrosi', 'electroestimulació', 'magnetoteràpia', 'ultrasons', 'massoteràpia',
  'cinesiteràpia', 'paraparèsia', 'atàxia', 'lligament creuat',
];

/** Estados en los que un caso admite informes. */
const ADMITE_INFORMES = ['aceptada', 'en_tratamiento', 'alta', 'abandonada'];

/** Tipo de audio por contenido; el navegador graba WebM u Ogg, Safari MP4. */
function tipoDeAudio(datos: Buffer): { ext: string; mime: string } | null {
  if (datos.length >= 4 && datos.readUInt32BE(0) === 0x1a45dfa3) return { ext: 'webm', mime: 'audio/webm' };
  if (datos.length >= 4 && datos.toString('ascii', 0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (datos.length >= 12 && datos.toString('ascii', 4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (datos.length >= 12 && datos.toString('ascii', 0, 4) === 'RIFF' && datos.toString('ascii', 8, 12) === 'WAVE') {
    return { ext: 'wav', mime: 'audio/wav' };
  }
  if (datos.length >= 3 && (datos.toString('ascii', 0, 3) === 'ID3' || (datos[0] === 0xff && (datos[1]! & 0xe0) === 0xe0))) {
    return { ext: 'mp3', mime: 'audio/mpeg' };
  }
  return null;
}

/** Un fallo del modelo con su código y un mensaje que se entiende. */
function errorDeModelo(error: unknown): never {
  if (error instanceof ErrorModelo) {
    throw new ErrorHttp(error.motivo === 'rechazo' ? 422 : 502, error.message, { motivo: error.motivo });
  }
  throw error;
}

export async function rutasInformes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, config, cola } = deps;
  const audios = resolve(config.RUTA_DATOS, 'audios');
  const modelos = () => modelosDisponibles(pool, config, deps.ia);

  app.get('/ia/estado', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const m = await modelos();
    return { redactor: m.redactor !== null, transcriptor: m.transcriptor !== null };
  });

  // --- Transcripciones ---

  async function transcribir(id: number, sesion: Sesion) {
    const { rows } = await pool.query<{ ruta_audio: string | null; mime: string; caso_id: number }>(
      'SELECT ruta_audio, mime, caso_id FROM transcripciones WHERE id = $1', [id],
    );
    const t = rows[0]!;
    if (!t.ruta_audio) throw conflicto('L’àudio ja no es conserva: escriu el text a mà.');
    const caso = await casoVisible(pool, sesion, t.caso_id);
    const { rows: pac } = await pool.query<{ raza: string | null }>('SELECT raza FROM pacientes WHERE id = $1', [caso.paciente_id]);
    const { transcriptor } = await modelos();
    if (!transcriptor) throw conflicto('No hi ha cap servei de transcripció configurat.');
    try {
      const r = await transcriptor.transcribir({
        audio: await readFile(join(audios, t.ruta_audio)),
        nombre: t.ruta_audio,
        mime: t.mime,
        vocabulario: [caso.paciente_nombre, pac[0]?.raza, ...VOCABULARIO_BASE].filter(Boolean).join(', '),
      });
      await pool.query(
        `UPDATE transcripciones SET texto = $2, modelo = $3, latencia_ms = $4, error = NULL, actualizado = now() WHERE id = $1`,
        [id, r.texto, r.modelo, r.latenciaMs],
      );
    } catch (error) {
      // El audio se queda y el error se guarda: se puede reintentar.
      const mensaje = error instanceof ErrorModelo ? error.message : 'El servei de transcripció ha fallat.';
      await pool.query('UPDATE transcripciones SET error = $2, actualizado = now() WHERE id = $1', [id, mensaje]);
    }
  }

  const leerTranscripcion = async (id: number) =>
    (await pool.query(
      `SELECT t.id, t.caso_id, t.texto, t.modelo, t.latencia_ms, t.error, t.creado, t.ruta_audio IS NOT NULL AS tiene_audio,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS autor
       FROM transcripciones t JOIN usuarios u ON u.id = t.autor_id WHERE t.id = $1`,
      [id],
    )).rows[0];

  app.post('/casos/:id/transcripciones', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const caso = await casoVisible(pool, sesion, idDeRuta(peticion.params));
    const archivo = await peticion.file({ limits: { fileSize: TAMANO_MAXIMO_AUDIO, files: 1 } });
    if (!archivo) throw datosIncorrectos('Falta l’àudio');
    const datos = await archivo.toBuffer();
    const tipo = tipoDeAudio(datos);
    if (!tipo) throw datosIncorrectos('Aquest àudio no s’entén. Torna a gravar-lo.');
    await mkdir(audios, { recursive: true });
    const ruta = `${randomBytes(16).toString('hex')}.${tipo.ext}`;
    await writeFile(join(audios, ruta), datos);
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO transcripciones (caso_id, autor_id, ruta_audio, mime, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [caso.id, sesion.usuarioId, ruta, tipo.mime, datos.length],
    );
    await transcribir(rows[0]!.id, sesion);
    return respuesta.code(201).send(await leerTranscripcion(rows[0]!.id));
  });

  app.get('/casos/:id/transcripciones', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const caso = await casoVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows } = await pool.query(
      `SELECT t.id, t.texto, t.modelo, t.latencia_ms, t.error, t.creado, t.ruta_audio IS NOT NULL AS tiene_audio,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS autor
       FROM transcripciones t JOIN usuarios u ON u.id = t.autor_id WHERE t.caso_id = $1 ORDER BY t.creado, t.id`,
      [caso.id],
    );
    return { transcripciones: rows };
  });

  /** Una transcripción de un caso del ámbito de la sesión, o 404. */
  async function transcripcionVisible(sesion: Sesion, id: number) {
    const ambito = ambitoCaso(sesion, 'c', 2);
    const { rows } = await pool.query<{ id: number; texto: string }>(
      `SELECT t.id, t.texto FROM transcripciones t JOIN casos c ON c.id = t.caso_id WHERE t.id = $1 AND ${ambito.sql}`,
      [id, ...ambito.params],
    );
    if (!rows[0]) throw noEncontrado('Aquesta nota no existeix');
    return rows[0];
  }

  app.patch('/transcripciones/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const d = validar(z.object({ texto: z.string().trim().max(20000) }), peticion.body);
    const t = await transcripcionVisible(sesion, id);
    if (t.texto !== d.texto) {
      await enTransaccion(pool, async (bd) => {
        await bd.query('UPDATE transcripciones SET texto = $2, actualizado = now() WHERE id = $1', [id, d.texto]);
        await registrarCambio(bd, {
          tabla: 'transcripciones', filaId: id, antes: { texto: t.texto }, despues: { texto: d.texto }, usuarioId: sesion.usuarioId,
        });
      });
    }
    return leerTranscripcion(id);
  });

  app.post('/transcripciones/:id/reintenta', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    await transcripcionVisible(sesion, id);
    await transcribir(id, sesion);
    return leerTranscripcion(id);
  });

  // --- Propuestas ---

  /** Pide el borrador al modelo; valida antes de devolver nada. */
  async function redactarConIa(
    sesion: Sesion, casoId: number, tipo: TipoInforme, transcripcionIds: number[] | undefined, instrucciones: string | null,
  ) {
    const { redactor } = await modelos();
    if (!redactor) throw conflicto('No hi ha cap servei de redacció configurat: redacta l’informe a mà.');
    const caso = await casoVisible(pool, sesion, casoId);
    const { rows: pac } = await pool.query(
      `SELECT nombre, especie, especie_otra, raza, sexo, esterilizado, fecha_nacimiento, edad_texto, peso_kg::float8 AS peso_kg
       FROM pacientes WHERE id = $1`,
      [caso.paciente_id],
    );
    const { rows: anterior } = await pool.query<{ texto: string; creado: Date }>(
      'SELECT texto, creado FROM informes WHERE caso_id = $1 ORDER BY creado DESC LIMIT 1', [caso.id],
    );
    // Por defecto, los dictados posteriores al último informe.
    const { rows: notas } = await pool.query<{ id: number; texto: string; creado: Date }>(
      `SELECT id, texto, creado FROM transcripciones
       WHERE caso_id = $1 AND texto <> '' AND ($2::int[] IS NULL OR id = ANY($2)) AND ($2::int[] IS NOT NULL OR $3::timestamptz IS NULL OR creado > $3)
       ORDER BY creado, id`,
      [caso.id, transcripcionIds ?? null, anterior[0]?.creado ?? null],
    );
    // Lo que se sabe del propietario, del veterinario y de la clínica, para
    // taparlo si aparece copiado en un campo libre.
    const { rows: quien } = await pool.query<{
      p_nombre: string; p_telefono: string | null; p_email: string | null;
      v_nombre: string | null; v_apellidos: string | null; v_email: string | null;
    }>(
      `SELECT pr.nombre AS p_nombre, pr.telefono AS p_telefono, pr.email AS p_email,
              d.nombre AS v_nombre, d.apellidos AS v_apellidos, d.email AS v_email
       FROM propietarios pr LEFT JOIN usuarios d ON d.id = $2 WHERE pr.id = $1`,
      [caso.propietario_id, caso.derivador_id],
    );
    const q = quien[0];
    const prompt = construirPrompt({
      tipo,
      paciente: pac[0],
      caso: { motivo: caso.motivo, historia_clinica: caso.historia_clinica, tratamiento_actual: caso.tratamiento_actual, objetivos: caso.objetivos },
      transcripciones: notas.map((n) => ({ creado: new Date(n.creado).toISOString(), texto: n.texto })),
      informeAnterior: anterior[0]?.texto ?? null,
      instrucciones,
    });
    const sistema = prompt.sistema;
    const texto = anonimizar(prompt.texto, {
      propietario: [q?.p_nombre ?? null, q?.p_telefono ?? null, q?.p_email ?? null],
      veterinario: [q?.v_nombre ?? null, q?.v_apellidos ?? null, q?.v_email ?? null, caso.derivador_nombre],
      clinica: [caso.clinica_nombre],
    });
    let r;
    try {
      r = await redactor.redactar({ sistema, texto, esquema: ESQUEMA_JSON, nombreEsquema: 'informe_fisioterapia' });
    } catch (error) {
      errorDeModelo(error);
    }
    const valido = esquemaInforme.safeParse(r.datos);
    if (!valido.success) {
      throw new ErrorHttp(502, 'La resposta del model no té la forma d’un informe. Torna-ho a provar o redacta’l a mà.', { motivo: 'respuesta_invalida' });
    }
    return { datos: valido.data, modelo: r.modelo, latenciaMs: r.latenciaMs, transcripcionIds: notas.map((n) => n.id) };
  }

  const YA_HAY_PENDIENTE = 'Ja hi ha una proposta pendent en aquest cas: confirma-la, edita-la o descarta-la abans de fer-ne una altra.';

  async function insertarPropuesta(bd: Consultable, p: {
    casoId: number; autorId: number; tipo: TipoInforme; origen: 'ia' | 'manual' | 'edicion'; datos: DatosInforme;
    transcripcionIds: number[]; instrucciones: string | null; modelo: string | null; latenciaMs: number | null;
    origenId: number | null; sustituyeId: number | null;
  }) {
    // Una sola pendiente por caso: la base lo garantiza aunque lleguen dos a la vez.
    const { rows } = await bd.query<{ id: number }>(
      `INSERT INTO propuestas_informe (caso_id, autor_id, tipo, origen, datos, ficha, transcripcion_ids, instrucciones,
                                       modelo, latencia_ms, propuesta_origen_id, sustituye_informe_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [p.casoId, p.autorId, p.tipo, p.origen, JSON.stringify(p.datos), renderInforme(p.tipo, p.datos), p.transcripcionIds,
        p.instrucciones, p.modelo, p.latenciaMs, p.origenId, p.sustituyeId],
    ).catch((error: { code?: string; constraint?: string }) => {
      if (error.code === '23505' && error.constraint === 'propuestas_pendiente_unica') throw conflicto(YA_HAY_PENDIENTE);
      throw error;
    });
    return rows[0]!.id;
  }

  /** Una propuesta de un caso del ámbito, o 404. */
  async function propuestaVisible(bd: Consultable, sesion: Sesion, id: number) {
    const ambito = ambitoCaso(sesion, 'c', 2);
    const { rows } = await bd.query<{
      id: number; caso_id: number; tipo: TipoInforme; estado: string; datos: DatosInforme; transcripcion_ids: number[];
      instrucciones: string | null; sustituye_informe_id: number | null;
    }>(
      `SELECT p.id, p.caso_id, p.tipo, p.estado, p.datos, p.transcripcion_ids, p.instrucciones, p.sustituye_informe_id
       FROM propuestas_informe p JOIN casos c ON c.id = p.caso_id WHERE p.id = $1 AND ${ambito.sql}`,
      [id, ...ambito.params],
    );
    if (!rows[0]) throw noEncontrado('Aquesta proposta no existeix');
    return rows[0];
  }

  /** Lease: solo cambia si seguía pendiente; si no, 409 y nada cambia. */
  async function soltarPendiente(bd: Consultable, id: number, nuevo: 'cancelada' | 'corregida' | 'confirmada') {
    const { rowCount } = await bd.query(
      `UPDATE propuestas_informe SET estado = $2, resuelto_el = now() WHERE id = $1 AND estado = 'pendiente'`,
      [id, nuevo],
    );
    if (!rowCount) throw conflicto('Aquesta proposta ja no està pendent.');
  }

  const leerPropuesta = async (id: number) =>
    (await pool.query(
      `SELECT p.id, p.caso_id, p.tipo, p.estado, p.origen, p.datos, p.ficha, p.transcripcion_ids, p.instrucciones, p.modelo,
              p.latencia_ms, p.propuesta_origen_id, p.sustituye_informe_id, p.informe_id, p.creado,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS autor
       FROM propuestas_informe p JOIN usuarios u ON u.id = p.autor_id WHERE p.id = $1`,
      [id],
    )).rows[0];

  app.post('/casos/:id/propuestas-informe', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const casoId = idDeRuta(peticion.params);
    const d = validar(z.object({
      tipo: z.enum(TIPOS_INFORME),
      transcripcion_ids: z.array(z.number().int().positive()).max(100).optional(),
      instrucciones: z.string().trim().max(2000).optional(),
      manual: z.boolean().optional(),
      datos: esquemaInforme.optional(),
      sustituye_informe_id: z.number().int().positive().optional(),
    }), peticion.body);
    const caso = await casoVisible(pool, sesion, casoId);
    if (!ADMITE_INFORMES.includes(caso.estado)) throw conflicto('Aquest cas encara no admet informes: primer s’ha d’acceptar.');
    if (d.sustituye_informe_id) {
      const { rows } = await pool.query('SELECT 1 FROM informes WHERE id = $1 AND caso_id = $2', [d.sustituye_informe_id, caso.id]);
      if (!rows[0]) throw datosIncorrectos('L’informe que es corregeix no és d’aquest cas');
    }
    // Antes de gastar una llamada al modelo.
    const { rows: pendiente } = await pool.query(`SELECT 1 FROM propuestas_informe WHERE caso_id = $1 AND estado = 'pendiente'`, [caso.id]);
    if (pendiente[0]) throw conflicto(YA_HAY_PENDIENTE);
    const ia = d.manual ? null : await redactarConIa(sesion, caso.id, d.tipo, d.transcripcion_ids, d.instrucciones || null);
    const id = await insertarPropuesta(pool, {
      casoId: caso.id, autorId: sesion.usuarioId, tipo: d.tipo, origen: ia ? 'ia' : 'manual',
      datos: ia?.datos ?? d.datos ?? informeVacio(), transcripcionIds: ia?.transcripcionIds ?? [],
      instrucciones: d.instrucciones || null, modelo: ia?.modelo ?? null, latenciaMs: ia?.latenciaMs ?? null,
      origenId: null, sustituyeId: d.sustituye_informe_id ?? null,
    });
    return respuesta.code(201).send(await leerPropuesta(id));
  });

  app.get('/casos/:id/propuestas-informe', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const caso = await casoVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows } = await pool.query(
      `SELECT id, tipo, estado, origen, creado FROM propuestas_informe WHERE caso_id = $1 ORDER BY creado DESC, id DESC LIMIT 50`,
      [caso.id],
    );
    return { propuestas: rows };
  });

  app.get('/propuestas-informe/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const p = await propuestaVisible(pool, sesion, idDeRuta(peticion.params));
    return leerPropuesta(p.id);
  });

  app.post('/propuestas-informe/:id/regenera', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const d = validar(z.object({ instrucciones: z.string().trim().max(2000).optional() }), peticion.body);
    const original = await propuestaVisible(pool, sesion, id);
    if (original.estado !== 'pendiente') throw conflicto('Aquesta proposta ja no està pendent.');
    // El modelo, antes de tocar nada: si falla, la original sigue pendiente.
    const ia = await redactarConIa(sesion, original.caso_id, original.tipo, original.transcripcion_ids, d.instrucciones || null);
    const nueva = await enTransaccion(pool, async (bd) => {
      await soltarPendiente(bd, id, 'cancelada');
      return insertarPropuesta(bd, {
        casoId: original.caso_id, autorId: sesion.usuarioId, tipo: original.tipo, origen: 'ia', datos: ia.datos,
        transcripcionIds: ia.transcripcionIds, instrucciones: d.instrucciones || null, modelo: ia.modelo,
        latenciaMs: ia.latenciaMs, origenId: id, sustituyeId: original.sustituye_informe_id,
      });
    });
    return respuesta.code(201).send(await leerPropuesta(nueva));
  });

  // Editar es volver a proponer, sin modelo: misma validación y mismo render.
  app.post('/propuestas-informe/:id/edita', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const d = validar(z.object({ datos: esquemaInforme }), peticion.body);
    const nueva = await enTransaccion(pool, async (bd) => {
      const original = await propuestaVisible(bd, sesion, id);
      await soltarPendiente(bd, id, 'corregida');
      return insertarPropuesta(bd, {
        casoId: original.caso_id, autorId: sesion.usuarioId, tipo: original.tipo, origen: 'edicion', datos: d.datos,
        transcripcionIds: original.transcripcion_ids, instrucciones: original.instrucciones, modelo: null,
        latenciaMs: null, origenId: id, sustituyeId: original.sustituye_informe_id,
      });
    });
    return respuesta.code(201).send(await leerPropuesta(nueva));
  });

  app.post('/propuestas-informe/:id/cancela', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    await enTransaccion(pool, async (bd) => {
      await propuestaVisible(bd, sesion, id);
      await soltarPendiente(bd, id, 'cancelada');
    });
    return leerPropuesta(id);
  });

  app.post('/propuestas-informe/:id/confirma', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const informeId = await enTransaccion(pool, async (bd) => {
      const p = await propuestaVisible(bd, sesion, id);
      const caso = await casoVisible(bd, sesion, p.caso_id, true);
      const alta = p.tipo === 'alta' ? decidirTransicion(caso.estado, 'alta_por_informe', 'sistema') : null;
      if (alta && !alta.ok) throw conflicto('Aquest cas no pot rebre l’alta en l’estat actual.');
      // El lease: si dos confirmaciones llegan a la vez, solo una pasa.
      await soltarPendiente(bd, id, 'confirmada');
      const valido = esquemaInforme.parse(p.datos);
      const texto = renderInforme(p.tipo, valido);
      const { rows } = await bd.query<{ id: number }>(
        `INSERT INTO informes (caso_id, propuesta_id, autor_id, tipo, contenido, texto, sustituye_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [caso.id, id, sesion.usuarioId, p.tipo, JSON.stringify(valido), texto, p.sustituye_informe_id],
      );
      const nuevo = rows[0]!.id;
      await bd.query('UPDATE propuestas_informe SET informe_id = $2 WHERE id = $1', [id, nuevo]);
      await bd.query(
        `INSERT INTO mensajes (caso_id, autor_id, tipo, visibilidad, cuerpo, informe_id) VALUES ($1, $2, 'informe', 'todos', $3, $4)`,
        [caso.id, sesion.usuarioId, TITULO_INFORME[p.tipo] + (p.sustituye_informe_id ? ' (corregeix l’anterior)' : ''), nuevo],
      );
      await registrarCambio(bd, {
        tabla: 'informes', filaId: nuevo, antes: null, despues: { tipo: p.tipo, propuesta_id: id, sustituye_id: p.sustituye_informe_id },
        usuarioId: sesion.usuarioId,
      });
      await tocarActividad(bd, caso.id);
      await avisarCaso(bd, sesion, caso, 'informe.publicado', {
        tipoInforme: p.tipo === 'valoracion' ? 'valoració' : p.tipo === 'evolucion' ? 'evolució' : 'alta',
      });
      if (alta?.ok) {
        await bd.query('UPDATE casos SET estado = $2, cerrado_el = now() WHERE id = $1', [caso.id, alta.a]);
        await registrarCambio(bd, {
          tabla: 'casos', filaId: caso.id, antes: { estado: caso.estado }, despues: { estado: alta.a, accion: 'alta_por_informe' },
          usuarioId: sesion.usuarioId,
        });
        await mensajeSistema(bd, caso.id, `${nombrePersona(sesion)} ha donat l’alta amb l’informe d’alta.`);
        await avisarCaso(bd, sesion, caso, 'caso.alta');
      }
      return nuevo;
    });
    cola.despertar();
    return respuesta.code(201).send({ informe_id: informeId, propuesta: await leerPropuesta(id) });
  });

  // --- Informes publicados (los dos lados, con ámbito) ---

  app.get('/casos/:id/informes', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const caso = await casoVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows } = await pool.query(
      `SELECT i.id, i.tipo, i.creado, i.sustituye_id, nullif(trim(u.nombre || ' ' || u.apellidos), '') AS autor
       FROM informes i JOIN usuarios u ON u.id = i.autor_id WHERE i.caso_id = $1 ORDER BY i.creado DESC, i.id DESC`,
      [caso.id],
    );
    return { informes: rows };
  });

  app.get('/informes/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const ambito = ambitoCaso(sesion, 'c', 2);
    const { rows } = await pool.query(
      `SELECT i.id, i.tipo, i.contenido, i.texto, i.creado, i.sustituye_id, i.caso_id,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS autor,
              p.nombre AS paciente, p.especie, p.especie_otra, p.raza, cl.nombre AS clinica,
              coalesce(nullif(trim(d.nombre || ' ' || d.apellidos), ''), c.derivador_nombre) AS veterinario
       FROM informes i
       JOIN casos c ON c.id = i.caso_id
       JOIN pacientes p ON p.id = c.paciente_id
       JOIN clinicas cl ON cl.id = c.clinica_id
       JOIN usuarios u ON u.id = i.autor_id
       LEFT JOIN usuarios d ON d.id = c.derivador_id
       WHERE i.id = $1 AND ${ambito.sql}`,
      [idDeRuta(peticion.params), ...ambito.params],
    );
    if (!rows[0]) throw noEncontrado('Aquest informe no existeix');
    return rows[0];
  });
}
