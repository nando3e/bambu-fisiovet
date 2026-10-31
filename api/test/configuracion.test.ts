// Configuración del panel: contacto de la web, retención y el servidor de
// correo, que solo toca el superadmin y cuya contraseña nunca vuelve.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { canalSmtp } from '../src/correo/transporte.ts';
import {
  entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado, type Servidor,
} from './ayuda.ts';

let s: Servidor;
let admin: string;
let fisio: string;
before(async () => {
  s = await servidorDePrueba('configuracion');
  admin = await entrarSuperadmin(s);
  fisio = (await fisioVerificada(s, admin)).cookie;
});
after(async () => {
  await s.app.close();
});

const servidorCorreo = (extra: Record<string, unknown> = {}) => ({
  host: '127.0.0.1', puerto: 1, seguridad: 'starttls', usuario: 'avisos@bambufisiovet.com',
  remitente_nombre: 'BAMBÚ Fisiovet', remitente_email: 'avisos@bambufisiovet.com', ...extra,
});

test('rol: el derivador no ve la configuración', async () => {
  const vet = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'GET', '/api/configuracion', { cookie: vet.cookie })).estado, 403);
  assert.equal((await pedir(s.app, 'GET', '/api/configuracion/avisos', { cookie: vet.cookie })).estado, 403);
});

test('contacto: un teléfono con letras → 400 y no cambia nada', async () => {
  const r = await pedir(s.app, 'PUT', '/api/configuracion/contacto', {
    cookie: fisio, cuerpo: { telefono: 'llama-nos' },
  });
  assert.equal(r.estado, 400);
  assert.ok(r.cuerpo.campos.telefono);
});

test('contacto: la web lo lee al momento y no enseña los campos vacíos', async () => {
  const r = await pedir(s.app, 'PUT', '/api/configuracion/contacto', {
    cookie: fisio, cuerpo: { telefono: '+34 960 000 000', email: 'hola@bambufisiovet.com', direccion: '' },
  });
  assert.equal(r.estado, 200);
  const publico = await pedir(s.app, 'GET', '/api/publico/contacto');
  assert.deepEqual(publico.cuerpo, { email: 'hola@bambufisiovet.com', telefono: '+34 960 000 000' });
  const { rows } = await s.pool.query(`SELECT count(*)::int AS n FROM historial WHERE tabla = 'configuracion' AND fila_id = 'contacto'`);
  assert.ok(rows[0].n >= 1, 'el cambio queda en el historial');
});

test('retención: fuera de rango → 400', async () => {
  assert.equal((await pedir(s.app, 'PUT', '/api/configuracion/retencion', { cookie: fisio, cuerpo: { audio_dias: 0 } })).estado, 400);
  assert.equal((await pedir(s.app, 'PUT', '/api/configuracion/retencion', { cookie: fisio, cuerpo: { audio_dias: 30 } })).estado, 200);
});

test('una clave que no es del panel → 404 (el servidor de correo tiene su propia ruta)', async () => {
  const r = await pedir(s.app, 'PUT', '/api/configuracion/correo_servidor', { cookie: fisio, cuerpo: {} });
  assert.equal(r.estado, 404);
});

test('servidor de correo: un usuario bambu → 403', async () => {
  assert.equal((await pedir(s.app, 'GET', '/api/configuracion/correo', { cookie: fisio })).estado, 403);
  assert.equal((await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: fisio, cuerpo: servidorCorreo() })).estado, 403);
});

test('servidor de correo: la contraseña se cifra, nunca vuelve y se conserva si llega vacía', async () => {
  const guardar = await pedir(s.app, 'PUT', '/api/configuracion/correo', {
    cookie: admin, cuerpo: servidorCorreo({ contrasena: 'secreto-de-dondominio' }),
  });
  assert.equal(guardar.estado, 200);
  assert.equal(guardar.cuerpo.contrasena_configurada, true);
  assert.doesNotMatch(guardar.respuesta.body, /secreto-de-dondominio|contrasena_cifrada/);

  const leer = await pedir(s.app, 'GET', '/api/configuracion/correo', { cookie: admin });
  assert.equal(leer.cuerpo.contrasena_configurada, true);
  assert.doesNotMatch(leer.respuesta.body, /secreto|v1:/);

  const { rows } = await s.pool.query(`SELECT valor FROM configuracion WHERE clave = 'correo_servidor'`);
  const cifrada = rows[0].valor.contrasena_cifrada;
  assert.match(cifrada, /^v1:/);
  assert.doesNotMatch(cifrada, /secreto-de-dondominio/);

  // Cambiar el puerto sin tocar la contraseña la conserva.
  await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: admin, cuerpo: servidorCorreo({ puerto: 2 }) });
  const { rows: despues } = await s.pool.query(`SELECT valor FROM configuracion WHERE clave = 'correo_servidor'`);
  assert.equal(despues[0].valor.contrasena_cifrada, cifrada);
  assert.equal(despues[0].valor.puerto, 2);

  const { rows: historial } = await s.pool.query(
    `SELECT antes::text || despues::text AS t FROM historial WHERE fila_id = 'correo_servidor'`,
  );
  for (const h of historial) assert.doesNotMatch(h.t, /contrasena_cifrada|v1:|secreto/);
});

test('correo de prueba con un servidor que no responde: muestra el error', async () => {
  await pedir(s.app, 'PUT', '/api/configuracion/correo', {
    cookie: admin, cuerpo: servidorCorreo({ puerto: 1, contrasena: 'secreto-de-dondominio' }),
  });
  const r = await pedir(s.app, 'POST', '/api/configuracion/correo/prueba', {
    cookie: admin, cuerpo: { para: 'nando@rbimprove.com' },
  });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.enviado, false);
  assert.match(r.cuerpo.error, /SMTP/);
});

test('el canal real lee la configuración en cada envío: un cambio vale sin reiniciar', async () => {
  const canal = canalSmtp(s.pool, s.config);
  const mensaje = { para: 'x@y.es', asunto: 'a', html: '<p>a</p>', texto: 'a' };
  await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: admin, cuerpo: servidorCorreo({ puerto: 1 }) });
  const a = await canal.enviar(mensaje);
  await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: admin, cuerpo: servidorCorreo({ puerto: 2 }) });
  const b = await canal.enviar(mensaje);
  assert.equal(a.resultado, 'error');
  assert.equal(b.resultado, 'error');
  assert.match((a as { motivo: string }).motivo, /:1\b/);
  assert.match((b as { motivo: string }).motivo, /:2\b/);
});

test('sin servidor completo, el canal omite el envío con su motivo', async () => {
  await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: admin, cuerpo: servidorCorreo({ host: '' }) });
  const r = await canalSmtp(s.pool, s.config).enviar({ para: 'x@y.es', asunto: 'a', html: 'a', texto: 'a' });
  assert.deepEqual(r, { resultado: 'omitido', motivo: 'smtp sin configurar' });
  const avisos = await pedir(s.app, 'GET', '/api/configuracion/avisos', { cookie: fisio });
  assert.equal(avisos.cuerpo.smtp_configurado, false);
  assert.equal(avisos.cuerpo.matriz.length, 17);
});
