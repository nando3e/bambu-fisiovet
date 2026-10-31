// Contraseñas con scrypt de node:crypto, sin dependencias.
//
// Formato guardado: scrypt$N$r$p$salHex$hashHex. Llevar los parámetros en el
// propio hash permite endurecerlos más adelante sin invalidar los antiguos.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const LONGITUD = 64;

function derivar(contrasena: string, sal: Buffer, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(contrasena, sal, LONGITUD, opciones, (error, clave) => {
      if (error) rechazar(error);
      else resolver(clave);
    });
  });
}

export async function hashearContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(contrasena, sal, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export async function comprobarContrasena(contrasena: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salHex, hashHex] = partes as [string, string, string, string, string, string];
  const esperado = Buffer.from(hashHex, 'hex');
  const obtenido = await derivar(contrasena, Buffer.from(salHex, 'hex'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return esperado.length === obtenido.length && timingSafeEqual(esperado, obtenido);
}

// Un hash de una contraseña que nadie conoce. Cuando el usuario no existe o no
// tiene contraseña se compara contra este, para que la respuesta tarde lo mismo
// y no delate qué correos tienen cuenta.
let ficticio: Promise<string> | null = null;

export async function gastarTiempoComoSiComprobara(contrasena: string): Promise<false> {
  ficticio ??= hashearContrasena(randomBytes(24).toString('hex'));
  await comprobarContrasena(contrasena, await ficticio);
  return false;
}
