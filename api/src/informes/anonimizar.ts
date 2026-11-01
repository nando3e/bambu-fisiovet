// Última barrera antes del modelo (principio duro 4). Las columnas del
// propietario y del veterinario ya no entran en el prompt, pero los campos
// libres (historia clínica, dictados, instrucciones, informe anterior) pueden
// llevarlos copiados: aquí se sustituyen los nombres conocidos, y cualquier
// teléfono o correo, por una etiqueta. Puro: sin base ni red.

export interface Conocidos {
  /** Nombre, teléfono y correo del propietario. */
  propietario: (string | null)[];
  /** Nombre, apellidos y correo del veterinario (o el nombre escrito a mano). */
  veterinario: (string | null)[];
  /** Nombre de la clínica. */
  clinica: (string | null)[];
}

const ETIQUETA = { propietario: '[propietari]', veterinario: '[veterinari]', clinica: '[clínica]' } as const;
/** Palabras sueltas de un nombre que se tapan solas (las más cortas dan falsos positivos). */
const LETRAS_MINIMAS = 3;
/** Nueve dígitos o más, con espacios, puntos o guiones entre medias. */
const TELEFONO = /\+?\d(?:[\s.\-]?\d){8,}/g;
const CORREO = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;
const CONECTORES = new Set(['de', 'del', 'la', 'les', 'el', 'els', 'i', 'y', 'dels', 'van']);

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const palabraEntera = (s: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapar(s)}(?![\\p{L}\\p{N}])`, 'giu');

export function anonimizar(texto: string, conocidos: Conocidos): string {
  let t = texto.replace(CORREO, '[correu]');
  for (const quien of ['propietario', 'veterinario', 'clinica'] as const) {
    const valores = conocidos[quien].map((v) => v?.trim()).filter((v): v is string => !!v && v.length >= LETRAS_MINIMAS);
    // Primero el valor entero (el nombre de la clínica solo así: «Clínica» suelta no se tapa).
    const piezas = new Set(valores);
    if (quien !== 'clinica') {
      for (const v of valores) {
        for (const p of v.split(/\s+/)) if (p.length >= LETRAS_MINIMAS && !CONECTORES.has(p.toLowerCase())) piezas.add(p);
      }
    }
    for (const p of [...piezas].sort((a, b) => b.length - a.length)) t = t.replace(palabraEntera(p), ETIQUETA[quien]);
  }
  return t.replace(TELEFONO, '[telèfon]');
}
