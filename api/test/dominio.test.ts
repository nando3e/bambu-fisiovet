// Lo puro: sin base ni red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { problemaDeContrasena } from '../src/dominio/contrasena-valida.ts';
import { dominioDe, dominioDeClinica, esGenerico } from '../src/dominio/dominios-genericos.ts';
import { decidirUnion } from '../src/dominio/union-clinica.ts';
import { resolverDestinatarios, type UsuarioAviso } from '../src/avisos/destinatarios.ts';
import { cifrar, descifrar } from '../src/cifrado.ts';
import { comprobarContrasena, hashearContrasena } from '../src/auth/contrasena.ts';
import { renderizar } from '../src/correo/plantilla.ts';
import { leerConfig } from '../src/config.ts';

test('contraseña: mínimo 10 caracteres y distinta del correo', () => {
  assert.match(problemaDeContrasena('123456789', null)!, /10 caràcters/);
  assert.equal(problemaDeContrasena('1234567890', null), null);
  assert.match(problemaDeContrasena('marta@clinica.vet', 'Marta@clinica.vet')!, /correu/);
});

test('scrypt: ida y vuelta, y una contraseña distinta no vale', async () => {
  const hash = await hashearContrasena('una-contrasena-larga');
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await comprobarContrasena('una-contrasena-larga', hash), true);
  assert.equal(await comprobarContrasena('otra-contrasena-larga', hash), false);
  assert.equal(await comprobarContrasena('x', 'no-es-un-hash'), false);
});

test('dominios: los genéricos no identifican clínica', () => {
  assert.equal(dominioDe('Marta@SantRoc.Vet'), 'santroc.vet');
  assert.equal(dominioDe('sin-arroba'), null);
  assert.equal(esGenerico('gmail.com'), true);
  assert.equal(dominioDeClinica('a@gmail.com'), null);
  assert.equal(dominioDeClinica('a@santroc.vet'), 'santroc.vet');
});

test('unión a clínica: auto, pendiente, no permitida y misma clínica', () => {
  const base = { clinicaOrigenId: 1, clinicaDestinoId: 2, miembrosClinicaOrigen: 1 };
  assert.equal(decidirUnion({ ...base, emailSolicitante: 'a@santroc.vet', dominioClinicaDestino: 'santroc.vet' }), 'auto');
  assert.equal(decidirUnion({ ...base, emailSolicitante: 'a@gmail.com', dominioClinicaDestino: 'santroc.vet' }), 'pendiente');
  // Un dominio genérico nunca se auto-aprueba, aunque la clínica lo tuviera apuntado.
  assert.equal(decidirUnion({ ...base, emailSolicitante: 'a@gmail.com', dominioClinicaDestino: 'gmail.com' }), 'pendiente');
  assert.equal(
    decidirUnion({ ...base, miembrosClinicaOrigen: 2, emailSolicitante: 'a@santroc.vet', dominioClinicaDestino: 'santroc.vet' }),
    'no_permitida',
  );
  assert.equal(
    decidirUnion({ ...base, clinicaDestinoId: 1, emailSolicitante: 'a@x.vet', dominioClinicaDestino: null }),
    'misma_clinica',
  );
});

const u = (id: number, rol: UsuarioAviso['rol'] = 'bambu'): UsuarioAviso =>
  ({ id, rol, nombre: `u${id}`, email: `u${id}@x.es`, recibeCorreos: true });
const ids = (l: UsuarioAviso[]) => l.map((x) => x.id);

test('destinatarios: escribe el veterinario → al fisio responsable, no a él', () => {
  const d = resolverDestinatarios({
    tipo: 'mensaje.nuevo', actor: { id: 10, rol: 'derivador' },
    equipoBambu: [u(1), u(2)], fisioResponsableId: 2, derivadores: [u(10, 'derivador')],
  });
  assert.deepEqual(ids(d.bambu), [2]);
  assert.deepEqual(ids(d.derivadores), []);
});

test('destinatarios: escribe Bambú → al veterinario y a los compañeros que participan', () => {
  const d = resolverDestinatarios({
    tipo: 'mensaje.nuevo', actor: { id: 2, rol: 'bambu' },
    equipoBambu: [u(1), u(2)], fisioResponsableId: 2,
    derivadores: [u(10, 'derivador'), u(11, 'derivador')],
  });
  assert.deepEqual(ids(d.bambu), []);
  assert.deepEqual(ids(d.derivadores), [10, 11]);
});

test('destinatarios: sin fisio responsable, todo el equipo', () => {
  const d = resolverDestinatarios({
    tipo: 'adjunto.nuevo', actor: { id: 10, rol: 'derivador' },
    equipoBambu: [u(1), u(2)], fisioResponsableId: null, derivadores: [],
  });
  assert.deepEqual(ids(d.bambu), [1, 2]);
});

