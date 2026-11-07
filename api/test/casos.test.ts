// Casos, pacientes y propietarios contra la base real, por caso de uso.
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

const DATOS = {
  paciente: { nombre: 'Nala', especie: 'perro', raza: 'Mestissa', peso_kg: 12.4 },
  propietario: { nombre: 'Joan Ferrer', telefono: '600111222' },
  caso: { motivo: 'Coixesa posterior dreta després de cirurgia' },
};
type Vet = Awaited<ReturnType<typeof veterinarioVerificado>>;
type Caso = { id: number; estado: string; paciente: { id: number }; propietario: { id: number } };

const borrador = async (vet: Vet, extra: Record<string, unknown> = {}) => {
  const r = await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: { ...DATOS, ...extra } });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo as Caso;
};
const derivar = async (vet: Vet, extra: Record<string, unknown> = {}) => {
  const b = await borrador(vet, extra);
  assert.equal((await pedir(s.app, 'POST', `/api/casos/${b.id}/envia`, { cookie: vet.cookie, cuerpo: { acepta_consentimiento: true } })).estado, 200);
  return b;
};
const accion = (cookie: string, id: number, que: string, cuerpo: unknown = {}) => pedir(s.app, 'POST', `/api/casos/${id}/${que}`, { cookie, cuerpo });
const ver = (cookie: string, id: number) => pedir(s.app, 'GET', `/api/casos/${id}`, { cookie });
const notificaciones = async (usuarioId: number, tipo: string, casoId?: number) =>
  (await s.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notificaciones n JOIN eventos e ON e.id = n.evento_id
     WHERE n.usuario_id = $1 AND e.tipo = $2 AND ($3::int IS NULL OR n.caso_id = $3)`,
    [usuarioId, tipo, casoId ?? null],
  )).rows[0]!.n;
const eventos = async (tipo: string, casoId: number) =>
  (await s.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM eventos WHERE tipo = $1 AND caso_id = $2', [tipo, casoId])).rows[0]!.n;
const companero = async (vet: Vet) => {
  const email = correoUnico();
  await pedir(s.app, 'POST', '/api/clinicas/mia/invitaciones', { cookie: vet.cookie, cuerpo: { nombre: 'Biel', email } });
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token: await tokenDelCorreo(s.pool, email, 'invitacion-clinica'), contrasena: CONTRASENA, privacidad: true },
  });
  return { cookie: r.cookie };
};

test('datos: la base rechaza lo incoherente, el consentimiento versiona solo y una base vieja recibe los eventos nuevos', async () => {
  assert.deepEqual(await aplicarMigraciones(s.pool), []);
  const autor = (await s.pool.query('SELECT id FROM usuarios WHERE es_de_entorno')).rows[0].id;
  const { rows: p } = await s.pool.query(`INSERT INTO propietarios (nombre) VALUES ('Joan') RETURNING id`);
  const falla = (sql: string, params: unknown[], restriccion: string) =>
    assert.rejects(s.pool.query(sql, params), (e: { constraint?: string; column?: string }) => (e.constraint ?? e.column) === restriccion);
  await falla(`INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'otro', $1)`, [p[0].id], 'pacientes_especie_otra_check');
  const { rows: pac } = await s.pool.query(`INSERT INTO pacientes (nombre, especie, propietario_id) VALUES ('Nala', 'perro', $1) RETURNING id`, [p[0].id]);
  // El portal solo recibe derivaciones: sin clínica, o sin quien la derivó o registró, no hay caso.
  await falla(`INSERT INTO casos (paciente_id, estado, creado_por, registrado_por) VALUES ($1, 'aceptada', $2, $2)`, [pac[0].id, autor], 'clinica_id');
  const { rows: cl } = await s.pool.query(`INSERT INTO clinicas (nombre) VALUES ('Sant Roc') RETURNING id`);
  await falla(`INSERT INTO casos (paciente_id, clinica_id, estado, creado_por) VALUES ($1, $2, 'aceptada', $3)`, [pac[0].id, cl[0].id, autor], 'casos_origen_check');

  const texto = 'Text del consentiment de prova, prou llarg per a valdre.';
  const leer = async () => (await pedir(s.app, 'GET', '/api/configuracion', { cookie: admin })).cuerpo.consentimiento;
  const v0 = (await leer()).version as number;
  await pedir(s.app, 'PUT', '/api/configuracion/consentimiento', { cookie: admin, cuerpo: { texto } });
  await pedir(s.app, 'PUT', '/api/configuracion/consentimiento', { cookie: admin, cuerpo: { texto, version: 99 } });
  assert.equal((await leer()).version, v0 + 1);

  await s.pool.query(`DELETE FROM configuracion_avisos WHERE evento = 'derivacion.aceptada'`);
  const otro = await servidorDePrueba('casos', {}, { url: s.url });
  await otro.app.close();
  admin = await entrarSuperadmin(s);
  assert.equal((await s.pool.query(`SELECT correo FROM configuracion_avisos WHERE evento = 'derivacion.aceptada'`)).rows[0].correo, true);
});

test('una derivación de punta a punta: borrador privado, envío validado, vista, aceptación con fisio, cita y alta, con sus avisos', async () => {
  const vet = await veterinarioVerificado(s);
  assert.equal((await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: { ...DATOS, paciente: { ...DATOS.paciente, especie: 'caball' } } })).estado, 400);
  // La derivación pide solo motivo y tratamiento: los campos retirados dan 400, al crear y al editar.
  assert.equal((await pedir(s.app, 'POST', '/api/casos', { cookie: vet.cookie, cuerpo: { ...DATOS, caso: { ...DATOS.caso, historia_clinica: 'x' } } })).estado, 400);
  const b = await borrador(vet, { caso: { motivo: '', tratamiento_actual: 'Meloxicam' } });
  assert.equal((await pedir(s.app, 'PATCH', `/api/casos/${b.id}`, { cookie: vet.cookie, cuerpo: { caso: { objetivos: 'x' } } })).estado, 400);
  // Retomar un borrador: la web manda lo que le devolvió la ficha (con los retirados vacíos y claves de más) y tiene que guardar.
  const retomado = (await ver(vet.cookie, b.id)).cuerpo;
  assert.equal((await pedir(s.app, 'PATCH', `/api/casos/${b.id}`, { cookie: vet.cookie, cuerpo: { caso: { ...retomado, historia_clinica: null, objetivos: '  ' } } })).estado, 200);

  // El borrador lo retoma su autor en otra sesión; ni un compañero ni Bambú lo ven, tampoco a su paciente.
  const otraSesion = (await pedir(s.app, 'POST', '/api/auth/entrar', { cuerpo: { identificador: vet.email, contrasena: CONTRASENA } })).cookie;
  assert.equal((await ver(otraSesion, b.id)).estado, 200);
  const comp = await companero(vet);
  for (const cookie of [comp.cookie, fisio.cookie]) {
    assert.equal((await ver(cookie, b.id)).estado, 404);
    assert.equal((await pedir(s.app, 'GET', `/api/pacientes/${b.paciente.id}`, { cookie })).estado, 404);
  }

  // Enviar sin motivo ni consentimiento: 400 con los campos y sigue en borrador.
  const sin = await accion(vet.cookie, b.id, 'envia');
  assert.ok(sin.cuerpo.campos['caso.motivo'] && sin.cuerpo.campos.consentimiento);
  await pedir(s.app, 'PATCH', `/api/casos/${b.id}`, { cookie: vet.cookie, cuerpo: { caso: { motivo: 'Hèrnia discal' } } });
  assert.equal((await accion(vet.cookie, b.id, 'envia', { acepta_consentimiento: true })).cuerpo.estado, 'enviada');
  assert.equal(await notificaciones(fisio.id, 'derivacion.enviada', b.id), 1);
  const { rows } = await s.pool.query(`SELECT destinatario FROM correos_pendientes c JOIN eventos e ON e.id = c.evento_id WHERE e.tipo = 'derivacion.enviada' AND e.caso_id = $1`, [b.id]);
  assert.deepEqual(rows.map((r) => r.destinatario), ['centre@bambufisiovet.com']);

  // Vista: la primera apertura de Bambú la marca una vez; la del veterinario no.
  assert.equal((await ver(vet.cookie, b.id)).cuerpo.vista_el, null);
  const primera = (await ver(fisio.cookie, b.id)).cuerpo;
  assert.equal(primera.vista_por, 'Laia Serra');
  assert.equal((await ver(admin, b.id)).cuerpo.vista_el, primera.vista_el);

  // Aceptar con fisio: aviso al veterinario y a la fisio; dos veces → 409 sin evento.
  assert.equal((await accion(vet.cookie, b.id, 'acepta')).estado, 403);
  assert.equal((await accion(fisio.cookie, b.id, 'acepta', { fisio_id: vet.usuario.id })).estado, 400);
  assert.equal((await accion(admin, b.id, 'acepta', { fisio_id: fisio.id })).cuerpo.estado, 'aceptada');
  assert.equal((await accion(admin, b.id, 'acepta')).estado, 409);
  assert.equal(await eventos('derivacion.aceptada', b.id), 1);
  assert.equal(await notificaciones(vet.usuario.id, 'derivacion.aceptada', b.id), 1);
  assert.equal(await notificaciones(fisio.id, 'caso.fisio_asignado', b.id), 1);

  // Cita, tancar exige motivo, alta manual; cada paso avisa al veterinario.
  assert.equal((await accion(fisio.cookie, b.id, 'alta-manual')).estado, 409);
  const cita = await accion(fisio.cookie, b.id, 'cita', { primera_visita: '2026-11-04' });
  assert.deepEqual([cita.cuerpo.estado, cita.cuerpo.primera_visita], ['en_tratamiento', '2026-11-04']);
  assert.match((await s.pool.query(`SELECT n.cuerpo FROM notificaciones n JOIN eventos e ON e.id = n.evento_id WHERE e.tipo = 'caso.en_tratamiento' AND e.caso_id = $1`, [b.id])).rows[0].cuerpo, /04\/11\/2026/);
  assert.equal((await accion(fisio.cookie, b.id, 'abandona')).estado, 400);
  assert.equal((await accion(fisio.cookie, b.id, 'alta-manual')).cuerpo.estado, 'alta');
  assert.equal(await notificaciones(vet.usuario.id, 'caso.alta', b.id), 1);

  // Otra derivación rechazada con su motivo; y dos aceptaciones a la vez: un 200, un 409 y un evento.
  const r = await derivar(vet);
  assert.equal((await accion(fisio.cookie, r.id, 'rechaza', { motivo: '' })).estado, 400);
  assert.equal((await accion(fisio.cookie, r.id, 'rechaza', { motivo: 'Cas quirúrgic' })).cuerpo.motivo_cierre, 'Cas quirúrgic');
  assert.equal(await notificaciones(vet.usuario.id, 'derivacion.rechazada', r.id), 1);
  const c = await derivar(vet);
  const [x, y] = await Promise.all([accion(admin, c.id, 'acepta'), accion(fisio.cookie, c.id, 'acepta')]);
  assert.deepEqual([x.estado, y.estado].sort(), [200, 409]);
  assert.equal(await eventos('derivacion.aceptada', c.id), 1);
});

test('quién edita qué: el veterinario hasta que se acepta (ficha incluida), Bambú siempre con historial y aviso; descartar no borra', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  assert.equal((await pedir(s.app, 'PATCH', `/api/casos/${c.id}`, { cookie: vet.cookie, cuerpo: { caso: { tratamiento_actual: 'Caminar sense dolor' } } })).cuerpo.tratamiento_actual, 'Caminar sense dolor');
  await accion(fisio.cookie, c.id, 'acepta');
  const tarde = await pedir(s.app, 'PATCH', `/api/casos/${c.id}`, { cookie: vet.cookie, cuerpo: { caso: { motivo: 'Un altre' } } });
  assert.deepEqual([tarde.estado, tarde.cuerpo.error], [409, "La derivació ja s'ha acceptat; afegeix la informació al fil"]);
  assert.equal((await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: vet.cookie, cuerpo: { raza: 'Beagle' } })).estado, 409);
  // Un borrador nuevo del mismo paciente tampoco cambia su ficha.
  const otro = await borrador(vet, { paciente_id: c.paciente.id });
  assert.equal((await pedir(s.app, 'PATCH', `/api/casos/${otro.id}`, { cookie: vet.cookie, cuerpo: { paciente: { nombre: 'Un altre' } } })).estado, 409);
  // El contacto del propietario sí, siempre; el nombre, no.
  await pedir(s.app, 'PATCH', `/api/propietarios/${c.propietario.id}`, { cookie: vet.cookie, cuerpo: { telefono: '699000111', nombre: 'Un altre' } });
  const ficha = (await pedir(s.app, 'GET', `/api/pacientes/${c.paciente.id}`, { cookie: vet.cookie })).cuerpo;
  assert.deepEqual([ficha.propietario.nombre, ficha.propietario.telefono], ['Joan Ferrer', '699000111']);

  // Bambú corrige el peso: historial con antes y después, aviso al veterinario; lo mismo otra vez no deja nada.
  const avisosAntes = await eventos('paciente.ficha_modificada', c.id);
  assert.equal((await pedir(s.app, 'PATCH', `/api/casos/${c.id}`, { cookie: fisio.cookie, cuerpo: { paciente: { peso_kg: 11.8 } } })).cuerpo.paciente.peso_kg, 11.8);
  const historial = async () => (await s.pool.query(`SELECT antes, despues FROM historial WHERE tabla = 'pacientes' AND fila_id = $1 ORDER BY id`, [String(c.paciente.id)])).rows;
  const h = await historial();
  assert.deepEqual([Number(h.at(-1).antes.peso_kg), h.at(-1).despues.peso_kg], [12.4, 11.8]);
  await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: fisio.cookie, cuerpo: { peso_kg: 11.8, nombre: 'Nala' } });
  assert.equal((await historial()).length, h.length);
  assert.equal(await eventos('paciente.ficha_modificada', c.id), avisosAntes + 1);
  // Solo el peso se compara como número: «001» → «1» en la raza es un cambio.
  await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: fisio.cookie, cuerpo: { raza: '001' } });
  await pedir(s.app, 'PATCH', `/api/pacientes/${c.paciente.id}`, { cookie: fisio.cookie, cuerpo: { raza: '1' } });
  assert.equal((await pedir(s.app, 'GET', `/api/pacientes/${c.paciente.id}`, { cookie: fisio.cookie })).cuerpo.raza, '1');
  assert.equal((await pedir(s.app, 'GET', `/api/casos/${c.id}/historial`, { cookie: vet.cookie })).estado, 403);

  // Descartar un borrador lo saca de la lista sin borrarlo, y ya no se envía ni se edita.
  const d = await borrador(vet);
  await accion(vet.cookie, d.id, 'descarta');
  assert.ok(!(await pedir(s.app, 'GET', '/api/casos', { cookie: vet.cookie })).cuerpo.casos.some((x: { id: number }) => x.id === d.id));
  assert.equal((await accion(vet.cookie, d.id, 'envia', { acepta_consentimiento: true })).estado, 404);
  assert.equal((await pedir(s.app, 'PATCH', `/api/casos/${d.id}`, { cookie: vet.cookie, cuerpo: { caso: { motivo: 'x' } } })).estado, 404);
  assert.ok((await s.pool.query('SELECT descartado_el FROM casos WHERE id = $1', [d.id])).rows[0].descartado_el);

  // El mismo paciente derivado otra vez: dos casos en su ficha.
  assert.equal((await pedir(s.app, 'GET', `/api/pacientes/${c.paciente.id}`, { cookie: vet.cookie })).cuerpo.casos.length, 2);
});

test('listas y control: solo lo de su clínica, orden y paginación, búsqueda sin acentos, novedades, contadores y pendientes de cita', async () => {
  const vet = await veterinarioVerificado(s, { clinica: 'Clínica Montgó' });
  const ajeno = await derivar(await veterinarioVerificado(s));
  const ids: number[] = [];
  for (let i = 0; i < 32; i++) ids.push((await derivar(vet, { paciente: { ...DATOS.paciente, nombre: `Gos ${i}` } })).id);
  const propia = await pedir(s.app, 'GET', '/api/casos', { cookie: vet.cookie });
  assert.equal(propia.cuerpo.casos.length, 30);
  assert.equal(propia.cuerpo.casos[0].id, ids.at(-1));
  assert.ok(!propia.cuerpo.casos.some((c: { id: number }) => c.id === ajeno.id));
  const resto = await pedir(s.app, 'GET', `/api/casos?antes_de=${propia.cuerpo.siguiente}`, { cookie: vet.cookie });
  const todos = [...propia.cuerpo.casos, ...resto.cuerpo.casos].map((c: { id: number }) => c.id);
  assert.deepEqual([...todos].sort((a, b) => a - b), ids);
  assert.ok((await pedir(s.app, 'GET', '/api/casos?q=montgo', { cookie: fisio.cookie })).cuerpo.casos.every((c: { clinica: string }) => c.clinica === 'Clínica Montgó'));

  // Novedades: el filtro y abrir el caso bajan la campana.
  const [a, b] = [ids[0]!, ids[1]!];
  await accion(fisio.cookie, a, 'acepta');
  await accion(fisio.cookie, a, 'cita');
  const nov = (await pedir(s.app, 'GET', '/api/casos?novedades=1', { cookie: vet.cookie })).cuerpo.casos;
  assert.deepEqual([nov.map((c: { id: number }) => c.id), nov[0].no_leidas], [[a], 2]);
  const antes = (await pedir(s.app, 'GET', '/api/notificaciones/resumen', { cookie: vet.cookie })).cuerpo.no_leidas;
  assert.equal((await accion(vet.cookie, a, 'leido')).cuerpo.no_leidas, antes - 2);

  // Contadores: «sense obrir» baja al abrirla.
  const sinAbrir = (await pedir(s.app, 'GET', '/api/panel/contadores', { cookie: fisio.cookie })).cuerpo.sin_abrir;
  await ver(fisio.cookie, b);
  assert.equal((await pedir(s.app, 'GET', '/api/panel/contadores', { cookie: fisio.cookie })).cuerpo.sin_abrir, sinAbrir - 1);

  // Pendiente de cita más de N días: marcada, contada y avisada una sola vez aunque la tarea corra dos veces a la vez.
  await accion(fisio.cookie, b, 'acepta');
  await s.pool.query(`UPDATE casos SET resuelto_el = now() - interval '4 days' WHERE id = $1`, [b]);
  assert.equal((await ver(fisio.cookie, b)).cuerpo.atascado, true);
  assert.ok((await pedir(s.app, 'GET', '/api/casos?atascados=1', { cookie: fisio.cookie })).cuerpo.casos.some((c: { id: number }) => c.id === b));
  await Promise.all([comprobarPendientesCita(s.pool), comprobarPendientesCita(s.pool)]);
  assert.equal(await comprobarPendientesCita(s.pool), 0);
  assert.equal(await eventos('caso.sin_noticias', b), 1);
  assert.equal(await notificaciones(fisio.id, 'caso.sin_noticias', b), 1);
});

test('ámbito: ninguna ruta da nada de otra clínica y el aviso de ficha no salta de clínica', async () => {
  const vet = await veterinarioVerificado(s);
  const c = await derivar(vet);
  const ajeno = await veterinarioVerificado(s);
  const rutas: [string, string, unknown?][] = [
    ['GET', `/api/casos/${c.id}`], ['PATCH', `/api/casos/${c.id}`, { caso: { motivo: 'x' } }],
    ['POST', `/api/casos/${c.id}/envia`, {}], ['POST', `/api/casos/${c.id}/descarta`, {}], ['POST', `/api/casos/${c.id}/leido`, {}],
    ['GET', `/api/pacientes/${c.paciente.id}`], ['PATCH', `/api/pacientes/${c.paciente.id}`, { nombre: 'x' }],
    ['PATCH', `/api/propietarios/${c.propietario.id}`, { telefono: '1' }],
    ['POST', '/api/casos', { ...DATOS, paciente_id: c.paciente.id }],
  ];
  for (const [metodo, ruta, cuerpo] of rutas) {
    assert.equal((await pedir(s.app, metodo as 'GET', ruta, { cookie: ajeno.cookie, ...(cuerpo ? { cuerpo } : {}) })).estado, 404, `${metodo} ${ruta}`);
  }
  for (const lista of [(await pedir(s.app, 'GET', '/api/casos', { cookie: ajeno.cookie })).cuerpo.casos, (await pedir(s.app, 'GET', '/api/pacientes', { cookie: ajeno.cookie })).cuerpo.pacientes]) {
    assert.ok(!lista.some((x: { id: number }) => x.id === c.id || x.id === c.paciente.id));
  }

  // Un caso incoherente del mismo paciente en otra clínica: el aviso de ficha va al de la clínica de quien edita.
  const otra = { cuerpo: { id: (await veterinarioVerificado(s, { clinica: 'Clínica Aliena' })).usuario.clinica.id } };
  const { rows } = await s.pool.query(
    `INSERT INTO casos (paciente_id, clinica_id, registrado_por, creado_por, estado, motivo, enviado_el, creado)
     VALUES ($1, $2, $3, $3, 'enviada', 'x', now(), now() + interval '1 minute') RETURNING id`,
    [c.paciente.id, otra.cuerpo.id, fisio.id],
  );
  await pedir(s.app, 'PATCH', `/api/propietarios/${c.propietario.id}`, { cookie: vet.cookie, cuerpo: { telefono: '688777666' } });
  assert.deepEqual([await eventos('paciente.ficha_modificada', rows[0].id), await eventos('paciente.ficha_modificada', c.id)], [0, 1]);
});

test('autoguardado: devolver la ficha tal como llega (con null en lo vacío) no da 400', async () => {
  const vet = await veterinarioVerificado(s);
  const b = await borrador(vet, { paciente: { nombre: 'Rocky', especie: 'perro' }, propietario: { nombre: 'Maria', telefono: '600' } });
  const ficha = (await ver(vet.cookie, b.id)).cuerpo;
  assert.equal(ficha.paciente.raza, null);
  const { id: _p, ...paciente } = ficha.paciente;
  const { id: _pr, consentimiento_version: _v, consentimiento_el: _e, ...propietario } = ficha.propietario;
  const r = await pedir(s.app, 'PATCH', `/api/casos/${b.id}`, { cookie: vet.cookie, cuerpo: { paciente, propietario, caso: { motivo: 'Coixesa anterior' } } });
  assert.equal(r.cuerpo.motivo, 'Coixesa anterior');
});
