// Informes por voz: transcripciones, propuestas, confirmación, informes y
// retención, con un redactor y un transcriptor de mentira.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ESQUEMA_JSON, esquemaInforme, type DatosInforme } from '../src/informes/esquema.ts';
import { renderInforme } from '../src/informes/render.ts';
import { ErrorModelo, type PeticionInforme, type RedactorInforme, type Transcriptor } from '../src/llm/tipos.ts';
import { aplicarRetencionAudios } from '../src/tareas/retencion-audios.ts';
import {
  entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado, type Servidor,
} from './ayuda.ts';

const VALIDO: DatosInforme = {
  resumen: 'Gos amb coixesa posterior dreta en millora.',
  hallazgos: ['Dolor a la palpació del genoll dret'],
  tratamiento_realizado: ['Làser', 'Cinta subaquàtica'],
  evolucion: 'Recolza més l’extremitat.',
  plan: 'Continuar amb el pla actual.',
  recomendaciones_veterinario: ['Control radiogràfic en un mes'],
  proxima_revision: null,
  dudas: ['Quantes sessions setmanals se li fan?'],
  texto_libre: null,
  estado_al_alta: null,
  pautas_domicilio: null,
};

// El redactor y el transcriptor de mentira: se puede cambiar qué devuelven.
let respuestaRedactor: () => Promise<unknown> = async () => VALIDO;
let ultimaPeticion: PeticionInforme | null = null;
const redactor: RedactorInforme = {
  async redactar(p) {
    ultimaPeticion = p;
    return { datos: await respuestaRedactor(), modelo: 'modelo-de-prueba', latenciaMs: 5 };
  },
};
let transcriptorCaido = false;
const transcriptor: Transcriptor = {
  async transcribir() {
    if (transcriptorCaido) throw new ErrorModelo('servicio', 'El servei de transcripció no respon.');
    return { texto: 'Avui ha fet làser i cinta. Recolza millor.', modelo: 'whisper-de-prueba', latenciaMs: 7 };
  },
};

let s: Servidor;
let admin: string;
let fisio: { cookie: string; id: number };
before(async () => {
  s = await servidorDePrueba('informes', {}, { ia: { redactor, transcriptor } });
  admin = await entrarSuperadmin(s);
  fisio = await fisioVerificada(s, admin);
});
after(async () => {
  await s.app.close();
});

type Vet = Awaited<ReturnType<typeof veterinarioVerificado>>;
const DATOS = {
  paciente: { nombre: 'Nala', especie: 'perro', raza: 'Beagle', peso_kg: 12.4 },
  propietario: { nombre: 'Marta Puig', telefono: '600 123 456', email: 'marta.puig@exemple.cat' },
  caso: {
    motivo: 'Coixesa posterior dreta',
    // Datos personales copiados en un campo libre que sí entra en el prompt.
    tratamiento_actual: 'Truqueu a la Marta Puig al 600 123 456 per la pauta de meloxicam.',
  },
};
// La història clínica ya no se pide, pero los casos viejos la tienen y sigue
// entrando en el prompt: se pone por SQL, como quedó en la base.
const HISTORIA_VIEJA = 'La porta la Sra. Puig (600123456, marta.puig@exemple.cat). La va operar el Dr. Ramon a la Clínica Secreta Montgó.';

async function enviado(vet: Vet) {
  const b = await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: DATOS });
  assert.equal(b.estado, 201, JSON.stringify(b.cuerpo));
  await s.pool.query('UPDATE casos SET historia_clinica = $2 WHERE id = $1', [b.cuerpo.id, HISTORIA_VIEJA]);
  await pedir(s.app, 'POST', `/api/casos/${b.cuerpo.id}/envia`, { cookie: vet.cookie, cuerpo: { acepta_consentimiento: true } });
  return b.cuerpo as { id: number };
}
async function casoAceptado(vet: Vet) {
  const c = await enviado(vet);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: { fisio_id: fisio.id } });
  return c;
}

const AUDIO = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(3000, 7)]);

