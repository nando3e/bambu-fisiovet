// Ciclo de vida de las cuentas: alta, verificación, entrar, sesiones,
// contraseña, recuperación, invitaciones y desactivar. Un test por caso de uso.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRASENA, datosAlta, correoUnico, ENTORNO_BASE, entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba,
  tokenDelCorreo, veterinarioVerificado, type Servidor,
} from './ayuda.ts';

let s: Servidor;
let admin: string;
before(async () => {
  s = await servidorDePrueba('acceso');
  admin = await entrarSuperadmin(s);
});
after(async () => {
  await s.app.close();
});

const alta = (email: string, extra: Record<string, unknown> = {}) =>
  pedir(s.app, 'POST', '/api/auth/registro', {
    cuerpo: { ...datosAlta(email, { nombre: 'Pau', clinica: 'Clínica Vidal' }), ...extra },
  });
const correosA = async (email: string) =>
  (await s.pool.query('SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1', [email])).rows[0].n as number;
const entrar = (identificador: string, contrasena = CONTRASENA) =>
  pedir(s.app, 'POST', '/api/auth/entrar', { cuerpo: { identificador, contrasena } });
const establece = (token: string, contrasena = CONTRASENA, extra: Record<string, unknown> = {}) =>
  pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena, ...extra } });
const estadoToken = async (token: string) => (await pedir(s.app, 'GET', `/api/auth/tokens/${token}`)).cuerpo;

test('alta de un veterinario: privacidad obligatoria, verificación por enlace de un solo uso y entrada a «Nova derivació»', async () => {
  const sinPrivacidad = correoUnico();
  assert.equal((await alta(sinPrivacidad, { privacidad: false })).estado, 400);
  assert.equal((await s.pool.query('SELECT 1 FROM usuarios WHERE email = $1', [sinPrivacidad])).rows.length, 0);

  const email = correoUnico();
  assert.equal((await alta(email)).estado, 200);
  const { rows } = await s.pool.query('SELECT rol, contrasena_hash, verificado_el, privacidad_version FROM usuarios WHERE email = $1', [email]);
  assert.deepEqual(rows[0], { rol: 'derivador', contrasena_hash: null, verificado_el: null, privacidad_version: '2026-10' });
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');

  // Contraseña corta: 400 y el enlace sigue sin usar.
  assert.equal((await establece(token, '123456789')).estado, 400);
  assert.equal((await estadoToken(token)).estado, 'valido');
  // Dos peticiones a la vez con el mismo enlace: solo una gana.
  const [a, b] = await Promise.all([establece(token), establece(token)]);
  assert.deepEqual([a.estado, b.estado].sort(), [200, 400]);
  const buena = a.estado === 200 ? a : b;
  assert.equal(buena.cuerpo.destino, '/d/nova');
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: buena.cookie })).cuerpo.email, email);
  assert.equal((await estadoToken(token)).estado, 'usado');

  // Un enlace caducado: la pantalla lo sabe y ofrece el correo para reenviar.
  const otro = correoUnico();
  await alta(otro);
  const viejo = await tokenDelCorreo(s.pool, otro, 'verificacion');
  await s.pool.query(`UPDATE tokens_correo SET caduca = now() - interval '1 minute' WHERE usuario_id = (SELECT id FROM usuarios WHERE email = $1)`, [otro]);
  assert.deepEqual([(await estadoToken(viejo)).estado, (await estadoToken(viejo)).email], ['caducado', otro]);
  assert.equal((await establece(viejo)).estado, 400);
});

test('alta sin enumerar cuentas: correo ya registrado, alta repetida sin verificar, altas simultáneas y reenvíos con freno', async () => {
  const { email: registrado } = await veterinarioVerificado(s);
  const respuestaNueva = (await alta(correoUnico())).cuerpo;
  assert.deepEqual((await alta(registrado.toUpperCase())).cuerpo, respuestaNueva);
  await tokenDelCorreo(s.pool, registrado, 'alta-existente');

  // Sin verificar: otra verificación, y el enlace anterior deja de valer.
  const pendiente = correoUnico();
  await alta(pendiente);
  const primero = await tokenDelCorreo(s.pool, pendiente, 'verificacion');
  await alta(pendiente);
  assert.equal((await estadoToken(primero)).estado, 'caducado');

  // Reenvíos: pasado el freno, la respuesta es idéntica a la de un correo sin cuenta.
  await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email: pendiente } });
  await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email: pendiente } });
  const antes = await correosA(pendiente);
  const cuarto = await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email: pendiente } });
  assert.deepEqual(cuarto.cuerpo, (await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email: correoUnico() } })).cuerpo);
  assert.equal(await correosA(pendiente), antes);

  const doble = correoUnico();
  const [a, b] = await Promise.all([alta(doble), alta(doble)]);
  assert.deepEqual([a.estado, b.estado], [200, 200]);
  assert.equal((await s.pool.query('SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = $1', [doble])).rows[0].n, 1);
});

