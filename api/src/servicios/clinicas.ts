// Unirse a una clínica: pedirlo, resolverlo y fusionar.
//
// Lo usan el alta (si al registrarse eligió una clínica existente, la
// solicitud se hace al verificar el correo) y las rutas de clínicas.
import type { Sesion } from '../auth/sesion.ts';
import { publicarEvento } from '../avisos/publicar.ts';
import type { Consultable } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import { decidirUnion } from '../dominio/union-clinica.ts';
import { conflicto, noEncontrado } from '../errores.ts';

export interface Solicitante {
  id: number;
  email: string;
  nombre: string;
  apellidos: string;
  clinicaId: number;
}

/**
 * Mueve a la clínica destino todo lo de la clínica de origen y la desactiva.
 * Los changes siguientes amplían esta función (casos, pacientes): todo lo que
 * cuelgue de una clínica tiene que moverse aquí, en la misma transacción.
 */
export async function fusionarClinica(
  bd: Consultable,
  origenId: number,
  destinoId: number,
  usuarioId: number | null,
): Promise<void> {
  const { rows: movidos } = await bd.query<{ id: number }>(
    'UPDATE usuarios SET clinica_id = $2 WHERE clinica_id = $1 RETURNING id',
    [origenId, destinoId],
  );
  const { rows: casos } = await bd.query<{ id: number }>(
    'UPDATE casos SET clinica_id = $2 WHERE clinica_id = $1 RETURNING id',
    [origenId, destinoId],
  );
  const { rows: pacientes } = await bd.query<{ id: number }>(
    'UPDATE pacientes SET clinica_origen_id = $2 WHERE clinica_origen_id = $1 RETURNING id',
    [origenId, destinoId],
  );
  await bd.query('UPDATE propietarios SET clinica_origen_id = $2 WHERE clinica_origen_id = $1', [origenId, destinoId]);
  await bd.query('UPDATE clinicas SET activa = false WHERE id = $1', [origenId]);
  await registrarCambio(bd, {
    tabla: 'clinicas',
    filaId: origenId,
    antes: { activa: true },
    despues: {
      activa: false, fusionada_en: destinoId, usuarios_movidos: movidos.map((m) => m.id),
      casos_movidos: casos.map((c) => c.id), pacientes_movidos: pacientes.map((p) => p.id),
    },
    usuarioId,
    origen: usuarioId ? 'pantalla' : 'sistema',
  });
}

async function derivadoresActivos(bd: Consultable, clinicaId: number): Promise<number[]> {
  const { rows } = await bd.query<{ id: number }>(
    `SELECT id FROM usuarios WHERE clinica_id = $1 AND rol = 'derivador' AND activo`,
    [clinicaId],
  );
  return rows.map((r) => r.id);
}

const nombreCompleto = (s: { nombre: string; apellidos: string }) =>
  `${s.nombre} ${s.apellidos}`.trim();

