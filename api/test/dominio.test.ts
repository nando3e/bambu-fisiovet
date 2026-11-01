// Lo puro: sin base ni red. Un test por tema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { problemaDeContrasena } from '../src/dominio/contrasena-valida.ts';
import { dominioDeClinica } from '../src/dominio/dominios-genericos.ts';
import { nifValido, normalizarNif } from '../src/dominio/nif.ts';
import { resolverDestinatarios, type UsuarioAviso } from '../src/avisos/destinatarios.ts';
import { cifrar, descifrar } from '../src/cifrado.ts';
import { comprobarContrasena, hashearContrasena } from '../src/auth/contrasena.ts';
import { renderizar } from '../src/correo/plantilla.ts';
import { leerConfig } from '../src/config.ts';
import { ACCIONES, decidirTransicion, ESTADOS, TRANSICIONES, EDITABLE_POR_DERIVADOR } from '../src/dominio/estados-caso.ts';
import { ambitoCaso, ambitoPaciente } from '../src/dominio/visibilidad.ts';
import { validarDerivacion } from '../src/dominio/validacion-derivacion.ts';
import { nombreSeguro, tipoDeAdjunto } from '../src/ficheros/adjuntos.ts';
import { horasLaborables, mediana } from '../src/dominio/indicadores.ts';

test('cuentas y secretos: contraseña, scrypt, cifrado, dominios, CIF/NIF y config', async () => {
  assert.match(problemaDeContrasena('123456789', null)!, /10 caràcters/);
  assert.match(problemaDeContrasena('marta@clinica.vet', 'Marta@clinica.vet')!, /correu/);
  const hash = await hashearContrasena('una-contrasena-larga');
  assert.equal(await comprobarContrasena('una-contrasena-larga', hash), true);
  assert.equal(await comprobarContrasena('otra-contrasena-larga', hash), false);

  const a = cifrar('secreto-smtp', 'clave-uno-larga-1234');
  assert.notEqual(a, cifrar('secreto-smtp', 'clave-uno-larga-1234'));
  assert.equal(descifrar(a, 'clave-uno-larga-1234'), 'secreto-smtp');
  assert.equal(descifrar(a, 'clave-dos-larga-1234'), null);

  assert.equal(dominioDeClinica('a@gmail.com'), null);
  assert.equal(dominioDeClinica('a@SantRoc.vet'), 'santroc.vet');
  // CIF de sociedad (control dígito, letra o cualquiera según la entidad), DNI y NIE de un autónomo.
  for (const bueno of ['B12345674', 'Q1234567D', 'G1234567D', 'G12345674', '12345678Z', 'X1234567L', ' b-12.345.674 ']) {
    assert.ok(nifValido(bueno), bueno);
  }
  for (const malo of ['B12345675', 'B1234567D', 'Q12345674', '12345678A', 'X1234567A', 'I12345674', '1234', '']) {
    assert.ok(!nifValido(malo), malo);
  }
  assert.equal(normalizarNif(' b-12.345.674 '), 'B12345674');

  assert.throws(() => leerConfig({ DATABASE_URL: 'postgres://a/b', SECRETO_SESION: 'x'.repeat(20), URL_PUBLICA: 'https://a.b' }), /CLAVE_CIFRADO/);
  const c = leerConfig({ DATABASE_URL: 'postgres://a/b', SECRETO_SESION: 'x'.repeat(20), CLAVE_CIFRADO: 'y'.repeat(20), URL_PUBLICA: 'https://a.b/', SUPERADMIN_CONTRASENA: '' });
  assert.equal(c.CORREO_DRY_RUN, true);
  assert.equal(c.SUPERADMIN_CONTRASENA, undefined);
});

