// Clínicas: el alta con CIF (sin enseñar ninguna clínica antes de entrar),
// las clínicas de Bambú y entrar en una clínica solo por invitación.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRASENA, cifUnico, correoUnico, datosAlta, entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba,
  tokenDelCorreo, veterinarioVerificado, type Servidor,
} from './ayuda.ts';

let s: Servidor;
let admin: string;
let fisio: { cookie: string; id: number };
before(async () => {
  s = await servidorDePrueba('clinicas');
  admin = await entrarSuperadmin(s);
  fisio = await fisioVerificada(s, admin);
});
after(async () => {
  await s.app.close();
});

const alta = (cuerpo: unknown) => pedir(s.app, 'POST', '/api/auth/registro', { cuerpo });
const contar = async (sql: string, params: unknown[]) => (await s.pool.query(sql, params)).rows[0].n as number;
const correos = (email: string, plantilla?: string) => contar(
  `SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1 AND ($2::text IS NULL OR plantilla = $2)`,
  [email, plantilla ?? null],
);
const usuarios = (email: string) => contar('SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = $1', [email]);

test('alta con CIF: todo obligatorio y con su control; con el CIF de una clínica que ya está, nada creado y «demana una invitació» solo a su correo; un alta abandonada no bloquea el CIF', async () => {
  // Todos los campos obligatorios, el CIF con su letra o dígito de control.
  const falta = await alta({ nombre: 'Anna', apellidos: 'Soler', email: correoUnico(), telefono: '600123456', clinica: { nombre: 'Clínica X' }, privacidad: true });
  assert.equal(falta.estado, 400);
  for (const campo of ['num_colegiado', 'clinica.poblacion', 'clinica.cif']) assert.ok(falta.cuerpo.campos[campo], campo);
  const malCif = await alta(datosAlta(correoUnico(), { cif: 'B12345675' }));
  assert.equal(malCif.estado, 400);
  assert.ok(malCif.cuerpo.campos['clinica.cif']);

  // Un alta normal guarda el CIF normalizado (y el dominio propio del correo, no el genérico).
  const cif = cifUnico();
  const titular = await veterinarioVerificado(s, { email: correoUnico('vet', 'santroc-cif.vet'), cif: cif.toLowerCase().replace(/^(.)(.{4})/, '$1-$2.') });
  const fila = (await s.pool.query('SELECT cif, dominio_correo FROM clinicas WHERE id = $1', [titular.usuario.clinica.id])).rows[0];
  assert.deepEqual(fila, { cif, dominio_correo: 'santroc-cif.vet' });
  const respuestaNormal = (await alta(datosAlta(correoUnico()))).cuerpo;

  // Con el CIF de esa clínica: la misma respuesta, ni usuario ni clínica, y el aviso a su propio correo.
  const correosTitular = await correos(titular.email);
  const notifTitular = await contar('SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1', [titular.usuario.id]);
  const intruso = correoUnico();
  const r = await alta(datosAlta(intruso, { cif: ` ${cif.slice(0, 1).toLowerCase()} ${cif.slice(1)} ` }));
  assert.deepEqual([r.estado, r.cuerpo], [200, respuestaNormal]);
  assert.equal(await usuarios(intruso), 0);
  assert.equal(await contar('SELECT count(*)::int AS n FROM clinicas WHERE cif = $1', [cif]), 1);
  assert.equal(await correos(intruso, 'clinica-existente'), 1);
  assert.equal(await correos(titular.email), correosTitular, 'a la clínica no le llega nada');
  assert.equal(await contar('SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1', [titular.usuario.id]), notifTitular);

  // También con el CIF de una clínica que dio de alta Bambú y aún no tiene a nadie.
  const deBambu = cifUnico();
  await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Telèfon', poblacion: 'Ondara', cif: deBambu } });
  const otro = correoUnico();
  await alta(datosAlta(otro, { cif: deBambu }));
  assert.deepEqual([await usuarios(otro), await correos(otro, 'clinica-existente')], [0, 1]);

  // Un alta que nunca se confirmó no bloquea el CIF: se retira y su enlace deja de valer.
  const abandonado = correoUnico();
  const cifAbandonado = cifUnico();
  await alta(datosAlta(abandonado, { cif: cifAbandonado }));
  const enlaceViejo = await tokenDelCorreo(s.pool, abandonado, 'verificacion');
  const nuevo = await veterinarioVerificado(s, { cif: cifAbandonado });
  assert.equal((await pedir(s.app, 'GET', `/api/auth/tokens/${enlaceViejo}`)).cuerpo.estado, 'caducado');
  assert.deepEqual(
    (await s.pool.query('SELECT activa FROM clinicas WHERE cif = $1 ORDER BY id', [cifAbandonado])).rows.map((x) => x.activa),
    [false, true],
  );
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: nuevo.cookie })).cuerpo.clinica.id, nuevo.usuario.clinica.id);

  // Ya no hay sugerencias de clínicas.
  assert.equal((await pedir(s.app, 'GET', '/api/clinicas/sugerencias?nombre=Cl%C3%ADnica')).estado, 404);
});

