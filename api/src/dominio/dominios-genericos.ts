// Dominios de correo que no identifican a una clínica. Quien entra con uno de
// estos no se une a nada sin aprobación: dos veterinarios con Gmail no tienen
// por qué ser de la misma clínica.

const GENERICOS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
  'live.com', 'live.es', 'msn.com', 'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.es',
  'telefonica.net', 'movistar.es', 'orange.es', 'vodafone.es', 'yandex.com', 'zoho.com',
  'mail.com', 'tutanota.com',
]);

/** El dominio de un correo, en minúsculas, o null si no tiene forma de correo. */
export function dominioDe(email: string): string | null {
  const arroba = email.lastIndexOf('@');
  if (arroba < 1) return null;
  const dominio = email.slice(arroba + 1).trim().toLowerCase();
  return dominio.includes('.') ? dominio : null;
}

export function esGenerico(dominio: string): boolean {
  return GENERICOS.has(dominio.toLowerCase());
}

/** El dominio que identifica a la clínica, o null si es genérico. */
export function dominioDeClinica(email: string): string | null {
  const dominio = dominioDe(email);
  return dominio && !esGenerico(dominio) ? dominio : null;
}
