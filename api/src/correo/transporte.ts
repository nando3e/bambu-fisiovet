// El canal de correo real: SMTP con la configuración que el superadmin guarda
// en el panel (Dondominio). Se lee en cada envío y el transporte se rehace si
// la configuración cambió, así un cambio en el panel vale sin reiniciar.
//
// Nunca lanza: devuelve qué pasó. `omitido` = no se debía enviar (SMTP sin
// configurar); `error` = se intentó y falló (la cola reintentará).
import { createHash } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
import type { Config } from '../config.ts';
import { descifrar } from '../cifrado.ts';
import { leerConfiguracion, type ValorConfig } from '../configuracion.ts';
import type { Consultable } from '../db/pool.ts';

export interface MensajeCorreo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

export type ResultadoCanal =
  | { resultado: 'enviado' }
  | { resultado: 'omitido'; motivo: string }
  | { resultado: 'error'; motivo: string };

export interface CanalCorreo {
  enviar(mensaje: MensajeCorreo): Promise<ResultadoCanal>;
}

type ServidorCorreo = ValorConfig<'correo_servidor'>;

export function servidorCompleto(s: ServidorCorreo): boolean {
  return Boolean(s.host && s.usuario && s.contrasena_cifrada && s.remitente_email);
}

export function crearTransporte(s: ServidorCorreo, contrasena: string): Transporter {
  return createTransport({
    host: s.host,
    port: s.puerto,
    // SSL = TLS desde el principio (465); STARTTLS negocia sobre la conexión (587).
    secure: s.seguridad === 'ssl',
    requireTLS: s.seguridad === 'starttls',
    auth: { user: s.usuario, pass: contrasena },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

export async function enviarCon(
  transporte: Pick<Transporter, 'sendMail'>,
  s: ServidorCorreo,
  mensaje: MensajeCorreo,
): Promise<ResultadoCanal> {
  try {
    await transporte.sendMail({
      from: { name: s.remitente_nombre, address: s.remitente_email },
      to: mensaje.para,
      subject: mensaje.asunto.slice(0, 200),
      text: mensaje.texto,
      html: mensaje.html,
    });
    return { resultado: 'enviado' };
  } catch (error) {
    return { resultado: 'error', motivo: `SMTP: ${(error as Error).message}`.slice(0, 500) };
  }
}

export function canalSmtp(bd: Consultable, config: Config): CanalCorreo {
  let huella = '';
  let transporte: Transporter | null = null;

  return {
    async enviar(mensaje) {
      const servidor = await leerConfiguracion(bd, 'correo_servidor');
      if (!servidorCompleto(servidor)) return { resultado: 'omitido', motivo: 'smtp sin configurar' };
      const contrasena = descifrar(servidor.contrasena_cifrada, config.CLAVE_CIFRADO);
      if (contrasena === null) {
        return { resultado: 'omitido', motivo: 'smtp sin configurar (no se puede descifrar la contraseña)' };
      }
      const nueva = createHash('sha256').update(JSON.stringify(servidor)).digest('hex');
      if (!transporte || nueva !== huella) {
        transporte?.close();
        transporte = crearTransporte(servidor, contrasena);
        huella = nueva;
      }
      return enviarCon(transporte, servidor, mensaje);
    },
  };
}
