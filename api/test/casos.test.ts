// Casos, pacientes y propietarios contra la base real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { aplicarMigraciones } from '../src/db/migraciones.ts';
import { comprobarPendientesCita } from '../src/tareas/pendientes-cita.ts';
import {
  CONTRASENA, correoUnico, entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, tokenDelCorreo,
  veterinarioVerificado, type Servidor,
} from './ayuda.ts';

let s: Servidor;
let admin: string;
let fisio: { cookie: string; id: number };
before(async () => {
  s = await servidorDePrueba('casos');
  admin = await entrarSuperadmin(s);
  fisio = await fisioVerificada(s, admin);
  await pedir(s.app, 'PUT', '/api/configuracion/avisos', {
    cookie: admin, cuerpo: { correo_centro: 'centre@bambufisiovet.com', dias_sin_noticias: 7, dias_pendiente_cita: 3 },
  });
});
after(async () => {
  await s.app.close();
});

const autor = async () =>
  (await s.pool.query<{ id: number }>('SELECT id FROM usuarios WHERE es_de_entorno LIMIT 1')).rows[0]!.id;

const fallaConRestriccion = async (sql: string, params: unknown[], restriccion: string) => {
  await assert.rejects(s.pool.query(sql, params), (e: { constraint?: string }) => e.constraint === restriccion);
};

const DATOS = {
  paciente: { nombre: 'Nala', especie: 'perro', raza: 'Mestissa', peso_kg: 12.4 },
  propietario: { nombre: 'Joan Ferrer', telefono: '600111222' },
  caso: { motivo: 'Coixesa posterior dreta després de cirurgia' },
};

type Vet = Awaited<ReturnType<typeof veterinarioVerificado>>;

const borrador = async (vet: Vet, extra: Record<string, unknown> = {}) => {
  const r = await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: { ...DATOS, ...extra } });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo as { id: number; estado: string; paciente: { id: number }; propietario: { id: number } };
};

const derivar = async (vet: Vet, extra: Record<string, unknown> = {}) => {
  const b = await borrador(vet, extra);
  const r = await pedir(s.app, 'POST', `/api/casos/${b.id}/envia`, {
    cookie: vet.cookie, cuerpo: { acepta_consentimiento: true },
  });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  return b;
};

const validarClinica = (id: number) => s.pool.query('UPDATE clinicas SET validada = true WHERE id = $1', [id]);

