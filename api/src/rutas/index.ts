import type { FastifyInstance } from 'fastify';
import limitador from '@fastify/rate-limit';
import type { Config } from '../config.ts';
import type { Pool } from '../db/pool.ts';
import type { Cola } from '../avisos/cola.ts';
import type { ModelosInyectados } from '../llm/factory.ts';
import { ErrorHttp } from '../errores.ts';

import { rutasPublicas } from './publico.ts';
import { rutasAuth } from './auth.ts';
import { rutasUsuarios } from './usuarios.ts';
import { rutasClinicas } from './clinicas.ts';
import { rutasConfiguracion } from './configuracion.ts';
import { rutasNotificaciones } from './notificaciones.ts';
import { rutasCasos } from './casos.ts';
import { rutasPacientes } from './pacientes.ts';
import { rutasHilo } from './hilo.ts';
import { rutasInformes } from './informes.ts';

export interface Deps {
  pool: Pool;
  config: Config;
  cola: Cola;
  /** Modelos de IA inyectados (tests); si no, salen de la configuración. */
  ia: ModelosInyectados;
}

export async function registrarRutas(app: FastifyInstance, deps: Deps): Promise<void> {
  // Un ErrorHttp lanzado dentro de una transacción ya ha hecho rollback cuando
  // llega aquí; lo demás es un fallo de verdad y se registra.
  app.setErrorHandler((error, peticion, respuesta) => {
    if (error instanceof ErrorHttp) {
      return respuesta.code(error.codigo).send({ error: error.message, ...error.extra });
    }
    // Fastify y sus complementos ya traen su código (429, 413, JSON mal
    // formado…): convertirlos en 500 escondería el motivo.
    const codigo = (error as { statusCode?: number }).statusCode;
    if (typeof codigo === 'number' && codigo >= 400 && codigo < 500) {
      return respuesta.code(codigo).send({ error: (error as Error).message });
    }
    peticion.log.error({ err: error }, 'fallo no controlado');
    return respuesta.code(500).send({ error: 'Hi ha hagut un error. Torna-ho a provar.' });
  });

  await app.register(async (api) => {
    await api.register(limitador, { global: false });
    await rutasPublicas(api, deps);
    await rutasAuth(api, deps);
    await rutasUsuarios(api, deps);
    await rutasClinicas(api, deps);
    await rutasConfiguracion(api, deps);
    await rutasNotificaciones(api, deps);
    await rutasCasos(api, deps);
    await rutasPacientes(api, deps);
    await rutasHilo(api, deps);
    await rutasInformes(api, deps);
  }, { prefix: '/api' });
}

/** Freno de intentos para las rutas públicas de acceso. */
export function frenoIntentos(config: Config, max = config.LIMITE_INTENTOS) {
  return {
    rateLimit: {
      max,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'Massa intents',
        message: 'Has provat massa vegades. Espera un minut.',
      }),
    },
  };
}

/** Lee un identificador de la ruta: `/x/abc` es un 400 que se entiende, no un 500. */
export function idDeRuta(params: unknown, nombre = 'id'): number {
  const bruto = (params as Record<string, string | undefined>)[nombre];
  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorHttp(400, 'Identificador no vàlid');
  return id;
}

/** Valida un cuerpo con zod y lanza 400 con los campos que fallan. */
export function validar<T>(
  esquema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } } },
  valor: unknown,
): T {
  const r = esquema.safeParse(valor ?? {});
  if (r.success) return r.data;
  const campos = Object.fromEntries(r.error.issues.map((i) => [i.path.join('.') || '_', i.message]));
  throw new ErrorHttp(400, 'Hi ha dades que no són vàlides', { campos });
}
