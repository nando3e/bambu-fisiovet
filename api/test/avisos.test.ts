// Avisos: catálogo, matriz, publicación en transacción, regla anti-ruido y la
// cola de correos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { publicarEvento } from '../src/avisos/publicar.ts';
import { encolarCorreo, crearCola, MAX_INTENTOS } from '../src/avisos/cola.ts';
import { TIPOS_EVENTO } from '../src/avisos/eventos.ts';
import { enTransaccion } from '../src/db/pool.ts';
import {
  CanalFalso, entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado,
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
  pedir(s.app, 'PUT', `/api/configuracion/avisos/${evento}`, {
    cookie: admin, cuerpo: { correo_a: null, ...fila },
  });

const contar = async (sql: string, params: unknown[] = []) =>
  (await s.pool.query<{ n: number }>(sql, params)).rows[0]!.n;

let casoFalso = 1000;

test('el catálogo del código y el CHECK de la migración son la misma lista', () => {
  const sql = readFileSync(new URL('../migrations/004_avisos.sql', import.meta.url), 'utf8');
  const bloque = /eventos_tipo_check CHECK \(tipo IN \(([\s\S]*?)\)\)/.exec(sql)![1]!;
  const enSql = [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(enSql, [...TIPOS_EVENTO].sort());
});

test('la semilla crea una fila por evento y no pisa lo editado', async () => {
  assert.equal(await contar('SELECT count(*)::int AS n FROM configuracion_avisos'), TIPOS_EVENTO.length);
  await matriz('mensaje.nuevo', { notificacion: true, correo: false });
  const otro = await servidorDePrueba('avisos', {}, { url: s.url });
  await otro.app.close();
  // Cada arranque cierra las sesiones del superadmin: hay que volver a entrar.
  admin = await entrarSuperadmin(s);
  const { rows } = await s.pool.query(`SELECT correo FROM configuracion_avisos WHERE evento = 'mensaje.nuevo'`);
  assert.equal(rows[0].correo, false);
  await matriz('mensaje.nuevo', { notificacion: true, correo: true });
});

test('publicar un tipo desconocido lanza y deshace', async () => {
  await assert.rejects(
    enTransaccion(s.pool, (bd) => publicarEvento(bd, { tipo: 'caso.inventado' as never, actor: null })),
    /desconocido/,
  );
});

test('si la acción se deshace, no queda ni evento, ni notificación, ni correo', async () => {
  await fisioVerificada(s, admin);
  const eventos = await contar('SELECT count(*)::int AS n FROM eventos');
  const correos = await contar('SELECT count(*)::int AS n FROM correos_pendientes');
  await assert.rejects(
    enTransaccion(s.pool, async (bd) => {
      await publicarEvento(bd, {
        tipo: 'derivacion.enviada', actor: null, casoId: casoFalso++, datos: { paciente: 'Nala' },
      });
      throw new Error('la acción falla después de publicar');
    }),
  );
  assert.equal(await contar('SELECT count(*)::int AS n FROM eventos'), eventos);
  assert.equal(await contar('SELECT count(*)::int AS n FROM correos_pendientes'), correos);
});

test('matriz: apagar la notificación no crea filas; apagar el correo no encola', async () => {
  await matriz('caso.alta', { notificacion: false, correo: false });
  const vet = await veterinarioVerificado(s);
  const r = await enTransaccion(s.pool, (bd) =>
    publicarEvento(bd, {
      tipo: 'caso.alta', actor: null, casoId: casoFalso++, datos: { paciente: 'Rufo' },
      derivadoresInteresados: [vet.usuario.id],
    }),
  );
  assert.deepEqual(r.notificados, []);
  assert.deepEqual(r.correosEncolados, []);

  await matriz('caso.alta', { notificacion: true, correo: false });
  const r2 = await enTransaccion(s.pool, (bd) =>
    publicarEvento(bd, {
      tipo: 'caso.alta', actor: null, casoId: casoFalso++, datos: { paciente: 'Rufo' },
      derivadoresInteresados: [vet.usuario.id],
    }),
  );
  assert.deepEqual(r2.notificados, [vet.usuario.id]);
  assert.deepEqual(r2.correosEncolados, []);
  await matriz('caso.alta', { notificacion: true, correo: true });
});

test('«Correu a» manda sobre el correo del centro; vacío, el del centro', async () => {
  await pedir(s.app, 'PUT', '/api/configuracion/avisos', {
    cookie: admin, cuerpo: { correo_centro: 'avisos@bambufisiovet.com', dias_sin_noticias: 7 },
  });
  await matriz('derivacion.enviada', { notificacion: true, correo: true, correo_a: 'recepcio@bambufisiovet.com' });
  const con = await enTransaccion(s.pool, (bd) =>
    publicarEvento(bd, { tipo: 'derivacion.enviada', actor: null, casoId: casoFalso++, datos: { paciente: 'Nala' } }),
  );
  assert.deepEqual(con.correosEncolados, ['recepcio@bambufisiovet.com']);

  await matriz('derivacion.enviada', { notificacion: true, correo: true, correo_a: null });
  const sin = await enTransaccion(s.pool, (bd) =>
    publicarEvento(bd, { tipo: 'derivacion.enviada', actor: null, casoId: casoFalso++, datos: { paciente: 'Nala' } }),
  );
  assert.deepEqual(sin.correosEncolados, ['avisos@bambufisiovet.com']);
});

test('«Correu a» no se admite en eventos que van a los veterinarios', async () => {
  const r = await matriz('derivacion.aceptada', { notificacion: true, correo: true, correo_a: 'x@y.es' });
  assert.equal(r.estado, 400);
});

test('veterinario con los correos apagados: notificación sí, correo no, y la traza lo dice', async () => {
  const vet = await veterinarioVerificado(s);
  await pedir(s.app, 'PATCH', '/api/auth/perfil', { cookie: vet.cookie, cuerpo: { recibe_correos: false } });
  const r = await enTransaccion(s.pool, (bd) =>
    publicarEvento(bd, {
      tipo: 'informe.publicado', actor: null, casoId: casoFalso++, datos: { paciente: 'Kira' },
      derivadoresInteresados: [vet.usuario.id],
    }),
  );
  assert.deepEqual(r.notificados, [vet.usuario.id]);
  assert.deepEqual(r.correosEncolados, []);
  const { rows } = await s.pool.query(
    `SELECT motivo FROM avisos_enviados WHERE evento_id = $1 AND canal = 'correo'`,
    [r.eventoId],
  );
  assert.equal(rows[0].motivo, 'recibe_correos=false');
});

test('anti-ruido: dos mensajes sin leer → dos notificaciones y un correo; tras leer, otro correo', async () => {
  const vet = await veterinarioVerificado(s);
  const fisio = await fisioVerificada(s, admin);
  const caso = casoFalso++;
  const mensaje = () =>
    enTransaccion(s.pool, (bd) =>
      publicarEvento(bd, {
        tipo: 'mensaje.nuevo', actor: { id: fisio.id, rol: 'bambu' }, casoId: caso,
        datos: { paciente: 'Nala', nombre: 'Laia' }, derivadoresInteresados: [vet.usuario.id],
      }),
    );
  const a = await mensaje();
  const b = await mensaje();
  assert.deepEqual(a.correosEncolados, [vet.email]);
  assert.deepEqual(b.correosEncolados, []);
  const lista = await pedir(s.app, 'GET', '/api/notificaciones?solo_no_leidas=1', { cookie: vet.cookie });
  assert.equal(lista.cuerpo.notificaciones.filter((n: { caso_id: number }) => n.caso_id === caso).length, 2);

  await pedir(s.app, 'POST', '/api/notificaciones/leidas', { cookie: vet.cookie });
  const c = await mensaje();
  assert.deepEqual(c.correosEncolados, [vet.email]);
});

test('notificaciones: contador, marcar una, marcar todas; la de otro → 404', async () => {
  const vet = await veterinarioVerificado(s);
  const otro = await veterinarioVerificado(s);
  for (let i = 0; i < 3; i++) {
    await enTransaccion(s.pool, (bd) =>
      publicarEvento(bd, {
        tipo: 'derivacion.aceptada', actor: null, casoId: casoFalso++, datos: { paciente: `P${i}` },
        derivadoresInteresados: [vet.usuario.id],
      }),
    );
  }
  assert.equal((await pedir(s.app, 'GET', '/api/notificaciones/resumen', { cookie: vet.cookie })).cuerpo.no_leidas, 3);
  const lista = await pedir(s.app, 'GET', '/api/notificaciones', { cookie: vet.cookie });
  const id = lista.cuerpo.notificaciones[0].id;
  assert.equal((await pedir(s.app, 'POST', `/api/notificaciones/${id}/leida`, { cookie: otro.cookie })).estado, 404);
  const una = await pedir(s.app, 'POST', `/api/notificaciones/${id}/leida`, { cookie: vet.cookie });
  assert.equal(una.cuerpo.no_leidas, 2);
  await pedir(s.app, 'POST', '/api/notificaciones/leidas', { cookie: vet.cookie });
  assert.equal((await pedir(s.app, 'GET', '/api/notificaciones/resumen', { cookie: vet.cookie })).cuerpo.no_leidas, 0);
});

test('los correos de cuenta salen aunque la matriz lo apague todo', async () => {
  for (const evento of TIPOS_EVENTO) await matriz(evento, { notificacion: true, correo: false });
  const vet = await veterinarioVerificado(s);
  await pedir(s.app, 'POST', '/api/auth/recupera', { cuerpo: { email: vet.email } });
  assert.equal(
    await contar(`SELECT count(*)::int AS n FROM correos_pendientes WHERE destinatario = $1 AND plantilla = 'recuperacion'`, [vet.email]),
    1,
  );
  const { rows } = await s.pool.query(
    `UPDATE configuracion_avisos SET correo = true WHERE evento IN (
       'derivacion.enviada','derivacion.aceptada','derivacion.rechazada','caso.alta','caso.abandonado',
       'mensaje.nuevo','adjunto.nuevo','informe.publicado','usuario.derivador_alta',
       'usuario.solicita_union','usuario.union_resuelta','caso.sin_noticias') RETURNING evento`,
  );
  assert.equal(rows.length, 12);
});

// --- La cola ---

async function colaCon(canal: CanalFalso, entorno: { dryRun?: boolean } = {}) {
  return crearCola({
    pool: s.pool,
    config: { ...s.config, CORREO_DRY_RUN: entorno.dryRun ?? false, COLA_ACTIVA: false },
    canal,
  });
}

async function vaciarCola() {
  await s.pool.query(`UPDATE correos_pendientes SET estado = 'descartado' WHERE estado IN ('pendiente', 'en_curso')`);
}

test('cola: envía, rellena la plantilla con enlace absoluto y deja traza', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  const id = await encolarCorreo(s.pool, {
    destinatario: 'marta@clinica.vet', plantilla: 'aviso',
    datos: { saludo: 'Hola, Marta', titulo: 'Informe nou: Nala', cuerpo: 'Text', enlace: '/d/casos/7' },
  });
  assert.equal(await (await colaCon(canal)).procesar(), 1);
  assert.equal(canal.enviados.length, 1);
  assert.match(canal.enviados[0]!.html, /https:\/\/bambu\.test\/d\/casos\/7/);
  assert.equal(canal.enviados[0]!.asunto, 'Informe nou: Nala · BAMBÚ Fisiovet');
  const { rows } = await s.pool.query('SELECT estado FROM correos_pendientes WHERE id = $1', [id]);
  assert.equal(rows[0].estado, 'enviado');
  assert.equal(
    await contar(`SELECT count(*)::int AS n FROM avisos_enviados WHERE correo_pendiente_id = $1 AND enviado`, [id]),
    1,
  );
});

test('cola: SMTP caído → pendiente con un intento y el próximo en el futuro; al sexto, fallido', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  canal.fallar = 'SMTP: connection refused';
  const id = await encolarCorreo(s.pool, {
    destinatario: 'x@clinica.vet', plantilla: 'prueba', datos: {},
  });
  const cola = await colaCon(canal);
  await cola.procesar();
  let { rows } = await s.pool.query(
    'SELECT estado, intentos, error, proximo_intento > now() AS futuro FROM correos_pendientes WHERE id = $1', [id],
  );
  assert.deepEqual({ ...rows[0] }, { estado: 'pendiente', intentos: 1, error: 'SMTP: connection refused', futuro: true });

  for (let i = 1; i < MAX_INTENTOS; i++) {
    await s.pool.query('UPDATE correos_pendientes SET proximo_intento = now() WHERE id = $1', [id]);
    await cola.procesar();
  }
  ({ rows } = await s.pool.query('SELECT estado, intentos FROM correos_pendientes WHERE id = $1', [id]));
  assert.deepEqual({ ...rows[0] }, { estado: 'fallido', intentos: MAX_INTENTOS });

  // Reintentar desde el panel lo devuelve a la cola.
  canal.fallar = null;
  const r = await pedir(s.app, 'POST', `/api/configuracion/avisos/cola/${id}/reintenta`, { cookie: admin });
  assert.equal(r.estado, 200);
  await cola.procesar();
  ({ rows } = await s.pool.query('SELECT estado FROM correos_pendientes WHERE id = $1', [id]));
  assert.equal(rows[0].estado, 'enviado');
});