/** Notificaciones de un tipo que tiene un usuario para un caso. */
const notificaciones = async (usuarioId: number, tipo: string, casoId?: number) =>
  (await s.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notificaciones n JOIN eventos e ON e.id = n.evento_id
     WHERE n.usuario_id = $1 AND e.tipo = $2 AND ($3::int IS NULL OR n.caso_id = $3)`,
    [usuarioId, tipo, casoId ?? null],
  )).rows[0]!.n;

const eventos = async (tipo: string, casoId: number) =>
  (await s.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM eventos WHERE tipo = $1 AND caso_id = $2', [tipo, casoId]))
    .rows[0]!.n;

const companero = async (vet: Vet) => {
  const email = correoUnico();
  await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: vet.cookie, cuerpo: { nombre: 'Biel', email } });
  const token = await tokenDelCorreo(s.pool, email, 'invitacion-clinica');
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token, contrasena: CONTRASENA, privacidad: true },
  });
  return { cookie: r.cookie, id: r.cuerpo.usuario.id as number };
};

test('migración 005: se aplica dos veces sin error y la base rechaza lo incoherente', async () => {
  assert.deepEqual(await aplicarMigraciones(s.pool), []);
  const { rows: p } = await s.pool.query<{ id: number }>(`INSERT INTO propietarios (nombre) VALUES ('Joan') RETURNING id`);
  await fallaConRestriccion(
    `INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'otro', $1)`, [p[0]!.id],
    'pacientes_especie_otra_check',
  );
  await fallaConRestriccion(
    `INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'caball', $1)`, [p[0]!.id],
    'pacientes_especie_check',
  );
  const { rows: pac } = await s.pool.query<{ id: number }>(
    `INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'perro', $1) RETURNING id`, [p[0]!.id],
  );
  // Un caso sin clínica: el portal solo recibe derivaciones.
  await assert.rejects(s.pool.query(
    `INSERT INTO casos (paciente_id, estado, creado_por, registrado_por) VALUES ($1, 'aceptada', $2, $2)`,
    [pac[0]!.id, await autor()],
  ), (e: { code?: string; column?: string }) => e.code === '23502' && e.column === 'clinica_id');
  // Ni quien lo derivó ni quien lo registró.
  const { rows: cl } = await s.pool.query<{ id: number }>(`INSERT INTO clinicas (nombre) VALUES ('Sant Roc') RETURNING id`);
  await fallaConRestriccion(
    `INSERT INTO casos (paciente_id, clinica_id, estado, creado_por) VALUES ($1, $2, 'aceptada', $3)`,
    [pac[0]!.id, cl[0]!.id, await autor()], 'casos_origen_check',
  );
  await fallaConRestriccion(
    `INSERT INTO casos (paciente_id, clinica_id, estado, creado_por, registrado_por) VALUES ($1, $2, 'cerrado', $3, $3)`,
    [pac[0]!.id, cl[0]!.id, await autor()], 'casos_estado_check',
  );
});

test('consentimiento: cambiar el texto sube la versión; guardar el mismo texto, no', async () => {
  const texto = 'Text del consentiment de prova, prou llarg per a valdre.';
  const leer = async () => (await pedir(s.app, 'GET', '/api/configuracion', { cookie: admin })).cuerpo.consentimiento;
  const v0 = (await leer()).version as number;
  assert.equal((await pedir(s.app, 'PUT', '/api/configuracion/consentimiento', { cookie: admin, cuerpo: { texto } })).estado, 200);
  assert.equal((await leer()).version, v0 + 1);
  // La versión la lleva el servidor: mandar otra no cambia nada.
  await pedir(s.app, 'PUT', '/api/configuracion/consentimiento', { cookie: admin, cuerpo: { texto, version: 99 } });
  assert.equal((await leer()).version, v0 + 1);
  assert.equal((await leer()).texto, texto);
});

test('borrador: lo recupera su autor en otra sesión; ni un compañero ni Bambú lo ven', async () => {
  const vet = await veterinarioVerificado(s);
  const b = await borrador(vet);
  assert.equal(b.estado, 'borrador');
  const otraSesion = await pedir(s.app, 'POST', '/api/auth/entrar', { cuerpo: { identificador: vet.email, contrasena: CONTRASENA } });
  const r = await pedir(s.app, 'GET', `/api/casos/${b.id}`, { cookie: otraSesion.cookie });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.motivo, DATOS.caso.motivo);
  const comp = await companero(vet);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${b.id}`, { cookie: comp.cookie })).estado, 404);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${b.id}`, { cookie: fisio.cookie })).estado, 404);
  // Tampoco el paciente del borrador.
  assert.equal((await pedir(s.app, 'GET', `/api/pacientes/${b.paciente.id}`, { cookie: comp.cookie })).estado, 404);
  assert.equal((await pedir(s.app, 'GET', `/api/pacientes/${b.paciente.id}`, { cookie: fisio.cookie })).estado, 404);
});

test('especie fuera de la lista → 400', async () => {
  const vet = await veterinarioVerificado(s);
  const r = await pedir(s.app, 'POST', '/api/casos', {
    cookie: vet.cookie, cuerpo: { ...DATOS, paciente: { ...DATOS.paciente, especie: 'caball' } },
  });
  assert.equal(r.estado, 400);
  assert.ok(r.cuerpo.campos['paciente.especie']);
});

test('enviar sin motivo → 400 con el campo y sigue en borrador; completa → enviada, aviso a Bambú y correo al centro', async () => {
  const vet = await veterinarioVerificado(s);
  const b = await borrador(vet, { caso: { motivo: '' } });
  const sin = await pedir(s.app, 'POST', `/api/casos/${b.id}/envia`, { cookie: vet.cookie, cuerpo: { acepta_consentimiento: true } });
  assert.equal(sin.estado, 400);
  assert.ok(sin.cuerpo.campos['caso.motivo']);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${b.id}`, { cookie: vet.cookie })).cuerpo.estado, 'borrador');
  // Sin el consentimiento tampoco.
  await pedir(s.app, 'PATCH', `/api/casos/${b.id}`, { cookie: vet.cookie, cuerpo: { caso: { motivo: 'Hèrnia discal' } } });
  const sinConsentimiento = await pedir(s.app, 'POST', `/api/casos/${b.id}/envia`, { cookie: vet.cookie, cuerpo: {} });
  assert.ok(sinConsentimiento.cuerpo.campos.consentimiento);

  const ok = await pedir(s.app, 'POST', `/api/casos/${b.id}/envia`, { cookie: vet.cookie, cuerpo: { acepta_consentimiento: true } });
  assert.equal(ok.estado, 200);
  assert.equal(ok.cuerpo.estado, 'enviada');
  assert.ok(ok.cuerpo.enviado_el);
  assert.equal(ok.cuerpo.consentimiento_vigente, true);
  assert.equal(await notificaciones(fisio.id, 'derivacion.enviada', b.id), 1);
  const { rows } = await s.pool.query(
    `SELECT destinatario FROM correos_pendientes c JOIN eventos e ON e.id = c.evento_id
     WHERE e.tipo = 'derivacion.enviada' AND e.caso_id = $1`,
    [b.id],
  );
  assert.deepEqual(rows.map((r) => r.destinatario), ['centre@bambufisiovet.com']);
});

