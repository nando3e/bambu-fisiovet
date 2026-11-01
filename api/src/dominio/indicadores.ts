// Cálculos de los indicadores del panel que no son un simple recuento. Puro:
// las fechas llegan ya en hora de Madrid (convertidas en SQL) y se leen como
// UTC, así aquí no se sabe nada de husos.

const HORA = 3_600_000;

/**
 * Horas de calendario de lunes a viernes entre dos instantes. Sin festivos
 * (supuesto de v1): viernes 18:00 → lunes 10:00 son 16 horas.
 */
export function horasLaborables(desde: Date, hasta: Date): number {
  let t = desde.getTime();
  const fin = hasta.getTime();
  let ms = 0;
  while (t < fin) {
    const d = new Date(t);
    const finDia = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const hastaTramo = Math.min(finDia, fin);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) ms += hastaTramo - t;
    t = hastaTramo;
  }
  return ms / HORA;
}

/** Mediana; sin datos, null (la pantalla dice «Sense dades», nunca cero). */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
