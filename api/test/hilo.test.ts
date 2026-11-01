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
const descargar = (cookie: string | undefined, id: number, que = 'fichero') =>
  s.app.inject({ method: 'GET', url: `/api/adjuntos/${id}/${que}`, headers: cookie ? { cookie } : {} });

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const CARPETA = resolve('./datos-test/adjuntos');
const ficherosEnDisco = () => (existsSync(CARPETA) ? readdirSync(CARPETA).length : 0);

test('conversación: pregunta con aviso al fisio, notas internas invisibles y sin mover la actividad, líneas de sistema y movimientos del panel', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: { fisio_id: fisio.id } });
  await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: fisio.cookie, cuerpo: { peso_kg: 11.8 } });
  const sistema = (await mensajes(vet.cookie, c.id)).filter((m) => m.tipo === 'sistema').map((m) => m.cuerpo);
  assert.ok(sistema.some((t) => /ha enviat la derivació/.test(t)));
  assert.ok(sistema.some((t) => /Bambú ha acceptat la derivació i Laia Serra/.test(t)));
  assert.ok(sistema.includes('Laia Serra ha canviat el pes: 12,4 → 11,8.'), sistema.join(' | '));

  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: vet.cookie, cuerpo: { cuerpo: 'Pren antiinflamatori?' } })).estado, 201);
  assert.equal(await notificaciones(fisio.id, 'mensaje.nuevo', c.id), 1);

  // Notas internas: el veterinario ni las ve ni recibe aviso, y su «última actividad» no se mueve.
  await s.pool.query(`UPDATE casos SET ultima_actividad = now() - interval '2 days' WHERE id = $1`, [c.id]);
  const actividad = async () => new Date((await s.pool.query('SELECT ultima_actividad FROM casos WHERE id = $1', [c.id])).rows[0].ultima_actividad).getTime();
  const antes = [await actividad(), await notificaciones(vet.usuario.id, 'mensaje.nuevo', c.id)];
  await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: fisio.cookie, cuerpo: { cuerpo: 'Nota per a l’equip', interna: true } });
  await subir(fisio.cookie, c.id, 'intern.pdf', PDF, true);
  assert.deepEqual([await actividad(), await notificaciones(vet.usuario.id, 'mensaje.nuevo', c.id)], antes);
  assert.ok(!(await mensajes(vet.cookie, c.id)).some((m) => m.visibilidad === 'bambu' || /nota|intern\.pdf/i.test(m.cuerpo)));
  assert.equal((await mensajes(fisio.cookie, c.id)).filter((m) => m.visibilidad === 'bambu').length, 2);
  // Si el veterinario marca «interna», su mensaje es visible igual.
  await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: vet.cookie, cuerpo: { cuerpo: 'Vull que ho vegen', interna: true } });
  assert.equal((await mensajes(vet.cookie, c.id)).find((m) => m.cuerpo === 'Vull que ho vegen')?.visibilidad, 'todos');

  // Un borrador no tiene hilo; otra clínica no ve nada.
  const borrador = await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: DATOS });
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${borrador.cuerpo.id}/mensajes`, { cookie: vet.cookie, cuerpo: { cuerpo: 'x' } })).estado, 409);
  const ajeno = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/mensajes`, { cookie: ajeno.cookie, cuerpo: { cuerpo: 'x' } })).estado, 404);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}/mensajes`, { cookie: ajeno.cookie })).estado, 404);

  // Últims moviments: la derivación recién enviada sale la primera; el derivador no los ve.
  const nueva = await derivar(vet);
  const mov = (await pedir(s.app, 'GET', '/api/panel/movimientos', { cookie: fisio.cookie })).cuerpo.movimientos[0];
  assert.deepEqual([mov.caso_id, mov.tipo], [nueva.id, 'derivacion.enviada']);
  assert.equal((await pedir(s.app, 'GET', '/api/panel/movimientos', { cookie: vet.cookie })).estado, 403);
});

test('adjuntos: PDF con huella y aviso, descarga protegida y sin caché, miniatura de la PNG; lo disfrazado o enorme no entra; lo interno no se ve', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const pdf = await subir(vet.cookie, c.id, 'l\'analítica (1).pdf', PDF);
  assert.equal(pdf.estado, 201, JSON.stringify(pdf.cuerpo));
  const { rows } = await s.pool.query('SELECT sha256, mime FROM adjuntos WHERE id = $1', [pdf.cuerpo.id]);
  assert.deepEqual([rows[0].sha256, rows[0].mime], [createHash('sha256').update(PDF).digest('hex'), 'application/pdf']);
  assert.equal(await notificaciones(fisio.id, 'adjunto.nuevo', c.id), 1);

  const f = await descargar(fisio.cookie, pdf.cuerpo.id);
  assert.equal(f.rawPayload.toString(), PDF.toString());
  assert.deepEqual([f.headers['content-type'], f.headers['x-content-type-options'], f.headers['cache-control']], ['application/pdf', 'nosniff', 'private, no-store']);
  assert.match(String(f.headers['content-disposition']), /filename\*=UTF-8''l%27anal%C3%ADtica%20%281%29\.pdf$/);

  const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#7a9a7a' } }).png().toBuffer();
  const mini = await descargar(vet.cookie, (await subir(vet.cookie, c.id, 'rx.png', png)).cuerpo.id, 'miniatura');
  assert.equal(mini.headers['content-type'], 'image/webp');
  assert.ok(((await sharp(mini.rawPayload).metadata()).width ?? 0) <= 480);

  // Sin sesión 401; de otra clínica 404, para bajar y para subir.
  const ajeno = await veterinarioVerificado(s);
  assert.equal((await descargar(undefined, pdf.cuerpo.id)).statusCode, 401);
  assert.equal((await descargar(ajeno.cookie, pdf.cuerpo.id)).statusCode, 404);
  assert.equal((await subir(ajeno.cookie, c.id, 'x.pdf', PDF)).estado, 404);

  // Un ejecutable disfrazado → 400; 15 MB → 413; nada en disco ni en la base. 10 MB sí entra.
  const enDisco = ficherosEnDisco();
  const contar = async () => (await s.pool.query('SELECT count(*)::int AS n FROM adjuntos WHERE caso_id = $1', [c.id])).rows[0].n;
  const adjuntos = await contar();
  assert.equal((await subir(vet.cookie, c.id, 'radiografia.pdf', Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(2000)]))).estado, 400);
  assert.equal((await subir(vet.cookie, c.id, 'gran.pdf', Buffer.concat([PDF, Buffer.alloc(15 * 1024 * 1024)]))).estado, 413);
  assert.deepEqual([ficherosEnDisco(), await contar()], [enDisco, adjuntos]);
  assert.equal((await subir(vet.cookie, c.id, 'rm.pdf', Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]))).estado, 201);

  // Uno en nota interna: el veterinario no lo ve ni lo descarga.
  const interno = await subir(fisio.cookie, c.id, 'intern.pdf', PDF, true);
  assert.ok(!(await mensajes(vet.cookie, c.id)).some((m) => m.adjunto_id === interno.cuerpo.id));
  assert.equal((await descargar(vet.cookie, interno.cuerpo.id)).statusCode, 404);
});

test('retirar: el veterinario dentro de 15 minutos, Bambú siempre; no se descarga ni se borra, y el nombre de uno interno no llega al veterinario', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const a = await subir(vet.cookie, c.id, 'a.pdf', PDF);
  const b = await subir(vet.cookie, c.id, 'b.pdf', PDF);
  assert.equal((await pedir(s.app, 'DELETE', `/api/adjuntos/${a.cuerpo.id}`, { cookie: vet.cookie })).estado, 200);
  await s.pool.query(`UPDATE adjuntos SET creado = now() - interval '30 minutes' WHERE id = $1`, [b.cuerpo.id]);
  assert.equal((await pedir(s.app, 'DELETE', `/api/adjuntos/${b.cuerpo.id}`, { cookie: vet.cookie })).estado, 403);
  assert.equal((await pedir(s.app, 'DELETE', `/api/adjuntos/${b.cuerpo.id}`, { cookie: fisio.cookie })).estado, 200);
  assert.equal((await descargar(fisio.cookie, a.cuerpo.id)).statusCode, 404);
  const hilo = await mensajes(vet.cookie, c.id);
  assert.equal(hilo.filter((m) => m.adjunto_retirado).length, 2);
  assert.ok(hilo.some((m) => m.tipo === 'sistema' && /ha retirat l’adjunt «a\.pdf»/.test(m.cuerpo)));
  const { rows } = await s.pool.query('SELECT ruta FROM adjuntos WHERE id = $1', [a.cuerpo.id]);
  assert.ok(existsSync(join(CARPETA, rows[0].ruta)));

  const r = await subir(fisio.cookie, c.id, 'sospita-interna.pdf', PDF, true);
  await pedir(s.app, 'DELETE', `/api/adjuntos/${r.cuerpo.id}`, { cookie: fisio.cookie });
  assert.ok(!(await mensajes(vet.cookie, c.id)).some((m) => m.cuerpo.includes('sospita-interna')));
  assert.ok((await mensajes(fisio.cookie, c.id)).some((m) => m.tipo === 'sistema' && m.cuerpo.includes('sospita-interna')));
});

test('atomicidad: si la acción falla (validación o aviso que revienta), ni cambia el estado ni queda línea en el hilo', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const antes = (await mensajes(fisio.cookie, c.id)).length;
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/rechaza`, { cookie: fisio.cookie, cuerpo: { motivo: '' } })).estado, 400);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: { fisio_id: vet.usuario.id } })).estado, 400);
  assert.equal((await mensajes(fisio.cookie, c.id)).length, antes);

  // Fallo inyectado al publicar el evento, después de escribir el estado y la línea de sistema.
  await s.pool.query(`
    CREATE OR REPLACE FUNCTION falla_aviso_prueba() RETURNS trigger AS $$
    BEGIN
      IF NEW.caso_id = ${c.id} AND NEW.tipo = 'derivacion.aceptada' THEN RAISE EXCEPTION 'fallo inyectado'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await s.pool.query(`DROP TRIGGER IF EXISTS falla_aviso_prueba ON eventos`);
  await s.pool.query(`CREATE TRIGGER falla_aviso_prueba BEFORE INSERT ON eventos FOR EACH ROW EXECUTE FUNCTION falla_aviso_prueba()`);
  try {
    assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} })).estado, 500);
  } finally {
    await s.pool.query(`DROP TRIGGER IF EXISTS falla_aviso_prueba ON eventos`);
  }
  assert.equal((await s.pool.query('SELECT estado FROM casos WHERE id = $1', [c.id])).rows[0].estado, 'enviada');
  assert.equal((await mensajes(fisio.cookie, c.id)).length, antes);
});
