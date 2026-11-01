// Derivaciones aceptadas que llevan más de N días sin cita: se marcan y se
// avisa al equipo una sola vez. Corre al arrancar y cada hora.
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';
import { leerConfiguracion } from '../configuracion.ts';
import { enTransaccion, type Pool } from '../db/pool.ts';
import { avisarCaso, casoVisible } from '../servicios/casos.ts';

const CADA = 60 * 60 * 1000;

/** Marca y avisa las atascadas; devuelve cuántas. La marca hace que cada una salga una vez. */
export async function comprobarPendientesCita(pool: Pool): Promise<number> {
  return enTransaccion(pool, async (bd) => {
    const { dias_pendiente_cita: dias } = await leerConfiguracion(bd, 'avisos');
    const { rows } = await bd.query<{ id: number }>(
      `UPDATE casos SET atasco_avisado_el = now()
       WHERE estado = 'aceptada' AND atasco_avisado_el IS NULL
         AND resuelto_el < now() - make_interval(days => $1)
       RETURNING id`,
      [dias],
    );
    for (const { id } of rows) {
      const caso = await casoVisible(bd, { usuarioId: 0, rol: 'bambu', clinicaId: null }, id);
      await avisarCaso(bd, null, caso, 'caso.sin_noticias', { dias });
    }
    return rows.length;
  });
}

export function iniciarPendientesCita(deps: {
  pool: Pool;
  config: Config;
  despertarCola: () => void;
  log?: Pick<FastifyBaseLogger, 'error'>;
}): { detener: () => void } {
  // Misma bandera que la cola: en los tests no corre sola.
  if (!deps.config.COLA_ACTIVA) return { detener: () => {} };
  const pasar = () => {
    comprobarPendientesCita(deps.pool)
      .then((n) => {
        if (n > 0) deps.despertarCola();
      })
      .catch((error) => deps.log?.error({ err: error }, 'fallo comprobando derivaciones pendientes de cita'));
  };
  pasar();
  const temporizador = setInterval(pasar, CADA);
  temporizador.unref();
  return { detener: () => clearInterval(temporizador) };
}
