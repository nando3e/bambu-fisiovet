// Arranque del API. Aplica migraciones, siembra la configuración por defecto,
// aplica el superadmin del entorno, arranca la cola de correos y monta las
// rutas. La web compilada se sirve desde aquí: todo vive tras el mismo dominio
// HTTPS (el micrófono del móvil lo exige) y sin CORS.
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import estatico from '@fastify/static';

import { leerConfig } from './config.ts';
import { crearPool } from './db/pool.ts';
import { aplicarMigraciones } from './db/migraciones.ts';
import { sembrarConfiguracion } from './configuracion.ts';
import { sembrarMatriz } from './avisos/matriz.ts';
import { crearCola } from './avisos/cola.ts';
import { canalSmtp, type CanalCorreo } from './correo/transporte.ts';
import { aplicarSuperadmin } from './superadmin.ts';
import { registrarRutas } from './rutas/index.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));

export interface Opciones {
  /** Canal de correo inyectable en los tests. Por defecto, el SMTP del panel. */
  canal?: CanalCorreo;
  /** Carpeta de la web compilada. Por defecto, web/dist del repo. */
  carpetaWeb?: string;
}

export async function construirServidor(entorno: NodeJS.ProcessEnv = process.env, opciones: Opciones = {}) {
  const config = leerConfig(entorno);
  const pool = crearPool(config.DATABASE_URL);

  await aplicarMigraciones(pool);
  await sembrarConfiguracion(pool);
  await sembrarMatriz(pool);
  const avisoSuperadmin = await aplicarSuperadmin(pool, config);
  await mkdir(resolve(config.RUTA_DATOS), { recursive: true });

  const app = Fastify({
    logger: { level: config.NIVEL_LOG },
    bodyLimit: 1024 * 1024,
    // Detrás de Traefik: sin esto todas las peticiones parecen venir de la
    // misma dirección y el freno de intentos bloquearía a todo el mundo a la vez.
    trustProxy: true,
  });
  app.log.info(avisoSuperadmin);

  const cola = crearCola({ pool, config, canal: opciones.canal ?? canalSmtp(pool, config), log: app.log });
  app.addHook('onClose', async () => {
    cola.detener();
    await pool.end();
  });

  await app.register(cookie, { secret: config.SECRETO_SESION });
  await registrarRutas(app, { pool, config, cola });

  // La web compilada, si está. En desarrollo la sirve Vite con su proxy.
  const web = opciones.carpetaWeb ?? join(AQUI, '..', '..', 'web', 'dist');
  if (existsSync(join(web, 'index.html'))) {
    await app.register(estatico, { root: web, prefix: '/', wildcard: false });
    // Una sola página: cualquier ruta que no sea del API la resuelve el
    // enrutador del navegador. El index nunca se cachea, o un despliegue
    // nuevo no llegaría al móvil.
    const indice = await readFile(join(web, 'index.html'), 'utf8');
    app.setNotFoundHandler((peticion, respuesta) => {
      if (peticion.url.startsWith('/api/') || peticion.url === '/api') {
        return respuesta.code(404).send({ error: 'No existeix' });
      }
      return respuesta.type('text/html; charset=utf-8').header('cache-control', 'no-cache').send(indice);
    });
  } else {
    app.setNotFoundHandler((_peticion, respuesta) => respuesta.code(404).send({ error: 'No existeix' }));
  }

  return { app, pool, config, cola };
}

const esEntrada = process.argv[1]?.endsWith('servidor.ts');
if (esEntrada) {
  const { app, config } = await construirServidor();
  await app.listen({ port: config.PUERTO_API, host: '0.0.0.0' });
  for (const senal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(senal, () => {
      app.close().finally(() => process.exit(0));
    });
  }
}
