// Textos de la interfaz. Toda cadena visible sale del diccionario: la clave
// está tipada, así que una clave que no existe no compila. Añadir castellano
// es añadir un fichero con las mismas claves.
import { va } from './va.ts';

export type ClaveTexto = keyof typeof va;

/** El texto de la clave, con {marcadores} sustituidos. */
export function t(clave: ClaveTexto, valores: Record<string, string | number> = {}): string {
  return va[clave].replace(/\{(\w+)\}/g, (_, nombre: string) =>
    nombre in valores ? String(valores[nombre]) : `{${nombre}}`,
  );
}

const FORMATO_FECHA = new Intl.DateTimeFormat('ca-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** «fa 5 min», «fa 3 h», o la fecha si es de hace más de una semana. */
export function haceCuanto(fechaIso: string): string {
  const segundos = Math.round((Date.now() - new Date(fechaIso).getTime()) / 1000);
  if (segundos < 60) return t('tiempo.ahora');
  if (segundos < 3600) return t('tiempo.minutos', { n: Math.floor(segundos / 60) });
  if (segundos < 86400) return t('tiempo.horas', { n: Math.floor(segundos / 3600) });
  if (segundos < 7 * 86400) return t('tiempo.dias', { n: Math.floor(segundos / 86400) });
  return FORMATO_FECHA.format(new Date(fechaIso));
}

export function fecha(fechaIso: string): string {
  return FORMATO_FECHA.format(new Date(fechaIso));
}
