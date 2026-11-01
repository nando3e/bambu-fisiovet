// Semilla de demostración: siembra en una base vacía y nunca pisa.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

import { sembrarDemo } from '../seed/demo.ts';
import { baseLimpia } from './ayuda.ts';

const pools: pg.Pool[] = [];
after(async () => {
  for (const p of pools) await p.end();
});

test('demo: siembra aunque ya haya otros casos; con un buzón real lo reparte con «+»; la segunda vez y en producción se niega', async () => {
  const pool = new pg.Pool({ connectionString: await baseLimpia('demo') });
  pools.push(pool);
  await assert.rejects(sembrarDemo(pool, 'https://bambufisiovet.com', 'x'), /producción/);
  // Con casos ya en la base (como el de prueba del portal) siembra igual.
  assert.match(await sembrarDemo(pool, 'http://localhost:8105', 'demo-bambu-2026'), /Demo sembrada/);
  assert.match(await sembrarDemo(pool, 'http://localhost:8105', 'demo-bambu-2026', 'nando@ejemplo.com'), /Demo sembrada/);
  const { rows } = await pool.query(`SELECT estado, count(*)::int AS n FROM casos GROUP BY estado`);
  assert.equal(rows.length, 7, 'hay casos en todos los estados');
  const correos = (await pool.query(`SELECT email FROM usuarios WHERE email LIKE 'nando%' ORDER BY id`)).rows.map((r) => r.email);
  assert.deepEqual(correos.slice(0, 2), ['nando@ejemplo.com', 'nando+pau@ejemplo.com']);
  assert.equal(correos.length, 6);
  const hilo = (await pool.query(`SELECT count(*) FILTER (WHERE visibilidad = 'bambu')::int AS internas, count(*)::int AS n FROM mensajes`)).rows[0];
  assert.ok(hilo.n > 10 && hilo.internas > 0, 'hay conversación y notas internas');
  await assert.rejects(sembrarDemo(pool, 'http://localhost:8105', 'demo-bambu-2026', 'nando@ejemplo.com'), /no pisa/);
});
