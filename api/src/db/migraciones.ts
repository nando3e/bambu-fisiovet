// Migraciones SQL numeradas e idempotentes, aplicadas al arrancar. La tabla
// `migraciones` registra lo aplicado y cada fichero puede correr dos veces sin
// romper nada.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from './pool.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const CARPETA_MIGRACIONES = join(AQUI, '..', '..', 'migrations');
/** Número arbitrario y fijo para `pg_advisory_lock`; solo lo usan las migraciones. */
const CERROJO_MIGRACIONES = 815_200_001;

export async function aplicarMigraciones(
  pool: Pool,
  carpeta: string = CARPETA_MIGRACIONES,
): Promise<string[]> {
  // Un cerrojo para toda la tanda: en un redespliegue pueden arrancar dos
  // contenedores a la vez, y sin él los dos aplicarían la misma migración.
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [CERROJO_MIGRACIONES]);
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS migraciones (
        nombre    text PRIMARY KEY,
        aplicada  timestamptz NOT NULL DEFAULT now()
      )
    `);
    const ficheros = (await readdir(carpeta)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await cliente.query<{ nombre: string }>('SELECT nombre FROM migraciones');
    const yaAplicadas = new Set(rows.map((r) => r.nombre));

    const nuevas: string[] = [];
    for (const fichero of ficheros) {
      if (yaAplicadas.has(fichero)) continue;
      const sql = await readFile(join(carpeta, fichero), 'utf8');
      // Cada migración en su transacción: si la 003 falla, la 001 y la 002 se
      // quedan y el arreglo es solo de la que falló.
      try {
        await cliente.query('BEGIN');
        await cliente.query(sql);
        await cliente.query('INSERT INTO migraciones (nombre) VALUES ($1)', [fichero]);
        await cliente.query('COMMIT');
        nuevas.push(fichero);
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw new Error(`La migración ${fichero} ha fallado: ${(error as Error).message}`);
      }
    }
    return nuevas;
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [CERROJO_MIGRACIONES]).catch(() => {});
    cliente.release();
  }
}
