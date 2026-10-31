// Equipo de Bambú: invitar, reenviar la invitación, desactivar y reactivar.
// También sirve a Bambú para ver y desactivar veterinarios.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exigirSesion, ROLES_BAMBU } from '../auth/permisos.ts';
import { revocarSesiones } from '../auth/sesion.ts';
import { emitirToken } from '../auth/tokens.ts';
import { encolarCorreo } from '../avisos/cola.ts';
import { enTransaccion } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import { conflicto, noEncontrado, prohibido } from '../errores.ts';
import { idDeRuta, validar, type Deps } from './index.ts';

const nombreCompleto = (s: { nombre: string; apellidos: string }) => `${s.nombre} ${s.apellidos}`.trim();

export async function rutasUsuarios(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, cola } = deps;

  app.get('/usuarios', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { rol } = validar(
      z.object({ rol: z.enum(['bambu', 'derivador']).optional() }),
      peticion.query,
    );
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.email, u.usuario, u.telefono, u.rol, u.activo,
              u.es_de_entorno, u.creado, u.ultimo_acceso, c.id AS clinica_id, c.nombre AS clinica_nombre,
              CASE WHEN NOT u.activo THEN 'desactivado'
                   WHEN u.verificado_el IS NULL THEN 'invitado'
                   ELSE 'activo' END AS estado
       FROM usuarios u LEFT JOIN clinicas c ON c.id = u.clinica_id
       WHERE ($1::text IS NULL AND u.rol IN ('superadmin', 'bambu')) OR u.rol = $1
       ORDER BY u.es_de_entorno DESC, u.activo DESC, u.nombre`,
      [rol ?? null],
    );
    return { usuarios: rows };
  });

  app.post('/usuarios', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const d = validar(
      z.object({
        nombre: z.string().trim().min(1, 'Cal el nom').max(80),
        apellidos: z.string().trim().max(120).default(''),
        email: z.string().trim().toLowerCase().email('Correu no vàlid').max(200),
      }),
      peticion.body,
    );
    const usuario = await enTransaccion(pool, async (bd) => {
      const { rows: existentes } = await bd.query('SELECT 1 FROM usuarios WHERE lower(email) = $1', [d.email]);
      if (existentes.length) throw conflicto('Aquest correu ja té compte');
      const { rows } = await bd.query<{ id: number }>(
        `INSERT INTO usuarios (email, nombre, apellidos, rol) VALUES ($1, $2, $3, 'bambu') RETURNING id`,
        [d.email, d.nombre, d.apellidos],
      );
      const id = rows[0]!.id;
      const token = await emitirToken(bd, id, 'invitacion');
      await encolarCorreo(bd, {
        destinatario: d.email, usuarioId: id, plantilla: 'invitacion-bambu',
        datos: { nombre: d.nombre, invitador: nombreCompleto(sesion), enlace: `/acces/estableix/${token}` },
      });
      await registrarCambio(bd, {
        tabla: 'usuarios', filaId: id, antes: null, despues: { ...d, rol: 'bambu' }, usuarioId: sesion.usuarioId,
      });
      return { id, ...d, rol: 'bambu', estado: 'invitado' };
    });
    cola.despertar();
    return respuesta.code(201).send(usuario);
  });

  app.post('/usuarios/:id/reenvia-invitacion', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    await enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query<{ email: string; nombre: string; rol: string; verificado_el: Date | null; clinica_nombre: string | null }>(
        `SELECT u.email, u.nombre, u.rol, u.verificado_el, c.nombre AS clinica_nombre
         FROM usuarios u LEFT JOIN clinicas c ON c.id = u.clinica_id
         WHERE u.id = $1 AND NOT u.es_de_entorno AND u.activo`,
        [id],
      );
      const u = rows[0];
      if (!u) throw noEncontrado();
      if (u.verificado_el) throw conflicto('Aquesta persona ja ha acceptat la invitació');
      const token = await emitirToken(bd, id, 'invitacion');
      await encolarCorreo(bd, {
        destinatario: u.email, usuarioId: id,
        plantilla: u.rol === 'bambu' ? 'invitacion-bambu' : 'invitacion-clinica',
        datos: {
          nombre: u.nombre, invitador: nombreCompleto(sesion), clinica: u.clinica_nombre,
          enlace: `/acces/estableix/${token}`,
        },
      });
    });
    cola.despertar();
    return { ok: true };
  });

  app.patch('/usuarios/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const id = idDeRuta(peticion.params);
    const { activo } = validar(z.object({ activo: z.boolean() }), peticion.body);
    await enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query<{ activo: boolean; es_de_entorno: boolean }>(
        'SELECT activo, es_de_entorno FROM usuarios WHERE id = $1 FOR UPDATE',
        [id],
      );
      const u = rows[0];
      if (!u) throw noEncontrado();
      if (u.es_de_entorno) throw prohibido('El superadmin no es pot desactivar');
      if (id === sesion.usuarioId && !activo) throw conflicto('No et pots desactivar a tu mateix');
      await bd.query('UPDATE usuarios SET activo = $2 WHERE id = $1', [id, activo]);
      if (!activo) await revocarSesiones(bd, id);
      await registrarCambio(bd, {
        tabla: 'usuarios', filaId: id, antes: { activo: u.activo }, despues: { activo }, usuarioId: sesion.usuarioId,
      });
    });
    return { ok: true };
  });
}
