// Indicadores del panel con números exactos sobre una semilla de fechas fijas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { entrarSuperadmin, pedir, servidorDePrueba, veterinarioVerificado, type Servidor } from './ayuda.ts';

let s: Servidor;
let admin: string;
let vet: Awaited<ReturnType<typeof veterinarioVerificado>>;
before(async () => {
  s = await servidorDePrueba('panel');
  admin = await entrarSuperadmin(s);
  vet = await veterinarioVerificado(s);
  await pedir(s.app, 'PUT', '/api/configuracion/avisos', {
    cookie: admin, cuerpo: { correo_centro: 'centre@bambufisiovet.com', dias_sin_noticias: 7, dias_pendiente_cita: 3 },
  });
  await sembrar();
});
after(async () => {
  await s.app.close();
});

const DIA = 86_400_000;
const haceDias = (n: number) => new Date(Date.now() - n * DIA);
const fechaHace = (n: number) => haceDias(n).toISOString().slice(0, 10);

/**
 * Enero-junio de 2026: 7 derivaciones de A y 3 de B en marzo, 1 de C en mayo.
 * Respuestas del portal: 4 h, 8 h (lunes 00:30 en Madrid, domingo en UTC) y
 * 26 h; la de B registrada por Bambú no cuenta. Altas del rango: esperas de
 * 3, 4 y 1 días y tratamientos de 36, 61 y 80. Fuera del rango, los últimos
 * 100 días de C para el embudo, los activos y los operativos.
 */
