// Proveedor de reserva para el informe y transcriptor de las notas de voz
// (Whisper, en catalán: no distingue el valenciano).
import OpenAI, { toFile } from 'openai';
import {
  ErrorModelo, type PeticionInforme, type PeticionTranscripcion, type RedactorInforme, type RespuestaModelo,
  type Transcriptor,
} from './tipos.ts';

const cliente = (apiKey: string) => new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });

export function redactorOpenai(apiKey: string, modelo: string): RedactorInforme {
  const c = cliente(apiKey);
  return {
    async redactar(p: PeticionInforme): Promise<RespuestaModelo> {
      const inicio = Date.now();
      let respuesta;
      try {
        respuesta = await c.chat.completions.create({
          model: modelo,
          messages: [{ role: 'system', content: p.sistema }, { role: 'user', content: p.texto }],
          response_format: { type: 'json_schema', json_schema: { name: p.nombreEsquema, strict: true, schema: p.esquema } },
        });
      } catch {
        throw new ErrorModelo('servicio', 'El servei de redacció ha fallat. Torna-ho a provar.');
      }
      const eleccion = respuesta.choices[0];
      if (eleccion?.message.refusal) {
        throw new ErrorModelo('rechazo', 'El model no ha volgut redactar aquest informe. Redacta’l a mà.');
      }
      let datos: unknown;
      try {
        datos = JSON.parse(eleccion?.message.content ?? '');
      } catch {
        throw new ErrorModelo('respuesta_invalida', 'La resposta del model no és vàlida. Torna-ho a provar.');
      }
      return { datos, modelo: respuesta.model, latenciaMs: Date.now() - inicio };
    },
  };
}

export function transcriptorOpenai(apiKey: string, modelo: string): Transcriptor {
  const c = cliente(apiKey);
  return {
    async transcribir(p: PeticionTranscripcion) {
      const inicio = Date.now();
      try {
        const r = await c.audio.transcriptions.create({
          model: modelo,
          file: await toFile(p.audio, p.nombre, { type: p.mime }),
          language: 'ca',
          prompt: p.vocabulario,
        });
        return { texto: r.text.trim(), modelo, latenciaMs: Date.now() - inicio };
      } catch {
        throw new ErrorModelo('servicio', 'El servei de transcripció no respon. L’àudio s’ha guardat: torna-ho a provar.');
      }
    },
  };
}
