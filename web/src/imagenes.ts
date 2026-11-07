// Reducir las fotos en el navegador antes de subirlas (lección de happydog:
// la espera era la subida del original de 4-6 MB por el móvil, no el
// servidor). Lo usan el hilo y los documentos del caso.

/** A partir de este peso se reduce; por debajo se sube tal cual. */
export const REDUCIR_DESDE = 1.5 * 1024 * 1024;
/** Lado mayor tras reducir: el servidor hace la miniatura a 480 px. */
const LADO_MAXIMO = 1600;

/** Una foto grande se reduce a 1600 px en JPEG; si algo falla, va el original. */
export async function reducir(fichero: File): Promise<{ datos: Blob; nombre: string }> {
  if (!fichero.type.startsWith('image/') || fichero.size < REDUCIR_DESDE) return { datos: fichero, nombre: fichero.name };
  try {
    const imagen = await createImageBitmap(fichero);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    imagen.close();
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return { datos: fichero, nombre: fichero.name };
    return { datos: blob, nombre: fichero.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch {
    return { datos: fichero, nombre: fichero.name };
  }
}

/** Vista previa local de una imagen (hay que liberarla con `URL.revokeObjectURL`). */
export const vistaPrevia = (fichero: File) => (fichero.type.startsWith('image/') ? URL.createObjectURL(fichero) : null);

export const tamano = (bytes: number | null) =>
  bytes === null ? '' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`;

/** Lo que admite el selector de ficheros (el servidor decide por el contenido). */
export const ACEPTADOS = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.zip,image/*,application/pdf';
