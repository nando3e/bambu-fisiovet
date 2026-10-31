// Ciclo de vida de las cuentas: alta, verificación, entrar, sesiones,
// contraseña, recuperación, invitaciones, roles y desactivar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRASENA, correoUnico, ENTORNO_BASE, entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba,
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
    cuerpo: {
      nombre: 'Pau', apellidos: 'Vidal', email, telefono: '600123456',
      clinica: { nombre: 'Clínica Vidal' }, privacidad: true, ...extra,
    },
  });

const correosA = async (email: string) =>
  (await s.pool.query('SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1', [email])).rows[0].n as number;

const entrar = (identificador: string, contrasena = CONTRASENA) =>
  pedir(s.app, 'POST', '/api/auth/entrar', { cuerpo: { identificador, contrasena } });

test('alta: crea el usuario sin contraseña y encola la verificación', async () => {
  const email = correoUnico();
  const r = await alta(email);
  assert.equal(r.estado, 200);
  const { rows } = await s.pool.query(
    `SELECT rol, contrasena_hash, verificado_el, privacidad_version, clinica_id FROM usuarios WHERE email = $1`,
    [email],
  );
  assert.equal(rows[0].rol, 'derivador');
  assert.equal(rows[0].contrasena_hash, null);
  assert.equal(rows[0].verificado_el, null);
  assert.equal(rows[0].privacidad_version, '2026-10');
  assert.ok(rows[0].clinica_id);
  await tokenDelCorreo(s.pool, email, 'verificacion');
});

test('alta: un correo ya registrado da la misma respuesta y avisa al dueño', async () => {
  const { email } = await veterinarioVerificado(s);
  const antes = await s.pool.query('SELECT count(*)::int AS n FROM usuarios');
  const r = await alta(email.toUpperCase());
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo, (await alta(correoUnico())).cuerpo, 'misma respuesta que un alta nueva');
  const despues = await s.pool.query('SELECT count(*)::int AS n FROM usuarios');
  assert.equal(despues.rows[0].n, antes.rows[0].n + 1, 'solo cuenta el alta nueva');
  await tokenDelCorreo(s.pool, email, 'alta-existente');
});

test('alta: sin aceptar la privacidad → 400 y no se crea nada', async () => {
  const email = correoUnico();
  const r = await alta(email, { privacidad: false });
  assert.equal(r.estado, 400);
  const { rows } = await s.pool.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
  assert.equal(rows.length, 0);
});

test('enlace válido: queda verificado, con sesión y destino «Nova derivació»', async () => {
  const email = correoUnico();
  await alta(email);
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');
  const info = await pedir(s.app, 'GET', `/api/auth/tokens/${token}`);
  assert.equal(info.cuerpo.estado, 'valido');
  assert.equal(info.cuerpo.tipo, 'verificacion');
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.destino, '/d/nova');
  const yo = await pedir(s.app, 'GET', '/api/auth/yo', { cookie: r.cookie });
  assert.equal(yo.cuerpo.email, email);
  assert.equal(yo.cuerpo.rol, 'derivador');
});

test('enlace usado dos veces → 400 y no cambia nada', async () => {
  const email = correoUnico();
  await alta(email);
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');
  assert.equal((await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } })).estado, 200);
  const otra = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token, contrasena: 'otra-contrasena-distinta' },
  });
  assert.equal(otra.estado, 400);
  assert.match(otra.cuerpo.error, /ja s'ha fet servir o ha caducat/);
  assert.equal((await entrar(email)).estado, 200, 'sigue valiendo la primera contraseña');
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${token}`)).cuerpo.estado, 'usado');
});

test('dos peticiones simultáneas con el mismo token: solo una gana', async () => {
  const email = correoUnico();
  await alta(email);
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');
  const [a, b] = await Promise.all([
    pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } }),
    pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } }),
  ]);
  assert.deepEqual([a.estado, b.estado].sort(), [200, 400]);
});

test('enlace caducado: la pantalla lo sabe y da el correo para reenviar', async () => {
  const email = correoUnico();
  await alta(email);
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');
  await s.pool.query(
    `UPDATE tokens_correo SET caduca = now() - interval '1 minute'
     WHERE usuario_id = (SELECT id FROM usuarios WHERE email = $1)`,
    [email],
  );
  const info = await pedir(s.app, 'GET', `/api/auth/tokens/${token}`);
  assert.equal(info.cuerpo.estado, 'caducado');
  assert.equal(info.cuerpo.email, email);
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } });
  assert.equal(r.estado, 400);
});

test('contraseña corta → 400 y el token sigue sin usar', async () => {
  const email = correoUnico();
  await alta(email);
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: '123456789' } });
  assert.equal(r.estado, 400);
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${token}`)).cuerpo.estado, 'valido');
});

