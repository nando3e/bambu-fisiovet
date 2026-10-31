// La cola de correos.
//
// Ningún correo se envía dentro de una petición: se encola y lo manda esta
// tarea de fondo, que vive en el mismo proceso. Un SMTP caído no hace fallar
// la acción del usuario, y un reinicio no pierde nada (al arrancar retoma lo
// pendiente).
//
// Los lotes se toman con FOR UPDATE SKIP LOCKED: con dos procesos a la vez,
// cada correo sale una sola vez. Un correo que se quedó `en_curso` porque el
// proceso murió a mitad vuelve a la cola a los diez minutos.
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';
import type { Consultable, Pool } from '../db/pool.ts';
import { renderizar } from '../correo/plantilla.ts';
import type { CanalCorreo } from '../correo/transporte.ts';

/** Minutos de espera tras el fallo número 1, 2, 3, 4 y 5. Al sexto, fallido. */
export const ESPERAS_MINUTOS = [1, 5, 30, 120, 720] as const;
export const MAX_INTENTOS = ESPERAS_MINUTOS.length + 1;
const TAMANO_LOTE = 20;

export interface CorreoAEncolar {
  destinatario: string;
  plantilla: string;
  datos: Record<string, unknown>;
  eventoId?: number | null;
  usuarioId?: number | null;
}

