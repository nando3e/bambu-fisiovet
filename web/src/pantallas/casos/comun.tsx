// Lo que comparten las pantallas de casos: tipos de las respuestas, el chip de
// estado y los nombres de especie y sexo.
import { t, type ClaveTexto } from '../../i18n/index.ts';
import type { EstadoCaso } from '../../estados.ts';

export interface CasoLista {
  id: number;
  estado: EstadoCaso;
  enviado_el: string | null;
  ultima_actividad: string;
  vista: boolean;
  registrada: boolean;
  paciente: string;
  especie: string | null;
  especie_otra: string | null;
  propietario: string;
  clinica_id: number;
  clinica: string;
  derivador: string | null;
  fisio: string | null;
  atascado: boolean;
  no_leidas: number;
}

export interface DatosPaciente {
  nombre: string;
  especie: string | null;
  especie_otra: string | null;
  raza: string | null;
  sexo: string | null;
  esterilizado: boolean | null;
  fecha_nacimiento: string | null;
  edad_texto: string | null;
  peso_kg: number | null;
}

export interface DatosPropietario {
  nombre: string;
  telefono: string | null;
  email: string | null;
}

export interface DatosDerivacion {
  motivo: string;
  tratamiento_actual: string;
}

export interface Ficha extends DatosDerivacion {
  id: number;
  // Campos que la derivación ya no pide: solo los tienen los casos antiguos y
  // la ficha los enseña si hay algo.
  historia_clinica: string;
  objetivos: string;
  notas_derivador: string;
  estado: EstadoCaso;
  clinica: { id: number; nombre: string };
  derivador: { id: number; nombre: string } | null;
  derivador_nombre: string | null;
  registrado_por: { id: number; nombre: string } | null;
  fisio: { id: number; nombre: string } | null;
  motivo_cierre: string | null;
  descartado: boolean;
  enviado_el: string | null;
  resuelto_el: string | null;
  vista_el: string | null;
  vista_por: string | null;
  en_tratamiento_el: string | null;
  primera_visita: string | null;
  cerrado_el: string | null;
  ultima_actividad: string;
  atascado: boolean;
  no_leidas: number;
  paciente: DatosPaciente & { id: number };
  propietario: DatosPropietario & { id: number };
  consentimiento_vigente: boolean;
  otros_casos: { id: number; estado: EstadoCaso; enviado_el: string | null; creado: string }[];
}

export const ESPECIES = ['perro', 'gato', 'conejo', 'ave', 'otro'] as const;
export const SEXOS = ['macho', 'hembra', 'desconocido'] as const;

export function nombreEspecie(especie: string | null, otra: string | null): string {
  if (!especie) return '';
  if (especie === 'otro' && otra) return otra;
  return t(`especie.${especie}` as ClaveTexto);
}

/** El veterinario ve «Enviada» y «Acceptada»; Bambú, «Nova» y «Pendent de cita». */
export function nombreEstado(estado: EstadoCaso, paraDerivador: boolean): string {
  if (paraDerivador && estado === 'enviada') return t('estado.enviadaDerivador');
  if (paraDerivador && estado === 'aceptada') return t('estado.aceptadaDerivador');
  return t(`estado.${estado}` as ClaveTexto);
}

const CLASE: Record<EstadoCaso, string> = {
  borrador: 'chip gris',
  enviada: 'chip atencion',
  aceptada: 'chip atencion',
  en_tratamiento: 'chip',
  alta: 'chip',
  rechazada: 'chip error',
  abandonada: 'chip gris',
};

export function ChipEstado({ estado, paraDerivador }: { estado: EstadoCaso; paraDerivador: boolean }) {
  return <span className={CLASE[estado]}>{nombreEstado(estado, paraDerivador)}</span>;
}

/** «2026-11-04» → «04/11/2026», sin pasar por Date (no se corre un día). */
export function fechaCorta(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
