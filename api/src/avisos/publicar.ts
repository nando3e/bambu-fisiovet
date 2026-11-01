// La única puerta de salida de los avisos.
//
// Toda acción relevante llama a `publicarEvento` con el cliente de SU
// transacción: si la acción se deshace, el evento, las notificaciones y los
// correos encolados se deshacen con ella. Aquí no se envía nada: los correos
// quedan en la cola y los manda la tarea de fondo.
import type { Rol } from '../auth/sesion.ts';
import { leerConfiguracion } from '../configuracion.ts';
import type { Consultable } from '../db/pool.ts';
import { resolverDestinatarios, type UsuarioAviso } from './destinatarios.ts';
import { definicion, esTipoEvento, type DatosEvento, type TipoEvento } from './eventos.ts';
import { encolarCorreo, trazarAviso } from './cola.ts';
import { direccionesDe } from './matriz.ts';

export interface EventoAPublicar {
  tipo: TipoEvento;
  actor: { id: number; rol: Rol } | null;
  casoId?: number | null;
  clinicaId?: number | null;
  datos?: DatosEvento;
  fisioResponsableId?: number | null;
  /** Veterinarios a los que puede interesar (el que derivó, los que escriben, el solicitante…). */
  derivadoresInteresados?: number[];
}

export interface ResumenPublicacion {
  eventoId: number;
  notificados: number[];
  correosEncolados: string[];
}

interface FilaUsuario {
  id: number;
  rol: Rol;
  nombre: string;
  email: string | null;
  recibe_correos: boolean;
}

const aUsuarioAviso = (f: FilaUsuario): UsuarioAviso => ({
  id: f.id,
  rol: f.rol,
  nombre: f.nombre,
  email: f.email,
  recibeCorreos: f.recibe_correos,
});

