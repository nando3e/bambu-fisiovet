// Qué casos y pacientes ve cada sesión. Devuelve el trozo de SQL que va en el
// WHERE y sus parámetros: el filtro del derivador vive en la consulta, nunca
// en código después (principio duro 1). Puro: sin pg, solo texto.

export interface QuienMira {
  usuarioId: number;
  rol: 'superadmin' | 'bambu' | 'derivador';
  clinicaId: number | null;
}

export interface Ambito {
  sql: string;
  params: unknown[];
}

const esLadoBambu = (q: QuienMira) => q.rol === 'bambu' || q.rol === 'superadmin';

/**
 * Casos visibles. `n` es el número del primer parámetro libre de la consulta.
 * Bambú ve todo lo enviado; un borrador solo existe para quien lo escribe.
 * El derivador ve lo de su clínica.
 */
export function ambitoCaso(q: QuienMira, alias = 'c', n = 1): Ambito {
  if (esLadoBambu(q)) return { sql: `${alias}.estado <> 'borrador'`, params: [] };
  if (q.clinicaId === null) return { sql: 'false', params: [] };
  return {
    sql: `(${alias}.clinica_id = $${n} AND (${alias}.estado <> 'borrador' OR ${alias}.derivador_id = $${n + 1}))`,
    params: [q.clinicaId, q.usuarioId],
  };
}

/**
 * Pacientes visibles: los que tienen algún caso a la vista de quien mira. No
 * basta con la clínica de origen: el paciente de un borrador ajeno no se ve
 * hasta que se envía. El propietario se ve a través del paciente.
 */
export function ambitoPaciente(q: QuienMira, alias = 'p', n = 1): Ambito {
  // Todo paciente nace de un caso; para Bambú, uno que ya no sea borrador.
  const caso = ambitoCaso(q, 'cv', n);
  return {
    sql: `EXISTS (SELECT 1 FROM casos cv WHERE cv.paciente_id = ${alias}.id AND ${caso.sql})`,
    params: caso.params,
  };
}