export async function solicitarUnion(
  bd: Consultable,
  solicitante: Solicitante,
  destinoId: number,
): Promise<'auto' | 'pendiente'> {
  const { rows: destinos } = await bd.query<{
    id: number; nombre: string; dominio_correo: string | null; validada: boolean;
  }>(
    'SELECT id, nombre, dominio_correo, validada FROM clinicas WHERE id = $1 AND activa',
    [destinoId],
  );
  const destino = destinos[0];
  if (!destino) throw noEncontrado('Aquesta clínica no existeix');

  const { rows: pendientes } = await bd.query(
    `SELECT 1 FROM solicitudes_union WHERE usuario_id = $1 AND estado = 'pendiente'`,
    [solicitante.id],
  );
  if (pendientes.length > 0) throw conflicto('Ja tens una sol·licitud pendent');

  const miembros = (await derivadoresActivos(bd, solicitante.clinicaId)).length;
  const decision = decidirUnion({
    emailSolicitante: solicitante.email,
    clinicaOrigenId: solicitante.clinicaId,
    clinicaDestinoId: destino.id,
    dominioClinicaDestino: destino.dominio_correo,
    miembrosClinicaOrigen: miembros,
  });
  if (decision === 'misma_clinica') throw conflicto("Ja formes part d'aquesta clínica");
  if (decision === 'no_permitida') {
    throw conflicto('La teua clínica ja té companys; demana a Bambú que les fusione');
  }

  if (decision === 'auto') {
    await bd.query(
      `INSERT INTO solicitudes_union (usuario_id, clinica_origen_id, clinica_destino_id, estado, resuelta_el)
       VALUES ($1, $2, $3, 'aprobada', now())`,
      [solicitante.id, solicitante.clinicaId, destino.id],
    );
    await fusionarClinica(bd, solicitante.clinicaId, destino.id, null);
    await publicarEvento(bd, {
      tipo: 'usuario.union_resuelta',
      actor: null,
      clinicaId: destino.id,
      datos: { aprobada: true, clinicaDestino: destino.nombre },
      derivadoresInteresados: [solicitante.id],
    });
    return 'auto';
  }

  await bd.query(
    `INSERT INTO solicitudes_union (usuario_id, clinica_origen_id, clinica_destino_id)
     VALUES ($1, $2, $3)`,
    [solicitante.id, solicitante.clinicaId, destino.id],
  );
  await publicarEvento(bd, {
    tipo: 'usuario.solicita_union',
    actor: { id: solicitante.id, rol: 'derivador' },
    clinicaId: destino.id,
    datos: { nombre: nombreCompleto(solicitante), clinicaDestino: destino.nombre },
    // En una clínica que Bambú no ha validado, solo resuelve Bambú: a sus
    // miembros no se les avisa (podría ser alguien que registró un nombre ajeno).
    derivadoresInteresados: destino.validada ? await derivadoresActivos(bd, destino.id) : [],
  });
  return 'pendiente';
}

export async function resolverSolicitud(
  bd: Consultable,
  solicitudId: number,
  sesion: Sesion,
  aprobar: boolean,
): Promise<void> {
  const { rows } = await bd.query<{
    usuario_id: number;
    clinica_origen_id: number;
    clinica_destino_id: number;
    estado: string;
    destino_nombre: string;
    destino_validada: boolean;
  }>(
    `SELECT s.usuario_id, s.clinica_origen_id, s.clinica_destino_id, s.estado, c.nombre AS destino_nombre,
            c.validada AS destino_validada
     FROM solicitudes_union s JOIN clinicas c ON c.id = s.clinica_destino_id
     WHERE s.id = $1 FOR UPDATE OF s`,
    [solicitudId],
  );
  const s = rows[0];
  // Un veterinario solo resuelve las de su clínica, y solo si Bambú la ha
  // validado; lo demás no existe para él.
  const puede = sesion.rol !== 'derivador'
    || (sesion.clinicaId === s?.clinica_destino_id && s.destino_validada);
  if (!s || !puede) throw noEncontrado('Aquesta sol·licitud no existeix');
  if (s.estado !== 'pendiente') throw conflicto('Aquesta sol·licitud ja està resolta');

  if (aprobar) {
    // Lo que valía al pedirlo se vuelve a mirar al aprobar: entre medias el
    // solicitante pudo invitar a alguien a su clínica (y la fusión se lo
    // llevaría sin que nadie lo viera) o la clínica destino desactivarse.
    const { rows: destino } = await bd.query('SELECT 1 FROM clinicas WHERE id = $1 AND activa', [s.clinica_destino_id]);
    if (destino.length === 0) throw conflicto('Aquesta clínica ja no està activa');
    const miembros = await derivadoresActivos(bd, s.clinica_origen_id);
    if (miembros.some((id) => id !== s.usuario_id)) {
      throw conflicto('La clínica del sol·licitant ja té companys; demana a Bambú que les fusione');
    }
  }

  await bd.query(
    `UPDATE solicitudes_union SET estado = $2, resuelta_por = $3, resuelta_el = now() WHERE id = $1`,
    [solicitudId, aprobar ? 'aprobada' : 'rechazada', sesion.usuarioId],
  );
  if (aprobar) {
    await fusionarClinica(bd, s.clinica_origen_id, s.clinica_destino_id, sesion.usuarioId);
  }
  await publicarEvento(bd, {
    tipo: 'usuario.union_resuelta',
    actor: { id: sesion.usuarioId, rol: sesion.rol },
    clinicaId: s.clinica_destino_id,
    datos: { aprobada: aprobar, clinicaDestino: s.destino_nombre },
    derivadoresInteresados: [s.usuario_id],
  });
}
