// Contrato propio con los modelos: la app no conoce a ningún proveedor, solo
// esto. Sin bucle de agente: el informe es una llamada con salida estructurada.

export interface PeticionInforme {
  sistema: string;
  texto: string;
  /** JSON schema estricto de la respuesta. */
  esquema: Record<string, unknown>;
  nombreEsquema: string;
}

export interface RespuestaModelo {
  datos: unknown;
  modelo: string;
  latenciaMs: number;
}

export interface RedactorInforme {
  redactar(p: PeticionInforme): Promise<RespuestaModelo>;
}

export interface PeticionTranscripcion {
  audio: Buffer;
  nombre: string;
  mime: string;
  /** Palabras que ayudan al transcriptor: paciente, raza, términos del oficio. */
  vocabulario: string;
}

export interface Transcriptor {
  transcribir(p: PeticionTranscripcion): Promise<{ texto: string; modelo: string; latenciaMs: number }>;
}

export type MotivoError = 'rechazo' | 'respuesta_invalida' | 'servicio';

/** Un fallo del modelo con su motivo, para enseñar un mensaje claro. */
export class ErrorModelo extends Error {
  readonly motivo: MotivoError;

  constructor(motivo: MotivoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorModelo';
    this.motivo = motivo;
  }
}
