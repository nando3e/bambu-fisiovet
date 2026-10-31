// Reglas de la contraseña. Pocas y claras: longitud y que no sea el correo.
// Devuelve el motivo en valenciano (se enseña tal cual) o null si vale.

export const LONGITUD_MINIMA = 10;

export function problemaDeContrasena(contrasena: string, email: string | null): string | null {
  if (contrasena.length < LONGITUD_MINIMA) {
    return `La contrasenya ha de tindre almenys ${LONGITUD_MINIMA} caràcters`;
  }
  if (contrasena.length > 200) return 'La contrasenya és massa llarga';
  if (email && contrasena.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'La contrasenya no pot ser el teu correu';
  }
  return null;
}
