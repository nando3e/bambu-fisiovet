// Hilo: mensajes, notas internas, mensajes de sistema, adjuntos y movimientos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

import {
  entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado, type Servidor,
} from './ayuda.ts';

let s: Servidor;
let admin: string;
let fisio: { cookie: string; id: number };
before(async () => {
  s = await servidorDePrueba('hilo');
  admin = await entrarSuperadmin(s);
  fisio = await fisioVerificada(s, admin);
});
after(async () => {
  await s.app.close();
});

type Vet = Awaited<ReturnType<typeof veterinarioVerificado>>;
const DATOS = {
  paciente: { nombre: 'Nala', especie: 'perro', peso_kg: 12.4 },
  propietario: { nombre: 'Joan Ferrer', telefono: '600111222' },
  caso: { motivo: 'Coixesa posterior dreta' },
};

async function derivar(vet: Vet) {
  const b = await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: DATOS });
  await pedir(s.app, 'POST', `/api/casos/${b.cuerpo.id}/envia`, { cookie: vet.cookie, cuerpo: { acepta_consentimiento: true } });
  return b.cuerpo as { id: number; paciente: { id: number }; propietario: { id: number } };
}

const mensajes = async (cookie: string, casoId: number) =>
  (await pedir(s.app, 'GET', `/api/casos/${casoId}/mensajes`, { cookie })).cuerpo.mensajes as {
    id: number; tipo: string; visibilidad: string; cuerpo: string; adjunto_id: number | null; adjunto_retirado: boolean;
  }[];

const notificaciones = async (usuarioId: number, tipo: string, casoId: number) =>
  (await s.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notificaciones n JOIN eventos e ON e.id = n.evento_id
     WHERE n.usuario_id = $1 AND e.tipo = $2 AND n.caso_id = $3`,
    [usuarioId, tipo, casoId],
  )).rows[0]!.n;

/** Sube un fichero como lo haría el navegador (multipart). */
async function subir(cookie: string | undefined, casoId: number, nombre: string, datos: Buffer, interna = false) {
  const limite = `----bambu${Math.random().toString(16).slice(2)}`;
  const partes = [
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="interna"\r\n\r\n${interna}\r\n`),
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="fichero"; filename="${nombre}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    datos,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ];
  const r = await s.app.inject({
    method: 'POST',
    url: `/api/casos/${casoId}/adjuntos`,
    headers: { 'content-type': `multipart/form-data; boundary=${limite}`, ...(cookie ? { cookie } : {}) },
    payload: Buffer.concat(partes),
  });
  return { estado: r.statusCode, cuerpo: r.json() as { id: number; error?: string } };
}

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const CARPETA = resolve('./datos-test/adjuntos');
const ficherosEnDisco = () => (existsSync(CARPETA) ? readdirSync(CARPETA).length : 0);

test('mensajes de sistema: aceptar y cambiar el peso dejan su línea en el hilo, con el antes y el después', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: { fisio_id: fisio.id } });
  await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: fisio.cookie, cuerpo: { peso_kg: 11.8 } });
  const textos = (await mensajes(vet.cookie, c.id)).filter((m) => m.tipo === 'sistema').map((m) => m.cuerpo);
  assert.ok(textos.some((t) => /ha enviat la derivació/.test(t)));
  assert.ok(textos.some((t) => /Bambú ha acceptat la derivació i Laia Serra/.test(t)));
  assert.ok(textos.some((t) => t === 'Laia Serra ha canviat el pes: 12,4 → 11,8.'), textos.join(' | '));
});

