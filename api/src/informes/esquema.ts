// El informe: su JSON schema estricto (lo que se pide al modelo) y su gemelo
// zod (lo que se valida, venga del modelo o del formulario de edición). Un
// test comprueba que los dos tienen las mismas claves.
import { z } from 'zod';

export const TIPOS_INFORME = ['valoracion', 'evolucion', 'alta'] as const;
export type TipoInforme = (typeof TIPOS_INFORME)[number];

const texto = z.string().trim().max(6000);
const lista = z.array(z.string().trim().min(1).max(1500)).max(30);
const opcional = z.string().trim().max(3000).nullable();

export const esquemaInforme = z.object({
  resumen: texto,
  hallazgos: lista,
  tratamiento_realizado: lista,
  evolucion: texto,
  plan: texto,
  recomendaciones_veterinario: lista,
  proxima_revision: opcional,
  /** Lo que el dictado no deja claro: nunca se rellena, se pregunta. */
  dudas: lista,
  estado_al_alta: opcional,
  pautas_domicilio: opcional,
});
export type DatosInforme = z.infer<typeof esquemaInforme>;

const cadena = { type: 'string' };
const listaJson = { type: 'array', items: { type: 'string' } };
const nulable = { anyOf: [{ type: 'string' }, { type: 'null' }] };

/** Estricto: todo requerido y nada de más; lo opcional es null. */
export const ESQUEMA_JSON: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resumen: { ...cadena, description: 'Resum clínic breu del cas i del moment actual.' },
    hallazgos: { ...listaJson, description: 'Troballes de l’exploració i de les proves, una per element.' },
    tratamiento_realizado: { ...listaJson, description: 'Tècniques i teràpies aplicades, una per element.' },
    evolucion: { ...cadena, description: 'Evolució del pacient segons les notes.' },
    plan: { ...cadena, description: 'Pla de tractament previst.' },
    recomendaciones_veterinario: { ...listaJson, description: 'Recomanacions per al veterinari que va derivar.' },
    proxima_revision: { ...nulable, description: 'Quan es recomana revisar, o null si les notes no ho diuen.' },
    dudas: { ...listaJson, description: 'El que les notes no deixen clar i caldria confirmar. Mai no s’inventa.' },
    estado_al_alta: { ...nulable, description: 'Només en l’informe d’alta: estat del pacient. Si no, null.' },
    pautas_domicilio: { ...nulable, description: 'Només en l’informe d’alta: pautes per a casa. Si no, null.' },
  },
  required: Object.keys(esquemaInforme.shape),
};

/** Un informe vacío para el camino «a mano». */
export function informeVacio(): DatosInforme {
  return {
    resumen: '', hallazgos: [], tratamiento_realizado: [], evolucion: '', plan: '',
    recomendaciones_veterinario: [], proxima_revision: null, dudas: [], estado_al_alta: null, pautas_domicilio: null,
  };
}