async function dictar(cookie: string, casoId: number, audio = AUDIO) {
  const limite = `----bambu${Math.random().toString(16).slice(2)}`;
  const r = await s.app.inject({
    method: 'POST',
    url: `/api/casos/${casoId}/transcripciones`,
    headers: { 'content-type': `multipart/form-data; boundary=${limite}`, cookie },
    payload: Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="audio"; filename="nota.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
      audio,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]),
  });
  return { estado: r.statusCode, cuerpo: r.json() };
}

const proponer = (casoId: number, cuerpo: Record<string, unknown>) =>
  pedir(s.app, 'POST', `/api/casos/${casoId}/propuestas-informe`, { cookie: fisio.cookie, cuerpo });
const propuesta = async (id: number) => (await pedir(s.app, 'GET', `/api/propuestas-informe/${id}`, { cookie: fisio.cookie })).cuerpo;
const confirmar = (id: number) => pedir(s.app, 'POST', `/api/propuestas-informe/${id}/confirma`, { cookie: fisio.cookie });

const notificaciones = async (usuarioId: number, tipo: string, casoId: number) =>
  (await s.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notificaciones n JOIN eventos e ON e.id = n.evento_id
     WHERE n.usuario_id = $1 AND e.tipo = $2 AND n.caso_id = $3`,
    [usuarioId, tipo, casoId],
  )).rows[0]!.n;

test('contrato con el modelo: esquema estricto igual al zod, render determinista sin dudas, y al modelo no viaja nada del propietario, del veterinario ni de la clínica', async () => {
  const props = Object.keys(ESQUEMA_JSON.properties as object).sort();
  assert.deepEqual(props, Object.keys(esquemaInforme.shape).sort());
  assert.deepEqual([(ESQUEMA_JSON.required as string[]).sort(), ESQUEMA_JSON.additionalProperties], [props, false]);

  const a = renderInforme('evolucion', VALIDO);
  assert.equal(a, renderInforme('evolucion', VALIDO));
  assert.ok(a.startsWith('Informe d’evolució') && !a.includes('Quantes sessions'));
  assert.match(renderInforme('alta', { ...VALIDO, estado_al_alta: 'Camina sense coixesa' }), /Estat a l’alta\nCamina sense coixesa/);
  assert.ok(!renderInforme('evolucion', { ...VALIDO, estado_al_alta: 'x' }).includes('Estat a l’alta'));
  // Escrito todo junto por el fisio: ese texto es el informe, sin secciones ni dudas.
  assert.equal(renderInforme('evolucion', { ...VALIDO, texto_libre: '  Resum lliure.\n\nPla: dues sessions.  ' }), 'Informe d’evolució\n\nResum lliure.\n\nPla: dues sessions.');

  const vet = await veterinarioVerificado(s, { nombre: 'Ramon', clinica: 'Clínica Secreta Montgó' });
  const c = await casoAceptado(vet);
  // Un informe anterior, un dictado y unas instrucciones que también los nombran.
  const anterior = await proponer(c.id, { tipo: 'evolucion', manual: true, datos: { ...VALIDO, resumen: 'Parlat amb Marta Puig: millora.' } });
  await confirmar(anterior.cuerpo.id);
  const nota = (await dictar(fisio.cookie, c.id)).cuerpo;
  await pedir(s.app, 'PATCH', `/api/transcripciones/${nota.id}`, { cookie: fisio.cookie, cuerpo: { texto: 'Avui ha fet làser. La Marta diu que el Ramon li va receptar antiinflamatori.' } });
  assert.equal((await proponer(c.id, { tipo: 'valoracion', instrucciones: 'Envia-li còpia a marta.puig@exemple.cat o al 600 123 456' })).estado, 201);
  const viajado = `${ultimaPeticion!.sistema}\n${ultimaPeticion!.texto}`;
  for (const prohibido of ['Marta', 'Puig', '600 123 456', '600123456', 'marta.puig@exemple.cat', 'Ramon', vet.email, 'Secreta Montgó']) {
    assert.ok(!viajado.includes(prohibido), `«${prohibido}» ha viajado al modelo`);
  }
  assert.ok(['Nala', 'Beagle', 'Avui ha fet làser', '[propietari]', '[veterinari]', '[clínica]', '[telèfon]', '[correu]'].every((x) => viajado.includes(x)), viajado);
});

test('IA en el panel: sin claves está apagada; con clave en el panel se enciende, la clave nunca vuelve ni va al historial y quitarla la apaga', async () => {
  assert.deepEqual((await pedir(s.app, 'GET', '/api/ia/estado', { cookie: fisio.cookie })).cuerpo, { redactor: true, transcriptor: true });
  const sinIa = await servidorDePrueba('informes_sin_ia');
  try {
    const cookie = await entrarSuperadmin(sinIa);
    const estado = async () => (await pedir(sinIa.app, 'GET', '/api/ia/estado', { cookie })).cuerpo;
    const modelos = { modelo_informe: 'claude-sonnet-5-5', modelo_informe_openai: 'gpt-4.1', modelo_transcripcion: 'whisper-1' };
    assert.deepEqual(await estado(), { redactor: false, transcriptor: false });
    const r = await pedir(sinIa.app, 'PUT', '/api/configuracion/ia', { cookie, cuerpo: { anthropic: 'sk-ant-de-prova', openai: 'sk-de-prova', ...modelos } });
    assert.ok(r.cuerpo.anthropic_configurada && !JSON.stringify(r.cuerpo).includes('sk-ant-de-prova'));
    assert.deepEqual(await estado(), { redactor: true, transcriptor: true });
    const { rows } = await sinIa.pool.query(`SELECT despues::text AS d FROM historial WHERE tabla = 'configuracion' AND fila_id = 'ia'`);
    assert.ok(rows.every((x) => !x.d.includes('sk-') && !x.d.includes('v1:')));
    await pedir(sinIa.app, 'PUT', '/api/configuracion/ia', { cookie, cuerpo: { quitar_anthropic: true, quitar_openai: true, ...modelos } });
    assert.deepEqual(await estado(), { redactor: false, transcriptor: false });
  } finally {
    await sinIa.app.close();
  }
});

test('dictado: texto con modelo y latencia, caída que guarda audio y se reintenta, corrección a mano, audios falsos o enormes fuera y retención que borra el audio y deja el texto', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await casoAceptado(vet);
  const ok = await dictar(fisio.cookie, c.id);
  assert.deepEqual([ok.estado, ok.cuerpo.texto, ok.cuerpo.modelo, ok.cuerpo.latencia_ms], [201, 'Avui ha fet làser i cinta. Recolza millor.', 'whisper-de-prueba', 7]);
  transcriptorCaido = true;
  const caido = await dictar(fisio.cookie, c.id);
  transcriptorCaido = false;
  assert.deepEqual([caido.estado, caido.cuerpo.tiene_audio], [201, true]);
  assert.match(caido.cuerpo.error, /no respon/);
  const otra = await pedir(s.app, 'POST', `/api/transcripciones/${caido.cuerpo.id}/reintenta`, { cookie: fisio.cookie });
  assert.equal(otra.cuerpo.error, null);
  assert.equal((await pedir(s.app, 'PATCH', `/api/transcripciones/${ok.cuerpo.id}`, { cookie: fisio.cookie, cuerpo: { texto: 'Text corregit' } })).cuerpo.texto, 'Text corregit');
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}/transcripciones`, { cookie: vet.cookie })).estado, 403);
  assert.equal((await dictar(fisio.cookie, c.id, Buffer.from('no soc un audio, soc text'))).estado, 400);
  assert.equal((await dictar(fisio.cookie, c.id, Buffer.concat([AUDIO, Buffer.alloc(11 * 1024 * 1024)]))).estado, 413);

  // Retención: un audio de 31 días con retención de 30 desaparece y el texto queda.
  const { rows } = await s.pool.query('SELECT ruta_audio FROM transcripciones WHERE id = $1', [otra.cuerpo.id]);
  const fichero = join(resolve('./datos-test/audios'), rows[0].ruta_audio);
  assert.ok(existsSync(fichero));
  await pedir(s.app, 'PUT', '/api/configuracion/retencion', { cookie: admin, cuerpo: { audio_dias: 30 } });
  await s.pool.query(`UPDATE transcripciones SET creado = now() - interval '31 days' WHERE id = $1`, [otra.cuerpo.id]);
  assert.ok(await aplicarRetencionAudios(s.pool, './datos-test') >= 1);
  assert.ok(!existsSync(fichero));
  const { rows: despues } = await s.pool.query('SELECT ruta_audio, texto FROM transcripciones WHERE id = $1', [otra.cuerpo.id]);
  assert.equal(despues[0].ruta_audio, null);
  assert.match(despues[0].texto, /làser/);
});