test('cola: en dry-run no llama al canal, marca enviado y la traza dice dry-run', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  const id = await encolarCorreo(s.pool, { destinatario: 'y@clinica.vet', plantilla: 'prueba', datos: {} });
  await (await colaCon(canal, { dryRun: true })).procesar();
  assert.equal(canal.enviados.length, 0);
  const { rows } = await s.pool.query(
    `SELECT c.estado, a.motivo FROM correos_pendientes c JOIN avisos_enviados a ON a.correo_pendiente_id = c.id
     WHERE c.id = $1`, [id],
  );
  assert.deepEqual({ ...rows[0] }, { estado: 'enviado', motivo: 'dry-run' });
});

test('cola: dos colas a la vez envían cada correo una sola vez', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  for (let i = 0; i < 30; i++) {
    await encolarCorreo(s.pool, { destinatario: `z${i}@clinica.vet`, plantilla: 'prueba', datos: {} });
  }
  const [a, b] = [await colaCon(canal), await colaCon(canal)];
  await Promise.all([a.procesar(), b.procesar()]);
  assert.equal(canal.enviados.length, 30);
  assert.equal(new Set(canal.enviados.map((m) => m.para)).size, 30);
});

test('cola: un correo que se quedó «en curso» porque el proceso murió vuelve a salir', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  const id = await encolarCorreo(s.pool, { destinatario: 'muerto@clinica.vet', plantilla: 'prueba', datos: {} });
  await s.pool.query(
    `UPDATE correos_pendientes SET estado = 'en_curso', en_curso_desde = now() - interval '11 minutes' WHERE id = $1`,
    [id],
  );
  await (await colaCon(canal)).procesar();
  assert.equal(canal.enviados.length, 1);
  const { rows } = await s.pool.query('SELECT intentos FROM correos_pendientes WHERE id = $1', [id]);
  assert.equal(rows[0].intentos, 1);
});