test('reenviar la verificación: el enlace viejo deja de valer; el cuarto reenvío no encola nada', async () => {
  const email = correoUnico();
  await alta(email);
  const primero = await tokenDelCorreo(s.pool, email, 'verificacion');
  assert.equal((await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email } })).estado, 200);
  const segundo = await tokenDelCorreo(s.pool, email, 'verificacion');
  assert.notEqual(primero, segundo);
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${primero}`)).cuerpo.estado, 'caducado');
  assert.equal((await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email } })).estado, 200);
  assert.equal((await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email } })).estado, 200);
  const antes = await correosA(email);
  // Pasado el freno, la respuesta es idéntica a la de un correo sin cuenta: un
  // 429 solo para las cuentas pendientes diría cuáles existen.
  const cuarto = await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email } });
  const sinCuenta = await pedir(s.app, 'POST', '/api/auth/reenvia-verificacion', { cuerpo: { email: correoUnico() } });
  assert.equal(cuarto.estado, 200);
  assert.deepEqual(cuarto.cuerpo, sinCuenta.cuerpo);
  assert.equal(await correosA(email), antes);
});

test('alta con el usuario del superadmin: misma respuesta, no se crea nada y el servidor vuelve a arrancar', async () => {
  const conCorreo = await servidorDePrueba('acceso_superadmin_correo', { SUPERADMIN_USUARIO: 'admin@bambu.test' });
  try {
    const r = await pedir(conCorreo.app, 'POST', '/api/auth/registro', {
      cuerpo: {
        nombre: 'Pau', apellidos: 'Vidal', email: 'Admin@Bambu.test', telefono: '600123456',
        clinica: { nombre: 'Clínica Vidal' }, privacidad: true,
      },
    });
    assert.equal(r.estado, 200);
    const { rows } = await conCorreo.pool.query(
      `SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = 'admin@bambu.test'`,
    );
    assert.equal(rows[0].n, 0);
    const cookie = (await pedir(conCorreo.app, 'POST', '/api/auth/entrar', {
      cuerpo: { identificador: 'admin@bambu.test', contrasena: ENTORNO_BASE.SUPERADMIN_CONTRASENA },
    })).cookie;
    // Tampoco se puede invitar con ese correo, ni al equipo ni a una clínica.
    const equipo = await pedir(conCorreo.app, 'POST', '/api/usuarios', {
      cookie, cuerpo: { nombre: 'X', email: 'admin@bambu.test' },
    });
    assert.equal(equipo.estado, 409);
    const vet = await veterinarioVerificado(conCorreo);
    const companero = await pedir(conCorreo.app, 'POST', '/api/clinicas/mia/invitaciones', {
      cookie: vet.cookie, cuerpo: { nombre: 'X', email: 'admin@bambu.test' },
    });
    assert.equal(companero.estado, 201);
    const tras = await conCorreo.pool.query(
      `SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = 'admin@bambu.test'`,
    );
    assert.equal(tras.rows[0].n, 0);
    // El arranque se negaba a levantar si había un usuario con ese correo.
    const otra = await servidorDePrueba('acceso_superadmin_correo', { SUPERADMIN_USUARIO: 'admin@bambu.test' }, { url: conCorreo.url });
    await otra.app.close();
  } finally {
    await conCorreo.app.close();
  }
});

test('dos altas simultáneas con el mismo correo: las dos responden igual y queda una cuenta', async () => {
  const email = correoUnico();
  const [a, b] = await Promise.all([alta(email), alta(email)]);
  assert.equal(a.estado, 200);
  assert.equal(b.estado, 200);
  assert.deepEqual(a.cuerpo, b.cuerpo);
  const { rows } = await s.pool.query('SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = $1', [email]);
  assert.equal(rows[0].n, 1);
});

test('entrar: inexistente, contraseña errónea y sin verificar son el mismo 401', async () => {
  const { email } = await veterinarioVerificado(s);
  const sinVerificar = correoUnico();
  await alta(sinVerificar);
  const a = await entrar(correoUnico());
  const b = await entrar(email, 'contrasena-equivocada');
  const c = await entrar(sinVerificar, CONTRASENA);
  for (const r of [a, b, c]) {
    assert.equal(r.estado, 401);
    assert.deepEqual(r.cuerpo, { error: 'Correu o contrasenya incorrectes' });
  }
  const ok = await entrar(email.toUpperCase());
  assert.equal(ok.estado, 200);
  assert.equal(ok.cuerpo.rol, 'derivador');
  assert.ok(ok.cuerpo.clinica.id);
});

test('freno de intentos: el undécimo en un minuto → 429', async () => {
  const limitado = await servidorDePrueba('acceso_freno', { LIMITE_INTENTOS: '10' });
  try {
    const estados: number[] = [];
    for (let i = 0; i < 11; i++) {
      estados.push((await pedir(limitado.app, 'POST', '/api/auth/entrar', {
        cuerpo: { identificador: 'nadie@x.es', contrasena: 'x' },
      })).estado);
    }
    assert.deepEqual(estados.slice(0, 10), Array(10).fill(401));
    assert.equal(estados[10], 429);
  } finally {
    await limitado.app.close();
  }
});

test('freno de intentos: cambiar X-Forwarded-For en cada petición no lo salta', async () => {
  const limitado = await servidorDePrueba('acceso_freno_xff', { LIMITE_INTENTOS: '3' });
  try {
    const estados: number[] = [];
    for (let i = 0; i < 4; i++) {
      estados.push((await limitado.app.inject({
        method: 'POST', url: '/api/auth/entrar',
        // Lo que inventa el cliente va delante; Traefik añade al final la
        // dirección real desde la que le llega la conexión.
        headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` },
        payload: { identificador: 'nadie@x.es', contrasena: 'x' },
      })).statusCode);
    }
    assert.deepEqual(estados, [401, 401, 401, 429]);
  } finally {
    await limitado.app.close();
  }
});

