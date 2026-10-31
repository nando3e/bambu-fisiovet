// Arranque: migraciones, superadmin por entorno y la web servida por el API.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { aplicarMigraciones } from '../src/db/migraciones.ts';
import { crearPool } from '../src/db/pool.ts';
import { baseLimpia, ENTORNO_BASE, pedir, servidorDePrueba, type Servidor } from './ayuda.ts';

const abiertos: Servidor[] = [];
after(async () => {
  for (const s of abiertos) await s.app.close();
});

async function arrancar(url: string, entorno: Record<string, string> = {}) {
  const s = await servidorDePrueba('arranque', entorno, { url });
  abiertos.push(s);
  return s;
}

test('las migraciones se pueden aplicar dos veces y /api/salud responde', async () => {
  const url = await baseLimpia('arranque');
  const s = await arrancar(url);
  assert.deepEqual(await aplicarMigraciones(s.pool), [], 'la segunda vez no aplica nada');
  const { rows } = await s.pool.query('SELECT count(*)::int AS n FROM migraciones');
  assert.equal(rows[0].n, 4);
  assert.equal((await pedir(s.app, 'GET', '/api/salud')).estado, 200);
  assert.equal((await pedir(s.app, 'GET', '/api/no-existe')).estado, 404);
});

test('dos arranques a la vez sobre una base nueva: los dos acaban bien y cada migración se aplica una vez', async () => {
  const url = await baseLimpia('arranque_paralelo');
  const a = crearPool(url);
  const b = crearPool(url);
  try {
    const [na, nb] = await Promise.all([aplicarMigraciones(a), aplicarMigraciones(b)]);
    assert.equal(na.length + nb.length, 4);
    const { rows } = await a.query('SELECT count(*)::int AS n FROM migraciones');
    assert.equal(rows[0].n, 4);
  } finally {
    await a.end();
    await b.end();
  }
});

test('superadmin: cambiar la contraseña por entorno; la vieja deja de valer', async () => {
  const url = await baseLimpia('superadmin');
  const entrar = (s: Servidor, contrasena: string) =>
    pedir(s.app, 'POST', '/api/auth/entrar', { cuerpo: { identificador: 'superadmin', contrasena } });

  const primero = await arrancar(url, { SUPERADMIN_CONTRASENA: 'primera-contrasena' });
  assert.equal((await entrar(primero, 'primera-contrasena')).estado, 200);

  const segundo = await arrancar(url, { SUPERADMIN_CONTRASENA: 'segunda-contrasena' });
  assert.equal((await entrar(segundo, 'segunda-contrasena')).estado, 200);
  assert.equal((await entrar(segundo, 'primera-contrasena')).estado, 401);

  const { rows } = await segundo.pool.query(
    'SELECT count(*)::int AS n, max(contrasena_hash) AS hash FROM usuarios WHERE es_de_entorno',
  );
  assert.equal(rows[0].n, 1, 'una sola fila de superadmin');
  assert.equal(rows[0].hash, null, 'sin hash en la base');
});

test('superadmin: sin contraseña nadie entra; cambiar el usuario renombra, no duplica', async () => {
  const url = await baseLimpia('superadmin_usuario');
  const sin = await arrancar(url, { SUPERADMIN_CONTRASENA: '' });
  const r = await pedir(sin.app, 'POST', '/api/auth/entrar', {
    cuerpo: { identificador: 'superadmin', contrasena: ENTORNO_BASE.SUPERADMIN_CONTRASENA },
  });
  assert.equal(r.estado, 401);

  const renombrado = await arrancar(url, { SUPERADMIN_USUARIO: 'nando' });
  const { rows } = await renombrado.pool.query('SELECT usuario FROM usuarios WHERE es_de_entorno');
  assert.deepEqual(rows.map((f) => f.usuario), ['nando']);
  const ok = await pedir(renombrado.app, 'POST', '/api/auth/entrar', {
    cuerpo: { identificador: 'Nando', contrasena: ENTORNO_BASE.SUPERADMIN_CONTRASENA },
  });
  assert.equal(ok.estado, 200);
  assert.equal(ok.cuerpo.rol, 'superadmin');
});

