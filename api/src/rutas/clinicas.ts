// Clínicas: la propia del veterinario, invitar compañeros y, para Bambú, verlas
// todas y corregir sus datos.
//
// Las clínicas las dan de alta sus veterinarios al registrarse. A una que ya
// está en el portal solo se entra por invitación de un compañero: no hay
// sugerencias ni solicitudes de unión, y Bambú no crea clínicas ni invita. El
// CIF solo evita clínicas repetidas; el veterinario no lo cambia.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Sesion } from '../auth/sesion.ts';
import { exigirSesion, ROLES_BAMBU, SOLO_DERIVADOR } from '../auth/permisos.ts';
import { emitirToken } from '../auth/tokens.ts';
import { encolarCorreo } from '../avisos/cola.ts';
import { enTransaccion, type Consultable } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import { nifValido, normalizarNif } from '../dominio/nif.ts';
import { ErrorHttp, noEncontrado } from '../errores.ts';
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
/** Lo que corrige Bambú: con población y CIF obligatorios. */
const datosClinicaBambu = datosClinica.extend({
  poblacion: z.string().trim().min(1, 'Cal la població').max(100),
  cif: z.string().trim().min(1, 'Cal el CIF o NIF').max(20).refine((v) => v === '' || nifValido(v), 'CIF o NIF no vàlid')
    .transform(normalizarNif),
});
const datosInvitacion = z.object({
  nombre: z.string().trim().min(1, 'Cal el nom').max(80),
  apellidos: z.string().trim().max(120).default(''),
  email: z.string().trim().toLowerCase().email('Correu no vàlid').max(200),
});

const CIF_REPETIDO = 'Ja hi ha una clínica activa amb aquest CIF';

/** Un 23505 del índice de CIF se responde como 409 con el campo. */
async function conCifUnico<T>(accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (error) {
    const e = error as { code?: string; constraint?: string };
    if (e.code === '23505' && e.constraint === 'clinicas_cif_activa') throw new ErrorHttp(409, CIF_REPETIDO, { campos: { cif: CIF_REPETIDO } });
    throw error;
  }
}

export async function rutasClinicas(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, config, cola } = deps;

  app.get('/clinicas/mia', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const { rows: clinicas } = await pool.query(
      `SELECT id, nombre, poblacion, cif, direccion, codigo_postal, telefono, email
       FROM clinicas WHERE id = $1`,
      [sesion.clinicaId],
    );
    const { rows: companeros } = await pool.query(
      `SELECT id, nombre, apellidos, email, activo, verificado_el IS NOT NULL AS verificado
       FROM usuarios WHERE clinica_id = $1 AND rol = 'derivador' ORDER BY nombre`,
      [sesion.clinicaId],
    );
    return { clinica: clinicas[0] ?? null, companeros };
  });

  // El veterinario edita los datos de contacto de su clínica, nunca el CIF.
  app.patch('/clinicas/mia', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const d = validar(datosClinica, peticion.body);
    await guardarClinica(sesion.clinicaId!, d, sesion.usuarioId);
    return { ok: true };
  });

  app.get('/clinicas', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { rows } = await pool.query(
      `SELECT c.id, c.nombre, c.poblacion, c.cif, c.direccion, c.codigo_postal, c.telefono, c.email,
              c.activa, c.creado,
              (SELECT count(*) FROM usuarios u
               WHERE u.clinica_id = c.id AND u.rol = 'derivador' AND u.activo) AS veterinarios,
              (SELECT count(*) FROM casos k WHERE k.clinica_id = c.id AND k.estado <> 'borrador') AS derivaciones
       FROM clinicas c
       WHERE c.activa
       ORDER BY c.nombre`,
    );
    return { clinicas: rows };
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
    const d = validar(datosClinicaBambu, peticion.body);
    await guardarClinica(id, d, sesion.usuarioId);
    return { ok: true };
  });

  async function guardarClinica(
    id: number,
    d: z.infer<typeof datosClinica> & { cif?: string },
    usuarioId: number,
  ) {
    await conCifUnico(() => enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query('SELECT * FROM clinicas WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw noEncontrado();
      await bd.query(
        `UPDATE clinicas SET nombre = $2, poblacion = $3, direccion = $4, codigo_postal = $5,
                telefono = $6, email = $7, cif = coalesce($8, cif)
         WHERE id = $1`,
        [id, d.nombre, d.poblacion || null, d.direccion || null, d.codigo_postal || null,
          d.telefono || null, d.email || null, d.cif ?? null],
      );
      await registrarCambio(bd, { tabla: 'clinicas', filaId: id, antes: rows[0], despues: d, usuarioId });
    }));
  }

  /**
   * Crea al invitado dentro de la clínica y le encola la invitación. Un correo
   * que ya tiene cuenta (o el usuario del superadmin) recibe la misma
   * respuesta y no pasa nada: un 409 diría qué correos están dados de alta.
   */
  async function invitar(bd: Consultable, clinicaId: number, sesion: Sesion, d: z.infer<typeof datosInvitacion>) {
    if (esUsuarioSuperadmin(config, d.email)) return;
    const { rows: existentes } = await bd.query('SELECT 1 FROM usuarios WHERE lower(email) = $1', [d.email]);
    if (existentes.length) return;
    const { rows: clinica } = await bd.query<{ nombre: string }>('SELECT nombre FROM clinicas WHERE id = $1', [clinicaId]);
    const { rows } = await bd.query<{ id: number }>(
      `INSERT INTO usuarios (email, nombre, apellidos, rol, clinica_id)
       VALUES ($1, $2, $3, 'derivador', $4) RETURNING id`,
      [d.email, d.nombre, d.apellidos, clinicaId],
    );
    await registrarCambio(bd, {
      tabla: 'usuarios', filaId: rows[0]!.id, antes: null,
      despues: { ...d, rol: 'derivador', clinica_id: clinicaId, invitado_por: sesion.usuarioId },
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
  }

  // Con freno: cada invitación es un correo que sale con nuestro remitente.
  app.post('/clinicas/mia/invitaciones', { config: frenoIntentos(config) }, async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_DERIVADOR);
    const d = validar(datosInvitacion, peticion.body);
    await enTransaccion(pool, (bd) => invitar(bd, sesion.clinicaId!, sesion, d));
    cola.despertar();
    return respuesta.code(201).send({ ok: true });
  });
}
