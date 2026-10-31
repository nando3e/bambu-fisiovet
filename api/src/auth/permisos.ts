// La frontera es el servidor: cada ruta privada pide la sesión y el rol aquí.
// Que la web esconda un botón no es un permiso.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import type { Pool } from '../db/pool.ts';
import { prohibido, sinSesion } from '../errores.ts';
import { leerSesion, type Rol, type Sesion } from './sesion.ts';

export const ROLES_BAMBU: readonly Rol[] = ['superadmin', 'bambu'];
export const SOLO_SUPERADMIN: readonly Rol[] = ['superadmin'];
export const SOLO_DERIVADOR: readonly Rol[] = ['derivador'];

export function esBambu(sesion: Sesion): boolean {
  return ROLES_BAMBU.includes(sesion.rol);
}

interface Contexto {
  pool: Pool;
  config: Config;
}

/** Devuelve la sesión o lanza 401; con roles, lanza 403 si no le corresponde. */
export async function exigirSesion(
  peticion: FastifyRequest,
  respuesta: FastifyReply,
  { pool, config }: Contexto,
  roles?: readonly Rol[],
): Promise<Sesion> {
  const sesion = await leerSesion(pool, peticion, respuesta, config);
  if (!sesion) throw sinSesion();
  if (roles && !roles.includes(sesion.rol)) throw prohibido();
  return sesion;
}
