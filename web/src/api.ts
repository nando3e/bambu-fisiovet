// Cliente del API. Una sola forma de llamar: api.get/post/put/patch con la
// ruta escrita entera (scripts/rutas-api.mjs comprueba que existe en el API).
import { t } from './i18n/index.ts';

export class ErrorApi extends Error {
  readonly estado: number;
  readonly campos: Record<string, string> | undefined;

  constructor(estado: number, mensaje: string, campos?: Record<string, string>) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.campos = campos;
  }
}

/** Se lanza cuando una llamada privada responde 401: la sesión ya no vale. */
export const EVENTO_SESION_CADUCADA = 'bambu:sesion-caducada';

async function peticion<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response;
  // Un FormData (subida de ficheros) va tal cual: el navegador pone el límite.
  const esFormulario = cuerpo instanceof FormData;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined || esFormulario ? {} : { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : esFormulario ? cuerpo : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, t('comun.sinConexion'));
  }
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok) {
    if (respuesta.status === 401 && !ruta.startsWith('/auth/')) {
      window.dispatchEvent(new Event(EVENTO_SESION_CADUCADA));
    }
    const mensaje = String(datos.error ?? datos.message ?? t('comun.errorGenerico'));
    throw new ErrorApi(respuesta.status, mensaje, datos.campos as Record<string, string> | undefined);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => peticion<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo: unknown = {}) => peticion<T>('POST', ruta, cuerpo),
  put: <T>(ruta: string, cuerpo: unknown) => peticion<T>('PUT', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown) => peticion<T>('PATCH', ruta, cuerpo),
  delete: <T>(ruta: string) => peticion<T>('DELETE', ruta),
  /** Sube un fichero (POST multipart). */
  /** Los campos van antes que el fichero: el servidor los lee al leer el fichero. */
  subir: <T>(ruta: string, fichero: File | Blob, campo = 'fichero', campos: Record<string, string> = {}, nombre?: string) => {
    const datos = new FormData();
    for (const [k, v] of Object.entries(campos)) datos.append(k, v);
    if (nombre) datos.append(campo, fichero, nombre);
    else datos.append(campo, fichero);
    return peticion<T>('POST', ruta, datos);
  },
};

/** El mensaje que se enseña de cualquier error. */
export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : t('comun.errorGenerico');
}

// --- Tipos de las respuestas que usa más de una pantalla ---

export type Rol = 'superadmin' | 'bambu' | 'derivador';

export interface Usuario {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  telefono: string | null;
  num_colegiado: string | null;
  rol: Rol;
  recibe_correos: boolean;
  es_de_entorno: boolean;
  clinica: { id: number; nombre: string } | null;
}

export interface Notificacion {
  id: number;
  titulo: string;
  cuerpo: string;
  enlace: string;
  caso_id: number | null;
  creado: string;
  leida_el: string | null;
  tipo: string;
}

export interface ClinicaSugerida {
  id: number;
  nombre: string;
  poblacion: string | null;
  mismo_dominio: boolean;
}
