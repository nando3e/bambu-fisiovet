// Avisos: catálogo, matriz, publicación en transacción, regla anti-ruido y la
// cola de correos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { publicarEvento } from '../src/avisos/publicar.ts';
import { encolarCorreo, crearCola, MAX_INTENTOS } from '../src/avisos/cola.ts';
import { TIPOS_EVENTO } from '../src/avisos/eventos.ts';
import { enTransaccion } from '../src/db/pool.ts';
import {
  CanalFalso, casoDePrueba, entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado,
  type Servidor,
} from './ayuda.ts';

let s: Servidor;
let admin: string;
before(async () => {
  s = await servidorDePrueba('avisos');
  admin = await entrarSuperadmin(s);
});
after(async () => {
  await s.app.close();
});

const matriz = (evento: string, fila: { notificacion: boolean; correo: boolean; correo_a?: string | null }) =>
  pedir(s.app, 'PUT', `/api/configuracion/avisos/${evento}`, { cookie: admin, cuerpo: { correo_a: null, ...fila } });
const contar = async (sql: string, params: unknown[] = []) => (await s.pool.query<{ n: number }>(sql, params)).rows[0]!.n;
const publicar = (ev: Parameters<typeof publicarEvento>[1]) => enTransaccion(s.pool, (bd) => publicarEvento(bd, ev));

