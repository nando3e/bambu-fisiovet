// La matriz de avisos: por evento, si genera notificación, si genera correo y,
// en los que llegan a Bambú, a qué dirección. Se siembra con los valores por
// defecto del catálogo y nunca se pisa lo editado.
import { leerConfiguracion } from '../configuracion.ts';
import type { Consultable } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import { datosIncorrectos, noEncontrado } from '../errores.ts';
import {
  admiteCorreoA, definicion, esTipoEvento, TIPOS_EVENTO, type Audiencia, type TipoEvento,
} from './eventos.ts';

export async function sembrarMatriz(bd: Consultable): Promise<void> {
  for (const tipo of TIPOS_EVENTO) {
    const def = definicion(tipo);
    await bd.query(
      `INSERT INTO configuracion_avisos (evento, notificacion, correo)
       VALUES ($1, $2, $3) ON CONFLICT (evento) DO NOTHING`,
      [tipo, def.notificacion, def.correo],
    );
  }
}

export interface FilaMatriz {
  evento: TipoEvento;
  audiencia: Audiencia;
  notificacion: boolean;
  correo: boolean;
  correo_a: string | null;
  admite_correo_a: boolean;
}

export async function leerMatriz(bd: Consultable): Promise<FilaMatriz[]> {
  const { rows } = await bd.query<{ evento: string; notificacion: boolean; correo: boolean; correo_a: string | null }>(
    'SELECT evento, notificacion, correo, correo_a FROM configuracion_avisos',
  );
  const porEvento = new Map(rows.map((r) => [r.evento, r]));
  // En el orden del catálogo, que es el que tiene sentido para leerla.
  return TIPOS_EVENTO.map((evento) => {
    const def = definicion(evento);
    const fila = porEvento.get(evento);
    return {
      evento,
      audiencia: def.audiencia,
      notificacion: fila?.notificacion ?? def.notificacion,
      correo: fila?.correo ?? def.correo,
      correo_a: fila?.correo_a ?? null,
      admite_correo_a: admiteCorreoA(evento),
    };
  });
}

/** Vaciar el correo del centro no puede dejar sin dirección a un aviso de Bambú encendido. */
export async function exigirCentroSinDependientes(bd: Consultable): Promise<void> {
  const dependen = (await leerMatriz(bd)).some((f) => f.audiencia === 'bambu' && f.correo && !f.correo_a);
  if (dependen) {
    throw datosIncorrectos('Hi ha avisos de l’equip que només tenen aquesta adreça: apaga’n el correu o omple «Correu a»');
  }
}

/** Las direcciones de «Correu a»: una o varias, separadas por comas, punto y coma o espacios. */
export function direccionesDe(texto: string | null | undefined): string[] {
  return (texto ?? '').split(/[,;\s]+/).map((d) => d.trim()).filter(Boolean);
}

export interface CambioFila {
  notificacion: boolean;
  correo: boolean;
  correo_a: string | null;
}

export async function actualizarFilaMatriz(
  bd: Consultable,
  evento: string,
  cambio: CambioFila,
  usuarioId: number,
): Promise<FilaMatriz> {
  if (!esTipoEvento(evento)) throw noEncontrado('Aquest avís no existeix');
  // Se guarda normalizado: «a@x.es, b@y.es».
  const correoA = direccionesDe(cambio.correo_a).join(', ') || null;
  if (correoA && !admiteCorreoA(evento)) {
    throw datosIncorrectos('Aquest avís va als veterinaris: no admet una adreça pròpia');
  }
  const antes = (await leerMatriz(bd)).find((f) => f.evento === evento)!;
  // Sin dirección, un aviso solo para Bambú no llega a nadie: no se enciende ni
  // se le quita la última. Una fila que ya estaba así se puede seguir tocando
  // (la notificación, por ejemplo). Los de las dos partes sí se encienden: el
  // veterinario tiene su propia dirección.
  if (antes.audiencia === 'bambu' && cambio.correo && !correoA && (!antes.correo || antes.correo_a)) {
    const { correo_centro } = await leerConfiguracion(bd, 'avisos');
    if (!correo_centro) {
      throw datosIncorrectos('Cal una adreça: omple «Correu a» o el correu del centre');
    }
  }
  await bd.query(
    `INSERT INTO configuracion_avisos (evento, notificacion, correo, correo_a, actualizado, actualizado_por)
     VALUES ($1, $2, $3, $4, now(), $5)
     ON CONFLICT (evento) DO UPDATE SET
       notificacion = EXCLUDED.notificacion, correo = EXCLUDED.correo, correo_a = EXCLUDED.correo_a,
       actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`,
    [evento, cambio.notificacion, cambio.correo, correoA, usuarioId],
  );
  await registrarCambio(bd, {
    tabla: 'configuracion_avisos', filaId: evento, antes, despues: { ...cambio, correo_a: correoA }, usuarioId,
  });
  return (await leerMatriz(bd)).find((f) => f.evento === evento)!;
}