test('descartar un borrador lo saca de la lista sin borrarlo', async () => {
  const vet = await veterinarioVerificado(s);
  const b = await borrador(vet);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${b.id}/descarta`, { cookie: vet.cookie })).estado, 200);
  const lista = await pedir(s.app, 'GET', '/api/casos', { cookie: vet.cookie });
  assert.ok(!lista.cuerpo.casos.some((c: { id: number }) => c.id === b.id));
  const { rows } = await s.pool.query('SELECT descartado_el FROM casos WHERE id = $1', [b.id]);
  assert.ok(rows[0].descartado_el);
});

test('editar: en enviada el veterinario puede; aceptada → 409 y nada cambia; Bambú siempre, con historial', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const edita = await pedir(s.app, 'PATCH', `/api/casos/${c.id}`, { cookie: vet.cookie, cuerpo: { caso: { objetivos: 'Caminar sense dolor' } } });
  assert.equal(edita.estado, 200);
  assert.equal(edita.cuerpo.objetivos, 'Caminar sense dolor');
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} });
  const tarde = await pedir(s.app, 'PATCH', `/api/casos/${c.id}`, { cookie: vet.cookie, cuerpo: { caso: { motivo: 'Un altre' } } });
  assert.equal(tarde.estado, 409);
  assert.equal(tarde.cuerpo.error, "La derivació ja s'ha acceptat; afegeix la informació al fil");
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: vet.cookie })).cuerpo.motivo, DATOS.caso.motivo);

  const antes = await eventos('paciente.ficha_modificada', c.id);
  const bambu = await pedir(s.app, 'PATCH', `/api/casos/${c.id}`, { cookie: fisio.cookie, cuerpo: { paciente: { peso_kg: 11.8 } } });
  assert.equal(bambu.cuerpo.paciente.peso_kg, 11.8);
  const { rows } = await s.pool.query(
    `SELECT antes, despues FROM historial WHERE tabla = 'pacientes' AND fila_id = $1 ORDER BY id DESC LIMIT 1`,
    [String(c.paciente.id)],
  );
  assert.deepEqual(rows[0].despues, { peso_kg: 11.8 });
  assert.equal(Number(rows[0].antes.peso_kg), 12.4);
  assert.equal(await eventos('paciente.ficha_modificada', c.id), antes + 1);
  assert.ok(await notificaciones(vet.usuario.id, 'paciente.ficha_modificada', c.id) >= 1);

  // Mandar lo mismo que ya hay no deja historial ni avisa.
  const historialAntes = (await s.pool.query(`SELECT count(*)::int AS n FROM historial WHERE tabla = 'pacientes' AND fila_id = $1`, [String(c.paciente.id)])).rows[0].n;
  await pedir(s.app, 'PATCH', `/api/casos/${c.id}`, { cookie: fisio.cookie, cuerpo: { paciente: { peso_kg: 11.8, nombre: 'Nala' } } });
  const historialDespues = (await s.pool.query(`SELECT count(*)::int AS n FROM historial WHERE tabla = 'pacientes' AND fila_id = $1`, [String(c.paciente.id)])).rows[0].n;
  assert.equal(historialDespues, historialAntes);
  assert.equal(await eventos('paciente.ficha_modificada', c.id), antes + 1);
});

test('aceptar con fisio: el veterinario recibe la aceptación y la fisio la asignación; dos veces → 409 sin evento', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const r = await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: admin, cuerpo: { fisio_id: fisio.id } });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.estado, 'aceptada');
  assert.equal(r.cuerpo.fisio.id, fisio.id);
  assert.equal(await notificaciones(vet.usuario.id, 'derivacion.aceptada', c.id), 1);
  assert.equal(await notificaciones(fisio.id, 'caso.fisio_asignado', c.id), 1);
  const otra = await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: admin, cuerpo: {} });
  assert.equal(otra.estado, 409);
  assert.equal(await eventos('derivacion.aceptada', c.id), 1);
});

test('dos aceptaciones a la vez: un 200, un 409 y un solo evento', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const [a, b] = await Promise.all([
    pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: admin, cuerpo: {} }),
    pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} }),
  ]);
  assert.deepEqual([a.estado, b.estado].sort(), [200, 409]);
  assert.equal(await eventos('derivacion.aceptada', c.id), 1);
});

test('transiciones: derivador no acepta (403), rechazar sin motivo (400), fisio que no es del equipo (400), alta desde aceptada (409)', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: vet.cookie, cuerpo: {} })).estado, 403);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/rechaza`, { cookie: fisio.cookie, cuerpo: { motivo: '' } })).estado, 400);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: { fisio_id: vet.usuario.id } })).estado, 400);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} })).estado, 200);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/alta-manual`, { cookie: fisio.cookie })).estado, 409);
});

test('rechazar con motivo: avisa al veterinario con el motivo', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const r = await pedir(s.app, 'POST', `/api/casos/${c.id}/rechaza`, { cookie: fisio.cookie, cuerpo: { motivo: 'No és un cas de fisioteràpia' } });
  assert.equal(r.cuerpo.estado, 'rechazada');
  assert.equal(r.cuerpo.motivo_cierre, 'No és un cas de fisioteràpia');
  assert.equal(await notificaciones(vet.usuario.id, 'derivacion.rechazada', c.id), 1);
});

test('«Ja té cita»: pasa a en tratamiento con la fecha y avisa; después alta manual; tancar exige motivo', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} });
  const r = await pedir(s.app, 'POST', `/api/casos/${c.id}/cita`, { cookie: fisio.cookie, cuerpo: { primera_visita: '2026-11-04' } });
  assert.equal(r.estado, 200);
  assert.equal(r.cuerpo.estado, 'en_tratamiento');
  assert.equal(r.cuerpo.primera_visita, '2026-11-04');
  assert.equal(await notificaciones(vet.usuario.id, 'caso.en_tratamiento', c.id), 1);
  const { rows } = await s.pool.query(
    `SELECT n.cuerpo FROM notificaciones n JOIN eventos e ON e.id = n.evento_id
     WHERE e.tipo = 'caso.en_tratamiento' AND e.caso_id = $1`,
    [c.id],
  );
  assert.match(rows[0].cuerpo, /04\/11\/2026/);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${c.id}/abandona`, { cookie: fisio.cookie, cuerpo: {} })).estado, 400);
  const alta = await pedir(s.app, 'POST', `/api/casos/${c.id}/alta-manual`, { cookie: fisio.cookie });
  assert.equal(alta.cuerpo.estado, 'alta');
  assert.equal(await notificaciones(vet.usuario.id, 'caso.alta', c.id), 1);
});

