// Clínicas: sugerencias, alta por Bambú, unirse sin cuello de botella (y solo
// por Bambú en las no validadas) e invitar compañeros.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRASENA, correoUnico, entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, tokenDelCorreo,
  veterinarioVerificado, type Servidor,
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

const sufijo = () => Math.random().toString(36).slice(2, 8);
const validar = (id: number) => s.pool.query('UPDATE clinicas SET validada = true WHERE id = $1', [id]);
const solicitudDe = async (usuarioId: number) =>
  (await s.pool.query(`SELECT id FROM solicitudes_union WHERE usuario_id = $1 AND estado = 'pendiente'`, [usuarioId])).rows[0]?.id as number;
const pedirUnion = (cookie: string, clinicaId: number) => pedir(s.app, 'POST', `/api/clinicas/${clinicaId}/solicitudes-union`, { cookie });
const tiposDe = async (cookie: string) =>
  (await pedir(s.app, 'GET', '/api/notificaciones', { cookie })).cuerpo.notificaciones.map((n: { tipo: string }) => n.tipo) as string[];
const sugerencias = async (nombre: string) =>
  (await pedir(s.app, 'GET', `/api/clinicas/sugerencias?nombre=${encodeURIComponent(nombre)}`)).cuerpo.clinicas as { id: number; nombre: string; mismo_dominio: boolean }[];

test('clínicas en el alta: dominio solo si no es genérico, sugerencias de clínicas reales, alta y validación por Bambú', async () => {
  const propio = await veterinarioVerificado(s, { email: correoUnico('vet', `cl${sufijo()}.vet`) });
  const generico = await veterinarioVerificado(s);
  const dominios = (await s.pool.query('SELECT id, dominio_correo FROM clinicas WHERE id = ANY($1) ORDER BY id', [[propio.usuario.clinica.id, generico.usuario.clinica.id]])).rows;
  assert.match(dominios[0].dominio_correo, /^cl.*\.vet$/);
  assert.equal(dominios[1].dominio_correo, null);

  // Sugerencias: solo nombre y población, nunca la clínica de un alta sin confirmar.
  const marca = sufijo();
  await pedir(s.app, 'POST', '/api/auth/registro', {
    cuerpo: { nombre: 'Anna', apellidos: 'Soler', email: correoUnico(), telefono: '600123456', clinica: { nombre: `Clínica Veterinària Sant Roc ${marca}` }, privacidad: true },
  });
  assert.equal((await sugerencias(`Clinica Sant Roc ${marca}`)).length, 0);
  await veterinarioVerificado(s, { clinica: `Clínica Veterinària Sant Roc ${marca}` });
  const vistas = await sugerencias(`Clinica Sant Roc ${marca}`);
  assert.equal(vistas.length, 1);
  assert.deepEqual(Object.keys(vistas[0]!).sort(), ['id', 'mismo_dominio', 'nombre', 'poblacion']);
  assert.equal(vistas[0]!.mismo_dominio, false);

  // Bambú da de alta una clínica que llama por teléfono: nace validada y se sugiere sin usuarios.
  const nombre = `Clínica Telèfon ${sufijo()}`;
  const nueva = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre, poblacion: 'Dénia' } });
  assert.equal(nueva.estado, 201);
  assert.ok((await sugerencias(nombre)).some((c) => c.id === nueva.cuerpo.id));
  await pedir(s.app, 'PATCH', `/api/clinicas/${nueva.cuerpo.id}`, { cookie: fisio.cookie, cuerpo: { nombre, validada: false } });
  assert.equal((await s.pool.query('SELECT validada FROM clinicas WHERE id = $1', [nueva.cuerpo.id])).rows[0].validada, false);
  // La ficha de la clínica no admite un correo que no lo es.
  assert.equal((await pedir(s.app, 'PATCH', '/api/clinicas/mia', { cookie: propio.cookie, cuerpo: { nombre: 'Clínica Bona', email: 'no-es-un-correo' } })).estado, 400);
});

test('unión automática: mismo dominio de correo, o clínica elegida en el alta al confirmar el correo', async () => {
  const dominio = `santroc${sufijo()}.vet`;
  const primera = await veterinarioVerificado(s, { email: correoUnico('a', dominio) });
  const segunda = await veterinarioVerificado(s, { email: correoUnico('b', dominio) });
  assert.equal((await pedirUnion(segunda.cookie, primera.usuario.clinica.id)).cuerpo.resultado, 'auto');
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: segunda.cookie })).cuerpo.clinica.id, primera.usuario.clinica.id);
  assert.equal((await s.pool.query('SELECT activa FROM clinicas WHERE id = $1', [segunda.usuario.clinica.id])).rows[0].activa, false);
  assert.ok((await tiposDe(segunda.cookie)).includes('usuario.union_resuelta'));

  // Elegir clínica en el alta: la solicitud se crea al verificar, no antes.
  const destino = await veterinarioVerificado(s);
  await validar(destino.usuario.clinica.id);
  const email = correoUnico();
  await pedir(s.app, 'POST', '/api/auth/registro', {
    cuerpo: { nombre: 'Anna', apellidos: 'Roca', email, telefono: '600000000', clinica: { nombre: 'La meua' }, privacidad: true, union_clinica_id: destino.usuario.clinica.id },
  });
  const contar = async () => (await s.pool.query(`SELECT count(*)::int AS n FROM solicitudes_union s JOIN usuarios u ON u.id = s.usuario_id WHERE u.email = $1`, [email])).rows[0].n;
  assert.equal(await contar(), 0);
  await pedir(s.app, 'POST', '/api/auth/establece-contrasena', { cuerpo: { token: await tokenDelCorreo(s.pool, email, 'verificacion'), contrasena: CONTRASENA } });
  assert.equal(await contar(), 1);
});

