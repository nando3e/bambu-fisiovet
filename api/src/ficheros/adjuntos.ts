// Adjuntos del hilo: qué se acepta y cómo se reconoce. Puro: decide por los
// primeros bytes del fichero, nunca por lo que diga el navegador. La
// extensión solo distingue entre formatos que por dentro son un ZIP.

export const TAMANO_MAXIMO_ADJUNTO = 12 * 1024 * 1024;

export type TipoAdjunto = 'pdf' | 'jpg' | 'png' | 'webp' | 'doc' | 'docx' | 'xlsx' | 'zip';

export const MIME_ADJUNTO: Record<TipoAdjunto, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

const empieza = (datos: Buffer, bytes: number[]) =>
  datos.length >= bytes.length && bytes.every((b, i) => datos[i] === b);

const extension = (nombre: string) => nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

/** El tipo real del fichero, o null si no es de los admitidos. */
export function tipoDeAdjunto(datos: Buffer, nombreOriginal: string): TipoAdjunto | null {
  if (empieza(datos, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (empieza(datos, [0xff, 0xd8, 0xff])) return 'jpg';
  if (empieza(datos, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (datos.length >= 12 && datos.toString('ascii', 0, 4) === 'RIFF' && datos.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (empieza(datos, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    // Contenedor OLE: el Word antiguo. Solo con su extensión.
    return extension(nombreOriginal) === 'doc' ? 'doc' : null;
  }
  if (empieza(datos, [0x50, 0x4b, 0x03, 0x04])) {
    const ext = extension(nombreOriginal);
    return ext === 'docx' || ext === 'xlsx' || ext === 'zip' ? ext : null;
  }
  return null;
}

export const esImagen = (tipo: TipoAdjunto) => tipo === 'jpg' || tipo === 'png' || tipo === 'webp';

/** Lo que se ve en el navegador sin descargar: imágenes y PDF. */
export const seMuestraEnLinea = (tipo: TipoAdjunto) => esImagen(tipo) || tipo === 'pdf';

/** Nombre original sin rutas ni caracteres que rompan la cabecera. */
export function nombreSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? 'fitxer';
  const limpio = base.replace(/[\u0000-\u001f"\\]/g, '').trim().slice(0, 150);
  return limpio || 'fitxer';
}
