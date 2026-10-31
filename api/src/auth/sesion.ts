// Sesiones guardadas en la base, revocables.
//
// La cookie lleva un token aleatorio (firmado); en la base solo su SHA-256.
// Cada petición comprueba que la sesión existe y que el usuario sigue activo:
// desactivar a alguien o cambiar la contraseña corta sus sesiones al momento,
// cosa que una cookie sin estado no permite.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import type { Consultable, Pool } from '../db/pool.ts';
import { generarToken, hashToken } from './tokens.ts';

export const COOKIE_SESION = 'bambu_sesion';
const DIAS_SESION = 14;

export type Rol = 'superadmin' | 'bambu' | 'derivador';

export interface Sesion {
  usuarioId: number;
  rol: Rol;
  clinicaId: number | null;
  nombre: string;
  apellidos: string;
  email: string | null;
  esDeEntorno: boolean;
  tokenHash: string;
}

function opcionesCookie(config: Config) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.COOKIE_SEGURA,
    signed: true,
    maxAge: DIAS_SESION * 24 * 60 * 60,
  };
}

export async function abrirSesion(
  bd: Consultable,
  respuesta: FastifyReply,
  config: Config,
  usuarioId: number,
  userAgent: string | undefined,
): Promise<void> {
  const { token, hash } = generarToken();
  await bd.query(
    `INSERT INTO sesiones (token_hash, usuario_id, caduca, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
    [hash, usuarioId, DIAS_SESION, (userAgent ?? '').slice(0, 300)],
  );
  await bd.query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [usuarioId]);
  respuesta.setCookie(COOKIE_SESION, token, opcionesCookie(config));
}

function tokenDeCookie(peticion: FastifyRequest): string | null {
  const cruda = peticion.cookies[COOKIE_SESION];
  if (!cruda) return null;
  const firmada = peticion.unsignCookie(cruda);
  return firmada.valid && firmada.value ? firmada.value : null;
}

/** La sesión de la petición, o null si no hay o ya no vale. */
export async function leerSesion(
  pool: Pool,
  peticion: FastifyRequest,
  respuesta: FastifyReply,
  config: Config,
): Promise<Sesion | null> {
  const token = tokenDeCookie(peticion);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await pool.query<{
    id: number;
    rol: Rol;
    clinica_id: number | null;
    nombre: string;
    apellidos: string;
    email: string | null;
    es_de_entorno: boolean;
    renovar: boolean;
    tocar: boolean;
  }>(
    `SELECT u.id, u.rol, u.clinica_id, u.nombre, u.apellidos, u.email, u.es_de_entorno,
            s.caduca < now() + make_interval(days => $2) AS renovar,
            s.ultimo_uso < now() - interval '1 minute' AS tocar
     FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = $1 AND s.caduca > now() AND u.activo`,
    [tokenHash, DIAS_SESION / 2],
  );
  const fila = rows[0];
  if (!fila) return null;

  // Se escribe como mucho una vez por minuto, no en cada petición. Si queda
  // menos de la mitad de la vida, se alarga y se renueva la cookie.
  if (fila.renovar) {
    await pool.query(
      `UPDATE sesiones SET ultimo_uso = now(), caduca = now() + make_interval(days => $2)
       WHERE token_hash = $1`,
      [tokenHash, DIAS_SESION],
    );
    respuesta.setCookie(COOKIE_SESION, token, opcionesCookie(config));
  } else if (fila.tocar) {
    await pool.query('UPDATE sesiones SET ultimo_uso = now() WHERE token_hash = $1', [tokenHash]);
  }

  return {
    usuarioId: fila.id,
    rol: fila.rol,
    clinicaId: fila.clinica_id,
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    email: fila.email,
    esDeEntorno: fila.es_de_entorno,
    tokenHash,
  };
}

export async function cerrarSesion(
  pool: Pool,
  peticion: FastifyRequest,
  respuesta: FastifyReply,
): Promise<void> {
  const token = tokenDeCookie(peticion);
  if (token) await pool.query('DELETE FROM sesiones WHERE token_hash = $1', [hashToken(token)]);
  respuesta.clearCookie(COOKIE_SESION, { path: '/' });
}

/** Revoca todas las sesiones de un usuario, salvo la indicada. */
export async function revocarSesiones(
  bd: Consultable,
  usuarioId: number,
  exceptoTokenHash?: string,
): Promise<void> {
  await bd.query(
    'DELETE FROM sesiones WHERE usuario_id = $1 AND token_hash IS DISTINCT FROM $2',
    [usuarioId, exceptoTokenHash ?? null],
  );
}