test('mensajes de sistema: si la acción se deshace, no queda línea', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const antes = (await mensajes(fisio.cookie, c.id)).length;
  // Rechazar sin motivo: 400 dentro de la transición.
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/rechaza`, { cookie: fisio.cookie, cuerpo: { motivo: '' } })).estado, 400);
  // Un fisio que no es del equipo: el error salta dentro de la transacción.
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: { fisio_id: vet.usuario.id } })).estado, 400);
  assert.equal((await mensajes(fisio.cookie, c.id)).length, antes);
});

test('hilo: el veterinario pregunta y el fisio responsable recibe el aviso; borrador → 409; otra clínica → 404', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: { fisio_id: fisio.id } });
  const r = await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: vet.cookie, cuerpo: { cuerpo: 'Pren antiinflamatori?' } });
  assert.equal(r.estado, 201);
  assert.equal(await notificaciones(fisio.id, 'mensaje.nuevo', c.id), 1);
  const borrador = await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: DATOS });
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${borrador.cuerpo.id}/mensajes`, { cookie: vet.cookie, cuerpo: { cuerpo: 'x' } })).estado, 409);
  const ajeno = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: ajeno.cookie, cuerpo: { cuerpo: 'x' } })).estado, 404);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}/mensajes`, { cookie: ajeno.cookie })).estado, 404);
});

test('notas internas: el veterinario no las recibe ni le avisan; si él manda «interna», el mensaje es visible', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const antes = await notificaciones(vet.usuario.id, 'mensaje.nuevo', c.id);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: fisio.cookie, cuerpo: { cuerpo: 'Nota per a l’equip', interna: true } });
  await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: fisio.cookie, cuerpo: { cuerpo: 'Una altra nota', interna: true } });
  const delVet = await mensajes(vet.cookie, c.id);
  assert.ok(!delVet.some((m) => m.visibilidad === 'bambu' || /nota/i.test(m.cuerpo)));
  assert.equal((await mensajes(fisio.cookie, c.id)).filter((m) => m.visibilidad === 'bambu').length, 2);
  assert.equal(await notificaciones(vet.usuario.id, 'mensaje.nuevo', c.id), antes);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: vet.cookie, cuerpo: { cuerpo: 'Vull que ho vegen', interna: true } });
  const propio = (await mensajes(vet.cookie, c.id)).find((m) => m.cuerpo === 'Vull que ho vegen');
  assert.equal(propio?.visibilidad, 'todos');
});

test('adjuntos: PDF con su huella y aviso; PNG con miniatura; descarga protegida', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const pdf = await subir(vet.cookie, c.id, 'analitica.pdf', PDF);
  assert.equal(pdf.estado, 201, JSON.stringify(pdf.cuerpo));
  const { rows } = await s.pool.query('SELECT sha256, mime, bytes FROM adjuntos WHERE id = $1', [pdf.cuerpo.id]);
  assert.equal(rows[0].sha256, createHash('sha256').update(PDF).digest('hex'));
  assert.equal(rows[0].mime, 'application/pdf');
  assert.ok(await notificaciones(fisio.id, 'adjunto.nuevo', c.id) >= 1);

  const fichero = await s.app.inject({ method: 'GET', url: `/api/adjuntos/${pdf.cuerpo.id}/fichero`, headers: { cookie: fisio.cookie } });
  assert.equal(fichero.statusCode, 200);
  assert.equal(fichero.headers['content-type'], 'application/pdf');
  assert.equal(fichero.headers['x-content-type-options'], 'nosniff');
  assert.equal(fichero.rawPayload.toString(), PDF.toString());

  const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#7a9a7a' } }).png().toBuffer();
  const img = await subir(vet.cookie, c.id, 'rx.png', png);
  assert.equal(img.estado, 201);
  const mini = await s.app.inject({ method: 'GET', url: `/api/adjuntos/${img.cuerpo.id}/miniatura`, headers: { cookie: vet.cookie } });
  assert.equal(mini.statusCode, 200);
  assert.equal(mini.headers['content-type'], 'image/webp');
  const meta = await sharp(mini.rawPayload).metadata();
  assert.ok((meta.width ?? 0) <= 480);

  // Sin sesión, 401; de otra clínica, 404.
  assert.equal((await s.app.inject({ method: 'GET', url: `/api/adjuntos/${pdf.cuerpo.id}/fichero` })).statusCode, 401);
  const ajeno = await veterinarioVerificado(s);
  assert.equal((await s.app.inject({ method: 'GET', url: `/api/adjuntos/${pdf.cuerpo.id}/fichero`, headers: { cookie: ajeno.cookie } })).statusCode, 404);
  assert.equal((await subir(ajeno.cookie, c.id, 'x.pdf', PDF)).estado, 404);
  assert.equal((await subir(undefined, c.id, 'x.pdf', PDF)).estado, 401);
});

test('adjuntos: un ejecutable disfrazado → 400 y nada en disco; 15 MB → 413', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const antes = ficherosEnDisco();
  const exe = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(2000)]);
  assert.equal((await subir(vet.cookie, c.id, 'radiografia.pdf', exe)).estado, 400);
  const grande = Buffer.concat([PDF, Buffer.alloc(15 * 1024 * 1024)]);
  assert.equal((await subir(vet.cookie, c.id, 'gran.pdf', grande)).estado, 413);
  assert.equal(ficherosEnDisco(), antes);
  const { rows } = await s.pool.query('SELECT count(*)::int AS n FROM adjuntos WHERE caso_id = $1', [c.id]);
  assert.equal(rows[0].n, 0);
});

test('adjuntos: un PDF de 10 MB entra (el límite es 12 MB, no los 8 de las fotos de la web)', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const diez = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
  assert.equal((await subir(vet.cookie, c.id, 'rm.pdf', diez)).estado, 201);
});

test('adjuntos: uno en nota interna no lo ve ni lo descarga el veterinario', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const r = await subir(fisio.cookie, c.id, 'intern.pdf', PDF, true);
  assert.equal(r.estado, 201);
  assert.ok(!(await mensajes(vet.cookie, c.id)).some((m) => m.adjunto_id === r.cuerpo.id));
  assert.equal((await s.app.inject({ method: 'GET', url: `/api/adjuntos/${r.cuerpo.id}/fichero`, headers: { cookie: vet.cookie } })).statusCode, 404);
});

test('retirar: el veterinario dentro de 15 minutos sí, fuera no; Bambú siempre; retirado no se descarga', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const a = await subir(vet.cookie, c.id, 'a.pdf', PDF);
  const b = await subir(vet.cookie, c.id, 'b.pdf', PDF);
  assert.equal((await pedir(s.app, 'DELETE', `/api/adjuntos/${a.cuerpo.id}`, { cookie: vet.cookie })).estado, 200);
  await s.pool.query(`UPDATE adjuntos SET creado = now() - interval '30 minutes' WHERE id = $1`, [b.cuerpo.id]);
  assert.equal((await pedir(s.app, 'DELETE', `/api/adjuntos/${b.cuerpo.id}`, { cookie: vet.cookie })).estado, 403);
  assert.equal((await pedir(s.app, 'DELETE', `/api/adjuntos/${b.cuerpo.id}`, { cookie: fisio.cookie })).estado, 200);
  assert.equal((await s.app.inject({ method: 'GET', url: `/api/adjuntos/${a.cuerpo.id}/fichero`, headers: { cookie: fisio.cookie } })).statusCode, 404);
  const hilo = await mensajes(vet.cookie, c.id);
  assert.ok(hilo.filter((m) => m.adjunto_retirado).length === 2);
  assert.ok(hilo.some((m) => m.tipo === 'sistema' && /ha retirat l’adjunt «a\.pdf»/.test(m.cuerpo)));
  // El fichero sigue en disco: retirar no borra.
  const { rows } = await s.pool.query('SELECT ruta FROM adjuntos WHERE id = $1', [a.cuerpo.id]);
  assert.ok(existsSync(join(CARPETA, rows[0].ruta)));
});

test('últims moviments: la derivación recién enviada sale la primera; el derivador no los ve', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const r = await pedir(s.app, 'GET', '/api/panel/movimientos', { cookie: fisio.cookie });
  assert.equal(r.cuerpo.movimientos[0].caso_id, c.id);
  assert.equal(r.cuerpo.movimientos[0].tipo, 'derivacion.enviada');
  assert.equal((await pedir(s.app, 'GET', '/api/panel/movimientos', { cookie: vet.cookie })).estado, 403);
});

test('catálogo: la fila del evento de sesión ya no está en la matriz', async () => {
  const { rows } = await s.pool.query(`SELECT count(*)::int AS n FROM configuracion_avisos WHERE evento = 'intervencion.registrada'`);
  assert.equal(rows[0].n, 0);
});
