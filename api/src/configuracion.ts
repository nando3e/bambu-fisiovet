// Configuración de negocio en la base: clave → valor validado por zod.
//
// Se lee en cada uso, sin caché: un cambio en el panel vale en la siguiente
// petición. La semilla crea los valores por defecto y nunca pisa lo editado.
import { z } from 'zod';
import type { Consultable } from './db/pool.ts';
import { registrarCambio } from './db/historial.ts';
import { datosIncorrectos } from './errores.ts';

const textoOpcional = z.string().trim().max(300).default('');
const telefono = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === '' || /^[+\d][\d\s().-]{5,}$/.test(v), 'Telèfon no vàlid')
  .default('');
const correoOpcional = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Correu no vàlid')
  .default('');
const urlOpcional = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//.test(v), 'Ha de començar per https://')
  .default('');

/** Texto provisional del consentimiento, hasta que Bambú y su asesor den el bueno. */
export const CONSENTIMIENTO_PROVISIONAL =
  "El propietari autoritza BAMBÚ Fisiovet a tractar les seues dades de contacte i les del seu animal " +
  "per a atendre la derivació, fer-ne el seguiment i informar el veterinari que l'ha derivat. " +
  "Pot exercir els seus drets d'accés, rectificació i supressió escrivint a BAMBÚ Fisiovet.";

export const ESQUEMAS = {
  contacto: z.object({
    email: correoOpcional,
    telefono,
    direccion: textoOpcional,
    horario: textoOpcional,
    maps_url: urlOpcional,
    instagram: urlOpcional,
  }),
  avisos: z.object({
    correo_centro: correoOpcional,
    dias_sin_noticias: z.coerce.number().int().min(1).max(60).default(7),
    // Días que una derivación puede estar aceptada sin cita antes de avisar.
    dias_pendiente_cita: z.coerce.number().int().min(1).max(60).default(3),
  }),
  retencion: z.object({
    audio_dias: z.coerce.number().int().min(1).max(365).default(30),
  }),
  // Nombre del fichero subido para cada foto de la web; vacío = la de serie.
  imagenes_web: z.object({
    portada: z.string().default(''),
    instalaciones: z.string().default(''),
  }),
  // La versión la lleva el servidor: sube sola cuando cambia el texto, y un
  // propietario con una versión anterior vuelve a dar el consentimiento.
  consentimiento: z.object({
    texto: z.string().trim().min(20, 'El text és massa curt').max(4000).default(CONSENTIMIENTO_PROVISIONAL),
    version: z.coerce.number().int().min(1).default(1),
  }),
  // Claves y modelos de IA. Las claves van cifradas con CLAVE_CIFRADO y nunca
  // salen por la API: las rutas las sustituyen por un booleano.
  ia: z.object({
    anthropic_cifrada: z.string().default(''),
    openai_cifrada: z.string().default(''),
    modelo_informe: z.string().trim().min(1).max(80).default('claude-sonnet-5-5'),
    modelo_informe_openai: z.string().trim().min(1).max(80).default('gpt-4.1'),
    modelo_transcripcion: z.string().trim().min(1).max(80).default('whisper-1'),
  }),
  correo_servidor: z.object({
    host: z.string().trim().max(200).default(''),
    puerto: z.coerce.number().int().min(1).max(65535).default(587),
    seguridad: z.enum(['starttls', 'ssl']).default('starttls'),
    usuario: z.string().trim().max(200).default(''),
    // Nunca sale por la API: las rutas la sustituyen por un booleano.
    contrasena_cifrada: z.string().default(''),
    remitente_nombre: z.string().trim().max(100).default('BAMBÚ Fisiovet'),
    remitente_email: correoOpcional,
  }),
} as const;

export type ClaveConfig = keyof typeof ESQUEMAS;
export type ValorConfig<C extends ClaveConfig> = z.infer<(typeof ESQUEMAS)[C]>;

export const CLAVES = Object.keys(ESQUEMAS) as ClaveConfig[];

export async function sembrarConfiguracion(bd: Consultable): Promise<void> {
  for (const clave of CLAVES) {
    const porDefecto = ESQUEMAS[clave].parse({});
    await bd.query(
      'INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING',
      [clave, JSON.stringify(porDefecto)],
    );
  }
}

export async function leerConfiguracion<C extends ClaveConfig>(
  bd: Consultable,
  clave: C,
): Promise<ValorConfig<C>> {
  const { rows } = await bd.query<{ valor: unknown }>(
    'SELECT valor FROM configuracion WHERE clave = $1',
    [clave],
  );
  // Lo guardado pasa otra vez por el esquema: si se añadió un campo nuevo, sale
  // con su valor por defecto en vez de undefined.
  const resultado = ESQUEMAS[clave].safeParse(rows[0]?.valor ?? {});
  if (!resultado.success) {
    // Lo guardado ya no cumple el esquema (se endureció después): se usan los
    // valores por defecto, pero que quede escrito; si no, la web pierde datos
    // sin que nadie sepa por qué.
    console.warn(`Configuración «${clave}» no válida; se usan los valores por defecto:`,
      JSON.stringify(resultado.error.issues));
  }
  return (resultado.success ? resultado.data : ESQUEMAS[clave].parse({})) as ValorConfig<C>;
}

/** Valida y guarda. Lanza 400 con el detalle si el valor no vale. */
export async function guardarConfiguracion<C extends ClaveConfig>(
  bd: Consultable,
  clave: C,
  valor: unknown,
  usuarioId: number,
  paraHistorial?: (v: ValorConfig<C>) => unknown,
): Promise<ValorConfig<C>> {
  const resultado = ESQUEMAS[clave].safeParse(valor);
  if (!resultado.success) {
    const campos = Object.fromEntries(
      resultado.error.issues.map((i) => [i.path.join('.') || clave, i.message]),
    );
    throw datosIncorrectos('Hi ha dades que no són vàlides', { campos });
  }
  const antes = await leerConfiguracion(bd, clave);
  let nuevo = resultado.data as ValorConfig<C>;
  if (clave === 'consentimiento') {
    const a = antes as ValorConfig<'consentimiento'>;
    const n = nuevo as ValorConfig<'consentimiento'>;
    nuevo = { texto: n.texto, version: n.texto === a.texto ? a.version : a.version + 1 } as ValorConfig<C>;
  }
  await bd.query(
    `INSERT INTO configuracion (clave, valor, actualizado, actualizado_por)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (clave) DO UPDATE
       SET valor = EXCLUDED.valor, actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`,
    [clave, JSON.stringify(nuevo), usuarioId],
  );
  const vista = paraHistorial ?? ((v: ValorConfig<C>) => v);
  await registrarCambio(bd, {
    tabla: 'configuracion',
    filaId: clave,
    antes: vista(antes),
    despues: vista(nuevo),
    usuarioId,
  });
  return nuevo;
}
