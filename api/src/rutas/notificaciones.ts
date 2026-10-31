// La campana: cada usuario ve y marca solo las suyas.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../auth/permisos.ts';
import { noEncontrado } from '../errores.ts';
import { idDeRuta, validar, type Deps } from './index.ts';

export async function rutasNotificaciones(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool } = deps;

  const contarNoLeidas = async (usuarioId: number) => {
    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*) AS n FROM notificaciones WHERE usuario_id = $1 AND leida_el IS NULL',
      [usuarioId],
    );
    return rows[0]?.n ?? 0;
  };

  app.get('/notificaciones', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const q = validar(
      z.object({
        solo_no_leidas: z.enum(['1', '0', 'true', 'false']).optional(),
        limite: z.coerce.number().int().min(1).max(100).default(30),
        antes_de: z.coerce.number().int().positive().optional(),
      }),
      peticion.query,
    );
    const soloNoLeidas = q.solo_no_leidas === '1' || q.solo_no_leidas === 'true';
    const { rows } = await pool.query(
      `SELECT n.id, n.titulo, n.cuerpo, n.enlace, n.caso_id, n.creado, n.leida_el, e.tipo
       FROM notificaciones n JOIN eventos e ON e.id = n.evento_id
       WHERE n.usuario_id = $1
         AND ($2::boolean IS FALSE OR n.leida_el IS NULL)
         AND ($3::bigint IS NULL OR n.id < $3)
       ORDER BY n.id DESC LIMIT $4`,
      [sesion.usuarioId, soloNoLeidas, q.antes_de ?? null, q.limite],
    );
    return { notificaciones: rows, no_leidas: await contarNoLeidas(sesion.usuarioId) };
  });

  app.get('/notificaciones/resumen', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    return { no_leidas: await contarNoLeidas(sesion.usuarioId) };
  });

  app.post('/notificaciones/:id/leida', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const { rowCount } = await pool.query(
      `UPDATE notificaciones SET leida_el = coalesce(leida_el, now())
       WHERE id = $1 AND usuario_id = $2`,
      [idDeRuta(peticion.params), sesion.usuarioId],
    );
    if (rowCount !== 1) throw noEncontrado();
    return { no_leidas: await contarNoLeidas(sesion.usuarioId) };
  });

  app.post('/notificaciones/leidas', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    await pool.query(
      'UPDATE notificaciones SET leida_el = now() WHERE usuario_id = $1 AND leida_el IS NULL',
      [sesion.usuarioId],
    );
    return { no_leidas: 0 };
  });
}
