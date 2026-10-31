// Dominio de casos: transiciones, ámbito y validación de la derivación. Puro.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCIONES, decidirTransicion, ESTADOS, TRANSICIONES, type Actor,
} from '../src/dominio/estados-caso.ts';
import { ambitoCaso, ambitoPaciente } from '../src/dominio/visibilidad.ts';
import { validarDerivacion, type DatosDerivacion } from '../src/dominio/validacion-derivacion.ts';

const ACTORES: Actor[] = ['derivador', 'bambu', 'sistema'];

test('transiciones: la tabla entera, cada combinación con su resultado', () => {
  const permitidas = [
    ['borrador', 'enviar', 'derivador', 'enviada'],
    ['borrador', 'descartar', 'derivador', 'borrador'],
    ['enviada', 'aceptar', 'bambu', 'aceptada'],
    ['enviada', 'rechazar', 'bambu', 'rechazada'],
    ['aceptada', 'abandonar', 'bambu', 'abandonada'],
    ['en_tratamiento', 'abandonar', 'bambu', 'abandonada'],
    ['en_tratamiento', 'alta_manual', 'bambu', 'alta'],
    ['aceptada', 'iniciar_tratamiento', 'sistema', 'en_tratamiento'],
    ['en_tratamiento', 'alta_por_informe', 'sistema', 'alta'],
  ];
  let combinaciones = 0;
  for (const estado of ESTADOS) {
    for (const accion of ACCIONES) {
      for (const actor of ACTORES) {
        combinaciones++;
        const d = decidirTransicion(estado, accion, actor);
        const fila = permitidas.find(([e, a, q]) => e === estado && a === accion && q === actor);
        if (fila) {
          assert.deepEqual(d, { ok: true, a: fila[3] }, `${estado} ${accion} ${actor}`);
        } else if (TRANSICIONES[accion].quien !== actor) {
          assert.deepEqual(d, { ok: false, codigo: 403 }, `${estado} ${accion} ${actor}`);
        } else {
          assert.deepEqual(d, { ok: false, codigo: 409 }, `${estado} ${accion} ${actor}`);
        }
      }
    }
  }
  assert.equal(combinaciones, ESTADOS.length * ACCIONES.length * ACTORES.length);
});

test('transiciones: no hay reapertura, nada sale de alta, rechazada ni abandonada', () => {
  for (const estado of ['alta', 'rechazada', 'abandonada'] as const) {
    for (const accion of ACCIONES) {
      for (const actor of ACTORES) assert.equal(decidirTransicion(estado, accion, actor).ok, false);
    }
  }
});

const vet = { usuarioId: 7, rol: 'derivador' as const, clinicaId: 3 };
const fisio = { usuarioId: 2, rol: 'bambu' as const, clinicaId: null };

test('ámbito de casos: el derivador siempre filtra por su clínica y solo ve sus borradores', () => {
  const a = ambitoCaso(vet, 'c', 4);
  assert.match(a.sql, /c\.clinica_id = \$4/);
  assert.match(a.sql, /c\.derivador_id = \$5/);
  assert.deepEqual(a.params, [3, 7]);
  const b = ambitoCaso(fisio);
  assert.equal(b.sql, "c.estado <> 'borrador'");
  assert.deepEqual(b.params, []);
  assert.equal(ambitoCaso({ usuarioId: 1, rol: 'superadmin', clinicaId: null }).sql, "c.estado <> 'borrador'");
  // Un derivador sin clínica (no debería existir) no ve nada, en vez de todo.
  assert.equal(ambitoCaso({ ...vet, clinicaId: null }).sql, 'false');
});

test('ámbito de pacientes: el derivador, a través de sus casos visibles', () => {
  const a = ambitoPaciente(vet, 'p', 2);
  assert.match(a.sql, /cv\.paciente_id = p\.id/);
  assert.match(a.sql, /cv\.clinica_id = \$2/);
  assert.deepEqual(a.params, [3, 7]);
  assert.equal(ambitoPaciente({ ...vet, clinicaId: null }).sql, 'false');
  // Bambú: el paciente de un borrador tampoco existe para él.
  assert.match(ambitoPaciente(fisio).sql, /cv.estado <> 'borrador'/);
});

const completa: DatosDerivacion = {
  paciente: { nombre: 'Nala', especie: 'perro', especie_otra: null },
  propietario: { nombre: 'Joan', telefono: '600111222', consentimiento_version: null },
  caso: { motivo: 'Coixesa posterior dreta' },
};

test('validación: completa y aceptando el consentimiento ahora → ok', () => {
  assert.deepEqual(validarDerivacion(completa, 1, true), { ok: true });
});

test('validación: cada obligatorio que falta aparece en campos', () => {
  const r = validarDerivacion({
    paciente: { nombre: ' ', especie: null, especie_otra: null },
    propietario: { nombre: '', telefono: null, consentimiento_version: null },
    caso: { motivo: '' },
  }, 1, false);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys((r as { campos: object }).campos).sort(), [
    'caso.motivo', 'consentimiento', 'paciente.especie', 'paciente.nombre',
    'propietario.nombre', 'propietario.telefono',
  ]);
});

test('validación: «otro» sin texto falla; consentimiento de una versión antigua no vale', () => {
  const otro = validarDerivacion({ ...completa, paciente: { ...completa.paciente, especie: 'otro' } }, 1, true);
  assert.ok(!otro.ok && otro.campos['paciente.especie_otra']);
  const viejo = { ...completa, propietario: { ...completa.propietario, consentimiento_version: 1 } };
  assert.ok(!validarDerivacion(viejo, 2, false).ok);
  assert.ok(validarDerivacion(viejo, 1, false).ok);
});
