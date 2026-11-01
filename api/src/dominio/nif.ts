// CIF/NIF de una clínica: normalizar y validar con su control. Puro, sin base.
//
// Vale el CIF de una sociedad y el NIF de un autónomo (DNI o NIE): muchas
// clínicas pequeñas son de una persona física.

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const LETRAS_CONTROL_CIF = 'JABCDEFGHI';
/** Entidades cuyo control es siempre una letra, o siempre un dígito. */
const CIF_CONTROL_LETRA = 'NPQRSW';
const CIF_CONTROL_DIGITO = 'ABEH';

/** Mayúsculas, sin espacios, puntos ni guiones: «b-12.345.674» → «B12345674». */
export function normalizarNif(texto: string): string {
  return texto.toUpperCase().replace(/[\s.\-]/g, '');
}

function dniValido(numero: string, letra: string): boolean {
  return LETRAS_DNI[Number(numero) % 23] === letra;
}

function cifValido(nif: string): boolean {
  const entidad = nif[0]!;
  const cifras = nif.slice(1, 8);
  const control = nif[8]!;
  let suma = 0;
  for (const [i, c] of [...cifras].entries()) {
    const n = Number(c);
    // Las posiciones impares (1.ª, 3.ª…) se doblan y se suman sus cifras.
    suma += i % 2 === 0 ? Math.floor((n * 2) / 10) + ((n * 2) % 10) : n;
  }
  const digito = (10 - (suma % 10)) % 10;
  const letra = LETRAS_CONTROL_CIF[digito]!;
  if (CIF_CONTROL_LETRA.includes(entidad)) return control === letra;
  if (CIF_CONTROL_DIGITO.includes(entidad)) return control === String(digito);
  return control === letra || control === String(digito);
}

/** Si el texto (ya normalizado o no) es un DNI, NIE o CIF con el control bien. */
export function nifValido(texto: string): boolean {
  const nif = normalizarNif(texto);
  if (/^\d{8}[A-Z]$/.test(nif)) return dniValido(nif.slice(0, 8), nif[8]!);
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) return dniValido(String('XYZ'.indexOf(nif[0]!)) + nif.slice(1, 8), nif[8]!);
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return cifValido(nif);
  return false;
}