test('clínicas de Bambú: CIF y población obligatorios, el CIF no se repite entre las activas y el veterinario no lo cambia', async () => {
  assert.equal((await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Sense CIF', poblacion: 'Dénia' } })).estado, 400);
  const cif = cifUnico();
  const una = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Una', poblacion: 'Dénia', cif } });
  assert.equal(una.estado, 201);
  const repetida = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Dos', poblacion: 'Dénia', cif } });
  assert.deepEqual([repetida.estado, Boolean(repetida.cuerpo.campos?.cif)], [409, true]);
  const dos = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Dos', poblacion: 'Dénia', cif: cifUnico() } });
  assert.equal((await pedir(s.app, 'PATCH', `/api/clinicas/${dos.cuerpo.id}`, { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Dos', poblacion: 'Dénia', cif } })).estado, 409);
  const lista = (await pedir(s.app, 'GET', '/api/clinicas', { cookie: fisio.cookie })).cuerpo;
  assert.equal(lista.clinicas.find((c: { id: number }) => c.id === una.cuerpo.id).cif, cif);

  // El veterinario edita los datos de contacto de su clínica, pero el CIF se queda.
  const vet = await veterinarioVerificado(s);
  const suyo = (await pedir(s.app, 'GET', '/api/clinicas/mia', { cookie: vet.cookie })).cuerpo.clinica.cif;
  assert.equal((await pedir(s.app, 'PATCH', '/api/clinicas/mia', { cookie: vet.cookie, cuerpo: { nombre: 'Clínica Bona', cif } })).estado, 200);
  assert.deepEqual(
    (await s.pool.query('SELECT nombre, cif FROM clinicas WHERE id = $1', [vet.usuario.clinica.id])).rows[0],
    { nombre: 'Clínica Bona', cif: suyo },
  );
  assert.equal((await pedir(s.app, 'PATCH', '/api/clinicas/mia', { cookie: vet.cookie, cuerpo: { nombre: 'Clínica Bona', email: 'no-es-un-correo' } })).estado, 400);
});

test('entrar en una clínica solo por invitación: de un compañero o de Bambú; un correo ya registrado no se delata; queda historial; con freno', async () => {
  const titular = await veterinarioVerificado(s);
  const email = correoUnico();
  assert.equal((await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: titular.cookie, cuerpo: { nombre: 'Biel', email } })).estado, 201);
  const acepta = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token: await tokenDelCorreo(s.pool, email, 'invitacion-clinica'), contrasena: CONTRASENA, privacidad: true },
  });
  assert.equal(acepta.cuerpo.usuario.clinica.id, titular.usuario.clinica.id);
  const { rows } = await s.pool.query(
    `SELECT h.usuario_id FROM historial h JOIN usuarios u ON h.tabla = 'usuarios' AND h.fila_id = u.id::text WHERE lower(u.email) = $1`, [email],
  );
  assert.deepEqual(rows.map((r) => r.usuario_id), [titular.usuario.id]);

  // Bambú invita al primer veterinario de una clínica suya; a una que no existe, 404.
  const clinica = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Invitada', poblacion: 'Pego', cif: cifUnico() } });
  const primero = correoUnico();
  assert.equal((await pedir(s.app, 'POST', `/api/clinicas/${clinica.cuerpo.id}/invitaciones`, { cookie: fisio.cookie, cuerpo: { nombre: 'Rosa', email: primero } })).estado, 201);
  const entra = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token: await tokenDelCorreo(s.pool, primero, 'invitacion-clinica'), contrasena: CONTRASENA, privacidad: true },
  });
  assert.equal(entra.cuerpo.usuario.clinica.id, clinica.cuerpo.id);
  assert.equal((await pedir(s.app, 'POST', '/api/clinicas/999999/invitaciones', { cookie: fisio.cookie, cuerpo: { nombre: 'X', email: correoUnico() } })).estado, 404);

  // Un correo con cuenta: misma respuesta, no se mueve nada ni sale correo.
  const otra = await veterinarioVerificado(s);
  const antes = await correos(otra.email);
  assert.equal((await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: titular.cookie, cuerpo: { nombre: 'X', email: otra.email } })).estado, 201);
  assert.equal((await s.pool.query('SELECT clinica_id FROM usuarios WHERE lower(email) = $1', [otra.email])).rows[0].clinica_id, otra.usuario.clinica.id);
  assert.equal(await correos(otra.email), antes);

  const limitado = await servidorDePrueba('clinicas_freno', { LIMITE_INTENTOS: '2' });
  try {
    const vet = await veterinarioVerificado(limitado);
    const estados: number[] = [];
    for (let i = 0; i < 3; i++) {
      estados.push((await pedir(limitado.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: vet.cookie, cuerpo: { nombre: 'X', email: correoUnico() } })).estado);
    }
    assert.deepEqual(estados, [201, 201, 429]);
  } finally {
    await limitado.app.close();
  }
});