test('catálogo: coincide con el CHECK vivo, la semilla no pisa lo editado y un evento desconocido o una acción deshecha no dejan nada', async () => {
  const { rows } = await s.pool.query<{ def: string }>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'eventos_tipo_check'`);
  assert.deepEqual([...rows[0]!.def.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), [...TIPOS_EVENTO].sort());
  assert.equal(await contar('SELECT count(*)::int AS n FROM configuracion_avisos'), TIPOS_EVENTO.length);

  await matriz('mensaje.nuevo', { notificacion: true, correo: false });
  const otro = await servidorDePrueba('avisos', {}, { url: s.url });
  await otro.app.close();
  admin = await entrarSuperadmin(s); // cada arranque cierra las sesiones del superadmin
  assert.equal((await s.pool.query(`SELECT correo FROM configuracion_avisos WHERE evento = 'mensaje.nuevo'`)).rows[0].correo, false);
  await matriz('mensaje.nuevo', { notificacion: true, correo: true });

  await assert.rejects(publicar({ tipo: 'caso.inventado' as never, actor: null }), /desconocido/);
  await fisioVerificada(s, admin);
  const eventos = await contar('SELECT count(*)::int AS n FROM eventos');
  const correos = await contar('SELECT count(*)::int AS n FROM correos_pendientes');
  const caso = await casoDePrueba(s.pool);
  await assert.rejects(enTransaccion(s.pool, async (bd) => {
    await publicarEvento(bd, { tipo: 'derivacion.enviada', actor: null, casoId: caso, datos: { paciente: 'Nala' } });
    throw new Error('la acción falla después de publicar');
  }));
  assert.equal(await contar('SELECT count(*)::int AS n FROM eventos'), eventos);
  assert.equal(await contar('SELECT count(*)::int AS n FROM correos_pendientes'), correos);
});

test('matriz: apagar notificación o correo vale al momento; «Correu a» manda sobre el centro; el veterinario decide sus correos; los de cuenta salen siempre', async () => {
  const vet = await veterinarioVerificado(s);
  await matriz('caso.alta', { notificacion: false, correo: false });
  const apagado = await publicar({ tipo: 'caso.alta', actor: null, casoId: await casoDePrueba(s.pool), derivadoresInteresados: [vet.usuario.id] });
  assert.deepEqual([apagado.notificados, apagado.correosEncolados], [[], []]);
  await matriz('caso.alta', { notificacion: true, correo: false });
  const soloCampana = await publicar({ tipo: 'caso.alta', actor: null, casoId: await casoDePrueba(s.pool), derivadoresInteresados: [vet.usuario.id] });
  assert.deepEqual([soloCampana.notificados, soloCampana.correosEncolados], [[vet.usuario.id], []]);
  await matriz('caso.alta', { notificacion: true, correo: true });

  await pedir(s.app, 'PUT', '/api/configuracion/avisos', { cookie: admin, cuerpo: { correo_centro: 'avisos@bambufisiovet.com', dias_sin_noticias: 7 } });
  await matriz('derivacion.enviada', { notificacion: true, correo: true, correo_a: 'recepcio@bambufisiovet.com' });
  assert.deepEqual((await publicar({ tipo: 'derivacion.enviada', actor: null, casoId: await casoDePrueba(s.pool) })).correosEncolados, ['recepcio@bambufisiovet.com']);
  // Varias direcciones: un correo a cada una, y se guardan normalizadas.
  const varias = await matriz('derivacion.enviada', { notificacion: true, correo: true, correo_a: 'recepcio@bambufisiovet.com; laia@bambufisiovet.com ' });
  assert.equal(varias.cuerpo.correo_a, 'recepcio@bambufisiovet.com, laia@bambufisiovet.com');
  assert.deepEqual((await publicar({ tipo: 'derivacion.enviada', actor: null, casoId: await casoDePrueba(s.pool) })).correosEncolados,
    ['recepcio@bambufisiovet.com', 'laia@bambufisiovet.com']);
  assert.equal((await matriz('derivacion.enviada', { notificacion: true, correo: true, correo_a: 'recepcio@bambufisiovet.com, no-es-correu' })).estado, 400);
  await matriz('derivacion.enviada', { notificacion: true, correo: true, correo_a: null });
  assert.deepEqual((await publicar({ tipo: 'derivacion.enviada', actor: null, casoId: await casoDePrueba(s.pool) })).correosEncolados, ['avisos@bambufisiovet.com']);
  assert.equal((await matriz('derivacion.aceptada', { notificacion: true, correo: true, correo_a: 'x@y.es' })).estado, 400);

  await pedir(s.app, 'PATCH', '/api/auth/perfil', { cookie: vet.cookie, cuerpo: { recibe_correos: false } });
  const sinCorreo = await publicar({ tipo: 'informe.publicado', actor: null, casoId: await casoDePrueba(s.pool), derivadoresInteresados: [vet.usuario.id] });
  assert.deepEqual([sinCorreo.notificados, sinCorreo.correosEncolados], [[vet.usuario.id], []]);
  assert.equal((await s.pool.query(`SELECT motivo FROM avisos_enviados WHERE evento_id = $1 AND canal = 'correo'`, [sinCorreo.eventoId])).rows[0].motivo, 'recibe_correos=false');

  // Los correos de cuenta no pasan por la matriz.
  await s.pool.query('UPDATE configuracion_avisos SET correo = false');
  await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email: vet.email } });
  assert.equal(await contar(`SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1 AND plantilla = 'recuperacion'`, [vet.email]), 1);
  await s.pool.query(`UPDATE configuracion_avisos SET correo = true WHERE evento NOT IN ('caso.fisio_asignado', 'caso.en_tratamiento', 'paciente.ficha_modificada', 'usuario.bambu_alta')`);
});

test('anti-ruido y campana: dos mensajes sin leer dan dos notificaciones y un correo; leer rearma el correo; la notificación de otro → 404', async () => {
  const vet = await veterinarioVerificado(s);
  const otro = await veterinarioVerificado(s);
  const fisio = await fisioVerificada(s, admin);
  const caso = await casoDePrueba(s.pool);
  const mensaje = () => publicar({
    tipo: 'mensaje.nuevo', actor: { id: fisio.id, rol: 'bambu' }, casoId: caso, datos: { paciente: 'Nala', nombre: 'Laia' },
    derivadoresInteresados: [vet.usuario.id],
  });
  assert.deepEqual((await mensaje()).correosEncolados, [vet.email]);
  assert.deepEqual((await mensaje()).correosEncolados, []);
  assert.equal((await pedir(s.app, 'GET', '/api/notificaciones/resumen', { cookie: vet.cookie })).cuerpo.no_leidas, 2);
  const id = (await pedir(s.app, 'GET', '/api/notificaciones', { cookie: vet.cookie })).cuerpo.notificaciones[0].id;
  assert.equal((await pedir(s.app, 'POST', `/api/notificaciones/${id}/leida`, { cookie: otro.cookie })).estado, 404);
  assert.equal((await pedir(s.app, 'POST', `/api/notificaciones/${id}/leida`, { cookie: vet.cookie })).cuerpo.no_leidas, 1);
  await pedir(s.app, 'POST', '/api/notificaciones/leidas', { cookie: vet.cookie });
  assert.equal((await pedir(s.app, 'GET', '/api/notificaciones/resumen', { cookie: vet.cookie })).cuerpo.no_leidas, 0);
  assert.deepEqual((await mensaje()).correosEncolados, [vet.email]);
});

// --- La cola ---

const colaCon = (canal: CanalFalso, dryRun = false) =>
  crearCola({ pool: s.pool, config: { ...s.config, CORREO_DRY_RUN: dryRun, COLA_ACTIVA: false }, canal });
const vaciarCola = () => s.pool.query(`UPDATE correos_pendientes SET estado = 'descartado' WHERE estado IN ('pendiente', 'en_curso')`);
const estado = async (id: number) => (await s.pool.query('SELECT estado, intentos, error FROM correos_pendientes WHERE id = $1', [id])).rows[0];

test('cola: envía con la plantilla y enlace absoluto y deja traza; en dry-run no llama al canal; una plantilla rota falla sin reintentos', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  const id = await encolarCorreo(s.pool, {
    destinatario: 'marta@clinica.vet', plantilla: 'aviso',
    datos: { saludo: 'Hola, Marta', titulo: 'Informe nou: Nala', cuerpo: 'Text', enlace: '/d/casos/7' },
  });
  await colaCon(canal).procesar();
  assert.match(canal.enviados[0]!.html, /https:\/\/bambu\.test\/d\/casos\/7/);
  assert.equal(canal.enviados[0]!.asunto, 'Informe nou: Nala · BAMBÚ Fisiovet');
  assert.equal((await estado(id)).estado, 'enviado');
  assert.equal(await contar('SELECT count(*)::int AS n FROM avisos_enviados WHERE correo_pendiente_id = $1 AND enviado', [id]), 1);

  const seco = await encolarCorreo(s.pool, { destinatario: 'y@clinica.vet', plantilla: 'prueba', datos: {} });
  const otroCanal = new CanalFalso();
  await colaCon(otroCanal, true).procesar();
  assert.equal(otroCanal.enviados.length, 0);
  assert.equal((await s.pool.query('SELECT motivo FROM avisos_enviados WHERE correo_pendiente_id = $1', [seco])).rows[0].motivo, 'dry-run');

  const roto = await encolarCorreo(s.pool, { destinatario: 'w@clinica.vet', plantilla: 'no-existe', datos: {} });
  await colaCon(new CanalFalso()).procesar();
  assert.equal((await estado(roto)).estado, 'fallido');
});

test('cola: SMTP caído reintenta hasta fallido y el panel lo reactiva; un envío interrumpido vuelve contando intento; dos colas no duplican', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  canal.fallar = 'SMTP: connection refused';
  const id = await encolarCorreo(s.pool, { destinatario: 'x@clinica.vet', plantilla: 'prueba', datos: {} });
  const cola = colaCon(canal);
  await cola.procesar();
  assert.deepEqual({ ...(await estado(id)) }, { estado: 'pendiente', intentos: 1, error: 'SMTP: connection refused' });
  for (let i = 1; i < MAX_INTENTOS; i++) {
    await s.pool.query('UPDATE correos_pendientes SET proximo_intento = now() WHERE id = $1', [id]);
    await cola.procesar();
  }
  assert.equal((await estado(id)).estado, 'fallido');
  canal.fallar = null;
  assert.equal((await pedir(s.app, 'POST', `/api/configuracion/avisos/cola/${id}/reintenta`, { cookie: admin })).estado, 200);
  await cola.procesar();
  assert.equal((await estado(id)).estado, 'enviado');

  // En curso caducado: sale otra vez y cuenta intento; en el último, fallido sin enviar.
  const muerto = await encolarCorreo(s.pool, { destinatario: 'muerto@clinica.vet', plantilla: 'prueba', datos: {} });
  const cuelga = await encolarCorreo(s.pool, { destinatario: 'cuelga@clinica.vet', plantilla: 'prueba', datos: {} });
  await s.pool.query(`UPDATE correos_pendientes SET estado = 'en_curso', en_curso_desde = now() - interval '11 minutes' WHERE id IN ($1, $2)`, [muerto, cuelga]);
  await s.pool.query('UPDATE correos_pendientes SET intentos = $2 WHERE id = $1', [cuelga, MAX_INTENTOS - 1]);
  const vista = new CanalFalso();
  await colaCon(vista).procesar();
  assert.deepEqual(vista.enviados.map((m) => m.para), ['muerto@clinica.vet']);
  assert.equal((await estado(muerto)).intentos, 1);
  assert.match((await estado(cuelga)).error, /interromput/);

  await vaciarCola();
  for (let i = 0; i < 30; i++) await encolarCorreo(s.pool, { destinatario: `z${i}@clinica.vet`, plantilla: 'prueba', datos: {} });
  const doble = new CanalFalso();
  await Promise.all([colaCon(doble).procesar(), colaCon(doble).procesar()]);
  assert.equal(new Set(doble.enviados.map((m) => m.para)).size, 30);
  assert.equal(doble.enviados.length, 30);
});