test('proponer: pendiente con sus dudas; lo inválido o rechazado no guarda; editar y regenerar dejan rastro; a mano vacía; sin aceptar no hay informes', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await casoAceptado(vet);
  const p = (await proponer(c.id, { tipo: 'valoracion' })).cuerpo;
  assert.deepEqual([p.estado, p.origen, p.datos.dudas], ['pendiente', 'ia', ['Quantes sessions setmanals se li fan?']]);
  assert.equal((await pedir(s.app, 'GET', `/api/propuestas-informe/${p.id}`, { cookie: vet.cookie })).estado, 403);

  // En un caso sin pendiente: una respuesta inválida o un rechazo no guardan nada.
  const limpio = await casoAceptado(vet);
  const contar = async () => (await s.pool.query('SELECT count(*)::int AS n FROM propuestas_informe WHERE caso_id = $1', [limpio.id])).rows[0].n;
  const antes = await contar();
  respuestaRedactor = async () => ({ resumen: 'x', inventat: true });
  const mala = await proponer(limpio.id, { tipo: 'evolucion' });
  respuestaRedactor = async () => { throw new ErrorModelo('rechazo', 'El model no ha volgut redactar aquest informe. Redacta’l a mà.'); };
  const rechazo = await proponer(limpio.id, { tipo: 'evolucion' });
  respuestaRedactor = async () => VALIDO;
  assert.deepEqual([mala.estado, rechazo.estado, await contar()], [502, 422, antes]);
  assert.match(rechazo.cuerpo.error, /a mà/);

  // Editar: la original queda corregida y nace otra pendiente.
  const editada = (await pedir(s.app, 'POST', `/api/propuestas-informe/${p.id}/edita`, { cookie: fisio.cookie, cuerpo: { datos: { ...VALIDO, plan: 'Tres sessions setmanals' } } })).cuerpo;
  assert.deepEqual([editada.estado, editada.origen, editada.datos.plan, (await propuesta(p.id)).estado], ['pendiente', 'edicion', 'Tres sessions setmanals', 'corregida']);
  // Una propuesta sin texto libre (de antes, o del modelo) lo recibe en null.
  assert.equal(editada.datos.texto_libre, null);
  assert.equal((await pedir(s.app, 'POST', `/api/propuestas-informe/${p.id}/edita`, { cookie: fisio.cookie, cuerpo: { datos: VALIDO } })).estado, 409);
  // Regenerar: si el modelo falla, sigue pendiente; si va, queda cancelada y enlazada, con las instrucciones al modelo.
  respuestaRedactor = async () => { throw new ErrorModelo('servicio', 'caigut'); };
  assert.equal((await pedir(s.app, 'POST', `/api/propuestas-informe/${editada.id}/regenera`, { cookie: fisio.cookie, cuerpo: {} })).estado, 502);
  respuestaRedactor = async () => VALIDO;
  assert.equal((await propuesta(editada.id)).estado, 'pendiente');
  const regenerada = (await pedir(s.app, 'POST', `/api/propuestas-informe/${editada.id}/regenera`, { cookie: fisio.cookie, cuerpo: { instrucciones: 'més breu' } })).cuerpo;
  assert.deepEqual([regenerada.propuesta_origen_id, (await propuesta(editada.id)).estado], [editada.id, 'cancelada']);
  assert.match(ultimaPeticion!.texto, /més breu/);

  // Una sola pendiente por caso: con una abierta, otra → 409 (sin llamar al modelo); dos toques a la vez → un 201 y un 409.
  const llamadas = ultimaPeticion;
  assert.equal((await proponer(c.id, { tipo: 'evolucion' })).estado, 409);
  assert.equal(ultimaPeticion, llamadas);
  await pedir(s.app, 'POST', `/api/propuestas-informe/${regenerada.id}/cancela`, { cookie: fisio.cookie });
  const dobles = await Promise.all([1, 2].map(() => proponer(limpio.id, { tipo: 'evolucion', manual: true })));
  assert.deepEqual(dobles.map((r) => r.estado).sort(), [201, 409]);
  assert.equal((await s.pool.query(`SELECT count(*)::int AS n FROM propuestas_informe WHERE caso_id = $1 AND estado = 'pendiente'`, [limpio.id])).rows[0].n, 1);
  // Y la base lo garantiza aunque la comprobación previa se cruce: una segunda pendiente no entra.
  await assert.rejects(
    s.pool.query(`INSERT INTO propuestas_informe (caso_id, autor_id, tipo, origen, datos, ficha) SELECT caso_id, autor_id, tipo, origen, datos, ficha FROM propuestas_informe WHERE caso_id = $1 AND estado = 'pendiente'`, [limpio.id]),
    (e: { constraint?: string }) => e.constraint === 'propuestas_pendiente_unica',
  );

  // A mano sin datos: vacía y pendiente; el inicio de Bambú cuenta las pendientes; sin aceptar, 409.
  const vacia = await proponer(c.id, { tipo: 'evolucion', manual: true });
  assert.deepEqual([vacia.estado, vacia.cuerpo.datos.resumen], [201, '']);
  assert.ok((await pedir(s.app, 'GET', '/api/panel/contadores', { cookie: fisio.cookie })).cuerpo.propuestas_pendientes >= 1);
  assert.equal((await proponer((await enviado(vet)).id, { tipo: 'evolucion', manual: true })).estado, 409);
});