test('vista: la primera apertura de Bambú la marca una vez; la del veterinario no', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: vet.cookie })).cuerpo.vista_el, null);
  const primera = await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: fisio.cookie });
  assert.ok(primera.cuerpo.vista_el);
  assert.equal(primera.cuerpo.vista_por, 'Laia Serra');
  const segunda = await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: admin });
  assert.equal(segunda.cuerpo.vista_por, 'Laia Serra');
  assert.equal(new Date(segunda.cuerpo.vista_el).getTime(), new Date(primera.cuerpo.vista_el).getTime());
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: vet.cookie })).cuerpo.vista_por, 'Laia Serra');
});

test('lista: el veterinario solo ve su clínica; orden por actividad, paginación sin huecos y búsqueda sin acentos', async () => {
  const vet = await veterinarioVerificado(s, { clinica: 'Clínica Montgó' });
  const otro = await veterinarioVerificado(s);
  const ajeno = await derivar(otro);
  const ids: number[] = [];
  for (let i = 0; i < 33; i++) ids.push((await derivar(vet, { paciente: { ...DATOS.paciente, nombre: `Gos ${i}` } })).id);
  const propia = await pedir(s.app, 'GET', '/api/casos', { cookie: vet.cookie });
  assert.equal(propia.cuerpo.casos.length, 30);
  assert.ok(propia.cuerpo.siguiente);
  assert.ok(!propia.cuerpo.casos.some((c: { id: number }) => c.id === ajeno.id));
  assert.equal(propia.cuerpo.casos[0].id, ids.at(-1));
  const resto = await pedir(s.app, 'GET', `/api/casos?antes_de=${propia.cuerpo.siguiente}`, { cookie: vet.cookie });
  const todos = [...propia.cuerpo.casos, ...resto.cuerpo.casos].map((c: { id: number }) => c.id);
  assert.equal(new Set(todos).size, 33);
  assert.deepEqual([...todos].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
  assert.equal(resto.cuerpo.siguiente, null);
  const busca = await pedir(s.app, 'GET', '/api/casos?q=montgo', { cookie: fisio.cookie });
  assert.ok(busca.cuerpo.casos.length > 0);
  assert.ok(busca.cuerpo.casos.every((c: { clinica: string }) => c.clinica === 'Clínica Montgó'));
});

test('«amb novetats» y abrir el caso: el filtro muestra solo lo no leído; marcar leído baja la campana en dos', async () => {
  const vet = await veterinarioVerificado(s);
  const a = await derivar(vet);
  const b = await derivar(vet);
  await pedir(s.app, 'POST', `/api/casos/${a.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} });
  await pedir(s.app, 'POST', `/api/casos/${a.id}/cita`, { cookie: fisio.cookie, cuerpo: {} });
  const novedades = await pedir(s.app, 'GET', '/api/casos?novedades=1', { cookie: vet.cookie });
  assert.deepEqual(novedades.cuerpo.casos.map((c: { id: number }) => c.id), [a.id]);
  assert.equal(novedades.cuerpo.casos[0].no_leidas, 2);
  const antes = (await pedir(s.app, 'GET', '/api/notificaciones/resumen', { cookie: vet.cookie })).cuerpo.no_leidas;
  const r = await pedir(s.app, 'POST', `/api/casos/${a.id}/leido`, { cookie: vet.cookie });
  assert.equal(r.cuerpo.no_leidas, antes - 2);
  assert.equal((await pedir(s.app, 'GET', '/api/casos?novedades=1', { cookie: vet.cookie })).cuerpo.casos.length, 0);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${b.id}/leido`, { cookie: (await veterinarioVerificado(s)).cookie })).estado, 404);
});

