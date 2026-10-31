// Plantillas de correo: ficheros HTML en `api/plantillas/correo/` que se
// editan sin tocar el código (patrón de nosolodulce).
//
// Cada plantilla es un fragmento con su `<title>` (el asunto) y el cuerpo; el
// marco común (logo, colores, pie) vive en `_base.html` y se aplica a todas.
//
// Marcadores (subconjunto de Mustache, sin dependencias):
//   {{nombre}}              el valor, escapado
//   {{#dato}}…{{/dato}}     el bloque si el dato existe y no está vacío;
//                           si es una lista, se repite por elemento
//   {{^dato}}…{{/dato}}     el bloque si el dato NO existe o está vacío
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const DIR_PLANTILLAS = resolve(AQUI, '..', '..', 'plantillas', 'correo');

type Ambito = Record<string, unknown>;

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function vacio(v: unknown): boolean {
  return v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && v.length === 0);
}

function buscar(ambitos: Ambito[], nombre: string): unknown {
  for (let i = ambitos.length - 1; i >= 0; i--) {
    const a = ambitos[i]!;
    if (Object.prototype.hasOwnProperty.call(a, nombre)) return a[nombre];
  }
  return undefined;
}

const SECCION = /\{\{([#^])\s*(\w+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/;
const HUECO = /\{\{\s*(\w+)\s*\}\}/g;

function render(texto: string, ambitos: Ambito[]): string {
  let salida = texto;
  for (let m = SECCION.exec(salida); m; m = SECCION.exec(salida)) {
    const [entero, tipo, nombre, dentro] = m as unknown as [string, string, string, string];
    const valor = buscar(ambitos, nombre);
    let trozo = '';
    if (tipo === '^') {
      trozo = vacio(valor) ? render(dentro, ambitos) : '';
    } else if (Array.isArray(valor)) {
      trozo = valor
        .map((el) => render(dentro, [...ambitos, el && typeof el === 'object' ? (el as Ambito) : { '.': el }]))
        .join('');
    } else if (!vacio(valor)) {
      trozo = render(dentro, valor && typeof valor === 'object' ? [...ambitos, valor as Ambito] : ambitos);
    }
    salida = salida.slice(0, m.index) + trozo + salida.slice(m.index + entero.length);
  }
  return salida.replace(HUECO, (_, nombre: string) => {
    const v = buscar(ambitos, nombre);
    return vacio(v) && v !== 0 ? '' : escapar(String(v));
  });
}

export function rellenar(plantilla: string, datos: Ambito): string {
  return render(plantilla, [datos]);
}

/** Texto plano a partir del HTML, para los clientes que no lo pintan. */
export function aTexto(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url: string, texto: string) =>
      `${texto.replace(/<[^>]+>/g, '').trim()} (${url})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface CorreoRenderizado {
  asunto: string;
  html: string;
  texto: string;
}

export function renderizar(nombre: string, datos: Ambito, dir = DIR_PLANTILLAS): CorreoRenderizado {
  const fragmento = rellenar(readFileSync(resolve(dir, `${nombre}.html`), 'utf8'), datos);
  const asunto = (/<title>([\s\S]*?)<\/title>/i.exec(fragmento)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  const cuerpo = fragmento.replace(/<title>[\s\S]*?<\/title>/i, '').trim();
  const base = rellenar(readFileSync(resolve(dir, '_base.html'), 'utf8'), { ...datos, asunto });
  const html = base.replace('<!--contenido-->', cuerpo);
  return { asunto, html, texto: aTexto(cuerpo) };
}