test('avisos: destinatarios según evento y actor (en Bambú, todo el equipo); plantillas completas y escapadas', () => {
  const u = (id: number, rol: UsuarioAviso['rol'] = 'bambu'): UsuarioAviso => ({ id, rol, nombre: `u${id}`, email: `u${id}@x.es`, recibeCorreos: true });
  const ids = (l: UsuarioAviso[]) => l.map((x) => x.id);
  const equipo = [u(1), u(2)];
  // El veterinario escribe: a todo el equipo de Bambú aunque haya fisio responsable, nunca a él.
  assert.deepEqual(ids(resolverDestinatarios({ tipo: 'mensaje.nuevo', actor: { id: 10, rol: 'derivador' }, equipoBambu: equipo, fisioResponsableId: 2, derivadores: [u(10, 'derivador')] }).bambu), [1, 2]);
  assert.deepEqual(ids(resolverDestinatarios({ tipo: 'adjunto.nuevo', actor: { id: 10, rol: 'derivador' }, equipoBambu: equipo, fisioResponsableId: null, derivadores: [] }).bambu), [1, 2]);
  // La derivación nueva, a todo el equipo aunque haya fisio; la asignación, solo al fisio.
  assert.deepEqual(ids(resolverDestinatarios({ tipo: 'derivacion.enviada', actor: { id: 10, rol: 'derivador' }, equipoBambu: equipo, fisioResponsableId: 2, derivadores: [] }).bambu), [1, 2]);
  assert.deepEqual(ids(resolverDestinatarios({ tipo: 'caso.fisio_asignado', actor: { id: 1, rol: 'bambu' }, equipoBambu: equipo, fisioResponsableId: null, derivadores: [] }).bambu), []);
  // Un evento de los dos lados sin actor (lo provoca el sistema) avisa a los dos.
  const sistema = resolverDestinatarios({ tipo: 'paciente.ficha_modificada', actor: null, equipoBambu: [u(1)], fisioResponsableId: null, derivadores: [u(10, 'derivador'), u(20, 'derivador')] });
  assert.deepEqual([ids(sistema.bambu), ids(sistema.derivadores)], [[1], [10, 20]]);

  const datos = { nombre: 'Marta', invitador: 'Laia', clinica: 'Sant Roc', saludo: 'Hola', titulo: 'T', cuerpo: 'C', enlace: 'https://bambu.test/acces/estableix/abc', urlPublica: 'https://bambu.test' };
  for (const p of ['verificacion', 'recuperacion', 'invitacion-bambu', 'invitacion-clinica', 'alta-existente', 'clinica-existente', 'aviso', 'prueba']) {
    const r = renderizar(p, datos);
    assert.ok(r.asunto.length > 5 && r.texto.length > 20, p);
    assert.doesNotMatch(r.html, /\{\{/, p);
  }
  const dir = mkdtempSync(join(tmpdir(), 'plantillas-'));
  writeFileSync(join(dir, '_base.html'), '<html><!--contenido--></html>');
  writeFileSync(join(dir, 'x.html'), '<title>Hola {{nombre}}</title><p>{{nombre}}</p>');
  assert.match(renderizar('x', { nombre: '<script>' }, dir).html, /&lt;script&gt;/);
});

test('casos: la tabla de transiciones entera, y la copia de la web es la misma', async () => {
  for (const estado of ESTADOS) {
    for (const accion of ACCIONES) {
      for (const actor of ['derivador', 'bambu', 'sistema'] as const) {
        const t = TRANSICIONES[accion];
        const esperado = t.quien !== actor ? { ok: false, codigo: 403 }
          : t.desde.includes(estado) ? { ok: true, a: t.a } : { ok: false, codigo: 409 };
        assert.deepEqual(decidirTransicion(estado, accion, actor), esperado, `${estado} ${accion} ${actor}`);
      }
    }
  }
  // Nada sale de los estados cerrados.
  for (const cerrado of ['alta', 'rechazada', 'abandonada'] as const) {
    assert.ok(ACCIONES.every((a) => !decidirTransicion(cerrado, a, TRANSICIONES[a].quien).ok));
  }
  const web = await import('../../web/src/estados.ts');
  assert.deepEqual(web.TRANSICIONES, TRANSICIONES);
  assert.deepEqual(web.EDITABLE_POR_DERIVADOR, EDITABLE_POR_DERIVADOR);
});

test('casos: el ámbito del derivador siempre filtra por clínica y borradores propios; validación de la derivación', () => {
  const vet = { usuarioId: 7, rol: 'derivador' as const, clinicaId: 3 };
  const a = ambitoCaso(vet, 'c', 4);
  assert.match(a.sql, /c\.clinica_id = \$4/);
  assert.match(a.sql, /c\.derivador_id = \$5/);
  assert.deepEqual(a.params, [3, 7]);
  assert.equal(ambitoCaso({ usuarioId: 2, rol: 'bambu', clinicaId: null }).sql, "c.estado <> 'borrador'");
  assert.equal(ambitoCaso({ ...vet, clinicaId: null }).sql, 'false');
  assert.equal(ambitoPaciente({ ...vet, clinicaId: null }).sql, 'false');
  assert.match(ambitoPaciente(vet, 'p', 2).sql, /cv\.clinica_id = \$2/);

  const completa = {
    paciente: { nombre: 'Nala', especie: 'perro', especie_otra: null },
    propietario: { nombre: 'Joan', telefono: '600', consentimiento_version: 1 },
    caso: { motivo: 'Coixesa' },
  };
  assert.deepEqual(validarDerivacion(completa, 1, false), { ok: true });
  // Consentimiento de una versión anterior no vale; «otro» sin texto, tampoco.
  assert.ok(!validarDerivacion(completa, 2, false).ok);
  const vacia = validarDerivacion({ paciente: { nombre: '', especie: 'otro', especie_otra: '' }, propietario: { nombre: '', telefono: null, consentimiento_version: null }, caso: { motivo: '' } }, 1, false);
  assert.deepEqual(Object.keys((vacia as { campos: object }).campos).sort(),
    ['caso.motivo', 'consentimiento', 'paciente.especie_otra', 'paciente.nombre', 'propietario.nombre', 'propietario.telefono']);
});

test('adjuntos: el tipo se decide por el contenido, nunca por la extensión; nombre saneado', () => {
  const b = (...bytes: number[]) => Buffer.from([...bytes, 0, 0, 0, 0, 0, 0, 0, 0]);
  const ZIP = b(0x50, 0x4b, 0x03, 0x04);
  assert.equal(tipoDeAdjunto(Buffer.from('%PDF-1.7\n'), 'sense-extensio'), 'pdf');
  assert.equal(tipoDeAdjunto(b(0xff, 0xd8, 0xff, 0xe0), 'foto.png'), 'jpg');
  assert.equal(tipoDeAdjunto(b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 'analitica.doc'), 'doc');
  assert.equal(tipoDeAdjunto(ZIP, 'pla.docx'), 'docx');
  assert.equal(tipoDeAdjunto(b(0x4d, 0x5a, 0x90, 0x00), 'radiografia.pdf'), null);
  assert.equal(tipoDeAdjunto(ZIP, 'informe.pdf'), null);
  assert.equal(tipoDeAdjunto(Buffer.from('hola'), 'nota.txt'), null);
  assert.equal(nombreSeguro(String.raw`C:\fotos\rx "dreta".jpg`), 'rx dreta.jpg');
  assert.equal(nombreSeguro('../../etc/passwd'), 'passwd');
});

test('indicadores: horas laborables de lunes a viernes y mediana sin datos → null', () => {
  const h = (a: string, b: string) => horasLaborables(new Date(`${a}Z`), new Date(`${b}Z`));
  assert.equal(h('2026-03-06T18:00:00', '2026-03-09T10:00:00'), 16); // viernes → lunes
  assert.equal(h('2026-03-10T09:00:00', '2026-03-10T13:30:00'), 4.5);
  assert.equal(h('2026-03-07T08:00:00', '2026-03-08T20:00:00'), 0); // sábado → domingo
  assert.equal(h('2026-03-09T10:00:00', '2026-03-09T09:00:00'), 0);
  assert.deepEqual([mediana([]), mediana([5, 1, 3]), mediana([4, 1, 3, 2])], [null, 3, 2.5]);
});