test('salir: la cookie deja de valer', async () => {
  const { cookie } = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie })).estado, 200);
  await pedir(s.app, 'POST', '/api/auth/salir', { cookie });
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie })).estado, 401);
});

test('sin sesión → 401; derivador en una ruta de Bambú → 403', async () => {
  assert.equal((await pedir(s.app, 'GET', '/api/usuarios')).estado, 401);
  const { cookie } = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'GET', '/api/usuarios', { cookie })).estado, 403);
});

test('cambiar la contraseña revoca las demás sesiones, no la actual', async () => {
  const { email, cookie: movil } = await veterinarioVerificado(s);
  const ordenador = (await entrar(email)).cookie;
  const mal = await pedir(s.app, 'POST', '/api/auth/cambia-contrasena', {
    cookie: movil, cuerpo: { actual: 'no-es-esta-contrasena', nueva: 'nueva-contrasena-larga' },
  });
  assert.equal(mal.estado, 400);
  const r = await pedir(s.app, 'POST', '/api/auth/cambia-contrasena', {
    cookie: movil, cuerpo: { actual: CONTRASENA, nueva: 'nueva-contrasena-larga' },
  });
  assert.equal(r.estado, 200);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: movil })).estado, 200);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: ordenador })).estado, 401);
  assert.equal((await entrar(email, 'nueva-contrasena-larga')).estado, 200);
});

test('recuperar: misma respuesta exista o no; el enlace revoca todas las sesiones', async () => {
  const { email, cookie } = await veterinarioVerificado(s);
  const inexistente = correoUnico();
  const a = await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email } });
  const b = await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email: inexistente } });
  assert.deepEqual(a.cuerpo, b.cuerpo);
  const { rows } = await s.pool.query('SELECT 1 FROM correos_pendientes WHERE destinatario = $1', [inexistente]);
  assert.equal(rows.length, 0);

  const token = await tokenDelCorreo(s.pool, email, 'recuperacion');
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token, contrasena: 'recuperada-contrasena' },
  });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.destino, '/d');
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie })).estado, 401);
  assert.equal((await entrar(email, 'recuperada-contrasena')).estado, 200);
});

test('invitar a una fisio: entra en /b y aparece en el equipo', async () => {
  const fisio = await fisioVerificada(s, admin);
  const yo = await pedir(s.app, 'GET', '/api/auth/yo', { cookie: fisio.cookie });
  assert.equal(yo.cuerpo.rol, 'bambu');
  const equipo = await pedir(s.app, 'GET', '/api/usuarios', { cookie: admin });
  const fila = equipo.cuerpo.usuarios.find((u: { id: number }) => u.id === fisio.id);
  assert.equal(fila.estado, 'activo');
  // Un correo ya usado no se invita dos veces.
  const repetida = await pedir(s.app, 'POST', '/api/usuarios', {
    cookie: admin, cuerpo: { nombre: 'X', email: fisio.email },
  });
  assert.equal(repetida.estado, 409);
});

