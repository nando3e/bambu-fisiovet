// Cifrado de secretos guardados en la base (hoy, la contraseña del SMTP).
//
// AES-256-GCM: cifra y autentica. La clave sale de CLAVE_CIFRADO por SHA-256
// (así cualquier texto largo vale) y cada cifrado lleva su IV aleatorio, de
// modo que cifrar dos veces lo mismo da textos distintos.
// Formato: v1:iv:tag:dato, todo en base64.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function claveDe(secreto: string): Buffer {
  return createHash('sha256').update(secreto).digest();
}

export function cifrar(texto: string, secreto: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', claveDe(secreto), iv);
  const dato = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), dato.toString('base64')].join(':');
}

/** Devuelve el texto o null si no se puede descifrar (clave cambiada, dato roto). */
export function descifrar(cifrado: string, secreto: string): string | null {
  const partes = cifrado.split(':');
  if (partes.length !== 4 || partes[0] !== 'v1') return null;
  try {
    const [, iv, tag, dato] = partes as [string, string, string, string];
    const descifrador = createDecipheriv('aes-256-gcm', claveDe(secreto), Buffer.from(iv, 'base64'));
    descifrador.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      descifrador.update(Buffer.from(dato, 'base64')),
      descifrador.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
