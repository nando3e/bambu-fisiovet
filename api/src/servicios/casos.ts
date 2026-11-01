// Casos: leer con ámbito, crear pacientes y propietarios, guardar cambios con
// historial y saber a quién avisar. Lo usan las rutas de casos y pacientes.
import type { Sesion } from '../auth/sesion.ts';
import { publicarEvento } from '../avisos/publicar.ts';
import type { Consultable } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import type { EstadoCaso } from '../dominio/estados-caso.ts';
import { ambitoCaso, ambitoPaciente, type QuienMira } from '../dominio/visibilidad.ts';
import { noEncontrado } from '../errores.ts';

export interface DatosPaciente {
  nombre?: string;
  especie?: string | null;
  especie_otra?: string | null;
  raza?: string | null;
  sexo?: string | null;
  esterilizado?: boolean | null;
  fecha_nacimiento?: string | null;
  edad_texto?: string | null;
  peso_kg?: number | null;
}
export interface DatosPropietario {
  nombre?: string;
  telefono?: string | null;
  email?: string | null;
}
export interface DatosCaso {
  motivo?: string;
  historia_clinica?: string;
  tratamiento_actual?: string;
  objetivos?: string;
  notas_derivador?: string;
}

export const CAMPOS_PACIENTE = [
  'nombre', 'especie', 'especie_otra', 'raza', 'sexo', 'esterilizado', 'fecha_nacimiento', 'edad_texto', 'peso_kg',
] as const;
export const CAMPOS_PROPIETARIO = ['nombre', 'telefono', 'email'] as const;
export const CAMPOS_CASO = ['motivo', 'historia_clinica', 'tratamiento_actual', 'objetivos', 'notas_derivador'] as const;

export interface FilaCaso {
  id: number;
  estado: EstadoCaso;
  paciente_id: number;
  propietario_id: number;
  clinica_id: number;
  clinica_nombre: string;
  derivador_id: number | null;
  derivador: string | null;
  derivador_nombre: string | null;
  registrado_por: number | null;
  registrado_por_nombre: string | null;
  fisio_responsable_id: number | null;
  fisio: string | null;
  motivo: string;
  historia_clinica: string;
  tratamiento_actual: string;
  objetivos: string;
  notas_derivador: string;
  motivo_cierre: string | null;
  descartado_el: Date | null;
  enviado_el: Date | null;
  resuelto_el: Date | null;
  vista_el: Date | null;
  vista_por_nombre: string | null;
  en_tratamiento_el: Date | null;
  primera_visita: string | null;
  cerrado_el: Date | null;
  ultima_actividad: Date;
  creado: Date;
  paciente_nombre: string;
}

const nombreDe = (alias: string) => `nullif(trim(${alias}.nombre || ' ' || ${alias}.apellidos), '')`;

/** El SELECT de un caso con los nombres que pinta la ficha. */
export const SELECT_CASO = `
  SELECT c.id, c.estado, c.paciente_id, p.propietario_id, c.clinica_id, cl.nombre AS clinica_nombre,
         c.derivador_id, ${nombreDe('d')} AS derivador, c.derivador_nombre,
         c.registrado_por, ${nombreDe('r')} AS registrado_por_nombre,
         c.fisio_responsable_id, ${nombreDe('f')} AS fisio,
         c.motivo, c.historia_clinica, c.tratamiento_actual, c.objetivos, c.notas_derivador,
         c.motivo_cierre, c.descartado_el, c.enviado_el, c.resuelto_el,
         c.vista_el, ${nombreDe('v')} AS vista_por_nombre, c.en_tratamiento_el, c.primera_visita,
         c.cerrado_el, c.ultima_actividad, c.creado, p.nombre AS paciente_nombre
  FROM casos c
  JOIN pacientes p ON p.id = c.paciente_id
  JOIN clinicas cl ON cl.id = c.clinica_id
  LEFT JOIN usuarios d ON d.id = c.derivador_id
  LEFT JOIN usuarios r ON r.id = c.registrado_por
  LEFT JOIN usuarios f ON f.id = c.fisio_responsable_id
  LEFT JOIN usuarios v ON v.id = c.vista_por`;

/** Un caso dentro del ámbito de la sesión, o 404. Con `bloquear`, FOR UPDATE. */
export async function casoVisible(bd: Consultable, sesion: QuienMira, id: number, bloquear = false): Promise<FilaCaso> {
  const ambito = ambitoCaso(sesion, 'c', 2);
  const { rows } = await bd.query<FilaCaso>(
    `${SELECT_CASO} WHERE c.id = $1 AND ${ambito.sql}${bloquear ? ' FOR UPDATE OF c' : ''}`,
    [id, ...ambito.params],
  );
  if (!rows[0]) throw noEncontrado('Aquest cas no existeix');
  return rows[0];
}

export async function pacienteVisible(bd: Consultable, sesion: QuienMira, id: number) {
  const ambito = ambitoPaciente(sesion, 'p', 2);
  const { rows } = await bd.query<{ id: number; propietario_id: number; clinica_origen_id: number | null }>(
    `SELECT p.id, p.propietario_id, p.clinica_origen_id FROM pacientes p WHERE p.id = $1 AND ${ambito.sql}`,
    [id, ...ambito.params],
  );
  if (!rows[0]) throw noEncontrado('Aquest pacient no existeix');
  return rows[0];
}