test('mismo paciente derivado otra vez: otro caso y la ficha del paciente muestra los dos; paciente ajeno → 404', async () => {
  const vet = await veterinarioVerificado(s);
  const primero = await derivar(vet);
  const segundo = await derivar(vet, { paciente_id: primero.paciente.id });
  assert.equal(segundo.paciente.id, primero.paciente.id);
  const ficha = await pedir(s.app, 'GET', `/api/pacientes/${primero.paciente.id}`, { cookie: vet.cookie });
  assert.deepEqual(ficha.cuerpo.casos.map((c: { id: number }) => c.id).sort(), [primero.id, segundo.id].sort());
  const otro = await veterinarioVerificado(s);
  const r = await pedir(s.app, 'POST', '/api/casos', { cookie: otro.cookie, cuerpo: { ...DATOS, paciente_id: primero.paciente.id } });
  assert.equal(r.estado, 404);
});

test('fichas: Bambú corrige el peso y avisa al veterinario; el veterinario cambia el teléfono pero no la ficha de un caso aceptado', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const otro = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'PATCH', `/api/propietarios/${c.propietario.id}`, { cookie: otro.cookie, cuerpo: { telefono: '611' } })).estado, 404);
  assert.equal((await pedir(s.app, 'PATCH', `/api/propietarios/${c.propietario.id}`, { cookie: vet.cookie, cuerpo: { telefono: '699888777' } })).estado, 200);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} });
  assert.equal((await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: vet.cookie, cuerpo: { raza: 'Beagle' } })).estado, 409);
  // El contacto del propietario, siempre; el nombre, no.
  assert.equal((await pedir(s.app, 'PATCH', `/api/propietarios/${c.propietario.id}`, { cookie: vet.cookie, cuerpo: { telefono: '699000111' } })).estado, 200);
  await pedir(s.app, 'PATCH', `/api/propietarios/${c.propietario.id}`, { cookie: vet.cookie, cuerpo: { nombre: 'Un altre' } });
  const ficha = await pedir(s.app, 'GET', `/api/pacientes/${c.paciente.id}`, { cookie: vet.cookie });
  assert.equal(ficha.cuerpo.propietario.nombre, 'Joan Ferrer');
  assert.equal(ficha.cuerpo.propietario.telefono, '699000111');
  const antes = await notificaciones(vet.usuario.id, 'paciente.ficha_modificada', c.id);
  assert.equal((await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: fisio.cookie, cuerpo: { peso_kg: 11.8 } })).estado, 200);
  assert.equal(await notificaciones(vet.usuario.id, 'paciente.ficha_modificada', c.id), antes + 1);
  const historial = await pedir(s.app, 'GET', `/api/pacientes/${c.paciente.id}/historial`, { cookie: fisio.cookie });
  assert.ok(historial.cuerpo.historial.some((h: { despues: { peso_kg?: number } }) => h.despues?.peso_kg === 11.8));
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}/historial`, { cookie: vet.cookie })).estado, 403);
});

test('ninguna ruta de casos, pacientes o propietarios da nada de otra clínica a un derivador', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const ajeno = await veterinarioVerificado(s);
  const rutas: [string, string, unknown?][] = [
    ['GET', `/api/casos/${c.id}`],
    ['PATCH', `/api/casos/${c.id}`, { caso: { motivo: 'x' } }],
    ['POST', `/api/casos/${c.id}/envia`, {}],
    ['POST', `/api/casos/${c.id}/descarta`, {}],
    ['POST', `/api/casos/${c.id}/leido`, {}],
    ['GET', `/api/pacientes/${c.paciente.id}`],
    ['PATCH', `/api/pacientes/${c.paciente.id}`, { nombre: 'x' }],
    ['PATCH', `/api/propietarios/${c.propietario.id}`, { telefono: '1' }],
  ];
  for (const [metodo, ruta, cuerpo] of rutas) {
    const r = await pedir(s.app, metodo as 'GET', ruta, { cookie: ajeno.cookie, ...(cuerpo ? { cuerpo } : {}) });
    assert.equal(r.estado, 404, `${metodo} ${ruta}`);
  }
  const listas = [
    (await pedir(s.app, 'GET', '/api/casos', { cookie: ajeno.cookie })).cuerpo.casos,
    (await pedir(s.app, 'GET', '/api/pacientes', { cookie: ajeno.cookie })).cuerpo.pacientes,
  ];
  for (const lista of listas) assert.ok(!lista.some((x: { id: number }) => x.id === c.id || x.id === c.paciente.id));
});

test('fusión: el veterinario con dos derivaciones en su clínica provisional las lleva a la clínica a la que se une', async () => {
  const destino = await veterinarioVerificado(s);
  await validarClinica(destino.usuario.clinica.id);
  const vet = await veterinarioVerificado(s);
  const a = await derivar(vet);
  const b = await derivar(vet);
  await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, { cookie: vet.cookie });
  const { rows } = await s.pool.query(`SELECT id FROM solicitudes_union WHERE usuario_id = $1 AND estado = 'pendiente'`, [vet.usuario.id]);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${rows[0].id}/aprueba`, { cookie: destino.cookie })).estado, 200);
  const lista = await pedir(s.app, 'GET', '/api/casos', { cookie: destino.cookie });
  const ids = lista.cuerpo.casos.map((c: { id: number }) => c.id);
  assert.ok(ids.includes(a.id) && ids.includes(b.id));
  const { rows: quedan } = await s.pool.query('SELECT count(*)::int AS n FROM casos WHERE clinica_id = $1', [vet.usuario.clinica.id]);
  assert.equal(quedan[0].n, 0);
});