export async function publicarEvento(bd: Consultable, ev: EventoAPublicar): Promise<ResumenPublicacion> {
  if (!esTipoEvento(ev.tipo)) throw new Error(`Evento desconocido: ${String(ev.tipo)}`);
  const def = definicion(ev.tipo);
  const datos: DatosEvento = { ...(ev.datos ?? {}), casoId: ev.casoId ?? null };

  const { rows: creado } = await bd.query<{ id: number }>(
    `INSERT INTO eventos (tipo, caso_id, clinica_id, actor_id, datos)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [ev.tipo, ev.casoId ?? null, ev.clinicaId ?? null, ev.actor?.id ?? null, JSON.stringify(datos)],
  );
  const eventoId = creado[0]!.id;

  // La matriz se lee aquí, sin caché: un cambio en el panel vale para este evento.
  const { rows: filas } = await bd.query<{ notificacion: boolean; correo: boolean; correo_a: string | null }>(
    'SELECT notificacion, correo, correo_a FROM configuracion_avisos WHERE evento = $1',
    [ev.tipo],
  );
  const matriz = filas[0] ?? { notificacion: def.notificacion, correo: def.correo, correo_a: null };

  const { rows: equipo } = await bd.query<FilaUsuario>(
    // El superadmin también es del lado Bambú: recibe la campana (no tiene
    // correo, así que nunca un correo).
    `SELECT id, rol, nombre, email, recibe_correos FROM usuarios
     WHERE rol IN ('bambu', 'superadmin') AND activo AND verificado_el IS NOT NULL ORDER BY id`,
  );
  const interesados = [...new Set(ev.derivadoresInteresados ?? [])];
  const { rows: derivadores } = interesados.length
    ? await bd.query<FilaUsuario>(
        `SELECT id, rol, nombre, email, recibe_correos FROM usuarios
         WHERE id = ANY($1) AND rol = 'derivador' AND activo AND verificado_el IS NOT NULL ORDER BY id`,
        [interesados],
      )
    : { rows: [] as FilaUsuario[] };

  const destino = resolverDestinatarios({
    tipo: ev.tipo,
    actor: ev.actor,
    equipoBambu: equipo.map(aUsuarioAviso),
    fisioResponsableId: ev.fisioResponsableId ?? null,
    derivadores: derivadores.map(aUsuarioAviso),
  });
  const todos = [...destino.bambu, ...destino.derivadores];

  // Regla anti-ruido: se mira ANTES de crear las notificaciones de este evento.
  const conNoLeida = new Set<number>();
  if (def.antiRuido && ev.casoId && todos.length) {
    const { rows } = await bd.query<{ usuario_id: number }>(
      `SELECT DISTINCT usuario_id FROM notificaciones
       WHERE caso_id = $1 AND usuario_id = ANY($2) AND leida_el IS NULL`,
      [ev.casoId, todos.map((u) => u.id)],
    );
    for (const r of rows) conNoLeida.add(r.usuario_id);
  }

  const notificados: number[] = [];
  if (matriz.notificacion) {
    for (const u of todos) {
      await bd.query(
        `INSERT INTO notificaciones (usuario_id, evento_id, caso_id, titulo, cuerpo, enlace)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.id, eventoId, ev.casoId ?? null, def.titulo(datos), def.cuerpo(datos), def.enlace(datos, u.rol)],
      );
      await trazarAviso(bd, { canal: 'notificacion', eventoId, destinatario: `usuario:${u.id}`, enviado: true });
      notificados.push(u.id);
    }
  }

  const correosEncolados: string[] = [];
  if (matriz.correo) {
    const datosCorreo = (rol: Rol, saludo: string) => ({
      saludo,
      titulo: def.titulo(datos),
      cuerpo: def.cuerpo(datos),
      enlace: def.enlace(datos, rol),
    });

    if (destino.ladoBambu) {
      const avisados = destino.bambu;
      const yaSabian = def.antiRuido && avisados.length > 0 && avisados.every((u) => conNoLeida.has(u.id));
      const { correo_centro } = await leerConfiguracion(bd, 'avisos');
      // «Correu a» (una o varias direcciones) manda sobre el correo del centro.
      const direcciones = direccionesDe(matriz.correo_a);
      if (direcciones.length === 0 && correo_centro) direcciones.push(correo_centro);
      if (yaSabian) {
        await trazarAviso(bd, {
          canal: 'correo', eventoId, destinatario: direcciones.join(', ') || 'equip', enviado: false,
          motivo: 'ya tiene notificación no leída',
        });
      } else if (direcciones.length > 0) {
        for (const direccion of direcciones) {
          await encolarCorreo(bd, {
            eventoId, destinatario: direccion, plantilla: def.plantilla,
            datos: datosCorreo('bambu', 'Hola, equip de Bambú'),
          });
          correosEncolados.push(direccion);
        }
      } else {
        // Sin «Correu a» ni correo del centro: a cada persona del equipo avisada.
        for (const u of avisados) {
          if (!u.email) continue;
          await encolarCorreo(bd, {
            eventoId, destinatario: u.email, usuarioId: u.id, plantilla: def.plantilla,
            datos: datosCorreo(u.rol, `Hola, ${u.nombre}`),
          });
          correosEncolados.push(u.email);
        }
      }
    }

    for (const u of destino.derivadores) {
      const motivo = !u.email
        ? 'sin correo'
        : !u.recibeCorreos
          ? 'recibe_correos=false'
          : def.antiRuido && conNoLeida.has(u.id)
            ? 'ya tiene notificación no leída'
            : null;
      if (motivo) {
        await trazarAviso(bd, {
          canal: 'correo', eventoId, destinatario: u.email ?? `usuario:${u.id}`, enviado: false, motivo,
        });
        continue;
      }
      await encolarCorreo(bd, {
        eventoId, destinatario: u.email!, usuarioId: u.id, plantilla: def.plantilla,
        datos: datosCorreo(u.rol, `Hola, ${u.nombre}`),
      });
      correosEncolados.push(u.email!);
    }
  }

  return { eventoId, notificados, correosEncolados };
}