test('unión pendiente a una clínica validada: avisa a compañeros y Bambú, resuelve un compañero, se revalida al aprobar', async () => {
  const destino = await veterinarioVerificado(s);
  await validar(destino.usuario.clinica.id);
  const solicitante = await veterinarioVerificado(s, { nombre: 'Jordi' });
  assert.equal((await pedirUnion(solicitante.cookie, destino.usuario.clinica.id)).cuerpo.resultado, 'pendiente');
  assert.equal((await pedirUnion(solicitante.cookie, destino.usuario.clinica.id)).estado, 409);
  assert.ok((await tiposDe(destino.cookie)).includes('usuario.solicita_union'));
  assert.ok((await tiposDe(admin)).includes('usuario.solicita_union'));
  const solicitud = (await pedir(s.app, 'GET', '/api/clinicas/mia', { cookie: destino.cookie })).cuerpo.solicitudes_recibidas[0];
  assert.equal(solicitud.nombre, 'Jordi');
  const ajeno = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud.id}/aprueba`, { cookie: ajeno.cookie })).estado, 404);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud.id}/aprueba`, { cookie: destino.cookie })).estado, 200);
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: solicitante.cookie })).cuerpo.clinica.id, destino.usuario.clinica.id);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${solicitud.id}/rechaza`, { cookie: admin })).estado, 409);

  // Rechazar: se queda en su clínica y recibe el aviso.
  const otro = await veterinarioVerificado(s);
  await pedirUnion(otro.cookie, destino.usuario.clinica.id);
  await pedir(s.app, 'POST', `/api/solicitudes-union/${await solicitudDe(otro.usuario.id)}/rechaza`, { cookie: admin });
  assert.equal((await pedir(s.app, 'GET', '/api/auth/yo', { cookie: otro.cookie })).cuerpo.clinica.id, otro.usuario.clinica.id);

  // Revalidación: si entre medias invitó a alguien a su clínica, o el destino se desactivó → 409 y nadie se mueve.
  const tercero = await veterinarioVerificado(s);
  await pedirUnion(tercero.cookie, destino.usuario.clinica.id);
  const invitado = correoUnico();
  await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: tercero.cookie, cuerpo: { nombre: 'Biel', email: invitado } });
  const r = await pedir(s.app, 'POST', `/api/solicitudes-union/${await solicitudDe(tercero.usuario.id)}/aprueba`, { cookie: destino.cookie });
  assert.equal(r.estado, 409);
  assert.equal((await s.pool.query('SELECT clinica_id FROM usuarios WHERE lower(email) = $1', [invitado])).rows[0].clinica_id, tercero.usuario.clinica.id);
  const cuarto = await veterinarioVerificado(s);
  const otroDestino = await veterinarioVerificado(s);
  await validar(otroDestino.usuario.clinica.id);
  await pedirUnion(cuarto.cookie, otroDestino.usuario.clinica.id);
  await s.pool.query('UPDATE clinicas SET activa = false WHERE id = $1', [otroDestino.usuario.clinica.id]);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${await solicitudDe(cuarto.usuario.id)}/aprueba`, { cookie: admin })).estado, 409);
});

test('unión a una clínica sin validar: solo resuelve Bambú y sus miembros ni la ven ni reciben el aviso', async () => {
  const destino = await veterinarioVerificado(s);
  const solicitante = await veterinarioVerificado(s);
  await pedirUnion(solicitante.cookie, destino.usuario.clinica.id);
  const id = await solicitudDe(solicitante.usuario.id);
  assert.ok(!(await tiposDe(destino.cookie)).includes('usuario.solicita_union'));
  assert.equal((await pedir(s.app, 'GET', '/api/solicitudes-union', { cookie: destino.cookie })).cuerpo.solicitudes.length, 0);
  assert.equal((await pedir(s.app, 'GET', '/api/clinicas/mia', { cookie: destino.cookie })).cuerpo.solicitudes_recibidas.length, 0);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${id}/aprueba`, { cookie: destino.cookie })).estado, 404);
  // Validada, ya la ve; Bambú la resuelve igual.
  await validar(destino.usuario.clinica.id);
  assert.equal((await pedir(s.app, 'GET', '/api/clinicas/mia', { cookie: destino.cookie })).cuerpo.solicitudes_recibidas.length, 1);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${id}/aprueba`, { cookie: fisio.cookie })).estado, 200);
});

test('invitar compañeros: el invitado entra en la clínica; un correo ya registrado no se delata; queda historial; con freno', async () => {
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
  // Con compañeros ya no puede unirse a otra clínica sola: lo fusiona Bambú.
  const otra = await veterinarioVerificado(s);
  assert.match((await pedirUnion(titular.cookie, otra.usuario.clinica.id)).cuerpo.error, /fusione/);

  // Un correo con cuenta: misma respuesta, no se crea nada ni sale correo.
  const antes = (await s.pool.query('SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1', [otra.email])).rows[0].n;
  assert.equal((await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: titular.cookie, cuerpo: { nombre: 'X', email: otra.email } })).estado, 201);
  assert.equal((await s.pool.query('SELECT clinica_id FROM usuarios WHERE lower(email) = $1', [otra.email])).rows[0].clinica_id, otra.usuario.clinica.id);
  assert.equal((await s.pool.query('SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1', [otra.email])).rows[0].n, antes);

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
