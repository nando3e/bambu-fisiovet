// Hilo del caso: mensajes, notas internas de Bambú, adjuntos protegidos y los
// últimos movimientos del inicio de Bambú. Los ficheros nunca se sirven como
// estáticos: pasan por aquí con sesión y ámbito (principio duro 7).
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { esBambu, exigirSesion, ROLES_BAMBU } from '../auth/permisos.ts';
import { enTransaccion } from '../db/pool.ts';
import { ambitoCaso } from '../dominio/visibilidad.ts';
import { conflicto, datosIncorrectos, noEncontrado, prohibido } from '../errores.ts';
import {
  categoriaDe, esImagen, MIME_ADJUNTO, nombreSeguro, seMuestraEnLinea, TAMANO_MAXIMO_ADJUNTO, tipoDeAdjunto,
  type TipoAdjunto,
} from '../ficheros/adjuntos.ts';
import { avisarCaso, casoVisible, nombrePersona, tocarActividad } from '../servicios/casos.ts';
import { mensajeSistema } from '../servicios/hilo.ts';
import { idDeRuta, validar, type Deps } from './index.ts';

/** encodeURIComponent deja sin codificar ' ( ) * , que no valen en filename*. */
const rfc5987 = (texto: string) =>
  encodeURIComponent(texto).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Minutos en los que el veterinario puede retirar su propio adjunto. */
const MINUTOS_RETIRAR = 15;
const SOLO_TRAS_ENVIAR = 'Envia la derivació abans d’adjuntar fitxers';
/** Mientras el caso está en marcha, el derivador añade documentos; después, lo que haga falta va por el hilo. */
const ABIERTO_PARA_DOCUMENTOS: readonly string[] = ['borrador', 'enviada', 'aceptada', 'en_tratamiento'];
const CASO_CERRADO = 'El cas ja està tancat: si cal afegir alguna cosa, escriu-ho al fil';

type Sharp = typeof import('sharp');
let sharp: Promise<Sharp | null> | null = null;

/**
 * `sharp` trae un binario nativo: si no carga (otra plataforma, imagen
 * rota), el adjunto se guarda igual, sin miniatura, y queda en el log.
 */
function cargarSharp(log: FastifyBaseLogger): Promise<Sharp | null> {
  sharp ??= import('sharp')
    // Módulo CommonJS: según el cargador llega como default o tal cual.
    .then((m) => ((m as { default?: Sharp }).default ?? m) as Sharp)
    .catch((error) => {
      log.error({ err: error }, 'sharp no carga: los adjuntos se guardan sin miniatura');
      return null;
    });
  return sharp;
}

