// Derivaciones: crear (el veterinario, o Bambú en su nombre), editar, enviar,
// aceptar, rechazar, «Ja té cita», tancar, alta, asignar fisio, listas y
// contadores. Todo con el ámbito de dominio/visibilidad.ts en la propia SQL.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { esBambu, exigirSesion, ROLES_BAMBU, SOLO_DERIVADOR } from '../auth/permisos.ts';
import type { Sesion } from '../auth/sesion.ts';
import { leerConfiguracion } from '../configuracion.ts';
import { enTransaccion, type Consultable } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import {
  decidirTransicion, EDITABLE_POR_DERIVADOR, ESTADOS, type AccionCaso, type EstadoCaso,
} from '../dominio/estados-caso.ts';
import { validarDerivacion } from '../dominio/validacion-derivacion.ts';
import { ambitoCaso } from '../dominio/visibilidad.ts';
import { conflicto, datosIncorrectos, ErrorHttp, noEncontrado, prohibido } from '../errores.ts';
import {
  avisarCaso, CAMPOS_CASO, CAMPOS_PACIENTE, CAMPOS_PROPIETARIO, casoVisible, crearPaciente,
  guardarCambios, nombrePersona, pacienteVisible, tocarActividad, type FilaCaso,
} from '../servicios/casos.ts';
import { fechaVisible, mensajeSistema, textoCambios } from '../servicios/hilo.ts';
import { idDeRuta, validar, type Deps } from './index.ts';

const textoLibre = (max: number) => z.string().trim().max(max);
// Lo que la web recarga de la ficha llega con null en los campos vacíos.
const textoOpcional = (max: number) => textoLibre(max).nullable().optional();
const fecha = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no vàlida').nullable(),
);

export const esquemaPaciente = z.object({
  nombre: textoLibre(80).optional(),
  especie: z.enum(['perro', 'gato', 'conejo', 'ave', 'otro'], {
    errorMap: () => ({ message: "Tria una espècie de la llista o «Altres»" }),
  }).nullable().optional(),
  especie_otra: textoOpcional(60),
  raza: textoOpcional(80),
  sexo: z.enum(['macho', 'hembra', 'desconocido']).nullable().optional(),
  esterilizado: z.boolean().nullable().optional(),
  fecha_nacimiento: fecha.optional(),
  edad_texto: textoOpcional(40),
  peso_kg: z.number().positive('El pes ha de ser positiu').max(999).nullable().optional(),
});
export const esquemaPropietario = z.object({
  nombre: textoLibre(120).optional(),
  telefono: textoOpcional(30),
  email: z.string().trim().toLowerCase().max(200)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Correu no vàlid').nullable().optional(),
});
const esquemaCaso = z.object({
  motivo: textoLibre(4000).optional(),
  historia_clinica: textoLibre(8000).optional(),
  tratamiento_actual: textoLibre(4000).optional(),
  objetivos: textoLibre(4000).optional(),
  notas_derivador: textoLibre(4000).optional(),
});
const motivo = z.object({ motivo: z.string().trim().min(3, 'Cal escriure el motiu').max(1000) });

const NO_EDITABLE = "La derivació ja s'ha acceptat; afegeix la informació al fil";