test('uniones: en una clínica no validada solo resuelve Bambú y sus miembros no reciben el aviso', async () => {
  const destino = await veterinarioVerificado(s);
  const solicitante = await veterinarioVerificado(s);
  await pedir(s.app, 'POST', `/api/clinicas/${destino.usuario.clinica.id}/solicitudes-union`, { cookie: solicitante.cookie });
  const { rows } = await s.pool.query(`SELECT id FROM solicitudes_union WHERE usuario_id = $1 AND estado = 'pendiente'`, [solicitante.usuario.id]);
  assert.equal(await notificaciones(destino.usuario.id, 'usuario.solicita_union'), 0);
  assert.ok(await notificaciones(fisio.id, 'usuario.solicita_union') >= 1);
  assert.equal((await pedir(s.app, 'GET', '/api/solicitudes-union', { cookie: destino.cookie })).cuerpo.solicitudes.length, 0);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${rows[0].id}/aprueba`, { cookie: destino.cookie })).estado, 404);
  assert.equal((await pedir(s.app, 'POST', `/api/solicitudes-union/${rows[0].id}/aprueba`, { cookie: fisio.cookie })).estado, 200);
});

test('alta de clínica por Bambú: nace validada y sale en las sugerencias sin usuarios', async () => {
  const nombre = `Clínica Telèfon ${Math.random().toString(36).slice(2, 7)}`;
  const r = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre, poblacion: 'Dénia' } });
  assert.equal(r.estado, 201);
  const { rows } = await s.pool.query('SELECT validada FROM clinicas WHERE id = $1', [r.cuerpo.id]);
  assert.equal(rows[0].validada, true);
  const sug = await pedir(s.app, 'GET', `/api/clinicas/sugerencias?nombre=${encodeURIComponent(nombre)}`);
  assert.ok(sug.cuerpo.clinicas.some((c: { id: number }) => c.id === r.cuerpo.id));
  // Desmarcarla también se puede.
  await pedir(s.app, 'PATCH', `/api/clinicas/${r.cuerpo.id}`, { cookie: fisio.cookie, cuerpo: { nombre, validada: false } });
  assert.equal((await s.pool.query('SELECT validada FROM clinicas WHERE id = $1', [r.cuerpo.id])).rows[0].validada, false);
});

test('derivación registrada por Bambú: nace aceptada, la ve el veterinario y le llega el aviso y el correo', async () => {
  const vet = await veterinarioVerificado(s);
  await validarClinica(vet.usuario.clinica.id);
  const r = await pedir(s.app, 'POST', '/api/casos', {
    cookie: fisio.cookie,
    cuerpo: { ...DATOS, clinica_id: vet.usuario.clinica.id, derivador_id: vet.usuario.id, acepta_consentimiento: true },
  });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.estado, 'aceptada');
  assert.equal(r.cuerpo.registrado_por.id, fisio.id);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${r.cuerpo.id}`, { cookie: vet.cookie })).estado, 200);
  assert.equal(await notificaciones(vet.usuario.id, 'derivacion.registrada', r.cuerpo.id), 1);
  const { rows } = await s.pool.query(
    `SELECT c.destinatario FROM correos_pendientes c JOIN eventos e ON e.id = c.evento_id
     WHERE e.tipo = 'derivacion.registrada' AND e.caso_id = $1`,
    [r.cuerpo.id],
  );
  assert.deepEqual(rows.map((x) => x.destinatario), [vet.email]);
});