test('entrar: el mismo 401 para inexistente, contraseña errónea o sin verificar; el freno no se salta cambiando X-Forwarded-For', async () => {
  const { email } = await veterinarioVerificado(s);
  const sinVerificar = correoUnico();
  await alta(sinVerificar);
  for (const r of [await entrar(correoUnico()), await entrar(email, 'contrasena-equivocada'), await entrar(sinVerificar)]) {
    assert.equal(r.estado, 401);
    assert.deepEqual(r.cuerpo, { error: 'Correu o contrasenya incorrectes' });
  }
  assert.equal((await entrar(email.toUpperCase())).cuerpo.rol, 'derivador');

  const limitado = await servidorDePrueba('acceso_freno', { LIMITE_INTENTOS: '3' });
  try {
    const estados: number[] = [];
    for (let i = 0; i < 4; i++) {
      estados.push((await limitado.app.inject({
        method: 'POST', url: '/api/auth/entrar',
        // Lo que inventa el cliente va delante; Traefik añade al final la dirección real.
        headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` },
        payload: { identificador: 'nadie@x.es', contrasena: 'x' },
      })).statusCode);
    }
    assert.deepEqual(estados, [401, 401, 401, 429]);
  } finally {
    await limitado.app.close();
  }
});

test('sesiones: salir, cambiar la contraseña, recuperarla, desactivar y el perfil', async () => {
  const vet = await veterinarioVerificado(s);
  const ordenador = (await entrar(vet.email)).cookie;
  // Cambiar la contraseña revoca las demás sesiones, no la actual.
  assert.equal((await pedir(s.app, 'POST', '/api/auth/cambia-contrasena', { cookie: vet.cookie, cuerpo: { actual: 'no-es-esta', nueva: 'nueva-contrasena-larga' } })).estado, 400);
  assert.equal((await pedir(s.app, 'POST', '/api/auth/cambia-contrasena', { cookie: vet.cookie, cuerpo: { actual: CONTRASENA, nueva: 'nueva-contrasena-larga' } })).estado, 200);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: vet.cookie })).estado, 200);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: ordenador })).estado, 401);

  // Recuperar: misma respuesta exista o no; el enlace revoca todas las sesiones y no vuelve a pedir la privacidad.
  const inexistente = correoUnico();
  assert.deepEqual(
    (await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email: vet.email } })).cuerpo,
    (await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email: inexistente } })).cuerpo,
  );
  assert.equal(await correosA(inexistente), 0);
  const token = await tokenDelCorreo(s.pool, vet.email, 'recuperacion');
  assert.equal((await estadoToken(token)).pide_privacidad, false);
  assert.equal((await establece(token, 'recuperada-contrasena')).cuerpo.destino, '/d');
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: vet.cookie })).estado, 401);
  const cookie = (await entrar(vet.email, 'recuperada-contrasena')).cookie;

  // Perfil: apagar correos, cambiar y vaciar el teléfono.
  const perfil = await pedir(s.app, 'PATCH', '/api/auth/perfil', { cookie, cuerpo: { recibe_correos: false, telefono: '611222333' } });
  assert.deepEqual([perfil.cuerpo.recibe_correos, perfil.cuerpo.telefono], [false, '611222333']);
  assert.equal((await pedir(s.app, 'PATCH', '/api/auth/perfil', { cookie, cuerpo: { telefono: '' } })).cuerpo.telefono, null);

  // Salir.
  await pedir(s.app, 'POST', '/api/auth/salir', { cookie });
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie })).estado, 401);

  // Desactivar: no entra y sus sesiones caen; reactivado, vuelve; el superadmin no se toca.
  const otro = await veterinarioVerificado(s);
  await pedir(s.app, 'PATCH', `/api/usuarios/${otro.usuario.id}`, { cookie: admin, cuerpo: { activo: false } });
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: otro.cookie })).estado, 401);
  assert.equal((await entrar(otro.email)).estado, 401);
  await pedir(s.app, 'PATCH', `/api/usuarios/${otro.usuario.id}`, { cookie: admin, cuerpo: { activo: true } });
  const viva = (await entrar(otro.email)).cookie;
  const sa = (await s.pool.query('SELECT id FROM usuarios WHERE es_de_entorno')).rows[0].id;
  assert.equal((await pedir(s.app, 'PATCH', `/api/usuarios/${sa}`, { cookie: admin, cuerpo: { activo: false } })).estado, 403);
  // Defensa en profundidad: una sesión viva de un usuario inactivo no vale aunque nadie la revocara.
  await s.pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [otro.usuario.id]);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: viva })).estado, 401);
});

test('invitar al equipo: «invitado» hasta usar el enlace, reenviar invalida el anterior, privacidad obligatoria y entra en /b', async () => {
  const email = correoUnico('fisio', 'bambufisiovet.com');
  const r = await pedir(s.app, 'POST', '/api/usuarios', { cookie: admin, cuerpo: { nombre: 'Clara', email } });
  assert.equal((await pedir(s.app, 'POST', '/api/usuarios', { cookie: admin, cuerpo: { nombre: 'X', email } })).estado, 409);
  const primero = await tokenDelCorreo(s.pool, email, 'invitacion-bambu');
  const fila = async () => (await pedir(s.app, 'GET', '/api/usuarios', { cookie: admin })).cuerpo.usuarios.find((u: { id: number }) => u.id === r.cuerpo.id);
  assert.equal((await fila()).estado, 'invitado');
  await pedir(s.app, 'POST', `/api/usuarios/${r.cuerpo.id}/reenvia-invitacion`, { cookie: admin });
  const token = await tokenDelCorreo(s.pool, email, 'invitacion-bambu');
  assert.equal((await estadoToken(primero)).estado, 'caducado');

  assert.equal((await estadoToken(token)).pide_privacidad, true);
  const sin = await establece(token);
  assert.equal(sin.estado, 400);
  assert.ok(sin.cuerpo.campos.privacidad);
  assert.equal((await estadoToken(token)).estado, 'valido');
  const con = await establece(token, CONTRASENA, { privacidad: true });
  assert.equal(con.cuerpo.destino, '/b');
  assert.equal((await fila()).estado, 'activo');
  assert.ok((await s.pool.query('SELECT privacidad_el FROM usuarios WHERE email = $1', [email])).rows[0].privacidad_el);
});

test('el usuario del superadmin con forma de correo no se puede dar de alta ni invitar, y el servidor vuelve a arrancar', async () => {
  const conCorreo = await servidorDePrueba('acceso_superadmin_correo', { SUPERADMIN_USUARIO: 'admin@bambu.test' });
  try {
    const r = await pedir(conCorreo.app, 'POST', '/api/auth/registro', {
      cuerpo: datosAlta('Admin@Bambu.test'),
    });
    assert.equal(r.estado, 200);
    const cookie = (await pedir(conCorreo.app, 'POST', '/api/auth/entrar', {
      cuerpo: { identificador: 'admin@bambu.test', contrasena: ENTORNO_BASE.SUPERADMIN_CONTRASENA },
    })).cookie;
    assert.equal((await pedir(conCorreo.app, 'POST', '/api/usuarios', { cookie, cuerpo: { nombre: 'X', email: 'admin@bambu.test' } })).estado, 409);
    const vet = await veterinarioVerificado(conCorreo);
    assert.equal((await pedir(conCorreo.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: vet.cookie, cuerpo: { nombre: 'X', email: 'admin@bambu.test' } })).estado, 201);
    assert.equal((await conCorreo.pool.query(`SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = 'admin@bambu.test'`)).rows[0].n, 0);
    // El arranque se negaba a levantar si había un usuario con ese correo.
    const otra = await servidorDePrueba('acceso_superadmin_correo', { SUPERADMIN_USUARIO: 'admin@bambu.test' }, { url: conCorreo.url });
    await otra.app.close();
  } finally {
    await conCorreo.app.close();
  }
});