/** Lo que hace falta para enviar, mirado sobre lo guardado. Lanza 400 con los campos. */
async function comprobarParaEnviar(bd: Consultable, casoId: number, aceptaAhora: boolean): Promise<void> {
  const { rows } = await bd.query<{
    p_nombre: string; especie: string | null; especie_otra: string | null; pr_id: number;
    pr_nombre: string; telefono: string | null; consentimiento_version: number | null; motivo: string;
  }>(
    `SELECT p.nombre AS p_nombre, p.especie, p.especie_otra, pr.id AS pr_id, pr.nombre AS pr_nombre,
            pr.telefono, pr.consentimiento_version, c.motivo
     FROM casos c JOIN pacientes p ON p.id = c.paciente_id JOIN propietarios pr ON pr.id = p.propietario_id
     WHERE c.id = $1`,
    [casoId],
  );
  const f = rows[0]!;
  const consentimiento = await leerConfiguracion(bd, 'consentimiento');
  const r = validarDerivacion({
    paciente: { nombre: f.p_nombre, especie: f.especie, especie_otra: f.especie_otra },
    propietario: { nombre: f.pr_nombre, telefono: f.telefono, consentimiento_version: f.consentimiento_version },
    caso: { motivo: f.motivo },
  }, consentimiento.version, aceptaAhora);
  if (!r.ok) throw datosIncorrectos('Falten dades per a enviar la derivació', { campos: r.campos });
  if (aceptaAhora) {
    await bd.query(
      `UPDATE propietarios SET consentimiento_version = $2, consentimiento_texto = $3, consentimiento_el = now()
       WHERE id = $1`,
      [f.pr_id, consentimiento.version, consentimiento.texto],
    );
  }
}

async function fisioDelEquipo(bd: Consultable, id: number): Promise<void> {
  const { rows } = await bd.query(
    `SELECT 1 FROM usuarios WHERE id = $1 AND rol = 'bambu' AND activo AND verificado_el IS NOT NULL`,
    [id],
  );
  if (!rows[0]) throw datosIncorrectos("Aquesta persona no és de l'equip de Bambú", { campos: { fisio_id: 'No vàlid' } });
}

/** La ficha completa tal como la pinta la web. */
async function fichaCaso(bd: Consultable, sesion: Sesion, id: number) {
  const caso = await casoVisible(bd, sesion, id);
  const { rows: pac } = await bd.query(
    `SELECT id, nombre, especie, especie_otra, raza, sexo, esterilizado, fecha_nacimiento, edad_texto,
            peso_kg::float8 AS peso_kg
     FROM pacientes WHERE id = $1`,
    [caso.paciente_id],
  );
  const { rows: prop } = await bd.query(
    `SELECT id, nombre, telefono, email, consentimiento_version, consentimiento_el FROM propietarios WHERE id = $1`,
    [caso.propietario_id],
  );
  const ambito = ambitoCaso(sesion, 'c', 3);
  const { rows: otros } = await bd.query(
    `SELECT c.id, c.estado, c.enviado_el, c.creado FROM casos c
     WHERE c.paciente_id = $1 AND c.id <> $2 AND c.descartado_el IS NULL AND ${ambito.sql}
     ORDER BY c.creado DESC`,
    [caso.paciente_id, caso.id, ...ambito.params],
  );
  const { rows: leidas } = await bd.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND caso_id = $2 AND leida_el IS NULL',
    [sesion.usuarioId, caso.id],
  );
  const avisos = await leerConfiguracion(bd, 'avisos');
  const consentimiento = await leerConfiguracion(bd, 'consentimiento');
  const atascado = caso.estado === 'aceptada' && caso.resuelto_el !== null
    && Date.now() - new Date(caso.resuelto_el).getTime() > avisos.dias_pendiente_cita * 86_400_000;
  return {
    id: caso.id,
    estado: caso.estado,
    clinica: { id: caso.clinica_id, nombre: caso.clinica_nombre },
    derivador: caso.derivador_id ? { id: caso.derivador_id, nombre: caso.derivador } : null,
    derivador_nombre: caso.derivador_nombre,
    registrado_por: caso.registrado_por ? { id: caso.registrado_por, nombre: caso.registrado_por_nombre } : null,
    fisio: caso.fisio_responsable_id ? { id: caso.fisio_responsable_id, nombre: caso.fisio } : null,
    motivo: caso.motivo,
    historia_clinica: caso.historia_clinica,
    tratamiento_actual: caso.tratamiento_actual,
    objetivos: caso.objetivos,
    notas_derivador: caso.notas_derivador,
    motivo_cierre: caso.motivo_cierre,
    descartado: caso.descartado_el !== null,
    enviado_el: caso.enviado_el,
    resuelto_el: caso.resuelto_el,
    vista_el: caso.vista_el,
    vista_por: caso.vista_por_nombre,
    en_tratamiento_el: caso.en_tratamiento_el,
    primera_visita: caso.primera_visita,
    cerrado_el: caso.cerrado_el,
    ultima_actividad: caso.ultima_actividad,
    atascado,
    no_leidas: leidas[0]!.n,
    paciente: pac[0],
    propietario: prop[0],
    consentimiento_vigente: (prop[0] as { consentimiento_version: number | null }).consentimiento_version
      === consentimiento.version,
    otros_casos: otros,
  };
}