test('superadmin: no puede recuperar ni cambiar su contraseña desde la app', async () => {
  const s = await servidorDePrueba('superadmin_limites');
  abiertos.push(s);
  const entrar = await pedir(s.app, 'POST', '/api/auth/entrar', {
    cuerpo: { identificador: 'superadmin', contrasena: ENTORNO_BASE.SUPERADMIN_CONTRASENA },
  });
  const cambio = await pedir(s.app, 'POST', '/api/auth/cambia-contrasena', {
    cookie: entrar.cookie, cuerpo: { actual: ENTORNO_BASE.SUPERADMIN_CONTRASENA, nueva: 'otra-contrasena-larga' },
  });
  assert.equal(cambio.estado, 403);
  // Con su usuario real, que no es un correo: la respuesta genérica, no un 400.
  const recupera = await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email: ENTORNO_BASE.SUPERADMIN_USUARIO } });
  assert.equal(recupera.estado, 200);
  assert.match(recupera.cuerpo.mensaje, /Si existeix un compte/);
  const { rows } = await s.pool.query('SELECT count(*)::int AS n FROM correos_pendientes');
  assert.equal(rows[0].n, 0);
});

test('superadmin: un reinicio cierra sus sesiones', async () => {
  const url = await baseLimpia('superadmin_sesiones');
  const a = await arrancar(url);
  const entrar = await pedir(a.app, 'POST', '/api/auth/entrar', {
    cuerpo: { identificador: 'superadmin', contrasena: ENTORNO_BASE.SUPERADMIN_CONTRASENA },
  });
  assert.equal((await pedir(a.app, 'GET', '/api/auth/yo', { cookie: entrar.cookie })).estado, 200);
  const b = await arrancar(url);
  assert.equal((await pedir(b.app, 'GET', '/api/auth/yo', { cookie: entrar.cookie })).estado, 401);
});

test('la web: cualquier ruta que no es del API devuelve el index sin caché', async () => {
  const web = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>Bambú</title>');
  const s = await servidorDePrueba('web', {}, { carpetaWeb: web });
  abiertos.push(s);
  const pagina = await s.app.inject({ method: 'GET', url: '/acces/estableix/abc' });
  assert.equal(pagina.statusCode, 200);
  assert.match(pagina.body, /<title>Bambú<\/title>/);
  assert.equal(pagina.headers['cache-control'], 'no-cache');
  const api = await s.app.inject({ method: 'GET', url: '/api/no-existe' });
  assert.equal(api.statusCode, 404);
  assert.equal(api.json().error, 'No existeix');
  // Un .js que ya no existe (PWA vieja tras un despliegue): 404, nunca el index
  // servido como JavaScript, que deja la página en blanco.
  const viejo = await s.app.inject({ method: 'GET', url: '/assets/index-viejo123.js' });
  assert.equal(viejo.statusCode, 404);
  assert.doesNotMatch(viejo.body, /<title>/);
});

test('JSON: un cuerpo que no es UTF-8 → 400 y no se guarda; en UTF-8 llega intacto', async () => {
  const s = await servidorDePrueba('utf8');
  abiertos.push(s);
  const cuerpo = (email: string) => ({
    nombre: 'Marta', apellidos: 'Puig', email, telefono: '600123456',
    clinica: { nombre: 'Clínica Sant Roc' }, privacidad: true,
  });
  // «í» en latin-1 (0xED), como lo manda curl desde una consola de Windows.
  const latin1 = Buffer.from(JSON.stringify(cuerpo('latin1@x.vet')), 'latin1');
  const mal = await s.app.inject({
    method: 'POST', url: '/api/auth/registro', headers: { 'content-type': 'application/json' }, payload: latin1,
  });
  assert.equal(mal.statusCode, 400);
  assert.match(mal.json().error, /UTF-8/);

  const bien = await s.app.inject({
    method: 'POST', url: '/api/auth/registro', headers: { 'content-type': 'application/json; charset=utf-8' },
    payload: Buffer.from(JSON.stringify(cuerpo('utf8@x.vet')), 'utf8'),
  });
  assert.equal(bien.statusCode, 200);
  const { rows } = await s.pool.query('SELECT nombre FROM clinicas ORDER BY id');
  assert.deepEqual(rows.map((r) => r.nombre), ['Clínica Sant Roc']);

  const roto = await s.app.inject({
    method: 'POST', url: '/api/auth/entrar', headers: { 'content-type': 'application/json' }, payload: '{"identificador":',
  });
  assert.equal(roto.statusCode, 400);
});
