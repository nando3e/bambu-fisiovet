// Configuración del proceso. Todo lo que viene del entorno pasa por zod: una
// variable mal puesta revienta al arrancar con un mensaje claro, no a mitad
// de una petición.
//
// Aquí solo va lo que cambia al desplegar. Lo que decide el negocio (contacto,
// avisos, servidor de correo) vive en la tabla `configuracion` y se edita desde
// el panel.
import { z } from 'zod';

const booleano = z
  .enum(['true', 'false', '1', '0', ''])
  .transform((v) => v === 'true' || v === '1');

const esquema = z.object({
  DATABASE_URL: z
    .string({ required_error: 'falta DATABASE_URL' })
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL debe empezar por postgres:// o postgresql://',
    }),
  PUERTO_API: z.coerce.number().int().positive().default(8105),
  SECRETO_SESION: z
    .string({ required_error: 'falta SECRETO_SESION' })
    .min(16, 'SECRETO_SESION debe tener al menos 16 caracteres'),
  // Cifra la contraseña del SMTP que se guarda en la base. Si se pierde, la
  // contraseña deja de descifrarse y basta con volver a escribirla en el panel.
  CLAVE_CIFRADO: z
    .string({ required_error: 'falta CLAVE_CIFRADO' })
    .min(16, 'CLAVE_CIFRADO debe tener al menos 16 caracteres'),
  URL_PUBLICA: z
    .string({ required_error: 'falta URL_PUBLICA' })
    .url('URL_PUBLICA debe ser una URL completa, con https://')
    .transform((v) => v.replace(/\/+$/, '')),

  // Cuenta de servicio. La contraseña va en claro (decisión de Nando): se
  // compara contra esta variable en cada login, así que cambiarla y reiniciar
  // es la forma de recuperar el acceso. Sin contraseña no hay superadmin.
  SUPERADMIN_USUARIO: z.string().min(1).max(60).default('superadmin'),
  SUPERADMIN_CONTRASENA: z
    .union([
      z.literal('').transform(() => undefined),
      z.string().min(8, 'SUPERADMIN_CONTRASENA debe tener al menos 8 caracteres'),
    ])
    .optional(),

  // Si es true no sale ningún correo aunque el panel tenga el SMTP configurado.
  // Nace en true: activar los envíos es una decisión explícita.
  CORREO_DRY_RUN: booleano.default('true'),
  COOKIE_SEGURA: booleano.default('false'),
  RUTA_DATOS: z.string().min(1).default('./datos'),
  // Intentos por minuto y dirección en las rutas públicas de acceso.
  LIMITE_INTENTOS: z.coerce.number().int().positive().default(10),
  NIVEL_LOG: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // La cola de correos en segundo plano. Los tests la apagan y la llaman a mano.
  COLA_ACTIVA: booleano.default('true'),
  // Respaldo de las claves de IA: las del panel (solo superadmin, cifradas)
  // mandan. Sin ninguna, la app funciona igual con los informes a mano.
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof esquema>;

export function leerConfig(entorno: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(entorno);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${detalle}`);
  }
  return resultado.data;
}