const vacioANull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Crea propietario y paciente de una clínica; devuelve el id del paciente. */
export async function crearPaciente(
  bd: Consultable,
  clinicaId: number,
  usuarioId: number,
  paciente: DatosPaciente,
  propietario: DatosPropietario,
): Promise<number> {
  const { rows: pr } = await bd.query<{ id: number }>(
    `INSERT INTO propietarios (nombre, telefono, email, clinica_origen_id, creado_por)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [propietario.nombre ?? '', vacioANull(propietario.telefono), vacioANull(propietario.email), clinicaId, usuarioId],
  );
  const { rows } = await bd.query<{ id: number }>(
    `INSERT INTO pacientes (nombre, especie, especie_otra, raza, sexo, esterilizado, fecha_nacimiento,
                            edad_texto, peso_kg, propietario_id, clinica_origen_id, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [paciente.nombre ?? '', paciente.especie ?? null, vacioANull(paciente.especie_otra), vacioANull(paciente.raza),
      paciente.sexo ?? null, paciente.esterilizado ?? null, paciente.fecha_nacimiento ?? null,
      vacioANull(paciente.edad_texto), paciente.peso_kg ?? null, pr[0]!.id, clinicaId, usuarioId],
  );
  return rows[0]!.id;
}

/**
 * Actualiza los campos que llegan y que cambian de verdad, y deja historial.
 * Devuelve los nombres de los campos cambiados (vacío = no ha cambiado nada).
 */
export async function guardarCambios(
  bd: Consultable,
  tabla: 'casos' | 'pacientes' | 'propietarios',
  id: number,
  permitidos: readonly string[],
  datos: Record<string, unknown>,
  usuarioId: number,
): Promise<string[]> {
  const claves = permitidos.filter((c) => datos[c] !== undefined);
  if (claves.length === 0) return [];
  const { rows } = await bd.query<Record<string, unknown>>(
    `SELECT ${claves.join(', ')} FROM ${tabla} WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const actual = rows[0]!;
  // Los textos del caso son NOT NULL: vaciarlos es dejarlos en ''. En las
  // fichas, vaciar un campo es dejarlo sin valor.
  const nuevo = (c: string) => {
    const v = vacioANull(datos[c]);
    return v === null && tabla === 'casos' ? '' : v;
  };
  // El peso llega de Postgres como texto ('12.40'): solo él se compara como
  // número. El resto, como texto («001» y «1» son nombres distintos).
  const comparable = (c: string, v: unknown) => {
    if (v === null || v === undefined) return null;
    return c === 'peso_kg' ? String(Number(v)) : String(v);
  };
  const cambiados = claves.filter((c) => comparable(c, actual[c]) !== comparable(c, nuevo(c)));
  if (cambiados.length === 0) return [];
  const valores = cambiados.map(nuevo);
  await bd.query(
    `UPDATE ${tabla} SET ${cambiados.map((c, i) => `${c} = $${i + 2}`).join(', ')}, actualizado = now() WHERE id = $1`,
    [id, ...valores],
  );
  await registrarCambio(bd, {
    tabla,
    filaId: id,
    antes: Object.fromEntries(cambiados.map((c) => [c, actual[c] ?? null])),
    despues: Object.fromEntries(cambiados.map((c, i) => [c, valores[i] ?? null])),
    usuarioId,
  });
  return cambiados;
}

/** Veterinarios a los que avisar: el que derivó o, si no tiene cuenta, los de la clínica. */
export async function interesadosDe(bd: Consultable, caso: { derivador_id: number | null; clinica_id: number }) {
  if (caso.derivador_id) return [caso.derivador_id];
  const { rows } = await bd.query<{ id: number }>(
    `SELECT id FROM usuarios WHERE clinica_id = $1 AND rol = 'derivador' AND activo`,
    [caso.clinica_id],
  );
  return rows.map((r) => r.id);
}

export async function tocarActividad(bd: Consultable, casoId: number): Promise<void> {
  await bd.query('UPDATE casos SET ultima_actividad = now() WHERE id = $1', [casoId]);
}

/** Publica un evento de caso con los datos que usan los textos de los avisos. */
export async function avisarCaso(
  bd: Consultable,
  sesion: Sesion | null,
  caso: FilaCaso,
  tipo: Parameters<typeof publicarEvento>[1]['tipo'],
  datos: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  await publicarEvento(bd, {
    tipo,
    actor: sesion ? { id: sesion.usuarioId, rol: sesion.rol } : null,
    casoId: caso.id,
    clinicaId: caso.clinica_id,
    fisioResponsableId: caso.fisio_responsable_id,
    derivadoresInteresados: await interesadosDe(bd, caso),
    datos: { paciente: caso.paciente_nombre, clinica: caso.clinica_nombre, ...datos },
  });
}

/**
 * Tras editar la ficha de un paciente (o de su propietario), avisa con el caso
 * más reciente que no sea borrador; si no hay ninguno, nadie más lo ve.
 */
export async function avisarFichaModificada(
  bd: Consultable,
  sesion: Sesion,
  pacienteIds: number[],
  campos: string[],
): Promise<void> {
  for (const pacienteId of pacienteIds) {
    const ambito = ambitoCaso(sesion, 'c', 2);
    const { rows } = await bd.query<{ id: number }>(
      `SELECT c.id FROM casos c
       WHERE c.paciente_id = $1 AND c.estado <> 'borrador' AND c.descartado_el IS NULL AND ${ambito.sql}
       ORDER BY c.creado DESC LIMIT 1`,
      [pacienteId, ...ambito.params],
    );
    if (!rows[0]) continue;
    const caso = await casoVisible(bd, sesion, rows[0].id);
    await tocarActividad(bd, caso.id);
    await avisarCaso(bd, sesion, caso, 'paciente.ficha_modificada', {
      nombre: `${sesion.nombre} ${sesion.apellidos}`.trim(),
      campos: campos.join(', '),
    });
  }
}
