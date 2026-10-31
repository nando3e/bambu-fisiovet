// Clínicas: sugerencias, unirse sin cuello de botella e invitar compañeros.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRASENA, correoUnico, entrarSuperadmin, pedir, servidorDePrueba, tokenDelCorreo,
  veterinarioVerificado, type Servidor,
} from './ayuda.ts';

let s: Servidor;
let admin: string;
before(async () => {
  s = await servidorDePrueba('clinicas');
  admin = await entrarSuperadmin(s);
});
after(async () => {
  await s.app.close();
});

const sufijo = () => Math.random().toString(36).slice(2, 8);

test('el alta crea su clínica y guarda el dominio solo si no es genérico', async () => {
  const propio = await veterinarioVerificado(s, { email: correoUnico('vet', `cl${sufijo()}.vet`) });
  const generico = await veterinarioVerificado(s);
  const { rows } = await s.pool.query(
    'SELECT id, dominio_correo FROM clinicas WHERE id = ANY($1) ORDER BY id',
    [[propio.usuario.clinica.id, generico.usuario.clinica.id]],
  );
  assert.match(rows[0].dominio_correo, /^cl.*\.vet$/);
  assert.equal(rows[1].dominio_correo, null);
});

test('sugerencias por nombre parecido y por dominio, solo nombre y población', async () => {
  const marca = sufijo();
  await veterinarioVerificado(s, { clinica: `Clínica Veterinària Sant Roc ${marca}` });
  const r = await pedir(s.app, 'GET', `/api/clinicas/sugerencias?nombre=${encodeURIComponent(`Clinica Sant Roc ${marca}`)}`);
  assert.equal(r.estado, 200);
  assert.ok(r.cuerpo.clinicas.some((c: { nombre: string }) => c.nombre.endsWith(marca)));
  assert.deepEqual(Object.keys(r.cuerpo.clinicas[0]).sort(), ['id', 'mismo_dominio', 'nombre', 'poblacion']);
});

test('mismo dominio de correo: unido al momento, sin solicitud pendiente', async () => {
  const dominio = `santroc${sufijo()}.vet`;
  const primera = await veterinarioVerificado(s, { email: correoUnico('a', dominio) });
  const segunda = await veterinarioVerificado(s, { email: correoUnico('b', dominio) });
  const r = await pedir(s.app, 'POST', `/api/clinicas/${primera.usuario.clinica.id}/solicitudes-union`, {
    cookie: segunda.cookie,
  });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.resultado, 'auto');
  const yo = await pedir(s.app, 'GET', '/api/auth/yo', { cookie: segunda.cookie });
  assert.equal(yo.cuerpo.clinica.id, primera.usuario.clinica.id);
  const { rows } = await s.pool.query('SELECT activa FROM clinicas WHERE id = $1', [segunda.usuario.clinica.id]);
  assert.equal(rows[0].activa, false, 'la clínica provisional queda inactiva');
  const notificaciones = await pedir(s.app, 'GET', '/api/notificaciones', { cookie: segunda.cookie });
  assert.ok(notificaciones.cuerpo.notificaciones.some((n: { tipo: string }) => n.tipo === 'usuario.union_resuelta'));
});

