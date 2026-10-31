// Pool de Postgres. Un único pool por proceso; las rutas piden cliente solo
// cuando necesitan transacción.
import pg from 'pg';

// int8 (count(*), bigserial) llega como string para no perder precisión. Aquí
// los identificadores y los conteos caben de sobra en un número.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// date: sin hora ni zona, tal cual, para que no se corra un día.
pg.types.setTypeParser(1082, (v) => v);

export type Pool = pg.Pool;
export type ClientePg = pg.PoolClient;
/** Lo que sirve para consultar: el pool o un cliente dentro de una transacción. */
export type Consultable = Pool | ClientePg;

export function crearPool(cadenaConexion: string): Pool {
  return new pg.Pool({
    connectionString: cadenaConexion,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Las conexiones que pasan horas paradas mueren en silencio tras un proxy
    // o un firewall; el keepalive evita el primer 500 «que se arregla
    // recargando» (plantilla DATOS §9).
    keepAlive: true,
  });
}

/** Ejecuta en una transacción y hace rollback si algo revienta. */
export async function enTransaccion<T>(
  pool: Pool,
  fn: (cliente: ClientePg) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}
