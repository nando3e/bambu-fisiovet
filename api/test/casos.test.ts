// Casos, pacientes y propietarios contra la base real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarMigraciones } from '../src/db/migraciones.ts';
import { entrarSuperadmin, pedir, servidorDePrueba, type Servidor } from './ayuda.ts';

let s: Servidor;
let admin: string;
before(async () => {
  s = await servidorDePrueba('casos');
  admin = await entrarSuperadmin(s);
});
after(async () => {
  await s.app.close();
});

const autor = async () =>
  (await s.pool.query<{ id: number }>('SELECT id FROM usuarios WHERE es_de_entorno LIMIT 1')).rows[0]!.id;

const fallaConRestriccion = async (sql: string, params: unknown[], restriccion: string) => {
  await assert.rejects(s.pool.query(sql, params), (e: { constraint?: string }) => e.constraint === restriccion);
};

test('migración 005: se aplica dos veces sin error y la base rechaza lo incoherente', async () => {
  assert.deepEqual(await aplicarMigraciones(s.pool), []);
  const { rows: p } = await s.pool.query<{ id: number }>(`INSERT INTO propietarios (nombre) VALUES ('Joan') RETURNING id`);
  await fallaConRestriccion(
    `INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'otro', $1)`, [p[0]!.id],
    'pacientes_especie_otra_check',
  );
  await fallaConRestriccion(
    `INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'caball', $1)`, [p[0]!.id],
    'pacientes_especie_check',
  );
  const { rows: pac } = await s.pool.query<{ id: number }>(
    `INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'perro', $1) RETURNING id`, [p[0]!.id],
  );
  // Un caso sin clínica: el portal solo recibe derivaciones.
  await assert.rejects(s.pool.query(
    `INSERT INTO casos (paciente_id, estado, creado_por, registrado_por) VALUES ($1, 'aceptada', $2, $2)`,
    [pac[0]!.id, await autor()],
  ), (e: { code?: string; column?: string }) => e.code === '23502' && e.column === 'clinica_id');
  // Ni quien lo derivó ni quien lo registró.
  const { rows: cl } = await s.pool.query<{ id: number }>(`INSERT INTO clinicas (nombre) VALUES ('Sant Roc') RETURNING id`);
  await fallaConRestriccion(
    `INSERT INTO casos (paciente_id, clinica_id, estado, creado_por) VALUES ($1, $2, 'aceptada', $3)`,
    [pac[0]!.id, cl[0]!.id, await autor()], 'casos_origen_check',
  );
  await fallaConRestriccion(
    `INSERT INTO casos (paciente_id, clinica_id, estado, creado_por, registrado_por) VALUES ($1, $2, 'cerrado', $3, $3)`,
    [pac[0]!.id, cl[0]!.id, await autor()], 'casos_estado_check',
  );
});

test('consentimiento: cambiar el texto sube la versión; guardar el mismo texto, no', async () => {
  const texto = 'Text del consentiment de prova, prou llarg per a valdre.';
  const leer = async () => (await pedir(s.app, 'GET', '/api/configuracion', { cookie: admin })).cuerpo.consentimiento;
  const v0 = (await leer()).version as number;
  assert.equal((await pedir(s.app, 'PUT', '/api/configuracion/consentimiento', { cookie: admin, cuerpo: { texto } })).estado, 200);
  assert.equal((await leer()).version, v0 + 1);
  // La versión la lleva el servidor: mandar otra no cambia nada.
  await pedir(s.app, 'PUT', '/api/configuracion/consentimiento', { cookie: admin, cuerpo: { texto, version: 99 } });
  assert.equal((await leer()).version, v0 + 1);
  assert.equal((await leer()).texto, texto);
});
