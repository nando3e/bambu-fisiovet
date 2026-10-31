// Qué pasa cuando un veterinario pide unirse a una clínica. Decisión pura, sin
// base: la ruta le pasa los datos y aplica lo que salga.
import { dominioDeClinica } from './dominios-genericos.ts';

export type DecisionUnion =
  /** El dominio del correo es el de la clínica: se une al momento. */
  | 'auto'
  /** Hace falta que un compañero o Bambú lo apruebe. */
  | 'pendiente'
  /** Su clínica ya tiene compañeros: moverlo a él solo los dejaría partidos. */
  | 'no_permitida'
  /** Ya está en esa clínica. */
  | 'misma_clinica';

export interface EntradaUnion {
  emailSolicitante: string;
  clinicaOrigenId: number;
  clinicaDestinoId: number;
  dominioClinicaDestino: string | null;
  /** Usuarios activos de la clínica de origen, contando al solicitante. */
  miembrosClinicaOrigen: number;
}

export function decidirUnion(e: EntradaUnion): DecisionUnion {
  if (e.clinicaOrigenId === e.clinicaDestinoId) return 'misma_clinica';
  if (e.miembrosClinicaOrigen > 1) return 'no_permitida';
  const dominio = dominioDeClinica(e.emailSolicitante);
  if (dominio && e.dominioClinicaDestino && dominio === e.dominioClinicaDestino.toLowerCase()) {
    return 'auto';
  }
  return 'pendiente';
}
