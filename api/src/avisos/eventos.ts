// Catálogo cerrado de eventos de dominio.
//
// Cada evento tiene una audiencia fija (a quién puede avisar), los valores por
// defecto de la matriz y los textos de la notificación en valenciano. La lista
// tiene que coincidir con el CHECK de la migración 004; un test lo comprueba.
import type { Rol } from '../auth/sesion.ts';

export type Audiencia = 'bambu' | 'derivador' | 'ambas';
export type DatosEvento = Record<string, string | number | boolean | null | undefined>;

interface DefEvento {
  audiencia: Audiencia;
  notificacion: boolean;
  correo: boolean;
  plantilla: string;
  titulo: (d: DatosEvento) => string;
  cuerpo: (d: DatosEvento) => string;
  enlace: (d: DatosEvento, rol: Rol) => string;
  /** En el lado Bambú solo avisa al fisio responsable (y a nadie si no hay). */
  soloFisio?: boolean;
  /** No manda otro correo a quien ya tiene una notificación sin leer del caso. */
  antiRuido?: boolean;
}

const paciente = (d: DatosEvento) => String(d.paciente ?? 'el pacient');
const nombre = (d: DatosEvento) => String(d.nombre ?? 'Una persona');
const clinica = (d: DatosEvento) => String(d.clinica ?? 'la clínica');
const enlaceCaso = (d: DatosEvento, rol: Rol) =>
  rol === 'derivador' ? `/d/casos/${d.casoId}` : `/b/casos/${d.casoId}`;

export const CATALOGO = {
  'derivacion.enviada': {
    audiencia: 'bambu', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `Nova derivació: ${paciente(d)}`,
    cuerpo: (d) => `${clinica(d)} ha derivat un cas.`,
    enlace: enlaceCaso,
  },
  'derivacion.aceptada': {
    audiencia: 'derivador', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `Derivació acceptada: ${paciente(d)}`,
    cuerpo: () => 'Bambú ha acceptat el cas.',
    enlace: enlaceCaso,
  },
  'derivacion.rechazada': {
    audiencia: 'derivador', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `Derivació no acceptada: ${paciente(d)}`,
    cuerpo: (d) => (d.motivo ? `Motiu: ${d.motivo}` : 'Bambú no ha acceptat el cas.'),
    enlace: enlaceCaso,
  },
  'caso.fisio_asignado': {
    audiencia: 'bambu', notificacion: true, correo: false, plantilla: 'aviso', soloFisio: true,
    titulo: (d) => `T'han assignat un cas: ${paciente(d)}`,
    cuerpo: (d) => `Derivat per ${clinica(d)}.`,
    enlace: enlaceCaso,
  },
  'caso.en_tratamiento': {
    audiencia: 'derivador', notificacion: true, correo: false, plantilla: 'aviso',
    titulo: (d) => `${paciente(d)} ha començat el tractament`,
    cuerpo: (d) => (d.primeraVisita ? `Primera visita: ${d.primeraVisita}.` : 'Ja té cita a Bambú.'),
    enlace: enlaceCaso,
  },
  'caso.alta': {
    audiencia: 'derivador', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `${paciente(d)} ha rebut l'alta`,
    cuerpo: () => 'El tractament ha acabat.',
    enlace: enlaceCaso,
  },
  'caso.abandonado': {
    audiencia: 'derivador', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `Cas tancat: ${paciente(d)}`,
    cuerpo: (d) => (d.motivo ? `Motiu: ${d.motivo}` : 'Bambú ha tancat el cas.'),
    enlace: enlaceCaso,
  },
  'mensaje.nuevo': {
    audiencia: 'ambas', notificacion: true, correo: true, plantilla: 'aviso', antiRuido: true,
    titulo: (d) => `Missatge nou: ${paciente(d)}`,
    cuerpo: (d) => `${nombre(d)} ha escrit al fil del cas.`,
    enlace: enlaceCaso,
  },
  'adjunto.nuevo': {
    audiencia: 'ambas', notificacion: true, correo: true, plantilla: 'aviso', antiRuido: true,
    titulo: (d) => `Document nou: ${paciente(d)}`,
    cuerpo: (d) => `${nombre(d)} ha afegit un document al cas.`,
    enlace: enlaceCaso,
  },
  'informe.publicado': {
    audiencia: 'derivador', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `Informe nou: ${paciente(d)}`,
    cuerpo: (d) => `Bambú ha publicat un informe${d.tipoInforme ? ` de ${d.tipoInforme}` : ''}.`,
    enlace: enlaceCaso,
  },
  'paciente.ficha_modificada': {
    audiencia: 'ambas', notificacion: true, correo: false, plantilla: 'aviso', antiRuido: true,
    titulo: (d) => `Fitxa actualitzada: ${paciente(d)}`,
    cuerpo: (d) => `${nombre(d)} ha canviat dades de la fitxa.`,
    enlace: enlaceCaso,
  },
  'usuario.derivador_alta': {
    audiencia: 'bambu', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `Nou veterinari: ${nombre(d)}`,
    cuerpo: (d) => `S'ha donat d'alta des de ${clinica(d)}.`,
    enlace: () => '/b/cliniques',
  },
  'usuario.bambu_alta': {
    audiencia: 'bambu', notificacion: true, correo: false, plantilla: 'aviso',
    titulo: (d) => `${nombre(d)} s'ha incorporat a l'equip`,
    cuerpo: () => 'Ja pot entrar al panell de Bambú.',
    enlace: () => '/b/configuracio/equip',
  },
  'caso.sin_noticias': {
    audiencia: 'bambu', notificacion: true, correo: true, plantilla: 'aviso',
    titulo: (d) => `Pendent de cita: ${paciente(d)}`,
    cuerpo: (d) => `Fa més de ${String(d.dias ?? 'uns')} dies que està acceptada i encara no té cita.`,
    enlace: enlaceCaso,
  },
} as const satisfies Record<string, DefEvento>;

export type TipoEvento = keyof typeof CATALOGO;

export const TIPOS_EVENTO = Object.keys(CATALOGO) as TipoEvento[];

export function definicion(tipo: TipoEvento): DefEvento {
  return CATALOGO[tipo] as DefEvento;
}

export function esTipoEvento(tipo: string): tipo is TipoEvento {
  return Object.prototype.hasOwnProperty.call(CATALOGO, tipo);
}

/** Si el lado Bambú de este evento admite «Correu a» (dirección propia). */
export function admiteCorreoA(tipo: TipoEvento): boolean {
  return definicion(tipo).audiencia !== 'derivador';
}
