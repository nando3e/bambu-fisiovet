// Qué hace falta para enviar una derivación. Puro: recibe lo guardado y la
// versión vigente del consentimiento, y dice qué campos faltan. Los
// obligatorios son un supuesto pendiente de Bambú; viven solo aquí.

export interface DatosDerivacion {
  paciente: { nombre: string | null; especie: string | null; especie_otra: string | null };
  propietario: { nombre: string | null; telefono: string | null; consentimiento_version: number | null };
  caso: { motivo: string | null };
}

export type Validacion = { ok: true } | { ok: false; campos: Record<string, string> };

const vacio = (v: string | null | undefined) => !v || v.trim() === '';

/**
 * `aceptaAhora`: quien envía marca la casilla del consentimiento en este
 * momento. Si no, vale el que el propietario ya aceptó, pero solo si es de la
 * versión vigente.
 */
export function validarDerivacion(
  d: DatosDerivacion,
  versionVigente: number,
  aceptaAhora: boolean,
): Validacion {
  const campos: Record<string, string> = {};
  if (vacio(d.paciente.nombre)) campos['paciente.nombre'] = 'Cal el nom del pacient';
  if (vacio(d.paciente.especie)) campos['paciente.especie'] = "Cal l'espècie";
  else if (d.paciente.especie === 'otro' && vacio(d.paciente.especie_otra)) {
    campos['paciente.especie_otra'] = "Escriu quina espècie és";
  }
  if (vacio(d.propietario.nombre)) campos['propietario.nombre'] = 'Cal el nom del propietari';
  if (vacio(d.propietario.telefono)) campos['propietario.telefono'] = 'Cal un telèfon del propietari';
  if (vacio(d.caso.motivo)) campos['caso.motivo'] = 'Cal el motiu de la derivació';
  if (!aceptaAhora && d.propietario.consentimiento_version !== versionVigente) {
    campos.consentimiento = 'Cal el consentiment del propietari';
  }
  return Object.keys(campos).length ? { ok: false, campos } : { ok: true };
}