export async function rutasCasos(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, cola } = deps;

  app.get('/consentimiento', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps);
    return leerConfiguracion(pool, 'consentimiento');
  });

  // --- Crear ---
  app.post('/casos', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const d = validar(z.object({
      paciente_id: z.number().int().positive().optional(),
      paciente: esquemaPaciente.default({}),
      propietario: esquemaPropietario.default({}),
      caso: esquemaCaso.default({}),
      // Solo Bambú, al registrar una derivación que llegó por teléfono o correo.
      clinica_id: z.number().int().positive().optional(),
      derivador_id: z.number().int().positive().nullable().optional(),
      derivador_nombre: textoLibre(120).optional(),
      acepta_consentimiento: z.boolean().optional(),
      fisio_id: z.number().int().positive().nullable().optional(),
      ja_te_cita: z.boolean().optional(),
      primera_visita: fecha.optional(),
    }), peticion.body);

    const id = await enTransaccion(pool, async (bd) => {
      if (sesion.rol === 'derivador') {
        const clinicaId = sesion.clinicaId!;
        const pacienteId = d.paciente_id
          ? (await pacienteVisible(bd, sesion, d.paciente_id)).id
          : await crearPaciente(bd, clinicaId, sesion.usuarioId, d.paciente, d.propietario);
        const { rows } = await bd.query<{ id: number }>(
          `INSERT INTO casos (paciente_id, clinica_id, derivador_id, creado_por, estado,
                              motivo, historia_clinica, tratamiento_actual, objetivos, notas_derivador)
           VALUES ($1, $2, $3, $3, 'borrador', $4, $5, $6, $7, $8) RETURNING id`,
          [pacienteId, clinicaId, sesion.usuarioId, d.caso.motivo ?? '', d.caso.historia_clinica ?? '',
            d.caso.tratamiento_actual ?? '', d.caso.objetivos ?? '', d.caso.notas_derivador ?? ''],
        );
        await registrarCambio(bd, {
          tabla: 'casos', filaId: rows[0]!.id, antes: null, despues: { estado: 'borrador', ...d.caso },
          usuarioId: sesion.usuarioId,
        });
        return rows[0]!.id;
      }

      // Bambú registra una derivación en nombre de una clínica: el portal
      // solo recibe derivaciones, así que sin clínica no hay caso.
      if (!d.clinica_id) {
        throw datosIncorrectos('Cal la clínica que deriva', { campos: { clinica_id: 'Tria la clínica' } });
      }
      const { rows: cl } = await bd.query('SELECT 1 FROM clinicas WHERE id = $1 AND activa AND validada', [d.clinica_id]);
      if (!cl[0]) {
        throw datosIncorrectos('La clínica ha d\'estar validada', { campos: { clinica_id: 'Clínica no validada' } });
      }
      if (d.derivador_id) {
        const { rows: vet } = await bd.query(
          `SELECT 1 FROM usuarios WHERE id = $1 AND clinica_id = $2 AND rol = 'derivador' AND activo`,
          [d.derivador_id, d.clinica_id],
        );
        if (!vet[0]) throw datosIncorrectos("Aquest veterinari no és d'aquesta clínica", { campos: { derivador_id: 'No vàlid' } });
      }
      if (d.fisio_id) await fisioDelEquipo(bd, d.fisio_id);
      let pacienteId: number;
      if (d.paciente_id) {
        const { rows: p } = await bd.query('SELECT id FROM pacientes WHERE id = $1 AND clinica_origen_id = $2', [d.paciente_id, d.clinica_id]);
        if (!p[0]) throw datosIncorrectos("Aquest pacient no és d'aquesta clínica", { campos: { paciente_id: 'No vàlid' } });
        pacienteId = d.paciente_id;
      } else {
        pacienteId = await crearPaciente(bd, d.clinica_id, sesion.usuarioId, d.paciente, d.propietario);
      }
      const estado: EstadoCaso = d.ja_te_cita ? 'en_tratamiento' : 'aceptada';
      const { rows } = await bd.query<{ id: number }>(
        `INSERT INTO casos (paciente_id, clinica_id, derivador_id, derivador_nombre, registrado_por, creado_por,
                            estado, fisio_responsable_id, motivo, historia_clinica, tratamiento_actual, objetivos,
                            notas_derivador, enviado_el, resuelto_el, en_tratamiento_el, primera_visita)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, now(), now(),
                 CASE WHEN $6 = 'en_tratamiento' THEN now() END, $13)
         RETURNING id`,
        [pacienteId, d.clinica_id, d.derivador_id ?? null, d.derivador_nombre || null, sesion.usuarioId, estado,
          d.fisio_id ?? null, d.caso.motivo ?? '', d.caso.historia_clinica ?? '', d.caso.tratamiento_actual ?? '',
          d.caso.objetivos ?? '', d.caso.notas_derivador ?? '', d.ja_te_cita ? (d.primera_visita ?? null) : null],
      );
      const casoId = rows[0]!.id;
      await comprobarParaEnviar(bd, casoId, d.acepta_consentimiento === true);
      await registrarCambio(bd, {
        tabla: 'casos', filaId: casoId, antes: null,
        despues: { estado, registrada: true, clinica_id: d.clinica_id, ...d.caso }, usuarioId: sesion.usuarioId,
      });
      const caso = await casoVisible(bd, sesion, casoId);
      await mensajeSistema(bd, casoId, `${nombrePersona(sesion)} ha registrat la derivació en nom de ${caso.clinica_nombre}`
        + (caso.estado === 'en_tratamiento' ? ', que ja té cita.' : '.'));
      await avisarCaso(bd, sesion, caso, 'derivacion.registrada');
      if (caso.fisio_responsable_id) await avisarCaso(bd, sesion, caso, 'caso.fisio_asignado');
      return casoId;
    });
    cola.despertar();
    return respuesta.code(201).send(await fichaCaso(pool, sesion, id));
  });

  // --- Leer ---
  app.get('/casos/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    if (esBambu(sesion)) {
      // La marca de «vista» no pide ningún clic: la primera apertura de
      // alguien de Bambú la deja puesta, una sola vez.
      await pool.query(
        `UPDATE casos SET vista_el = now(), vista_por = $2 WHERE id = $1 AND estado = 'enviada' AND vista_el IS NULL`,
        [id, sesion.usuarioId],
      );
    }
    return fichaCaso(pool, sesion, id);
  });

  // --- Editar ---
  app.patch('/casos/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    const d = validar(z.object({
      paciente: esquemaPaciente.optional(),
      propietario: esquemaPropietario.optional(),
      caso: esquemaCaso.optional(),
    }), peticion.body);
    await enTransaccion(pool, async (bd) => {
      const caso = await casoVisible(bd, sesion, id, true);
      if (caso.descartado_el) throw noEncontrado('Aquest cas no existeix');
      if (sesion.rol === 'derivador' && !EDITABLE_POR_DERIVADOR.includes(caso.estado)) throw conflicto(NO_EDITABLE);
      const tocaFicha = Object.keys(d.paciente ?? {}).length > 0 || Object.keys(d.propietario ?? {}).length > 0;
      if (sesion.rol === 'derivador' && tocaFicha) {
        // La ficha es del paciente, no de esta derivación: si otra suya ya está
        // aceptada, la misma regla que en PATCH /pacientes/:id.
        const { rows } = await bd.query(
          'SELECT 1 FROM casos WHERE paciente_id = $1 AND NOT (estado = ANY($2))',
          [caso.paciente_id, EDITABLE_POR_DERIVADOR],
        );
        if (rows[0]) throw conflicto(NO_EDITABLE);
      }
      const cambios = [
        ...await guardarCambios(bd, 'casos', caso.id, CAMPOS_CASO, d.caso ?? {}, sesion.usuarioId),
        ...await guardarCambios(bd, 'pacientes', caso.paciente_id, CAMPOS_PACIENTE, d.paciente ?? {}, sesion.usuarioId),
        ...await guardarCambios(bd, 'propietarios', caso.propietario_id, CAMPOS_PROPIETARIO, d.propietario ?? {}, sesion.usuarioId),
      ];
      if (cambios.length === 0) return;
      await tocarActividad(bd, caso.id);
      if (caso.estado !== 'borrador') {
        await mensajeSistema(bd, caso.id, textoCambios(nombrePersona(sesion), cambios));
        await avisarCaso(bd, sesion, caso, 'paciente.ficha_modificada', {
          nombre: nombrePersona(sesion),
          campos: cambios.map((c) => c.campo).join(', '),
        });
      }
    });
    cola.despertar();
    return fichaCaso(pool, sesion, id);
  });

  // --- Transiciones ---
  async function transicion(
    sesion: Sesion,
    id: number,
    accion: AccionCaso,
    aplicar: (bd: Consultable, caso: FilaCaso, a: EstadoCaso) => Promise<void>,
  ) {
    await enTransaccion(pool, async (bd) => {
      const caso = await casoVisible(bd, sesion, id, true);
      // Descartado = ya no existe para nadie: ni se envía ni se vuelve a descartar.
      if (caso.descartado_el) throw noEncontrado('Aquest cas no existeix');
      const actor = sesion.rol === 'derivador' ? 'derivador' : 'bambu';
      const decision = decidirTransicion(caso.estado, accion, actor);
      if (!decision.ok) {
        if (decision.codigo === 403) throw prohibido();
        throw conflicto('Aquesta acció no es pot fer en l\'estat actual del cas');
      }
      await aplicar(bd, caso, decision.a);
      if (decision.a !== caso.estado) {
        await registrarCambio(bd, {
          tabla: 'casos', filaId: caso.id, antes: { estado: caso.estado }, despues: { estado: decision.a, accion },
          usuarioId: sesion.usuarioId,
        });
      }
      await tocarActividad(bd, caso.id);
    });
    cola.despertar();
    return fichaCaso(pool, sesion, id);
  }

  app.post('/casos/:id/envia', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const d = validar(z.object({ acepta_consentimiento: z.boolean().optional() }), peticion.body);
    return transicion(sesion, idDeRuta(peticion.params), 'enviar', async (bd, caso, a) => {
      await comprobarParaEnviar(bd, caso.id, d.acepta_consentimiento === true);
      await bd.query('UPDATE casos SET estado = $2, enviado_el = now() WHERE id = $1', [caso.id, a]);
      await mensajeSistema(bd, caso.id, `${nombrePersona(sesion)} ha enviat la derivació.`);
      await avisarCaso(bd, sesion, caso, 'derivacion.enviada');
    });
  });

  app.post('/casos/:id/descarta', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    return transicion(sesion, idDeRuta(peticion.params), 'descartar', async (bd, caso) => {
      await bd.query('UPDATE casos SET descartado_el = now() WHERE id = $1', [caso.id]);
      await registrarCambio(bd, {
        tabla: 'casos', filaId: caso.id, antes: { descartado: false }, despues: { descartado: true },
        usuarioId: sesion.usuarioId,
      });
    });
  });

  app.post('/casos/:id/acepta', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const d = validar(z.object({ fisio_id: z.number().int().positive().nullable().optional() }), peticion.body);
    return transicion(sesion, idDeRuta(peticion.params), 'aceptar', async (bd, caso, a) => {
      if (d.fisio_id) await fisioDelEquipo(bd, d.fisio_id);
      await bd.query(
        `UPDATE casos SET estado = $2, resuelto_el = now(), fisio_responsable_id = coalesce($3, fisio_responsable_id)
         WHERE id = $1`,
        [caso.id, a, d.fisio_id ?? null],
      );
      const actualizado = await casoVisible(bd, sesion, caso.id);
      await mensajeSistema(bd, caso.id, actualizado.fisio
        ? `Bambú ha acceptat la derivació i ${actualizado.fisio} en serà la fisio responsable.`
        : 'Bambú ha acceptat la derivació.');
      await avisarCaso(bd, sesion, actualizado, 'derivacion.aceptada');
      if (d.fisio_id) await avisarCaso(bd, sesion, actualizado, 'caso.fisio_asignado');
    });
  });

  app.post('/casos/:id/rechaza', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const d = validar(motivo, peticion.body);
    return transicion(sesion, idDeRuta(peticion.params), 'rechazar', async (bd, caso, a) => {
      await bd.query(
        `UPDATE casos SET estado = $2, motivo_cierre = $3, resuelto_el = now(), cerrado_el = now() WHERE id = $1`,
        [caso.id, a, d.motivo],
      );
      await mensajeSistema(bd, caso.id, `Bambú no ha acceptat la derivació. Motiu: ${d.motivo}`);
      await avisarCaso(bd, sesion, caso, 'derivacion.rechazada', { motivo: d.motivo });
    });
  });

  // «Ja té cita»: la visita ya está dada en Wakyma.
  app.post('/casos/:id/cita', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const d = validar(z.object({ primera_visita: fecha.optional() }), peticion.body);
    return transicion(sesion, idDeRuta(peticion.params), 'iniciar_tratamiento', async (bd, caso, a) => {
      await bd.query(
        'UPDATE casos SET estado = $2, en_tratamiento_el = now(), primera_visita = $3 WHERE id = $1',
        [caso.id, a, d.primera_visita ?? null],
      );
      const visita = fechaVisible(d.primera_visita);
      await mensajeSistema(bd, caso.id, visita ? `Ja té cita: primera visita el ${visita}.` : 'Ja té cita a Bambú.');
      await avisarCaso(bd, sesion, caso, 'caso.en_tratamiento', { primeraVisita: visita });
    });
  });

  app.post('/casos/:id/abandona', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const d = validar(motivo, peticion.body);
    return transicion(sesion, idDeRuta(peticion.params), 'abandonar', async (bd, caso, a) => {
      await bd.query('UPDATE casos SET estado = $2, motivo_cierre = $3, cerrado_el = now() WHERE id = $1', [caso.id, a, d.motivo]);
      await mensajeSistema(bd, caso.id, `Bambú ha tancat el cas. Motiu: ${d.motivo}`);
      await avisarCaso(bd, sesion, caso, 'caso.abandonado', { motivo: d.motivo });
    });
  });

  app.post('/casos/:id/alta-manual', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    return transicion(sesion, idDeRuta(peticion.params), 'alta_manual', async (bd, caso, a) => {
      await bd.query('UPDATE casos SET estado = $2, cerrado_el = now() WHERE id = $1', [caso.id, a]);
      await mensajeSistema(bd, caso.id, 'Bambú ha donat l’alta.');
      await avisarCaso(bd, sesion, caso, 'caso.alta');
    });
  });

  app.post('/casos/:id/asigna-fisio', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const d = validar(z.object({ fisio_id: z.number().int().positive() }), peticion.body);
    await enTransaccion(pool, async (bd) => {
      const caso = await casoVisible(bd, sesion, id, true);
      if (!['enviada', 'aceptada', 'en_tratamiento'].includes(caso.estado)) {
        throw conflicto('Aquest cas ja està tancat');
      }
      await fisioDelEquipo(bd, d.fisio_id);
      if (caso.fisio_responsable_id === d.fisio_id) return;
      await bd.query('UPDATE casos SET fisio_responsable_id = $2 WHERE id = $1', [caso.id, d.fisio_id]);
      await registrarCambio(bd, {
        tabla: 'casos', filaId: caso.id, antes: { fisio_responsable_id: caso.fisio_responsable_id },
        despues: { fisio_responsable_id: d.fisio_id }, usuarioId: sesion.usuarioId,
      });
      await tocarActividad(bd, caso.id);
      const actualizado = await casoVisible(bd, sesion, caso.id);
      await mensajeSistema(bd, caso.id, `${actualizado.fisio} és ara la fisio responsable.`);
      await avisarCaso(bd, sesion, actualizado, 'caso.fisio_asignado');
    });
    cola.despertar();
    return fichaCaso(pool, sesion, id);
  });

  app.post('/casos/:id/leido', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    await casoVisible(pool, sesion, id);
    await pool.query(
      'UPDATE notificaciones SET leida_el = now() WHERE usuario_id = $1 AND caso_id = $2 AND leida_el IS NULL',
      [sesion.usuarioId, id],
    );
    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_el IS NULL',
      [sesion.usuarioId],
    );
    return { no_leidas: rows[0]!.n };
  });

  app.get('/casos/:id/historial', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const caso = await casoVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows } = await pool.query(
      `SELECT h.id, h.tabla, h.antes, h.despues, h.origen, h.cuando,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS usuario
       FROM historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE (h.tabla = 'casos' AND h.fila_id = $1) OR (h.tabla = 'pacientes' AND h.fila_id = $2)
          OR (h.tabla = 'propietarios' AND h.fila_id = $3)
       ORDER BY h.cuando DESC, h.id DESC LIMIT 200`,
      [String(caso.id), String(caso.paciente_id), String(caso.propietario_id)],
    );
    return { historial: rows };
  });

  // --- Listas ---
  app.get('/casos', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const q = validar(z.object({
      estado: z.string().optional().transform((v) => (v ? v.split(',') : []))
        .refine((l) => l.every((e) => (ESTADOS as readonly string[]).includes(e)), 'Estat no vàlid'),
      clinica_id: z.coerce.number().int().positive().optional(),
      fisio_id: z.coerce.number().int().positive().optional(),
      especie: z.enum(['perro', 'gato', 'conejo', 'ave', 'otro']).optional(),
      q: z.string().trim().max(100).optional(),
      novedades: z.enum(['1', 'true']).optional(),
      sin_abrir: z.enum(['1', 'true']).optional(),
      atascados: z.enum(['1', 'true']).optional(),
      antes_de: z.string().regex(/^\d+(\.\d+)?_\d+$/).optional(),
    }), peticion.query);
    const avisos = await leerConfiguracion(pool, 'avisos');

    const params: unknown[] = [sesion.usuarioId, avisos.dias_pendiente_cita];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const ambito = ambitoCaso(sesion, 'c', params.length + 1);
    params.push(...ambito.params);
    const filtros = [ambito.sql, 'c.descartado_el IS NULL'];
    if (q.estado.length) filtros.push(`c.estado = ANY(${p(q.estado)})`);
    if (q.clinica_id) filtros.push(`c.clinica_id = ${p(q.clinica_id)}`);
    if (q.fisio_id) filtros.push(`c.fisio_responsable_id = ${p(q.fisio_id)}`);
    if (q.especie) filtros.push(`pa.especie = ${p(q.especie)}`);
    if (q.q) {
      filtros.push(`unaccent(lower(pa.nombre || ' ' || pr.nombre || ' ' || cl.nombre || ' ' || coalesce(c.derivador_nombre, '')))
        LIKE '%' || unaccent(lower(${p(q.q)})) || '%'`);
    }
    if (q.novedades) filtros.push('no_leidas.n > 0');
    if (q.sin_abrir) filtros.push(`c.estado = 'enviada' AND c.vista_el IS NULL`);
    if (q.atascados) filtros.push(`c.estado = 'aceptada' AND c.resuelto_el < now() - make_interval(days => $2)`);
    if (q.antes_de) {
      const [epoca, id] = q.antes_de.split('_');
      filtros.push(`(extract(epoch FROM c.ultima_actividad), c.id) < (${p(epoca)}::numeric, ${p(Number(id))})`);
    }
    const POR_PAGINA = 30;
    const { rows } = await pool.query(
      `SELECT c.id, c.estado, c.enviado_el, c.ultima_actividad, c.vista_el IS NOT NULL AS vista,
              c.registrado_por IS NOT NULL AS registrada,
              pa.nombre AS paciente, pa.especie, pa.especie_otra, pr.nombre AS propietario,
              cl.id AS clinica_id, cl.nombre AS clinica,
              coalesce(nullif(trim(d.nombre || ' ' || d.apellidos), ''), c.derivador_nombre) AS derivador,
              nullif(trim(f.nombre || ' ' || f.apellidos), '') AS fisio,
              (c.estado = 'aceptada' AND c.resuelto_el < now() - make_interval(days => $2)) AS atascado,
              no_leidas.n AS no_leidas,
              extract(epoch FROM c.ultima_actividad)::text || '_' || c.id AS cursor
       FROM casos c
       JOIN pacientes pa ON pa.id = c.paciente_id
       JOIN propietarios pr ON pr.id = pa.propietario_id
       JOIN clinicas cl ON cl.id = c.clinica_id
       LEFT JOIN usuarios d ON d.id = c.derivador_id
       LEFT JOIN usuarios f ON f.id = c.fisio_responsable_id
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS n FROM notificaciones nt
         WHERE nt.caso_id = c.id AND nt.usuario_id = $1 AND nt.leida_el IS NULL
       ) no_leidas
       WHERE ${filtros.join(' AND ')}
       ORDER BY c.ultima_actividad DESC, c.id DESC
       LIMIT ${POR_PAGINA + 1}`,
      params,
    );
    const hayMas = rows.length > POR_PAGINA;
    const casos = rows.slice(0, POR_PAGINA);
    return {
      casos: casos.map(({ cursor: _c, ...resto }) => resto),
      siguiente: hayMas ? (casos.at(-1) as { cursor: string }).cursor : null,
    };
  });

  app.get('/panel/contadores', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const avisos = await leerConfiguracion(pool, 'avisos');
    const { rows } = await pool.query(
      `SELECT count(*) FILTER (WHERE estado = 'enviada' AND vista_el IS NULL)::int AS sin_abrir,
              count(*) FILTER (WHERE estado = 'enviada')::int AS noves,
              count(*) FILTER (WHERE estado = 'aceptada')::int AS pendientes_cita,
              count(*) FILTER (WHERE estado = 'aceptada' AND resuelto_el < now() - make_interval(days => $1))::int AS atascados,
              count(*) FILTER (WHERE estado = 'en_tratamiento')::int AS en_tratamiento
       FROM casos WHERE descartado_el IS NULL`,
      [avisos.dias_pendiente_cita],
    );
    return { ...rows[0], dias_pendiente_cita: avisos.dias_pendiente_cita };
  });
}

/** Para que las rutas de pacientes no dupliquen el error. */
export const errorNoEditable = () => new ErrorHttp(409, NO_EDITABLE);
