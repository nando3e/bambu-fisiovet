// Configuración del panel: contacto de la web, retención, el servidor de
// correo (solo superadmin, contraseña que nunca vuelve) y las fotos de la web.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { TIPOS_EVENTO } from '../src/avisos/eventos.ts';
import { canalSmtp } from '../src/correo/transporte.ts';
import { entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado, type Servidor } from './ayuda.ts';

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

test('contacto y retención: se validan, la web los lee al momento sin campos vacíos y queda historial; una clave ajena → 404', async () => {
  assert.ok((await pedir(s.app, 'PUT', '/api/configuracion/contacto', { cookie: fisio, cuerpo: { telefono: 'llama-nos' } })).cuerpo.campos.telefono);
  await pedir(s.app, 'PUT', '/api/configuracion/contacto', { cookie: fisio, cuerpo: { telefono: '+34 960 000 000', email: 'hola@bambufisiovet.com', direccion: '' } });
  assert.deepEqual((await pedir(s.app, 'GET', '/api/publico/contacto')).cuerpo, { email: 'hola@bambufisiovet.com', telefono: '+34 960 000 000' });
  assert.ok((await s.pool.query(`SELECT count(*)::int AS n FROM historial WHERE tabla = 'configuracion' AND fila_id = 'contacto'`)).rows[0].n >= 1);
  assert.equal((await pedir(s.app, 'PUT', '/api/configuracion/retencion', { cookie: fisio, cuerpo: { audio_dias: 0 } })).estado, 400);
  assert.equal((await pedir(s.app, 'PUT', '/api/configuracion/correo_servidor', { cookie: fisio, cuerpo: {} })).estado, 404);
});

test('servidor de correo: la contraseña se cifra, nunca vuelve ni va al historial y se conserva si llega vacía; el canal lee cada cambio', async () => {
  const guardar = await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: admin, cuerpo: servidorCorreo({ contrasena: 'secreto-de-dondominio' }) });
  assert.equal(guardar.cuerpo.contrasena_configurada, true);
  assert.doesNotMatch(guardar.respuesta.body, /secreto|contrasena_cifrada/);
  assert.doesNotMatch((await pedir(s.app, 'GET', '/api/configuracion/correo', { cookie: admin })).respuesta.body, /secreto|v1:/);
  const cifrada = (await s.pool.query(`SELECT valor FROM configuracion WHERE clave = 'correo_servidor'`)).rows[0].valor.contrasena_cifrada;
  assert.match(cifrada, /^v1:/);

  const canal = canalSmtp(s.pool, s.config);
  const mensaje = { para: 'x@y.es', asunto: 'a', html: '<p>a</p>', texto: 'a' };
  assert.match((await canal.enviar(mensaje) as { motivo: string }).motivo, /:1\b/);
  await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: admin, cuerpo: servidorCorreo({ puerto: 2 }) });
  assert.match((await canal.enviar(mensaje) as { motivo: string }).motivo, /:2\b/);
  assert.equal((await s.pool.query(`SELECT valor FROM configuracion WHERE clave = 'correo_servidor'`)).rows[0].valor.contrasena_cifrada, cifrada);
  for (const h of (await s.pool.query(`SELECT antes::text || despues::text AS t FROM historial WHERE fila_id = 'correo_servidor'`)).rows) {
    assert.doesNotMatch(h.t, /contrasena_cifrada|v1:|secreto/);
  }

  // Correo de prueba: sale fuera de la cola, enseña el error y deja traza.
  const prueba = await pedir(s.app, 'POST', '/api/configuracion/correo/prueba', { cookie: admin, cuerpo: { para: 'nando@rbimprove.com' } });
  assert.equal(prueba.cuerpo.enviado, false);
  assert.match((await s.pool.query(`SELECT motivo FROM avisos_enviados WHERE plantilla = 'prueba' ORDER BY id DESC LIMIT 1`)).rows[0].motivo, /^prova: /);

  // Incompleto: el canal omite con su motivo y el panel lo dice.
  await pedir(s.app, 'PUT', '/api/configuracion/correo', { cookie: admin, cuerpo: servidorCorreo({ host: '' }) });
  assert.deepEqual(await canal.enviar(mensaje), { resultado: 'omitido', motivo: 'smtp sin configurar' });
  const avisos = (await pedir(s.app, 'GET', '/api/configuracion/avisos', { cookie: fisio })).cuerpo;
  assert.deepEqual([avisos.smtp_configurado, avisos.matriz.length], [false, TIPOS_EVENTO.length]);
});

test('la cola del panel enseña un correo fallido de hace días, no solo las últimas 24 horas', async () => {
  const { rows } = await s.pool.query(
    `INSERT INTO correos_pendientes (destinatario, plantilla, datos, estado, intentos, error, creado)
     VALUES ('viejo@clinica.vet', 'prueba', '{}', 'fallido', 6, 'SMTP caigut', now() - interval '3 days') RETURNING id`,
  );
  const r = await pedir(s.app, 'GET', '/api/configuracion/avisos/cola', { cookie: admin });
  assert.ok(r.cuerpo.correos.some((c: { id: number }) => c.id === rows[0].id));
});

test('fotos de la web: una PNG se guarda y se sirve, restaurar vuelve a la de serie; un ejecutable, un hueco inventado o ../ no pasan', async () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const subir = (cookie: string, hueco: string, datos: Buffer) => {
    const limite = '----bambu' + Math.random().toString(16).slice(2);
    return s.app.inject({
      method: 'POST', url: `/api/configuracion/imagenes/${hueco}`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${limite}` },
      payload: Buffer.concat([
        Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="imagen"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n`),
        datos, Buffer.from(`\r\n--${limite}--\r\n`),
      ]),
    });
  };
  const url = (await subir(fisio, 'portada', PNG)).json().url as string;
  assert.match(url, /^\/api\/publico\/imagenes\/portada-[a-f0-9]{16}\.png$/);
  assert.deepEqual((await pedir(s.app, 'GET', '/api/publico/imagenes')).cuerpo, { portada: url, instalaciones: null });
  assert.equal((await s.app.inject({ method: 'GET', url })).headers['content-type'], 'image/png');
  await pedir(s.app, 'POST', '/api/configuracion/imagenes/portada/restaura', { cookie: fisio });
  assert.equal((await pedir(s.app, 'GET', '/api/publico/imagenes')).cuerpo.portada, null);

  assert.equal((await subir(fisio, 'portada', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]))).statusCode, 400);
  assert.equal((await subir(fisio, 'fondo', PNG)).statusCode, 404);
  assert.equal((await subir((await veterinarioVerificado(s)).cookie, 'portada', PNG)).statusCode, 403);
  assert.equal((await s.app.inject({ method: 'GET', url: '/api/publico/imagenes/..%2F..%2F.env' })).statusCode, 404);
});