export async function rutasHilo(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, config, cola } = deps;
  const carpeta = resolve(config.RUTA_DATOS, 'adjuntos');

  app.get('/casos/:id/mensajes', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const caso = await casoVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows } = await pool.query(
      `SELECT m.id, m.tipo, m.visibilidad, m.cuerpo, m.creado, m.autor_id, m.informe_id,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS autor,
              u.rol IN ('bambu', 'superadmin') AS autor_bambu,
              a.id AS adjunto_id, a.nombre_original AS adjunto_nombre, a.mime AS adjunto_mime,
              a.bytes AS adjunto_bytes, a.miniatura_ruta IS NOT NULL AS adjunto_miniatura,
              a.eliminado_el IS NOT NULL AS adjunto_retirado, a.subido_por AS adjunto_subido_por,
              a.categoria AS adjunto_categoria
       FROM mensajes m
       LEFT JOIN usuarios u ON u.id = m.autor_id
       LEFT JOIN adjuntos a ON a.id = m.adjunto_id
       WHERE m.caso_id = $1 AND ($2::boolean OR m.visibilidad = 'todos')
       ORDER BY m.creado, m.id`,
      [caso.id, esBambu(sesion)],
    );
    return { mensajes: rows };
  });

  app.post('/casos/:id/mensajes', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    const d = validar(z.object({
      cuerpo: z.string().trim().min(1, 'Escriu el missatge').max(8000),
      interna: z.boolean().optional(),
    }), peticion.body);
    // Un veterinario nunca crea notas internas: el servidor lo fuerza.
    const interna = esBambu(sesion) && d.interna === true;
    const mensaje = await enTransaccion(pool, async (bd) => {
      const caso = await casoVisible(bd, sesion, id, true);
      if (caso.estado === 'borrador') throw conflicto('Envia la derivació abans d’escriure al fil');
      const { rows } = await bd.query<{ id: number }>(
        `INSERT INTO mensajes (caso_id, autor_id, tipo, visibilidad, cuerpo) VALUES ($1, $2, 'texto', $3, $4) RETURNING id`,
        [caso.id, sesion.usuarioId, interna ? 'bambu' : 'todos', d.cuerpo],
      );
      // Una nota interna no avisa a nadie ni mueve la actividad del caso: el
      // veterinario no debe notar ni que existe.
      if (!interna) {
        await tocarActividad(bd, caso.id);
        await avisarCaso(bd, sesion, caso, 'mensaje.nuevo', { nombre: nombrePersona(sesion) });
      }
      return rows[0]!;
    });
    cola.despertar();
    return respuesta.code(201).send(mensaje);
  });

  app.post('/casos/:id/adjuntos', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    // El caso se mira antes de leer el fichero: sin ámbito, 404 sin gastar disco.
    // En borrador solo entran los documentos de la derivación (con categoría),
    // y solo los sube quien la está escribiendo.
    const previo = await casoVisible(pool, sesion, id);
    if (previo.descartado_el) throw noEncontrado('Aquest cas no existeix');
    if (previo.estado === 'borrador' && sesion.rol !== 'derivador') throw conflicto(SOLO_TRAS_ENVIAR);

    const archivo = await peticion.file({ limits: { fileSize: TAMANO_MAXIMO_ADJUNTO, files: 1 } });
    if (!archivo) throw datosIncorrectos('Falta el fitxer');
    // Más de 12 MB: toBuffer lanza el error del complemento con su 413. Se lee
    // entero antes de rechazar por categoría: así el navegador recibe el
    // mensaje en vez de una conexión cortada.
    const datos = await archivo.toBuffer();
    const campoCategoria = archivo.fields.categoria as { value?: unknown } | undefined;
    const cat = categoriaDe(campoCategoria?.value);
    if (!cat.ok) throw datosIncorrectos('Categoria de document desconeguda');
    const categoria = cat.categoria;
    if (previo.estado === 'borrador' && !categoria) throw conflicto(SOLO_TRAS_ENVIAR);
    if (categoria && sesion.rol === 'derivador' && !ABIERTO_PARA_DOCUMENTOS.includes(previo.estado)) throw conflicto(CASO_CERRADO);
    const nombre = nombreSeguro(archivo.filename);
    const tipo = tipoDeAdjunto(datos, nombre);
    if (!tipo) throw datosIncorrectos('Aquest tipus de fitxer no s’admet. Puja PDF, imatges, Word, Excel o ZIP.');
    const campoInterna = archivo.fields.interna as { value?: unknown } | undefined;
    const interna = esBambu(sesion) && campoInterna?.value === 'true';

    await mkdir(carpeta, { recursive: true });
    const base = randomBytes(16).toString('hex');
    const ruta = `${base}.${tipo}`;
    let guardado = false;
    try {
      await writeFile(join(carpeta, ruta), datos);
      const miniatura = esImagen(tipo) ? await crearMiniatura(datos, base, tipo, peticion.log) : null;
      const resultado = await enTransaccion(pool, async (bd) => {
        const caso = await casoVisible(bd, sesion, id, true);
        if (caso.descartado_el) throw noEncontrado('Aquest cas no existeix');
        const enBorrador = caso.estado === 'borrador';
        if (enBorrador && (sesion.rol !== 'derivador' || !categoria)) throw conflicto(SOLO_TRAS_ENVIAR);
        if (categoria && sesion.rol === 'derivador' && !ABIERTO_PARA_DOCUMENTOS.includes(caso.estado)) throw conflicto(CASO_CERRADO);
        const { rows: adj } = await bd.query<{ id: number }>(
          `INSERT INTO adjuntos (caso_id, subido_por, nombre_original, mime, bytes, ruta, miniatura_ruta, sha256, categoria)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [caso.id, sesion.usuarioId, nombre, MIME_ADJUNTO[tipo], datos.length, ruta, miniatura,
            createHash('sha256').update(datos).digest('hex'), categoria],
        );
        const { rows: men } = await bd.query<{ id: number }>(
          `INSERT INTO mensajes (caso_id, autor_id, tipo, visibilidad, cuerpo, adjunto_id)
           VALUES ($1, $2, 'adjunto', $3, $4, $5) RETURNING id`,
          [caso.id, sesion.usuarioId, interna ? 'bambu' : 'todos', nombre, adj[0]!.id],
        );
        // En borrador nadie más ve el caso: el aviso de «derivació enviada»
        // dirá cuántos documentos trae.
        if (!interna && !enBorrador) {
          await tocarActividad(bd, caso.id);
          await avisarCaso(bd, sesion, caso, 'adjunto.nuevo', { nombre: nombrePersona(sesion) });
        }
        return { id: adj[0]!.id, mensaje_id: men[0]!.id };
      });
      guardado = true;
      cola.despertar();
      return respuesta.code(201).send(resultado);
    } finally {
      // Si no se llega a guardar el registro, nada de lo escrito se queda en
      // disco (tampoco una miniatura a medias).
      if (!guardado) {
        await rm(join(carpeta, ruta), { force: true });
        await rm(join(carpeta, `${base}-min.webp`), { force: true });
      }
    }
  });

  // Los documentos del caso: los adjuntos vivos, con su categoría (null = del
  // hilo), con el ámbito del caso y sin las notas internas para el derivador.
  app.get('/casos/:id/adjuntos', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const caso = await casoVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows } = await pool.query(
      `SELECT a.id, a.nombre_original AS nombre, a.mime, a.bytes, a.miniatura_ruta IS NOT NULL AS miniatura,
              a.categoria, a.subido_por, a.creado, m.visibilidad,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS autor
       FROM adjuntos a
       JOIN mensajes m ON m.adjunto_id = a.id
       LEFT JOIN usuarios u ON u.id = a.subido_por
       WHERE a.caso_id = $1 AND a.eliminado_el IS NULL AND ($2::boolean OR m.visibilidad = 'todos')
       ORDER BY a.creado, a.id`,
      [caso.id, esBambu(sesion)],
    );
    return { adjuntos: rows };
  });

  async function crearMiniatura(datos: Buffer, base: string, tipo: TipoAdjunto, log: FastifyBaseLogger) {
    const s = await cargarSharp(log);
    if (!s) return null;
    try {
      const nombre = `${base}-min.webp`;
      // sharp trabaja en el pool de hilos de libuv: no bloquea el event loop.
      await s(datos).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 }).toFile(join(carpeta, nombre));
      return nombre;
    } catch (error) {
      log.error({ err: error, tipo }, 'no se ha podido crear la miniatura');
      return null;
    }
  }

  /** Un adjunto visible para la sesión (ámbito del caso, nota interna, no retirado) o 404. */
  async function adjuntoVisible(sesion: Parameters<typeof casoVisible>[1], id: number) {
    const ambito = ambitoCaso(sesion, 'c', 3);
    const { rows } = await pool.query<{
      id: number; ruta: string; miniatura_ruta: string | null; mime: string; nombre_original: string;
      subido_por: number; creado: Date; caso_id: number; eliminado: boolean; visibilidad: 'todos' | 'bambu';
      caso_estado: string;
    }>(
      `SELECT a.id, a.ruta, a.miniatura_ruta, a.mime, a.nombre_original, a.subido_por, a.creado, a.caso_id,
              a.eliminado_el IS NOT NULL AS eliminado, m.visibilidad, c.estado AS caso_estado
       FROM adjuntos a
       JOIN mensajes m ON m.adjunto_id = a.id
       JOIN casos c ON c.id = a.caso_id
       WHERE a.id = $1 AND ($2::boolean OR m.visibilidad = 'todos') AND ${ambito.sql}`,
      [id, sesion.rol !== 'derivador', ...ambito.params],
    );
    if (!rows[0]) throw noEncontrado('Aquest fitxer no existeix');
    return rows[0];
  }

  for (const cual of ['fichero', 'miniatura'] as const) {
    app.get(`/adjuntos/:id/${cual}`, async (peticion, respuesta) => {
      const sesion = await exigirSesion(peticion, respuesta, deps);
      const a = await adjuntoVisible(sesion, idDeRuta(peticion.params));
      if (a.eliminado) throw noEncontrado('Aquest fitxer s’ha retirat');
      const ruta = cual === 'miniatura' ? a.miniatura_ruta : a.ruta;
      if (!ruta) throw noEncontrado('Aquest fitxer no té miniatura');
      const tipo = (Object.entries(MIME_ADJUNTO).find(([, m]) => m === a.mime)?.[0] ?? 'zip') as TipoAdjunto;
      const enLinea = cual === 'miniatura' || seMuestraEnLinea(tipo);
      return respuesta
        .header('Content-Type', cual === 'miniatura' ? 'image/webp' : a.mime)
        .header('X-Content-Type-Options', 'nosniff')
        // Datos clínicos: nada de caché del navegador, que serviría el fichero
        // a otra sesión del mismo ordenador sin pasar por los permisos.
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${rfc5987(a.nombre_original)}`)
        .send(createReadStream(join(carpeta, ruta)));
    });
  }

  app.delete('/adjuntos/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    await enTransaccion(pool, async (bd) => {
      const a = await adjuntoVisible(sesion, id);
      if (a.eliminado) throw noEncontrado('Aquest fitxer ja s’ha retirat');
      if (sesion.rol === 'derivador') {
        // En el borrador no corre el plazo: nadie más lo ve y Bambú no podría retirarlo.
        const fueraDePlazo = a.caso_estado !== 'borrador' && Date.now() - new Date(a.creado).getTime() > MINUTOS_RETIRAR * 60_000;
        if (a.subido_por !== sesion.usuarioId || fueraDePlazo) {
          throw prohibido(`Només pots retirar els teus fitxers durant ${MINUTOS_RETIRAR} minuts. Demana-ho a Bambú.`);
        }
      }
      const { rowCount } = await bd.query(
        'UPDATE adjuntos SET eliminado_el = now(), eliminado_por = $2 WHERE id = $1 AND eliminado_el IS NULL',
        [id, sesion.usuarioId],
      );
      if (!rowCount) throw noEncontrado('Aquest fitxer ja s’ha retirat');
      // La línea del hilo tiene la misma visibilidad que el adjunto: retirar uno
      // interno no puede enseñarle al veterinario ni su nombre.
      await mensajeSistema(bd, a.caso_id, `${nombrePersona(sesion)} ha retirat l’adjunt «${a.nombre_original}».`, a.visibilidad);
      if (a.visibilidad === 'todos') await tocarActividad(bd, a.caso_id);
    });
    return { ok: true };
  });

  app.get('/panel/movimientos', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { rows } = await pool.query(
      `SELECT e.id, e.tipo, e.creado, e.caso_id, p.nombre AS paciente, cl.nombre AS clinica,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS actor
       FROM eventos e
       JOIN casos c ON c.id = e.caso_id
       JOIN pacientes p ON p.id = c.paciente_id
       JOIN clinicas cl ON cl.id = c.clinica_id
       LEFT JOIN usuarios u ON u.id = e.actor_id
       ORDER BY e.creado DESC, e.id DESC LIMIT 15`,
    );
    return { movimientos: rows };
  });
}