test('destinatarios: la derivación nueva va a todo el equipo aunque haya fisio', () => {
  const d = resolverDestinatarios({
    tipo: 'derivacion.enviada', actor: { id: 10, rol: 'derivador' },
    equipoBambu: [u(1), u(2)], fisioResponsableId: 2, derivadores: [u(10, 'derivador')],
  });
  assert.deepEqual(ids(d.bambu), [1, 2]);
  assert.equal(d.ladoDerivador, false);
});

test('destinatarios: la asignación solo al fisio, y a nadie si no hay', () => {
  const con = resolverDestinatarios({
    tipo: 'caso.fisio_asignado', actor: { id: 1, rol: 'bambu' },
    equipoBambu: [u(1), u(2)], fisioResponsableId: 2, derivadores: [],
  });
  assert.deepEqual(ids(con.bambu), [2]);
  const sin = resolverDestinatarios({
    tipo: 'caso.fisio_asignado', actor: { id: 1, rol: 'bambu' },
    equipoBambu: [u(1), u(2)], fisioResponsableId: null, derivadores: [],
  });
  assert.deepEqual(ids(sin.bambu), []);
});

test('destinatarios: la solicitud de unión llega a los dos lados, nunca al solicitante', () => {
  const d = resolverDestinatarios({
    tipo: 'usuario.solicita_union', actor: { id: 10, rol: 'derivador' },
    equipoBambu: [u(1)], fisioResponsableId: null,
    derivadores: [u(10, 'derivador'), u(20, 'derivador')],
  });
  assert.deepEqual(ids(d.bambu), [1]);
  assert.deepEqual(ids(d.derivadores), [20]);
});

test('destinatarios: el actor nunca se avisa a sí mismo, aunque sea de Bambú', () => {
  const d = resolverDestinatarios({
    tipo: 'usuario.bambu_alta', actor: { id: 1, rol: 'bambu' },
    equipoBambu: [u(1), u(2)], fisioResponsableId: null, derivadores: [],
  });
  assert.deepEqual(ids(d.bambu), [2]);
});

test('cifrado: ida y vuelta, IV distinto cada vez, clave equivocada → null', () => {
  const a = cifrar('secreto-smtp', 'clave-uno-larga-1234');
  const b = cifrar('secreto-smtp', 'clave-uno-larga-1234');
  assert.notEqual(a, b);
  assert.equal(descifrar(a, 'clave-uno-larga-1234'), 'secreto-smtp');
  assert.equal(descifrar(a, 'clave-dos-larga-1234'), null);
  assert.equal(descifrar('basura', 'clave-uno-larga-1234'), null);
});

test('plantillas: todas renderizan con asunto, enlace absoluto y sin huecos sin sustituir', () => {
  const datos = {
    nombre: 'Marta', invitador: 'Laia', clinica: 'Sant Roc', saludo: 'Hola, Marta',
    titulo: 'Nova derivació: Nala', cuerpo: 'Text', enlace: 'https://bambu.test/acces/estableix/abc',
    urlPublica: 'https://bambu.test',
  };
  for (const p of ['verificacion', 'recuperacion', 'invitacion-bambu', 'invitacion-clinica', 'alta-existente', 'aviso', 'prueba']) {
    const r = renderizar(p, datos);
    assert.ok(r.asunto.length > 5, `${p}: sin asunto`);
    assert.doesNotMatch(r.html, /\{\{/, `${p}: queda un hueco`);
    assert.match(r.html, /https:\/\/bambu\.test\/logo-bambu\.png/, `${p}: sin el marco común`);
    if (p !== 'prueba') assert.match(r.html, /https:\/\/bambu\.test\/acces\/estableix\/abc|Obri el portal/, `${p}: sin enlace`);
    assert.ok(r.texto.length > 20, `${p}: sin versión de texto`);
  }
});

test('plantillas: los datos se escapan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plantillas-'));
  writeFileSync(join(dir, '_base.html'), '<html><!--contenido--></html>');
  writeFileSync(join(dir, 'x.html'), '<title>Hola {{nombre}}</title><p>{{nombre}}</p>');
  const r = renderizar('x', { nombre: '<script>' }, dir);
  assert.match(r.html, /&lt;script&gt;/);
  assert.equal(r.asunto, 'Hola <script>');
});

test('config: sin CLAVE_CIFRADO falla con un mensaje claro', () => {
  assert.throws(
    () => leerConfig({ DATABASE_URL: 'postgres://a/b', SECRETO_SESION: 'x'.repeat(20), URL_PUBLICA: 'https://a.b' }),
    /CLAVE_CIFRADO/,
  );
});

test('config: CORREO_DRY_RUN nace en true y la contraseña vacía del superadmin no cuenta', () => {
  const c = leerConfig({
    DATABASE_URL: 'postgres://a/b', SECRETO_SESION: 'x'.repeat(20), CLAVE_CIFRADO: 'y'.repeat(20),
    URL_PUBLICA: 'https://a.b/', SUPERADMIN_CONTRASENA: '',
  });
  assert.equal(c.CORREO_DRY_RUN, true);
  assert.equal(c.SUPERADMIN_CONTRASENA, undefined);
  assert.equal(c.URL_PUBLICA, 'https://a.b');
});