test('cola: un «en curso» que se interrumpe una y otra vez acaba en fallido, sin enviarse', async () => {
  await vaciarCola();
  const canal = new CanalFalso();
  const id = await encolarCorreo(s.pool, { destinatario: 'cuelga@clinica.vet', plantilla: 'prueba', datos: {} });
  await s.pool.query(
    `UPDATE correos_pendientes SET estado = 'en_curso', intentos = $2,
       en_curso_desde = now() - interval '11 minutes' WHERE id = $1`,
    [id, MAX_INTENTOS - 1],
  );
  await (await colaCon(canal)).procesar();
  assert.equal(canal.enviados.length, 0);
  const { rows } = await s.pool.query('SELECT estado, error FROM correos_pendientes WHERE id = $1', [id]);
  assert.equal(rows[0].estado, 'fallido');
  assert.match(rows[0].error, /interromput/);
});

test('cola: una plantilla que no existe → fallido sin reintentos', async () => {
  await vaciarCola();
  const id = await encolarCorreo(s.pool, { destinatario: 'w@clinica.vet', plantilla: 'no-existe', datos: {} });
  await (await colaCon(new CanalFalso())).procesar();
  const { rows } = await s.pool.query('SELECT estado, error FROM correos_pendientes WHERE id = $1', [id]);
  assert.equal(rows[0].estado, 'fallido');
  assert.match(rows[0].error, /plantilla/);
});
