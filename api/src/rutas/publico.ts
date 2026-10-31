import type { FastifyInstance } from 'fastify';
import { leerConfiguracion } from '../configuracion.ts';
import type { Deps } from './index.ts';

export async function rutasPublicas(app: FastifyInstance, { pool }: Deps): Promise<void> {
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