test('publicar: doble toque → un informe y un 409; sale en el hilo, avisa y lo lee solo su clínica; el de alta da el alta y corregir lo sustituye', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await casoAceptado(vet);
  const p = (await proponer(c.id, { tipo: 'valoracion' })).cuerpo;
  const [a, b] = await Promise.all([confirmar(p.id), confirmar(p.id)]);
  assert.deepEqual([a.estado, b.estado].sort(), [201, 409]);
  const { rows } = await s.pool.query('SELECT id, texto FROM informes WHERE caso_id = $1', [c.id]);
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].texto.includes('Quantes sessions'), 'las dudas no salen en el informe');
  const hilo = (await pedir(s.app, 'GET', `/api/casos/${c.id}/mensajes`, { cookie: vet.cookie })).cuerpo.mensajes;
  assert.ok(hilo.some((m: { tipo: string; informe_id: number }) => m.tipo === 'informe' && m.informe_id === rows[0].id));
  assert.equal(await notificaciones(vet.usuario.id, 'informe.publicado', c.id), 1);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}/informes`, { cookie: vet.cookie })).cuerpo.informes.length, 1);
  assert.equal((await pedir(s.app, 'GET', `/api/informes/${rows[0].id}`, { cookie: vet.cookie })).cuerpo.paciente, 'Nala');
  const ajeno = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'GET', `/api/informes/${rows[0].id}`, { cookie: ajeno.cookie })).estado, 404);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}/informes`, { cookie: ajeno.cookie })).estado, 404);

  // Informe de alta a mano: el caso queda en alta con su aviso; corregir es publicar otro que lo sustituye.
  const alta = await proponer(c.id, { tipo: 'alta', manual: true, datos: { ...VALIDO, estado_al_alta: 'Camina bé', pautas_domicilio: 'Passejos curts' } });
  assert.equal(alta.cuerpo.origen, 'manual');
  const conf = await confirmar(alta.cuerpo.id);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: vet.cookie })).cuerpo.estado, 'alta');
  assert.deepEqual([await notificaciones(vet.usuario.id, 'informe.publicado', c.id), await notificaciones(vet.usuario.id, 'caso.alta', c.id)], [2, 1]);
  const corr = await proponer(c.id, { tipo: 'evolucion', manual: true, datos: VALIDO, sustituye_informe_id: conf.cuerpo.informe_id });
  const conf2 = await confirmar(corr.cuerpo.id);
  assert.equal((await pedir(s.app, 'GET', `/api/informes/${conf2.cuerpo.informe_id}`, { cookie: vet.cookie })).cuerpo.sustituye_id, conf.cuerpo.informe_id);
});
