// Mensajes del sistema en el hilo: cada transición y cada cambio de ficha deja
// una línea legible, en valenciano y en la misma transacción que la acción.
// Son contenido guardado (el hilo es el rastro del caso), no interfaz.
import type { Consultable } from '../db/pool.ts';

export interface CambioCampo {
  tabla: 'casos' | 'pacientes' | 'propietarios';
  campo: string;
  antes: unknown;
  despues: unknown;
}

export async function mensajeSistema(
  bd: Consultable,
  casoId: number,
  texto: string,
  visibilidad: 'todos' | 'bambu' = 'todos',
): Promise<void> {
  await bd.query(
    `INSERT INTO mensajes (caso_id, autor_id, tipo, visibilidad, cuerpo) VALUES ($1, NULL, 'sistema', $2, $3)`,
    [casoId, visibilidad, texto],
  );
}

const ETIQUETAS: Record<string, string> = {
  'casos.motivo': 'el motiu de la derivació',
  'casos.historia_clinica': 'la història clínica',
  'casos.tratamiento_actual': 'el tractament actual',
  'casos.objetivos': 'els objectius',
  'casos.notas_derivador': 'les notes',
  'pacientes.nombre': 'el nom del pacient',
  'pacientes.especie': 'l’espècie',
  'pacientes.especie_otra': 'l’espècie',
  'pacientes.raza': 'la raça',
  'pacientes.sexo': 'el sexe',
  'pacientes.esterilizado': 'si està esterilitzat',
  'pacientes.fecha_nacimiento': 'la data de naixement',
  'pacientes.edad_texto': 'l’edat',
  'pacientes.peso_kg': 'el pes',
  'propietarios.nombre': 'el nom del propietari',
  'propietarios.telefono': 'el telèfon del propietari',
  'propietarios.email': 'el correu del propietari',
};

/** Los textos largos del caso no se copian al hilo: solo se dice que han cambiado. */
const LARGOS = new Set(['casos.motivo', 'casos.historia_clinica', 'casos.tratamiento_actual', 'casos.objetivos', 'casos.notas_derivador']);

const ESPECIES: Record<string, string> = { perro: 'gos', gato: 'gat', conejo: 'conill', ave: 'au', otro: 'altres' };
const SEXOS: Record<string, string> = { macho: 'mascle', hembra: 'femella', desconocido: 'no se sap' };

function valor(clave: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (clave === 'pacientes.peso_kg') return String(Number(v)).replace('.', ',');
  if (clave === 'pacientes.especie') return ESPECIES[String(v)] ?? String(v);
  if (clave === 'pacientes.sexo') return SEXOS[String(v)] ?? String(v);
  if (clave === 'pacientes.esterilizado') return v ? 'sí' : 'no';
  if (clave === 'pacientes.fecha_nacimiento') return String(v).split('-').reverse().join('/');
  return String(v);
}

/** «Laia Serra ha canviat el pes: 12,4 → 11,8; el telèfon del propietari: …». */
export function textoCambios(quien: string, cambios: CambioCampo[]): string {
  const partes = cambios.map((c) => {
    const clave = `${c.tabla}.${c.campo}`;
    const etiqueta = ETIQUETAS[clave] ?? c.campo;
    return LARGOS.has(clave) ? etiqueta : `${etiqueta}: ${valor(clave, c.antes)} → ${valor(clave, c.despues)}`;
  });
  return `${quien} ha canviat ${partes.join('; ')}.`;
}

export const fechaVisible = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : null);
