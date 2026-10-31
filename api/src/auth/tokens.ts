// Tokens de un solo uso que viajan por correo: verificar el alta, aceptar una
// invitación, recuperar la contraseña. Los tres acaban en la misma pantalla
// (/acces/estableix/:token).
//
// En la base solo se guarda el SHA-256: quien lea la base no puede usar los
// enlaces.
import { createHash, randomBytes } from 'node:crypto';
import type { Consultable } from '../db/pool.ts';

export type TipoToken = 'verificacion' | 'recuperacion' | 'invitacion';

export const CADUCIDAD_HORAS: Record<TipoToken, number> = {
  verificacion: 48,
  recuperacion: 1,
  invitacion: 24 * 7,
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/**
 * Emite un token nuevo y deja sin valor los anteriores del mismo tipo de ese
 * usuario: reenviar un correo invalida el enlace viejo.
 */
export async function emitirToken(
  bd: Consultable,
  usuarioId: number,
  tipo: TipoToken,
  datos: Record<string, unknown> = {},
): Promise<string> {
  await bd.query(
    `UPDATE tokens_correo SET caduca = least(caduca, now())
     WHERE usuario_id = $1 AND tipo = $2 AND usado_el IS NULL`,
    [usuarioId, tipo],
  );
  const { token, hash } = generarToken();
  await bd.query(
    `INSERT INTO tokens_correo (usuario_id, tipo, token_hash, datos, caduca)
     VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
    [usuarioId, tipo, hash, JSON.stringify(datos), CADUCIDAD_HORAS[tipo]],
  );
  return token;
}

export type EstadoToken = 'valido' | 'caducado' | 'usado' | 'inexistente';

export interface InfoToken {
  estado: EstadoToken;
  tipo?: TipoToken;
  usuarioId?: number;
  datos?: Record<string, unknown>;
}

/** Mira un token sin consumirlo (para pintar la pantalla del enlace). */
export async function consultarToken(bd: Consultable, token: string): Promise<InfoToken> {
  const { rows } = await bd.query<{
    tipo: TipoToken;
    usuario_id: number;
    datos: Record<string, unknown>;
    usado: boolean;
    caducado: boolean;
  }>(
    `SELECT tipo, usuario_id, datos, usado_el IS NOT NULL AS usado, caduca <= now() AS caducado
     FROM tokens_correo WHERE token_hash = $1`,
    [hashToken(token)],
  );
  const fila = rows[0];
  if (!fila) return { estado: 'inexistente' };
  const estado: EstadoToken = fila.usado ? 'usado' : fila.caducado ? 'caducado' : 'valido';
  return { estado, tipo: fila.tipo, usuarioId: fila.usuario_id, datos: fila.datos };
}

/**
 * Consume el token de forma atómica: solo cuenta si estaba sin usar y sin
 * caducar. Dos peticiones simultáneas con el mismo token: una gana, la otra
 * recibe null. Debe llamarse dentro de la transacción que aplica el efecto,
 * para que un fallo posterior devuelva el token a su estado.
 */
export async function consumirToken(
  bd: Consultable,
  token: string,
): Promise<{ tipo: TipoToken; usuarioId: number; datos: Record<string, unknown> } | null> {
  const { rows } = await bd.query<{ tipo: TipoToken; usuario_id: number; datos: Record<string, unknown> }>(
    `UPDATE tokens_correo SET usado_el = now()
     WHERE token_hash = $1 AND usado_el IS NULL AND caduca > now()
     RETURNING tipo, usuario_id, datos`,
    [hashToken(token)],
  );
  const fila = rows[0];
  return fila ? { tipo: fila.tipo, usuarioId: fila.usuario_id, datos: fila.datos } : null;
}