test('invitación: sin aceptar la privacidad → 400 y el enlace sigue sin usar; aceptándola queda guardada', async () => {
  const email = correoUnico('fisio', 'bambufisiovet.com');
  await pedir(s.app, 'POST', '/api/usuarios', { cookie: admin, cuerpo: { nombre: 'Nil', email } });
  const token = await tokenDelCorreo(s.pool, email, 'invitacion-bambu');
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${token}`)).cuerpo.pide_privacidad, true);
  const sin = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: CONTRASENA } });
  assert.equal(sin.estado, 400);
  assert.ok(sin.cuerpo.campos.privacidad);
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${token}`)).cuerpo.estado, 'valido');
  const con = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token, contrasena: CONTRASENA, privacidad: true },
  });
  assert.equal(con.estado, 200);
  const { rows } = await s.pool.query('SELECT privacidad_version, privacidad_el FROM usuarios WHERE email = $1', [email]);
  assert.equal(rows[0].privacidad_version, '2026-10');
  assert.ok(rows[0].privacidad_el);
});

test('recuperar: quien ya aceptó la privacidad en el alta no la vuelve a ver', async () => {
  const { email } = await veterinarioVerificado(s);
  await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email } });
  const token = await tokenDelCorreo(s.pool, email, 'recuperacion');
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${token}`)).cuerpo.pide_privacidad, false);
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token, contrasena: 'otra-contrasena-larga' } });
  assert.equal(r.estado, 200);
});

test('invitación pendiente: «invitado» y se puede reenviar, invalidando la anterior', async () => {
  const email = correoUnico('fisio', 'bambufisiovet.com');
  const r = await pedir(s.app, 'POST', '/api/usuarios', { cookie: admin, cuerpo: { nombre: 'Clara', email } });
  const primero = await tokenDelCorreo(s.pool, email, 'invitacion-bambu');
  const equipo = await pedir(s.app, 'GET', '/api/usuarios', { cookie: admin });
  assert.equal(equipo.cuerpo.usuarios.find((u: { id: number }) => u.id === r.cuerpo.id).estado, 'invitado');
  assert.equal((await pedir(s.app, 'POST', `/api/usuarios/${r.cuerpo.id}/reenvia-invitacion`, { cookie: admin })).estado, 200);
  assert.notEqual(await tokenDelCorreo(s.pool, email, 'invitacion-bambu'), primero);
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${primero}`)).cuerpo.estado, 'caducado');
});

test('desactivar: no puede entrar, sus sesiones caen; el superadmin no se toca', async () => {
  const { email, cookie, usuario } = await veterinarioVerificado(s);
  const r = await pedir(s.app, 'PATCH', `/api/usuarios/${usuario.id}`, { cookie: admin, cuerpo: { activo: false } });
  assert.equal(r.estado, 200);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie })).estado, 401);
  assert.equal((await entrar(email)).estado, 401);
  const { rows } = await s.pool.query('SELECT id FROM usuarios WHERE es_de_entorno');
  const sa = await pedir(s.app, 'PATCH', `/api/usuarios/${rows[0].id}`, { cookie: admin, cuerpo: { activo: false } });
  assert.equal(sa.estado, 403);
  // Reactivado, vuelve a entrar.
  await pedir(s.app, 'PATCH', `/api/usuarios/${usuario.id}`, { cookie: admin, cuerpo: { activo: true } });
  assert.equal((await entrar(email)).estado, 200);
});

test('una sesión viva de un usuario inactivo no vale, aunque nadie la revocara', async () => {
  // Defensa en profundidad: desactivar ya revoca las sesiones, pero si un
  // usuario queda inactivo por otra vía, la sesión tampoco debe abrir nada.
  const { cookie, usuario } = await veterinarioVerificado(s);
  await s.pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [usuario.id]);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie })).estado, 401);
});

test('perfil: apagar los correos y cambiar el teléfono', async () => {
  const { cookie } = await veterinarioVerificado(s);
  const r = await pedir(s.app, 'PATCH', '/api/auth/perfil', {
    cookie, cuerpo: { recibe_correos: false, telefono: '611222333' },
  });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.recibe_correos, false);
  assert.equal(r.cuerpo.telefono, '611222333');
  // Vaciar el campo lo deja sin valor, no con un texto vacío.
  const vacio = await pedir(s.app, 'PATCH', '/api/auth/perfil', { cookie, cuerpo: { telefono: '' } });
  assert.equal(vacio.cuerpo.telefono, null);
});

test('alta repetida sin haber verificado: llega otra verificación, con la clínica elegida', async () => {
  const email = correoUnico();
  await alta(email);
  const destino = await veterinarioVerificado(s);
  await alta(email, { union_clinica_id: destino.usuario.clinica.id });
  const { rows } = await s.pool.query(
    `SELECT t.tipo, t.datos FROM tokens_correo t JOIN usuarios u ON u.id = t.usuario_id
     WHERE lower(u.email) = $1 ORDER BY t.id DESC LIMIT 1`,
    [email],
  );
  assert.equal(rows[0].tipo, 'verificacion');
  assert.equal(rows[0].datos.union_clinica_id, destino.usuario.clinica.id);
  assert.equal(await correosA(email), 2);
});
