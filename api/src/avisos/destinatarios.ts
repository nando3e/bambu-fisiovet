// A quién avisa cada evento. Función pura: recibe los usuarios ya cargados y
// decide, sin base ni red, para poder probar cada audiencia por separado.
//
// Regla que no tiene excepciones: quien provoca el evento nunca se avisa a sí
// mismo.
import type { Rol } from '../auth/sesion.ts';
import { definicion, type TipoEvento } from './eventos.ts';

export interface UsuarioAviso {
  id: number;
  rol: Rol;
  nombre: string;
  email: string | null;
  recibeCorreos: boolean;
}

export interface EntradaDestinatarios {
  tipo: TipoEvento;
  actor: { id: number; rol: Rol } | null;
  /** Usuarios de Bambú activos y verificados. */
  equipoBambu: UsuarioAviso[];
  fisioResponsableId: number | null;
  /** Veterinarios interesados en el evento, activos y verificados. */
  derivadores: UsuarioAviso[];
}

export interface Destinatarios {
  /** Si el evento llega al lado Bambú (aunque la lista de personas quede vacía, el correo del centro sí). */
  ladoBambu: boolean;
  ladoDerivador: boolean;
  bambu: UsuarioAviso[];
  derivadores: UsuarioAviso[];
}

function sinRepetirNiActor(lista: UsuarioAviso[], actorId: number | null): UsuarioAviso[] {
  const vistos = new Set<number>();
  return lista.filter((u) => {
    if (u.id === actorId || vistos.has(u.id)) return false;
    vistos.add(u.id);
    return true;
  });
}

export function resolverDestinatarios(e: EntradaDestinatarios): Destinatarios {
  const def = definicion(e.tipo);
  let ladoBambu = def.audiencia === 'bambu';
  let ladoDerivador = def.audiencia === 'derivador';

  if (def.audiencia === 'ambas') {
    if (!e.actor) {
      ladoBambu = true;
      ladoDerivador = true;
    } else if (e.actor.rol === 'derivador') {
      ladoBambu = true;
    } else {
      ladoDerivador = true;
    }
  }

  // En Bambú se entera todo el equipo, tenga o no el caso fisio responsable
  // (decisión de Nando, 01/11). Solo «T'han assignat un cas» es personal.
  let bambu: UsuarioAviso[] = [];
  if (ladoBambu) {
    bambu = def.soloFisio ? e.equipoBambu.filter((u) => u.id === e.fisioResponsableId) : e.equipoBambu;
  }

  const actorId = e.actor?.id ?? null;
  return {
    ladoBambu,
    ladoDerivador,
    bambu: sinRepetirNiActor(bambu, actorId),
    derivadores: ladoDerivador ? sinRepetirNiActor(e.derivadores, actorId) : [],
  };
}
