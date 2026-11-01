// La ficha del informe en texto: determinista y la misma para la pantalla, el
// hilo y la impresión. Las dudas no salen: son para el fisio, no para el
// veterinario.
import type { DatosInforme, TipoInforme } from './esquema.ts';

export const TITULO_INFORME: Record<TipoInforme, string> = {
  valoracion: 'Informe de valoració',
  evolucion: 'Informe d’evolució',
  alta: 'Informe d’alta',
};

const lista = (titulo: string, elementos: string[]) =>
  elementos.length ? [`${titulo}`, ...elementos.map((e) => `- ${e}`), ''] : [];
const parrafo = (titulo: string, texto: string | null) => (texto && texto.trim() ? [titulo, texto.trim(), ''] : []);

export function renderInforme(tipo: TipoInforme, d: DatosInforme): string {
  // Si el fisio lo ha escrito todo junto, ese texto es el informe.
  if (d.texto_libre && d.texto_libre.trim()) return [TITULO_INFORME[tipo], '', d.texto_libre.trim()].join('\n');
  return [
    TITULO_INFORME[tipo],
    '',
    ...parrafo('Resum', d.resumen),
    ...lista('Troballes', d.hallazgos),
    ...lista('Tractament realitzat', d.tratamiento_realizado),
    ...parrafo('Evolució', d.evolucion),
    ...parrafo('Pla', d.plan),
    ...lista('Recomanacions per al veterinari', d.recomendaciones_veterinario),
    ...parrafo('Pròxima revisió', d.proxima_revision),
    ...(tipo === 'alta' ? [...parrafo('Estat a l’alta', d.estado_al_alta), ...parrafo('Pautes a casa', d.pautas_domicilio)] : []),
  ].join('\n').trim();
}
