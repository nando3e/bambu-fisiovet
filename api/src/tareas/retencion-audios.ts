// Retención de audios: los dictados se guardan los días que diga la
// configuración; después se borra el fichero y se conserva el texto. Corre al
// arrancar y cada 24 horas.
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';
import { leerConfiguracion } from '../configuracion.ts';
import type { Pool } from '../db/pool.ts';

const CADA = 24 * 60 * 60 * 1000;

/** Borra los audios caducados; devuelve cuántos. */
export async function aplicarRetencionAudios(pool: Pool, rutaDatos: string): Promise<number> {
  const { audio_dias: dias } = await leerConfiguracion(pool, 'retencion');
  const { rows } = await pool.query<{ id: number; ruta_audio: string }>(
    `SELECT id, ruta_audio FROM transcripciones
     WHERE ruta_audio IS NOT NULL AND creado < now() - make_interval(days => $1)`,
    [dias],
  );
  const carpeta = resolve(rutaDatos, 'audios');
  for (const t of rows) {
    await rm(join(carpeta, t.ruta_audio), { force: true });
    await pool.query('UPDATE transcripciones SET ruta_audio = NULL WHERE id = $1', [t.id]);
  }
  return rows.length;
}

export function iniciarRetencionAudios(deps: {
  pool: Pool;
  config: Config;
  log?: Pick<FastifyBaseLogger, 'error'>;
}): { detener: () => void } {
  // Misma bandera que la cola: en los tests no corre sola.
  if (!deps.config.COLA_ACTIVA) return { detener: () => {} };
  const pasar = () => {
    aplicarRetencionAudios(deps.pool, deps.config.RUTA_DATOS)
      .catch((error) => deps.log?.error({ err: error }, 'fallo aplicando la retención de audios'));
  };
  pasar();
  const temporizador = setInterval(pasar, CADA);
  temporizador.unref();
  return { detener: () => clearInterval(temporizador) };
}