async function sembrar() {
  const autor = (await s.pool.query('SELECT id FROM usuarios WHERE es_de_entorno')).rows[0].id as number;
  const { rows: pr } = await s.pool.query(`INSERT INTO propietarios (nombre) VALUES ('Joan') RETURNING id`);
  const { rows: pa } = await s.pool.query(`INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'perro', $1) RETURNING id`, [pr[0].id]);
  const clinica = async (nombre: string) => (await s.pool.query(`INSERT INTO clinicas (nombre) VALUES ($1) RETURNING id`, [nombre])).rows[0].id as number;
  const [A, B, C] = [await clinica('Clínica A'), await clinica('Clínica B'), await clinica('Clínica C')];
  type F = string | Date | null;
  const caso = (clinicaId: number, estado: string, o: {
    enviado: F; resuelto?: F; enTratamiento?: F; primeraVisita?: string; cerrado?: F; registrado?: boolean;
  }) => s.pool.query(
    `INSERT INTO casos (paciente_id, clinica_id, derivador_id, registrado_por, creado_por, estado,
                        enviado_el, resuelto_el, en_tratamiento_el, primera_visita, cerrado_el)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [pa[0].id, clinicaId, o.registrado ? null : vet.usuario.id, o.registrado ? autor : null, autor, estado,
      o.enviado, o.resuelto ?? null, o.enTratamiento ?? null, o.primeraVisita ?? null, o.cerrado ?? null],
  );

  await caso(A, 'alta', {
    enviado: '2026-03-02 09:00+01', resuelto: '2026-03-02 13:00+01',
    enTratamiento: '2026-03-04 10:00+01', primeraVisita: '2026-03-05', cerrado: '2026-04-10 12:00+02',
  });
  await caso(A, 'alta', {
    enviado: '2026-03-16 00:30+01', resuelto: '2026-03-16 08:30+01',
    enTratamiento: '2026-03-18 10:00+01', primeraVisita: '2026-03-20', cerrado: '2026-05-20 12:00+02',
  });
  await caso(A, 'rechazada', { enviado: '2026-03-11 10:00+01', resuelto: '2026-03-12 12:00+01', cerrado: '2026-03-12 12:00+01' });
  for (const d of [20, 23, 24, 25]) await caso(A, 'enviada', { enviado: `2026-03-${d} 10:00+01` });
  await caso(A, 'borrador', { enviado: null });
  await caso(B, 'alta', {
    registrado: true, enviado: '2026-03-12 10:00+01', resuelto: '2026-03-12 10:00+01',
    enTratamiento: '2026-03-12 10:00+01', primeraVisita: '2026-03-13', cerrado: '2026-06-01 12:00+02',
  });
  for (const d of [26, 27]) await caso(B, 'enviada', { enviado: `2026-03-${d} 10:00+01` });
  await caso(C, 'abandonada', { registrado: true, enviado: '2026-05-10 10:00+02', resuelto: '2026-05-10 10:00+02', cerrado: '2026-05-20 10:00+02' });

  await caso(C, 'aceptada', { enviado: haceDias(10), resuelto: haceDias(9) });
  await caso(C, 'en_tratamiento', { enviado: haceDias(20), resuelto: haceDias(19), enTratamiento: haceDias(15), primeraVisita: fechaHace(14) });
  await caso(C, 'alta', { enviado: haceDias(30), resuelto: haceDias(29), enTratamiento: haceDias(28), primeraVisita: fechaHace(27), cerrado: haceDias(25) });
  await caso(C, 'rechazada', { enviado: haceDias(40), resuelto: haceDias(39), cerrado: haceDias(39) });
  await caso(C, 'abandonada', { enviado: haceDias(50), resuelto: haceDias(49), cerrado: haceDias(45) });
  await caso(C, 'enviada', { enviado: new Date() });
  await caso(C, 'rechazada', { enviado: haceDias(100), resuelto: haceDias(99), cerrado: haceDias(99) });
}

const indicadores = (query = '', cookie = admin) => pedir(s.app, 'GET', `/api/panel/indicadores${query}`, { cookie });

test('indicadores con números exactos: meses, clínicas, respuesta en horas laborables, embudo, activos, duración y operativos', async () => {
  const r = (await indicadores('?desde=2026-01-01&hasta=2026-06-30')).cuerpo;
  assert.deepEqual(r.por_mes.map((m: { mes: string; n: number }) => `${m.mes}:${m.n}`),
    ['2026-01:0', '2026-02:0', '2026-03:10', '2026-04:0', '2026-05:1', '2026-06:0']);
  assert.deepEqual(r.clinicas.map((c: { nombre: string; n: number; sin_derivar: boolean }) => [c.nombre, c.n, c.sin_derivar]),
    [['Clínica A', 7, true], ['Clínica B', 3, true], ['Clínica C', 1, false]]);
  assert.deepEqual(r.respuesta, { mediana_horas: 8, resueltas: 3, en_24h: 2, sin_resolver: 6 });
  assert.deepEqual(r.embudo, {
    enviadas: 6, aceptadas: 4, con_cita: 2, alta: 1, pendientes_cita: 1, rechazadas: 1, abandonadas: 1, sin_respuesta: 1,
  });
  assert.deepEqual(r.activos, { enviada: 7, aceptada: 1, en_tratamiento: 1 });
  assert.deepEqual(r.duracion, { altas: 3, espera_dias: 3, tratamiento_dias: 61 });
  assert.deepEqual(r.operativos, { atascados: 1, propuestas_pendientes: 0, dias_pendiente_cita: 3 });
});

test('rango: sin altas dice «sin datos» (null, no cero); por defecto 12 meses hasta hoy; al revés o más de 36 meses → 400; el derivador → 403', async () => {
  const vacio = (await indicadores('?desde=2025-01-01&hasta=2025-06-30')).cuerpo;
  assert.deepEqual(vacio.duracion, { altas: 0, espera_dias: null, tratamiento_dias: null });
  assert.equal(vacio.respuesta.mediana_horas, null);
  assert.ok(vacio.por_mes.every((m: { n: number }) => m.n === 0));

  const defecto = (await indicadores()).cuerpo;
  assert.equal(defecto.por_mes.length, 12);
  assert.equal(defecto.rango.hasta, new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()));

  assert.equal((await indicadores('?desde=2026-06-01&hasta=2026-01-01')).estado, 400);
  assert.equal((await indicadores('?desde=2023-01-01&hasta=2026-01-01')).estado, 400);
  assert.equal((await indicadores('?desde=2023-02-01&hasta=2026-01-31')).estado, 200);
  assert.equal((await indicadores('', vet.cookie)).estado, 403);
});