test('registrada sin veterinario con cuenta: avisa a los de la clínica; clínica sin usuarios: no falla', async () => {
  const vet = await veterinarioVerificado(s);
  await validarClinica(vet.usuario.clinica.id);
  const r = await pedir(s.app, 'POST', '/api/casos', {
    cookie: fisio.cookie,
    cuerpo: { ...DATOS, clinica_id: vet.usuario.clinica.id, derivador_nombre: 'Dra. Pons', acepta_consentimiento: true },
  });
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.derivador_nombre, 'Dra. Pons');
  assert.equal(await notificaciones(vet.usuario.id, 'derivacion.registrada', r.cuerpo.id), 1);

  const nueva = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Sense Usuaris' } });
  const sin = await pedir(s.app, 'POST', '/api/casos', {
    cookie: fisio.cookie,
    cuerpo: { ...DATOS, clinica_id: nueva.cuerpo.id, derivador_nombre: 'Dr. Vidal', acepta_consentimiento: true, ja_te_cita: true, primera_visita: '2026-11-05' },
  });
  assert.equal(sin.estado, 201);
  assert.equal(sin.cuerpo.estado, 'en_tratamiento');
  assert.equal(sin.cuerpo.primera_visita, '2026-11-05');
});

test('registrada: sin clínica, con clínica no validada, sin consentimiento o con un veterinario ajeno → 400', async () => {
  const vet = await veterinarioVerificado(s);
  const otro = await veterinarioVerificado(s);
  const base = { ...DATOS, acepta_consentimiento: true };
  assert.equal((await pedir(s.app, 'POST', '/api/casos', { cookie: fisio.cookie, cuerpo: base })).estado, 400);
  assert.equal((await pedir(s.app, 'POST', '/api/casos', { cookie: fisio.cookie, cuerpo: { ...base, clinica_id: vet.usuario.clinica.id } })).estado, 400);
  await validarClinica(vet.usuario.clinica.id);
  const sinConsentimiento = await pedir(s.app, 'POST', '/api/casos', {
    cookie: fisio.cookie, cuerpo: { ...DATOS, clinica_id: vet.usuario.clinica.id },
  });
  assert.equal(sinConsentimiento.estado, 400);
  assert.ok(sinConsentimiento.cuerpo.campos.consentimiento);
  const vetAjeno = await pedir(s.app, 'POST', '/api/casos', {
    cookie: fisio.cookie, cuerpo: { ...base, clinica_id: vet.usuario.clinica.id, derivador_id: otro.usuario.id },
  });
  assert.equal(vetAjeno.estado, 400);
  const { rows } = await s.pool.query('SELECT count(*)::int AS n FROM casos WHERE clinica_id = $1', [vet.usuario.clinica.id]);
  assert.equal(rows[0].n, 0);
});

