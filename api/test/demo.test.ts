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

test('demo: siembra en una base vacía; la segunda vez y en producción se niega', async () => {
  const pool = new pg.Pool({ connectionString: await baseLimpia('demo') });
  pools.push(pool);
  await assert.rejects(sembrarDemo(pool, 'https://bambufisiovet.com', 'x'), /producción/);
  assert.match(await sembrarDemo(pool, 'http://localhost:8105', 'demo-bambu-2026'), /Demo sembrada/);
  const { rows } = await pool.query(`SELECT estado, count(*)::int AS n FROM casos GROUP BY estado`);
  assert.equal(rows.length, 7, 'hay casos en todos los estados');
  await assert.rejects(sembrarDemo(pool, 'http://localhost:8105', 'demo-bambu-2026'), /no pisa/);
});
