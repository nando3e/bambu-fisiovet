// Estados del caso y quién puede moverlos: copia como datos de
// api/src/dominio/estados-caso.ts para que la web solo enseñe los botones que
// el servidor va a aceptar. Un test del API compara las dos tablas.

export type EstadoCaso =
  | 'borrador' | 'enviada' | 'aceptada' | 'en_tratamiento' | 'alta' | 'rechazada' | 'abandonada';

export type AccionCaso =
  | 'enviar' | 'descartar' | 'aceptar' | 'rechazar' | 'abandonar' | 'alta_manual'
  | 'iniciar_tratamiento' | 'alta_por_informe';

export const TRANSICIONES: Record<AccionCaso, { desde: readonly EstadoCaso[]; a: EstadoCaso; quien: 'derivador' | 'bambu' | 'sistema' }> = {
  enviar: { desde: ['borrador'], a: 'enviada', quien: 'derivador' },
  descartar: { desde: ['borrador'], a: 'borrador', quien: 'derivador' },
  aceptar: { desde: ['enviada'], a: 'aceptada', quien: 'bambu' },
  rechazar: { desde: ['enviada'], a: 'rechazada', quien: 'bambu' },
  abandonar: { desde: ['aceptada', 'en_tratamiento'], a: 'abandonada', quien: 'bambu' },
  alta_manual: { desde: ['en_tratamiento'], a: 'alta', quien: 'bambu' },
  iniciar_tratamiento: { desde: ['aceptada'], a: 'en_tratamiento', quien: 'bambu' },
  alta_por_informe: { desde: ['aceptada', 'en_tratamiento'], a: 'alta', quien: 'sistema' },
};

export const EDITABLE_POR_DERIVADOR: readonly EstadoCaso[] = ['borrador', 'enviada'];
export const CERRADOS: readonly EstadoCaso[] = ['alta', 'rechazada', 'abandonada'];

/** Acciones que puede pedir Bambú desde este estado. */
export function accionesBambu(estado: EstadoCaso): AccionCaso[] {
  return (Object.keys(TRANSICIONES) as AccionCaso[]).filter(
    (a) => TRANSICIONES[a].quien === 'bambu' && TRANSICIONES[a].desde.includes(estado),
  );
}