test('el veterinario que se registra después y se une a la clínica ve las derivaciones registradas a su nombre', async () => {
  const nueva = await pedir(s.app, 'POST', '/api/clinicas', { cookie: fisio.cookie, cuerpo: { nombre: 'Clínica Arribada Tard' } });
  const r = await pedir(s.app, 'POST', '/api/casos', {
    cookie: fisio.cookie,
    cuerpo: { ...DATOS, clinica_id: nueva.cuerpo.id, derivador_nombre: 'Dra. Mas', acepta_consentimiento: true },
  });
  const vet = await veterinarioVerificado(s);
  await pedir(s.app, 'POST', `/api/clinicas/${nueva.cuerpo.id}/solicitudes-union`, { cookie: vet.cookie });
  const { rows } = await s.pool.query(`SELECT id FROM solicitudes_union WHERE usuario_id = $1 AND estado = 'pendiente'`, [vet.usuario.id]);
  await pedir(s.app, 'POST', `/api/solicitudes-union/${rows[0].id}/aprueba`, { cookie: fisio.cookie });
  const cookie = (await pedir(s.app, 'POST', '/api/auth/entrar', { cuerpo: { identificador: vet.email, contrasena: CONTRASENA } })).cookie;
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${r.cuerpo.id}`, { cookie })).estado, 200);
});

test('pendientes de cita: la atascada se marca y avisa una sola vez; los contadores la cuentan', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  await pedir(s.app, 'POST', `/api/casos/${c.id}/acepta`, { cookie: fisio.cookie, cuerpo: {} });
  await s.pool.query(`UPDATE casos SET resuelto_el = now() - interval '4 days' WHERE id = $1`, [c.id]);
  const contadores = await pedir(s.app, 'GET', '/api/panel/contadores', { cookie: fisio.cookie });
  assert.ok(contadores.cuerpo.atascados >= 1);
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: fisio.cookie })).cuerpo.atascado, true);
  const lista = await pedir(s.app, 'GET', '/api/casos?atascados=1', { cookie: fisio.cookie });
  assert.ok(lista.cuerpo.casos.some((x: { id: number }) => x.id === c.id));
  assert.ok(await comprobarPendientesCita(s.pool) >= 1);
  assert.equal(await comprobarPendientesCita(s.pool), 0);
  assert.equal(await eventos('caso.sin_noticias', c.id), 1);
  assert.equal(await notificaciones(fisio.id, 'caso.sin_noticias', c.id), 1);
});

test('contadores: «noves sense obrir» baja al abrir la derivación', async () => {
  const vet = await veterinarioVerificado(s);
  const antes = (await pedir(s.app, 'GET', '/api/panel/contadores', { cookie: fisio.cookie })).cuerpo.sin_abrir;
  const c = await derivar(vet);
  assert.equal((await pedir(s.app, 'GET', '/api/panel/contadores', { cookie: fisio.cookie })).cuerpo.sin_abrir, antes + 1);
  const sinAbrir = await pedir(s.app, 'GET', '/api/casos?sin_abrir=1', { cookie: fisio.cookie });
  assert.ok(sinAbrir.cuerpo.casos.some((x: { id: number }) => x.id === c.id));
  await pedir(s.app, 'GET', `/api/casos/${c.id}`, { cookie: fisio.cookie });
  assert.equal((await pedir(s.app, 'GET', '/api/panel/contadores', { cookie: fisio.cookie })).cuerpo.sin_abrir, antes);
});

test('matriz: una base que ya existía recibe al arrancar las filas de los eventos nuevos', async () => {
  await s.pool.query(`DELETE FROM configuracion_avisos WHERE evento = 'derivacion.registrada'`);
  await s.pool.query(`UPDATE configuracion_avisos SET correo = false WHERE evento = 'mensaje.nuevo'`);
  const otro = await servidorDePrueba('casos', {}, { url: s.url });
  await otro.app.close();
  const { rows } = await s.pool.query(
    `SELECT evento, correo FROM configuracion_avisos WHERE evento IN ('derivacion.registrada', 'mensaje.nuevo') ORDER BY evento`,
  );
  assert.deepEqual(rows, [{ evento: 'derivacion.registrada', correo: true }, { evento: 'mensaje.nuevo', correo: false }]);
  await s.pool.query(`UPDATE configuracion_avisos SET correo = true WHERE evento = 'mensaje.nuevo'`);
  // Arrancar otro servidor cierra las sesiones del superadmin.
  admin = await entrarSuperadmin(s);
});

test('autoguardado: devolver la ficha tal como llega (con null en lo vacío) no da 400', async () => {
  const vet = await veterinarioVerificado(s);
  const b = await borrador(vet, { paciente: { nombre: 'Rocky', especie: 'perro' }, propietario: { nombre: 'Maria', telefono: '600' } });
  const ficha = (await pedir(s.app, 'GET', `/api/casos/${b.id}`, { cookie: vet.cookie })).cuerpo;
  assert.equal(ficha.paciente.raza, null);
  const { id: _p, ...paciente } = ficha.paciente;
  const { id: _pr, consentimiento_version: _v, consentimiento_el: _e, ...propietario } = ficha.propietario;
  const r = await pedir(s.app, 'PATCH', `/api/casos/${b.id}`, {
    cookie: vet.cookie, cuerpo: { paciente, propietario, caso: { motivo: 'Coixesa anterior esquerra' } },
  });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.motivo, 'Coixesa anterior esquerra');
});
