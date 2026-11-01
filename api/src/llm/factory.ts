// Qué modelos hay disponibles ahora mismo. Las claves del panel (cifradas,
// solo superadmin) mandan; las del entorno son el respaldo. Se lee en cada
// uso: un cambio en el panel vale sin reiniciar.
import { descifrar } from '../cifrado.ts';
import type { Config } from '../config.ts';
import { leerConfiguracion } from '../configuracion.ts';
import type { Consultable } from '../db/pool.ts';
import { redactorAnthropic } from './anthropic.ts';
import { redactorOpenai, transcriptorOpenai } from './openai.ts';
import type { RedactorInforme, Transcriptor } from './tipos.ts';

export interface ModelosDisponibles {
  redactor: RedactorInforme | null;
  transcriptor: Transcriptor | null;
}

/** Los tests (y quien quiera otro proveedor) inyectan los suyos aquí. */
export interface ModelosInyectados {
  redactor?: RedactorInforme | null;
  transcriptor?: Transcriptor | null;
}

export async function clavesIa(bd: Consultable, config: Config) {
  const ia = await leerConfiguracion(bd, 'ia');
  const anthropic = (ia.anthropic_cifrada && descifrar(ia.anthropic_cifrada, config.CLAVE_CIFRADO)) || config.ANTHROPIC_API_KEY || '';
  const openai = (ia.openai_cifrada && descifrar(ia.openai_cifrada, config.CLAVE_CIFRADO)) || config.OPENAI_API_KEY || '';
  return { ia, anthropic, openai };
}

export async function modelosDisponibles(
  bd: Consultable,
  config: Config,
  inyectados: ModelosInyectados = {},
): Promise<ModelosDisponibles> {
  const { ia, anthropic, openai } = await clavesIa(bd, config);
  const redactor = inyectados.redactor !== undefined ? inyectados.redactor
    : anthropic ? redactorAnthropic(anthropic, ia.modelo_informe)
      : openai ? redactorOpenai(openai, ia.modelo_informe_openai)
        : null;
  const transcriptor = inyectados.transcriptor !== undefined ? inyectados.transcriptor
    : openai ? transcriptorOpenai(openai, ia.modelo_transcripcion)
      : null;
  return { redactor, transcriptor };
}