test('correo genérico: pendiente; llega a compañeros y Bambú; un compañero aprueba', async () => {
  const destino = await veterinarioVerificado(s);
  const solicitante = await veterinarioVerificado(s, { nombre: 'Jordi' });
  const r = await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, {
    cookie: solicitante.cookie,
  });
  assert.equal(r.cuerpo.resultado, 'pendiente');

  const avisoCompanero = await pedir(s.app, 'GET', '/api/notificaciones', { cookie: destino.cookie });
  const aviso = avisoCompanero.cuerpo.notificaciones.find((n: { tipo: string }) => n.tipo === 'usuario.solicita_union');
  assert.ok(aviso, 'el compañero recibe la solicitud');
  assert.equal(aviso.enlace, '/d/perfil');
  const avisoBambu = await pedir(s.app, 'GET', '/api/notificaciones', { cookie: admin });
  assert.ok(
    avisoBambu.cuerpo.notificaciones.some((n: { tipo: string }) => n.tipo === 'usuario.solicita_union'),
    'el superadmin, del lado Bambú, recibe la solicitud en la campana',
  );

  const repetida = await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, {
    cookie: solicitante.cookie,
  });
  assert.equal(repetida.estado, 409);

  const mia = await pedir(s.app, 'GET', '/api/clinicas/mia', { cookie: destino.cookie });
  const solicitud = mia.cuerpo.solicitudes_recibidas[0];
  assert.equal(solicitud.nombre, 'Jordi');

  // Un veterinario de otra clínica no la ve ni la puede resolver.
  const ajeno = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud.id}/aprueba`, { cookie: ajeno.cookie })).estado, 404);

  const aprobada = await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud.id}/aprueba`, { cookie: destino.cookie });
  assert.equal(aprobada.estado, 200);
  const yo = await pedir(s.app, 'GET', '/api/auth/yo', { cookie: solicitante.cookie });
  assert.equal(yo.cuerpo.clinica.id, destino.usuario.clinica.id);
  assert.equal(
    (await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud.id}/rechaza`, { cookie: admin })).estado,
    409,
    'ya resuelta',
  );
});

test('rechazar: se queda en su clínica y recibe el aviso', async () => {
  const destino = await veterinarioVerificado(s);
  const solicitante = await veterinarioVerificado(s);
  await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, { cookie: solicitante.cookie });
  const lista = await pedir(s.app, 'GET', '/api/solicitudes-union', { cookie: admin });
  const solicitud = lista.cuerpo.solicitudes.find((x: { email: string }) => x.email === solicitante.email);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud.id}/rechaza`, { cookie: admin })).estado, 200);
  const yo = await pedir(s.app, 'GET', '/api/auth/yo', { cookie: solicitante.cookie });
  assert.equal(yo.cuerpo.clinica.id, solicitante.usuario.clinica.id);
  const n = await pedir(s.app, 'GET', '/api/notificaciones', { cookie: solicitante.cookie });
  assert.match(n.cuerpo.notificaciones[0].titulo, /No s'ha acceptat/);
});

test('elegir clínica en el alta: la solicitud se hace al confirmar el correo', async () => {
  const destino = await veterinarioVerificado(s);
  const email = correoUnico();
  await pedir(s.app, 'POST', '/api/auth/registro', {
    cuerpo: {
      nombre: 'Anna', apellidos: 'Roca', email, telefono: '600000000',
      clinica: { nombre: 'La meua' }, privacidad: true, union_clinica_id: destino.usuario.clinica.id,
    },
  });
  const { rows: antes } = await s.pool.query(
    `SELECT count(*)::int AS n FROM solicitudes_union s JOIN usuarios u ON u.id = s.usuario_id WHERE u.email = $1`,
    [email],
  );
  assert.equal(antes[0].n, 0, 'nada antes de verificar');
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');
  await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } });
  const mia = await pedir(s.app, 'GET', '/api/clinicas/mia', { cookie: destino.cookie });
  assert.ok(mia.cuerpo.solicitudes_recibidas.some((x: { email: string }) => x.email === email));
});

test('clínica provisional con compañeros → 409; invitar a un compañero lo crea dentro', async () => {
  const titular = await veterinarioVerificado(s);
  const emailCompanero = correoUnico();
  const inv = await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', {
    cookie: titular.cookie, cuerpo: { nombre: 'Biel', email: emailCompanero },
  });
  assert.equal(inv.estado, 201);
  const token = await tokenDelCorreo(s.pool, emailCompanero, 'invitacion-clinica');
  const acepta = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } });
  assert.equal(acepta.estado, 200);
  assert.equal(acepta.cuerpo.usuario.clinica.id, titular.usuario.clinica.id);

  const otra = await veterinarioVerificado(s);
  const r = await pedir(s.app, 'POST', `/api/clinicas/${otra.usuario.clinica.id}/solicitudes-union`, { cookie: titular.cookie });
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error, /fusione/);
});

test('rol: el derivador no lista clínicas; Bambú sí', async () => {
  const vet = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'GET', '/api/clinicas', { cookie: vet.cookie })).estado, 403);
  const r = await pedir(s.app, 'GET', '/api/clinicas', { cookie: admin });
  assert.equal(r.estado, 200);
  assert.ok(r.cuerpo.clinicas.length > 0);
});
