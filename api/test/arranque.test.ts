// Arranque: migraciones, superadmin por entorno y la web servida por el API.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { aplicarMigraciones, CARPETA_MIGRACIONES } from '../src/db/migraciones.ts';
import { crearPool } from '../src/db/pool.ts';
import { baseLimpia, ENTORNO_BASE, pedir, servidorDePrueba, type Servidor } from './ayuda.ts';

const MIGRACIONES = readdirSync(CARPETA_MIGRACIONES).filter((f) => f.endsWith('.sql')).length;
const abiertos: Servidor[] = [];
after(async () => {
  for (const s of abiertos) await s.app.close();
});

async function arrancar(url: string, entorno: Record<string, string> = {}) {
  const s = await servidorDePrueba('arranque', entorno, { url });
  abiertos.push(s);
  return s;
}

test('migraciones: dos arranques a la vez sobre una base nueva acaban bien; repetirlas no aplica nada', async () => {
  const url = await baseLimpia('arranque');
  const a = crearPool(url);
  const b = crearPool(url);
  try {
    const [na, nb] = await Promise.all([aplicarMigraciones(a), aplicarMigraciones(b)]);
    assert.equal(na.length + nb.length, MIGRACIONES);
  } finally {
    await a.end();
    await b.end();
  }
  const s = await arrancar(url);
  assert.deepEqual(await aplicarMigraciones(s.pool), []);
  assert.equal((await s.pool.query('SELECT count(*)::int AS n FROM migraciones')).rows[0].n, MIGRACIONES);
  assert.equal((await pedir(s.app, 'GET', '/api/salud')).estado, 200);
});

test('superadmin por entorno: sin contraseña nadie entra; cambiarla o renombrarlo vale al reiniciar y cierra sus sesiones', async () => {
  const url = await baseLimpia('superadmin');
  const entrar = (s: Servidor, identificador: string, contrasena: string) =>
    pedir(s.app, 'POST', '/api/auth/entrar', { cuerpo: { identificador, contrasena } });

  const sin = await arrancar(url, { SUPERADMIN_CONTRASENA: '' });
  assert.equal((await entrar(sin, 'superadmin', ENTORNO_BASE.SUPERADMIN_CONTRASENA)).estado, 401);

  const primero = await arrancar(url, { SUPERADMIN_CONTRASENA: 'primera-contrasena' });
  const sesion = await entrar(primero, 'superadmin', 'primera-contrasena');
  assert.equal(sesion.estado, 200);
  // Desde la app no se cambia ni se recupera (respuesta genérica, sin correo).
  assert.equal((await pedir(primero.app, 'POST', '/api/auth/cambia-contrasena', {
    cookie: sesion.cookie, cuerpo: { actual: 'primera-contrasena', nueva: 'otra-contrasena-larga' },
  })).estado, 403);
  const recupera = await pedir(primero.app, 'POST', '/api/auth/recupera', { cuerpo: { email: 'superadmin' } });
  assert.match(recupera.cuerpo.mensaje, /Si existeix un compte/);
  assert.equal((await primero.pool.query('SELECT count(*)::int AS n FROM correos_pendientes')).rows[0].n, 0);

  const segundo = await arrancar(url, { SUPERADMIN_USUARIO: 'nando', SUPERADMIN_CONTRASENA: 'segunda-contrasena' });
  assert.equal((await pedir(segundo.app, 'GET', '/api/auth/yo', { cookie: sesion.cookie })).estado, 401);
  assert.equal((await entrar(segundo, 'Nando', 'primera-contrasena')).estado, 401);
  assert.equal((await entrar(segundo, 'Nando', 'segunda-contrasena')).cuerpo.rol, 'superadmin');
  const { rows } = await segundo.pool.query('SELECT usuario, contrasena_hash FROM usuarios WHERE es_de_entorno');
  assert.deepEqual(rows, [{ usuario: 'nando', contrasena_hash: null }]);
});

test('web: las rutas que no son del API sirven el index sin caché; un .js que no existe da 404', async () => {
  const web = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>Bambú</title>');
  const s = await servidorDePrueba('web', {}, { carpetaWeb: web });
  abiertos.push(s);
  const pagina = await s.app.inject({ method: 'GET', url: '/acces/estableix/abc' });
  assert.match(pagina.body, /<title>Bambú<\/title>/);
  assert.equal(pagina.headers['cache-control'], 'no-cache');
  assert.equal((await s.app.inject({ method: 'GET', url: '/api/no-existe' })).json().error, 'No existeix');
  // Una PWA vieja pide un .js que ya no está: nunca el index servido como JavaScript.
  assert.equal((await s.app.inject({ method: 'GET', url: '/assets/index-viejo123.js' })).statusCode, 404);
});

test('JSON: un cuerpo que no es UTF-8 → 400 y no se guarda; en UTF-8 llega intacto', async () => {
  const s = await servidorDePrueba('utf8');
  abiertos.push(s);
  const cuerpo = (email: string) => ({
    nombre: 'Marta', apellidos: 'Puig', email, telefono: '600123456', clinica: { nombre: 'Clínica Sant Roc' }, privacidad: true,
  });
  // «í» en latin-1, como lo manda curl desde una consola de Windows.
  const mal = await s.app.inject({
    method: 'POST', url: '/api/auth/registro', headers: { 'content-type': 'application/json' },
    payload: Buffer.from(JSON.stringify(cuerpo('latin1@x.vet')), 'latin1'),
  });
  assert.equal(mal.statusCode, 400);
  const bien = await s.app.inject({
    method: 'POST', url: '/api/auth/registro', headers: { 'content-type': 'application/json; charset=utf-8' },
    payload: Buffer.from(JSON.stringify(cuerpo('utf8@x.vet')), 'utf8'),
  });
  assert.equal(bien.statusCode, 200);
  assert.deepEqual((await s.pool.query('SELECT nombre FROM clinicas')).rows.map((r) => r.nombre), ['Clínica Sant Roc']);
});
