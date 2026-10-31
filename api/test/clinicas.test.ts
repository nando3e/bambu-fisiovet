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

const solicitudDe = async (usuarioId: number) =>
  (await s.pool.query(
    `SELECT id FROM solicitudes_union WHERE usuario_id = $1 AND estado = 'pendiente'`, [usuarioId],
  )).rows[0].id as number;

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

test('sugerencias: la clínica de un alta sin verificar no se ofrece; mismo_dominio siempre es booleano', async () => {
  const marca = sufijo();
  await pedir(s.app, 'POST', '/api/auth/registro', {
    cuerpo: {
      nombre: 'Anna', apellidos: 'Soler', email: correoUnico(), telefono: '600123456',
      clinica: { nombre: `Clínica Fantasma ${marca}` }, privacidad: true,
    },
  });
  const nombre = encodeURIComponent(`Clinica Fantasma ${marca}`);
  const antes = await pedir(s.app, 'GET', `/api/clinicas/sugerencias?nombre=${nombre}`);
  assert.equal(antes.cuerpo.clinicas.length, 0);
  await veterinarioVerificado(s, { clinica: `Clínica Fantasma ${marca}` });
  const despues = await pedir(s.app, 'GET', `/api/clinicas/sugerencias?nombre=${nombre}`);
  assert.equal(despues.cuerpo.clinicas.length, 1);
  assert.equal(despues.cuerpo.clinicas[0].mismo_dominio, false);
});

test('aprobar se revalida: si el solicitante invitó a alguien entre medias → 409 y nadie se mueve', async () => {
  const destino = await veterinarioVerificado(s);
  const solicitante = await veterinarioVerificado(s);
  const pide = await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, {
    cookie: solicitante.cookie,
  });
  assert.equal(pide.estado, 200);
  const invitado = correoUnico();
  await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', {
    cookie: solicitante.cookie, cuerpo: { nombre: 'Biel', email: invitado },
  });
  const solicitud = await solicitudDe(solicitante.usuario.id);
  const r = await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud}/aprueba`, { cookie: destino.cookie });
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error, /fusione/);
  const { rows } = await s.pool.query('SELECT clinica_id FROM usuarios WHERE lower(email) = $1', [invitado]);
  assert.equal(rows[0].clinica_id, solicitante.usuario.clinica.id);
});

test('aprobar hacia una clínica desactivada → 409', async () => {
  const destino = await veterinarioVerificado(s);
  const solicitante = await veterinarioVerificado(s);
  await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, { cookie: solicitante.cookie });
  await s.pool.query('UPDATE clinicas SET activa = false WHERE id = $1', [destino.usuario.clinica.id]);
  const solicitud = await solicitudDe(solicitante.usuario.id);
  const r = await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud}/aprueba`, { cookie: admin });
  assert.equal(r.estado, 409);
});

test('invitar a un correo que ya tiene cuenta: misma respuesta, no se crea nada ni sale correo', async () => {
  const titular = await veterinarioVerificado(s);
  const otro = await veterinarioVerificado(s);
  const antes = (await s.pool.query('SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1', [otro.email])).rows[0].n;
  const r = await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', {
    cookie: titular.cookie, cuerpo: { nombre: 'X', email: otro.email },
  });
  assert.equal(r.estado, 201);
  const { rows } = await s.pool.query('SELECT clinica_id FROM usuarios WHERE lower(email) = $1', [otro.email]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clinica_id, otro.usuario.clinica.id);
  const despues = (await s.pool.query('SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1', [otro.email])).rows[0].n;
  assert.equal(despues, antes);
});

test('invitar a un compañero deja historial', async () => {
  const titular = await veterinarioVerificado(s);
  const email = correoUnico();
  await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: titular.cookie, cuerpo: { nombre: 'Biel', email } });
  const { rows } = await s.pool.query(
    `SELECT h.usuario_id FROM historial h JOIN usuarios u ON h.tabla = 'usuarios' AND h.fila_id = u.id::text
     WHERE lower(u.email) = $1`,
    [email],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].usuario_id, titular.usuario.id);
});

test('solicitudes de unión: un veterinario solo ve las dirigidas a su clínica', async () => {
  const destino = await veterinarioVerificado(s);
  const ajeno = await veterinarioVerificado(s);
  const solicitante = await veterinarioVerificado(s);
  await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, { cookie: solicitante.cookie });
  const id = await solicitudDe(solicitante.usuario.id);
  const delDestino = await pedir(s.app, 'GET', '/api/solicitudes-union', { cookie: destino.cookie });
  const delAjeno = await pedir(s.app, 'GET', '/api/solicitudes-union', { cookie: ajeno.cookie });
  assert.ok(delDestino.cuerpo.solicitudes.some((x: { id: number }) => x.id === id));
  assert.ok(!delAjeno.cuerpo.solicitudes.some((x: { id: number }) => x.id === id));
});

test('invitar compañeros tiene freno: pasado el límite → 429', async () => {
  const limitado = await servidorDePrueba('clinicas_freno', { LIMITE_INTENTOS: '2' });
  try {
    const vet = await veterinarioVerificado(limitado);
    const estados: number[] = [];
    for (let i = 0; i < 3; i++) {
      estados.push((await pedir(limitado.app, 'POST', '/api/clinicas/mia/invitaciones', {
        cookie: vet.cookie, cuerpo: { nombre: 'X', email: correoUnico() },
      })).estado);
    }
    assert.deepEqual(estados, [201, 201, 429]);
  } finally {
    await limitado.app.close();
  }
});

test('la ficha de la clínica no admite un correo que no lo es', async () => {
  const vet = await veterinarioVerificado(s);
  const r = await pedir(s.app, 'PATCH', '/api/clinicas/mia', {
    cookie: vet.cookie, cuerpo: { nombre: 'Clínica Bona', email: 'no-es-un-correo' },
  });
  assert.equal(r.estado, 400);
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
  const acepta = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token, contrasena: CONTRASENA, privacidad: true },
  });
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
