import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { leerConfiguracion } from '../configuracion.ts';
import { HUECOS, MIME, NOMBRE_VALIDO, type TipoImagen } from '../ficheros/imagenes-web.ts';
import { noEncontrado } from '../errores.ts';
import type { Deps } from './index.ts';

export async function rutasPublicas(app: FastifyInstance, { pool, config }: Deps): Promise<void> {
  // Las fotos que Bambú ha subido; null = la web usa la de serie.
  app.get('/publico/imagenes', async () => {
    const imagenes = await leerConfiguracion(pool, 'imagenes_web');
    return Object.fromEntries(
      HUECOS.map((h) => [h, imagenes[h] ? `/api/publico/imagenes/${imagenes[h]}` : null]),
    );
  });

  app.get('/publico/imagenes/:fichero', async (peticion, respuesta) => {
    const { fichero } = peticion.params as { fichero: string };
    // Solo nombres con la forma que pone el servidor: nada de ../
    if (!NOMBRE_VALIDO.test(fichero)) throw noEncontrado();
    const ruta = join(resolve(config.RUTA_DATOS), 'web', fichero);
    if (!existsSync(ruta)) throw noEncontrado();
    const tipo = fichero.split('.').pop() as TipoImagen;
    // El nombre es aleatorio por subida: su contenido no cambia nunca.
    return respuesta
      .type(MIME[tipo])
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(ruta));
  });

  app.get('/salud', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  // Lo que la landing enseña del centro. Solo los campos con valor: un dato
  // vacío oculta su línea en la web, nunca un «configura el teléfono».
  app.get('/publico/contacto', async () => {
    const contacto = await leerConfiguracion(pool, 'contacto');
    return Object.fromEntries(Object.entries(contacto).filter(([, v]) => v !== ''));
  });
}
