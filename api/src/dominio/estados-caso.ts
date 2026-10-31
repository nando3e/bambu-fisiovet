// Máquina de estados del caso. Decisión pura: la ruta pregunta si una acción
// vale desde el estado actual y para quién la pide, y aplica lo que salga.
// La web tiene una copia de la tabla en web/src/estados.ts; un test compara
// las dos.

export const ESTADOS = [
  'borrador', 'enviada', 'aceptada', 'en_tratamiento', 'alta', 'rechazada', 'abandonada',
] as const;
export type EstadoCaso = (typeof ESTADOS)[number];

export const ACCIONES = [
  'enviar', 'descartar', 'aceptar', 'rechazar', 'abandonar', 'alta_manual',
  'iniciar_tratamiento', 'alta_por_informe',
] as const;
export type AccionCaso = (typeof ACCIONES)[number];

export type Actor = 'derivador' | 'bambu' | 'sistema';

interface Transicion {
  desde: readonly EstadoCaso[];
  a: EstadoCaso;
  quien: Actor;
}

/** La tabla de la spec. `descartar` no cambia el estado: marca `descartado_el`. */
export const TRANSICIONES: Record<AccionCaso, Transicion> = {
  enviar: { desde: ['borrador'], a: 'enviada', quien: 'derivador' },
  descartar: { desde: ['borrador'], a: 'borrador', quien: 'derivador' },
  aceptar: { desde: ['enviada'], a: 'aceptada', quien: 'bambu' },
  rechazar: { desde: ['enviada'], a: 'rechazada', quien: 'bambu' },
  abandonar: { desde: ['aceptada', 'en_tratamiento'], a: 'abandonada', quien: 'bambu' },
  alta_manual: { desde: ['en_tratamiento'], a: 'alta', quien: 'bambu' },
  // Las dos del sistema las disparan la primera sesión (change 3) y el
  // informe de alta (change 4).
  iniciar_tratamiento: { desde: ['aceptada'], a: 'en_tratamiento', quien: 'sistema' },
  alta_por_informe: { desde: ['en_tratamiento'], a: 'alta', quien: 'sistema' },
};

export type Decision =
  | { ok: true; a: EstadoCaso }
  /** 403: no le toca a quien lo pide. 409: no vale desde este estado. */
  | { ok: false; codigo: 403 | 409 };

export function decidirTransicion(estado: EstadoCaso, accion: AccionCaso, actor: Actor): Decision {
  const t = TRANSICIONES[accion];
  if (t.quien !== actor) return { ok: false, codigo: 403 };
  if (!t.desde.includes(estado)) return { ok: false, codigo: 409 };
  return { ok: true, a: t.a };
}

/** Estados en los que el veterinario aún puede editar su derivación. */
export const EDITABLE_POR_DERIVADOR: readonly EstadoCaso[] = ['borrador', 'enviada'];

/** Estados de un caso que sigue vivo (para listas y avisos). */
export const ACTIVOS: readonly EstadoCaso[] = ['enviada', 'aceptada', 'en_tratamiento'];