export async function encolarCorreo(bd: Consultable, c: CorreoAEncolar): Promise<number> {
  const { rows } = await bd.query<{ id: number }>(
    `INSERT INTO correos_pendientes (evento_id, destinatario_usuario_id, destinatario, plantilla, datos)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [c.eventoId ?? null, c.usuarioId ?? null, c.destinatario, c.plantilla, JSON.stringify(c.datos)],
  );
  return rows[0]!.id;
}

export interface Traza {
  canal: 'correo' | 'notificacion' | 'whatsapp';
  destinatario: string;
  enviado: boolean;
  motivo?: string | null;
  eventoId?: number | null;
  correoPendienteId?: number | null;
  plantilla?: string | null;
}

export async function trazarAviso(bd: Consultable, t: Traza): Promise<void> {
  await bd.query(
    `INSERT INTO avisos_enviados (canal, evento_id, correo_pendiente_id, destinatario, plantilla, enviado, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [t.canal, t.eventoId ?? null, t.correoPendienteId ?? null, t.destinatario, t.plantilla ?? null,
      t.enviado, t.motivo ?? null],
  );
}

interface Pendiente {
  id: number;
  evento_id: number | null;
  destinatario: string;
  plantilla: string;
  datos: Record<string, unknown>;
  intentos: number;
}

/** Datos de la plantilla con los enlaces relativos convertidos en absolutos. */
function datosParaPlantilla(datos: Record<string, unknown>, urlPublica: string): Record<string, unknown> {
  const salida: Record<string, unknown> = { ...datos, urlPublica };
  for (const [clave, valor] of Object.entries(datos)) {
    if (typeof valor === 'string' && valor.startsWith('/') && /^(enlace|url)/i.test(clave)) {
      salida[clave] = `${urlPublica}${valor}`;
    }
  }
  return salida;
}

export interface Cola {
  /** Procesa ya, sin esperar al temporizador. */
  despertar(): void;
  /** Vacía lo que esté listo para enviar. Devuelve cuántos correos ha tratado. */
  procesar(): Promise<number>;
  detener(): void;
}

export function crearCola(deps: {
  pool: Pool;
  config: Config;
  canal: CanalCorreo;
  log?: Pick<FastifyBaseLogger, 'error' | 'info'>;
}): Cola {
  const { pool, config, canal, log } = deps;
  let temporizador: NodeJS.Timeout | null = null;
  let ocupada: Promise<number> | null = null;
  let otraVuelta = false;

  async function tomarLote(): Promise<Pendiente[]> {
    const { rows } = await pool.query<Pendiente>(
      `UPDATE correos_pendientes SET estado = 'en_curso', en_curso_desde = now()
       WHERE id IN (
         SELECT id FROM correos_pendientes
         WHERE (estado = 'pendiente' AND proximo_intento <= now())
            OR (estado = 'en_curso' AND en_curso_desde < now() - interval '10 minutes')
         ORDER BY id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, evento_id, destinatario, plantilla, datos, intentos`,
      [TAMANO_LOTE],
    );
    return rows;
  }

  async function tratar(p: Pendiente): Promise<void> {
    let mensaje;
    try {
      const r = renderizar(p.plantilla, datosParaPlantilla(p.datos, config.URL_PUBLICA));
      mensaje = { para: p.destinatario, ...r };
    } catch (error) {
      // Una plantilla rota no se arregla reintentando.
      const motivo = `plantilla: ${(error as Error).message}`.slice(0, 500);
      await pool.query(
        `UPDATE correos_pendientes SET estado = 'fallido', error = $2, en_curso_desde = NULL WHERE id = $1`,
        [p.id, motivo],
      );
      await trazarAviso(pool, {
        canal: 'correo', eventoId: p.evento_id, correoPendienteId: p.id,
        destinatario: p.destinatario, plantilla: p.plantilla, enviado: false, motivo,
      });
      return;
    }

    const resultado = config.CORREO_DRY_RUN
      ? ({ resultado: 'omitido', motivo: 'dry-run' } as const)
      : await canal.enviar(mensaje);

    if (resultado.resultado === 'error') {
      const intentos = p.intentos + 1;
      const fallido = intentos >= MAX_INTENTOS;
      const espera = ESPERAS_MINUTOS[Math.min(intentos, ESPERAS_MINUTOS.length) - 1]!;
      await pool.query(
        `UPDATE correos_pendientes
           SET estado = $2, intentos = $3, error = $4, en_curso_desde = NULL,
               proximo_intento = now() + make_interval(mins => $5)
         WHERE id = $1`,
        [p.id, fallido ? 'fallido' : 'pendiente', intentos, resultado.motivo, espera],
      );
    } else {
      // Enviado de verdad, o no se debía enviar (dry-run, SMTP sin configurar):
      // en los dos casos sale de la cola, y la traza dice qué pasó.
      await pool.query(
        `UPDATE correos_pendientes
           SET estado = 'enviado', enviado_el = now(), en_curso_desde = NULL, error = NULL
         WHERE id = $1`,
        [p.id],
      );
    }
    await trazarAviso(pool, {
      canal: 'correo',
      eventoId: p.evento_id,
      correoPendienteId: p.id,
      destinatario: p.destinatario,
      plantilla: p.plantilla,
      enviado: resultado.resultado === 'enviado',
      motivo: resultado.resultado === 'enviado' ? null : resultado.motivo,
    });
  }

  async function vaciar(): Promise<number> {
    let total = 0;
    for (;;) {
      const lote = await tomarLote();
      for (const p of lote) {
        try {
          await tratar(p);
        } catch (error) {
          log?.error({ err: error, correo: p.id }, 'fallo tratando un correo de la cola');
        }
      }
      total += lote.length;
      if (lote.length < TAMANO_LOTE) return total;
    }
  }

  function procesar(): Promise<number> {
    if (ocupada) {
      otraVuelta = true;
      return ocupada;
    }
    ocupada = (async () => {
      let total = 0;
      try {
        do {
          otraVuelta = false;
          total += await vaciar();
        } while (otraVuelta);
      } finally {
        ocupada = null;
      }
      return total;
    })();
    return ocupada;
  }

  function despertar(): void {
    // Apagada (los tests), la cola solo se mueve cuando la llaman a mano: si
    // no, una ruta que la despierta compite con la cola del propio test.
    if (!config.COLA_ACTIVA) return;
    setImmediate(() => {
      procesar().catch((error) => log?.error({ err: error }, 'fallo en la cola de correos'));
    });
  }

  if (config.COLA_ACTIVA) {
    temporizador = setInterval(despertar, 15_000);
    temporizador.unref();
    despertar();
  }

  return {
    despertar,
    procesar,
    detener() {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    },
  };
}

/** Devuelve un correo fallido a la cola con un intento inmediato. */
export async function reintentarCorreo(bd: Consultable, id: number): Promise<boolean> {
  const { rowCount } = await bd.query(
    `UPDATE correos_pendientes SET estado = 'pendiente', proximo_intento = now(), intentos = 0
     WHERE id = $1 AND estado = 'fallido'`,
    [id],
  );
  return rowCount === 1;
}
