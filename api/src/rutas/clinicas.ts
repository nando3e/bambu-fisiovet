// Clínicas: sugerencias en el alta, la clínica propia, unirse a otra,
// invitar compañeros. Bambú ve todas.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exigirSesion, ROLES_BAMBU, SOLO_DERIVADOR } from '../auth/permisos.ts';
import { emitirToken } from '../auth/tokens.ts';
import { encolarCorreo } from '../avisos/cola.ts';
import { enTransaccion } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import { dominioDe } from '../dominio/dominios-genericos.ts';
import { noEncontrado } from '../errores.ts';
import { resolverSolicitud, solicitarUnion } from '../servicios/clinicas.ts';
import { esUsuarioSuperadmin } from '../superadmin.ts';
import { frenoIntentos, idDeRuta, validar, type Deps } from './index.ts';

const datosClinica = z.object({
  nombre: z.string().trim().min(2, 'Cal el nom').max(150),
  poblacion: z.string().trim().max(100).default(''),
  direccion: z.string().trim().max(200).default(''),
  codigo_postal: z.string().trim().max(10).default(''),
  telefono: z.string().trim().max(30).default(''),
  email: z.string().trim().toLowerCase().max(200).default('')
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Correu no vàlid'),
});

export async function rutasClinicas(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, config, cola } = deps;

  // Mientras alguien se da de alta: clínicas parecidas por nombre o con el
  // dominio de su correo. Solo nombre y población, nunca quién trabaja allí.
  app.get('/clinicas/sugerencias', { config: frenoIntentos(config, config.LIMITE_INTENTOS * 3) }, async (peticion) => {
    const q = validar(
      z.object({ nombre: z.string().trim().max(150).default(''), email: z.string().trim().max(200).default('') }),
      peticion.query,
    );
    const dominio = q.email ? dominioDe(q.email) : null;
    if (q.nombre.length < 3 && !dominio) return { clinicas: [] };
    const { rows } = await pool.query(
      // Clínicas validadas por Bambú (aunque no tengan usuarios: las que dio de
      // alta al registrar derivaciones por teléfono) o con alguien verificado.
      // La que acaba de teclear un desconocido sin confirmar su correo, no.
      `SELECT id, nombre, poblacion, coalesce(dominio_correo = $2, false) AS mismo_dominio
       FROM clinicas
       WHERE activa
         AND (validada OR EXISTS (SELECT 1 FROM usuarios u
                     WHERE u.clinica_id = clinicas.id AND u.activo AND u.verificado_el IS NOT NULL))
         AND (
         ($1 <> '' AND similarity(unaccent(lower(nombre)), unaccent(lower($1))) > 0.3)
         OR ($2::text IS NOT NULL AND dominio_correo = $2)
       )
       ORDER BY mismo_dominio DESC, similarity(unaccent(lower(nombre)), unaccent(lower($1))) DESC
       LIMIT 5`,
      [q.nombre, dominio],
    );
    return { clinicas: rows };
  });

  app.get('/clinicas/mia', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const { rows: clinicas } = await pool.query(
      `SELECT id, nombre, poblacion, direccion, codigo_postal, telefono, email
       FROM clinicas WHERE id = $1`,
      [sesion.clinicaId],
    );
    const { rows: companeros } = await pool.query(
      `SELECT id, nombre, apellidos, email, activo, verificado_el IS NOT NULL AS verificado
       FROM usuarios WHERE clinica_id = $1 AND rol = 'derivador' ORDER BY nombre`,
      [sesion.clinicaId],
    );
    const { rows: recibidas } = await pool.query(
      // Como en GET /solicitudes-union: en una clínica sin validar las
      // resuelve Bambú y sus miembros no las ven.
      `SELECT s.id, s.creado, u.nombre, u.apellidos, u.email
       FROM solicitudes_union s JOIN usuarios u ON u.id = s.usuario_id
       JOIN clinicas d ON d.id = s.clinica_destino_id AND d.validada
       WHERE s.clinica_destino_id = $1 AND s.estado = 'pendiente' ORDER BY s.creado`,
      [sesion.clinicaId],
    );
    const { rows: mias } = await pool.query(
      `SELECT s.id, s.creado, c.nombre AS clinica_destino
       FROM solicitudes_union s JOIN clinicas c ON c.id = s.clinica_destino_id
       WHERE s.usuario_id = $1 AND s.estado = 'pendiente'`,
      [sesion.usuarioId],
    );
    return {
      clinica: clinicas[0] ?? null,
      companeros,
      solicitudes_recibidas: recibidas,
      mi_solicitud: mias[0] ?? null,
    };
  });

  app.patch('/clinicas/mia', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const d = validar(datosClinica, peticion.body);
    await guardarClinica(sesion.clinicaId!, d, sesion.usuarioId);
    return { ok: true };
  });

  app.get('/clinicas', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { rows } = await pool.query(
      `SELECT c.id, c.nombre, c.poblacion, c.direccion, c.codigo_postal, c.telefono, c.email,
              c.activa, c.validada, c.creado,
              (SELECT count(*) FROM usuarios u
               WHERE u.clinica_id = c.id AND u.rol = 'derivador' AND u.activo) AS veterinarios,
              (SELECT count(*) FROM casos k WHERE k.clinica_id = c.id AND k.estado <> 'borrador') AS derivaciones
       FROM clinicas c
       WHERE c.activa
       ORDER BY c.nombre`,
    );
    const { rows: solicitudes } = await pool.query(
      `SELECT s.id, s.creado, u.nombre, u.apellidos, u.email,
              o.nombre AS clinica_origen, d.nombre AS clinica_destino
       FROM solicitudes_union s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN clinicas o ON o.id = s.clinica_origen_id
       JOIN clinicas d ON d.id = s.clinica_destino_id
       WHERE s.estado = 'pendiente' ORDER BY s.creado`,
    );
    return { clinicas: rows, solicitudes };
  });

  app.get('/clinicas/:id/usuarios', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const { rows } = await pool.query(
      `SELECT id, nombre, apellidos, email, telefono, num_colegiado, activo,
              verificado_el IS NOT NULL AS verificado, ultimo_acceso
       FROM usuarios WHERE clinica_id = $1 ORDER BY nombre`,
      [id],
    );
    return { usuarios: rows };
  });

  app.patch('/clinicas/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const d = validar(datosClinica.extend({ validada: z.boolean().optional() }), peticion.body);
    await guardarClinica(id, d, sesion.usuarioId);
    return { ok: true };
  });

  // Bambú da de alta una clínica que llama por teléfono y no está en el
  // portal. Nace validada: la conoce Bambú.
  app.post('/clinicas', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const d = validar(datosClinica, peticion.body);
    const clinica = await enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query<{ id: number; nombre: string }>(
        `INSERT INTO clinicas (nombre, poblacion, direccion, codigo_postal, telefono, email, validada)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, nombre`,
        [d.nombre, d.poblacion || null, d.direccion || null, d.codigo_postal || null,
          d.telefono || null, d.email || null],
      );
      await registrarCambio(bd, {
        tabla: 'clinicas', filaId: rows[0]!.id, antes: null, despues: { ...d, validada: true },
        usuarioId: sesion.usuarioId,
      });
      return rows[0]!;
    });
    return respuesta.code(201).send(clinica);
  });

  async function guardarClinica(
    id: number,
    d: z.infer<typeof datosClinica> & { validada?: boolean },
    usuarioId: number,
  ) {
    await enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query('SELECT * FROM clinicas WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw noEncontrado();
      await bd.query(
        `UPDATE clinicas SET nombre = $2, poblacion = $3, direccion = $4, codigo_postal = $5,
                telefono = $6, email = $7, validada = coalesce($8, validada) WHERE id = $1`,
        [id, d.nombre, d.poblacion || null, d.direccion || null, d.codigo_postal || null,
          d.telefono || null, d.email || null, d.validada ?? null],
      );
      await registrarCambio(bd, { tabla: 'clinicas', filaId: id, antes: rows[0], despues: d, usuarioId });
    });
  }

  app.post('/clinicas/:id/solicitudes-union', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const destino = idDeRuta(peticion.params);
    const resultado = await enTransaccion(pool, (bd) =>
      solicitarUnion(bd, {
        id: sesion.usuarioId, email: sesion.email!, nombre: sesion.nombre, apellidos: sesion.apellidos,
        clinicaId: sesion.clinicaId!,
      }, destino),
    );
    cola.despertar();
    return { resultado };
  });

  app.get('/solicitudes-union', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const { rows } = await pool.query(
      `SELECT s.id, s.creado, u.nombre, u.apellidos, u.email,
              o.nombre AS clinica_origen, d.nombre AS clinica_destino
       FROM solicitudes_union s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN clinicas o ON o.id = s.clinica_origen_id
       JOIN clinicas d ON d.id = s.clinica_destino_id
       WHERE s.estado = 'pendiente' AND ($1::int IS NULL OR (s.clinica_destino_id = $1 AND d.validada))
       ORDER BY s.creado`,
      [sesion.rol === 'derivador' ? sesion.clinicaId : null],
    );
    return { solicitudes: rows };
  });

  for (const [accion, aprobar] of [['aprueba', true], ['rechaza', false]] as const) {
    app.post(`/solicitudes-union/:id/${accion}`, async (peticion, respuesta) => {
      const sesion = await exigirSesion(peticion, respuesta, deps);
      const id = idDeRuta(peticion.params);
      await enTransaccion(pool, (bd) => resolverSolicitud(bd, id, sesion, aprobar));
      cola.despertar();
      return { ok: true };
    });
  }

  // Con freno: cada invitación es un correo que sale con nuestro remitente.
  app.post('/clinicas/mia/invitaciones', { config: frenoIntentos(config) }, async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const d = validar(
      z.object({
        nombre: z.string().trim().min(1, 'Cal el nom').max(80),
        apellidos: z.string().trim().max(120).default(''),
        email: z.string().trim().toLowerCase().email('Correu no vàlid').max(200),
      }),
      peticion.body,
    );
    // Un correo que ya tiene cuenta (o el usuario del superadmin) recibe la
    // misma respuesta y no pasa nada: un 409 diría a cualquier veterinario qué
    // correos están dados de alta. Esa persona ya puede entrar y unirse.
    if (esUsuarioSuperadmin(config, d.email)) return respuesta.code(201).send({ ok: true });
    await enTransaccion(pool, async (bd) => {
      const { rows: existentes } = await bd.query('SELECT 1 FROM usuarios WHERE lower(email) = $1', [d.email]);
      if (existentes.length) return;
      const { rows: clinica } = await bd.query<{ nombre: string }>(
        'SELECT nombre FROM clinicas WHERE id = $1', [sesion.clinicaId],
      );
      const { rows } = await bd.query<{ id: number }>(
        `INSERT INTO usuarios (email, nombre, apellidos, rol, clinica_id)
         VALUES ($1, $2, $3, 'derivador', $4) RETURNING id`,
        [d.email, d.nombre, d.apellidos, sesion.clinicaId],
      );
      await registrarCambio(bd, {
        tabla: 'usuarios', filaId: rows[0]!.id, antes: null,
        despues: { ...d, rol: 'derivador', clinica_id: sesion.clinicaId, invitado_por: sesion.usuarioId },
        usuarioId: sesion.usuarioId,
      });
      const token = await emitirToken(bd, rows[0]!.id, 'invitacion');
      await encolarCorreo(bd, {
        destinatario: d.email, usuarioId: rows[0]!.id, plantilla: 'invitacion-clinica',
        datos: {
          nombre: d.nombre, invitador: `${sesion.nombre} ${sesion.apellidos}`.trim(),
          clinica: clinica[0]?.nombre, enlace: `/acces/estableix/${token}`,
        },
      });
    });
    cola.despertar();
    return respuesta.code(201).send({ ok: true });
  });
}
