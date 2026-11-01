// Redactor de informes con Claude (SDK oficial). Una sola llamada con salida
// estructurada y JSON schema estricto: los modelos actuales rechazan forzar
// una herramienta (400), y la salida estructurada da la misma garantía de
// forma. Un rechazo de política se reintenta en el servidor con el modelo de
// respaldo que él decide (`fallbacks: "default"`).
import Anthropic from '@anthropic-ai/sdk';
import { ErrorModelo, type PeticionInforme, type RedactorInforme, type RespuestaModelo } from './tipos.ts';

export function redactorAnthropic(apiKey: string, modelo: string): RedactorInforme {
  const cliente = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  return {
    async redactar(p: PeticionInforme): Promise<RespuestaModelo> {
      const inicio = Date.now();
      let respuesta;
      try {
        respuesta = await cliente.beta.messages.create({
          model: modelo,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: p.sistema,
          messages: [{ role: 'user', content: p.texto }],
          output_config: { format: { type: 'json_schema', schema: p.esquema } },
        });
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          throw new ErrorModelo('servicio', `El servei de redacció ha fallat (${error.status ?? 'sense resposta'}).`);
        }
        throw new ErrorModelo('servicio', 'No s’ha pogut contactar amb el servei de redacció.');
      }
      if (respuesta.stop_reason === 'refusal') {
        throw new ErrorModelo('rechazo', 'El model no ha volgut redactar aquest informe. Redacta’l a mà.');
      }
      if (respuesta.stop_reason === 'max_tokens') {
        throw new ErrorModelo('respuesta_invalida', 'L’informe ha quedat tallat. Torna-ho a provar amb instruccions més breus.');
      }
      const texto = respuesta.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      let datos: unknown;
      try {
        datos = JSON.parse(texto);
      } catch {
        throw new ErrorModelo('respuesta_invalida', 'La resposta del model no és vàlida. Torna-ho a provar.');
      }
      return { datos, modelo: respuesta.model, latenciaMs: Date.now() - inicio };
    },
  };
}
