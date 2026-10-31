// Historial de cambios: quién cambió qué y cuándo. Nada se borra en esta app,
// y lo que se cambia deja rastro con el antes y el después.
import type { Consultable } from './pool.ts';

export type OrigenCambio = 'pantalla' | 'voz' | 'correo' | 'sistema';

export interface Cambio {
  tabla: string;
  filaId: number | string;
  antes: unknown;
  despues: unknown;
  usuarioId: number | null;
  origen?: OrigenCambio;
}

export async function registrarCambio(bd: Consultable, cambio: Cambio): Promise<void> {
  await bd.query(
    `INSERT INTO historial (tabla, fila_id, antes, despues, usuario_id, origen)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      cambio.tabla,
      String(cambio.filaId),
      cambio.antes === undefined ? null : JSON.stringify(cambio.antes),
      cambio.despues === undefined ? null : JSON.stringify(cambio.despues),
      cambio.usuarioId,
      cambio.origen ?? 'pantalla',
    ],
  );
}
