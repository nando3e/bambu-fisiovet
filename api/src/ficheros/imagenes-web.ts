// Las fotos de la web pública (portada e instalaciones), que Bambú puede
// cambiar desde el panel. No son datos clínicos: se sirven públicamente.
//
// El tipo se decide por el contenido del fichero, no por su extensión ni por
// lo que diga el navegador: un .exe renombrado a .jpg no pasa.

export const HUECOS = ['portada', 'instalaciones'] as const;
export type Hueco = (typeof HUECOS)[number];
export type TipoImagen = 'jpg' | 'png' | 'webp';

export const TAMANO_MAXIMO = 8 * 1024 * 1024;

export const MIME: Record<TipoImagen, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Nombre con el que se guarda: hueco + aleatorio + extensión. Solo estos se sirven. */
export const NOMBRE_VALIDO = /^(portada|instalaciones)-[a-f0-9]{16}\.(jpg|png|webp)$/;

export function esHueco(valor: string): valor is Hueco {
  return (HUECOS as readonly string[]).includes(valor);
}

export function tipoDeImagen(datos: Buffer): TipoImagen | null {
  if (datos.length >= 3 && datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return 'jpg';
  if (datos.length >= 8 && datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (datos.length >= 12 && datos.toString('ascii', 0, 4) === 'RIFF' && datos.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}
