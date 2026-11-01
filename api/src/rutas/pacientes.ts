// Pacientes y propietarios: lista, ficha con sus derivaciones, edición con
// historial. Bambú edita siempre; el veterinario, mientras ninguna derivación
// del paciente esté aceptada (y el contacto del propietario, siempre).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exigirSesion, ROLES_BAMBU } from '../auth/permisos.ts';
import { enTransaccion } from '../db/pool.ts';
import { EDITABLE_POR_DERIVADOR } from '../dominio/estados-caso.ts';
import { ambitoCaso, ambitoPaciente } from '../dominio/visibilidad.ts';
import { noEncontrado } from '../errores.ts';
import {
  avisarFichaModificada, CAMPOS_PACIENTE, CAMPOS_PROPIETARIO, guardarCambios, pacienteVisible,
} from '../servicios/casos.ts';
import { errorNoEditable, esquemaPaciente, esquemaPropietario } from './casos.ts';
import { idDeRuta, validar, type Deps } from './index.ts';

export async function rutasPacientes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, cola } = deps;

  app.get('/pacientes', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const { q, clinica_id } = validar(z.object({
      q: z.string().trim().max(100).optional(),
      clinica_id: z.coerce.number().int().positive().optional(),
    }), peticion.query);
    const ambito = ambitoPaciente(sesion, 'p', 1);
    const params: unknown[] = [...ambito.params];
    const filtros = [ambito.sql];
    if (q) {
      params.push(q);
      filtros.push(`unaccent(lower(p.nombre || ' ' || pr.nombre || ' ' || coalesce(pr.telefono, '')))
        LIKE '%' || unaccent(lower($${params.length})) || '%'`);
    }
    if (clinica_id) {
      params.push(clinica_id);
      filtros.push(`p.clinica_origen_id = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT p.id, p.nombre, p.especie, p.especie_otra, p.raza, pr.nombre AS propietario, pr.telefono,
              cl.nombre AS clinica,
              (SELECT count(*) FROM casos c WHERE c.paciente_id = p.id AND c.estado <> 'borrador')::int AS derivaciones
       FROM pacientes p
       JOIN propietarios pr ON pr.id = p.propietario_id
       LEFT JOIN clinicas cl ON cl.id = p.clinica_origen_id
       WHERE ${filtros.join(' AND ')}
       ORDER BY p.actualizado DESC LIMIT 100`,
      params,
    );
    return { pacientes: rows };
  });

  app.get('/pacientes/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const paciente = await pacienteVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows: p } = await pool.query(
      `SELECT p.id, p.nombre, p.especie, p.especie_otra, p.raza, p.sexo, p.esterilizado, p.fecha_nacimiento,
              p.edad_texto, p.peso_kg::float8 AS peso_kg, cl.id AS clinica_id, cl.nombre AS clinica
       FROM pacientes p LEFT JOIN clinicas cl ON cl.id = p.clinica_origen_id WHERE p.id = $1`,
      [paciente.id],
    );
    const { rows: propietario } = await pool.query(
      'SELECT id, nombre, telefono, email, consentimiento_version, consentimiento_el FROM propietarios WHERE id = $1',
      [paciente.propietario_id],
    );
    const ambito = ambitoCaso(sesion, 'c', 2);
    const { rows: casos } = await pool.query(
      `SELECT c.id, c.estado, c.motivo, c.enviado_el, c.creado, c.cerrado_el
       FROM casos c WHERE c.paciente_id = $1 AND c.descartado_el IS NULL AND ${ambito.sql}
       ORDER BY c.creado DESC`,
      [paciente.id, ...ambito.params],
    );
    return { ...p[0], propietario: propietario[0], casos };
  });

  app.patch('/pacientes/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    const d = validar(esquemaPaciente, peticion.body);
    await enTransaccion(pool, async (bd) => {
      const paciente = await pacienteVisible(bd, sesion, id);
      if (sesion.rol === 'derivador') {
        const { rows } = await bd.query(
          'SELECT 1 FROM casos WHERE paciente_id = $1 AND NOT (estado = ANY($2))',
          [paciente.id, EDITABLE_POR_DERIVADOR],
        );
        if (rows[0]) throw errorNoEditable();
      }
      const campos = await guardarCambios(bd, 'pacientes', paciente.id, CAMPOS_PACIENTE, d, sesion.usuarioId);
      if (campos.length) await avisarFichaModificada(bd, sesion, [paciente.id], campos);
    });
    cola.despertar();
    return { ok: true };
  });

  app.patch('/propietarios/:id', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    const id = idDeRuta(peticion.params);
    const d = validar(esquemaPropietario, peticion.body);
    await enTransaccion(pool, async (bd) => {
      // El propietario se ve a través de sus pacientes.
      const ambito = ambitoPaciente(sesion, 'p', 2);
      const { rows: pacientes } = await bd.query<{ id: number }>(
        `SELECT p.id FROM pacientes p WHERE p.propietario_id = $1 AND ${ambito.sql}`,
        [id, ...ambito.params],
      );
      if (!pacientes.length) throw noEncontrado('Aquest propietari no existeix');
      // El veterinario actualiza el contacto siempre; el nombre, como el resto
      // de la ficha, mientras no esté aceptada ninguna derivación.
      const permitidos = sesion.rol === 'derivador' ? ['telefono', 'email'] : CAMPOS_PROPIETARIO;
      const campos = await guardarCambios(bd, 'propietarios', id, permitidos, d, sesion.usuarioId);
      if (campos.length) await avisarFichaModificada(bd, sesion, pacientes.map((p) => p.id), campos);
    });
    cola.despertar();
    return { ok: true };
  });

  app.get('/pacientes/:id/historial', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const paciente = await pacienteVisible(pool, sesion, idDeRuta(peticion.params));
    const { rows } = await pool.query(
      `SELECT h.id, h.tabla, h.antes, h.despues, h.origen, h.cuando,
              nullif(trim(u.nombre || ' ' || u.apellidos), '') AS usuario
       FROM historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE (h.tabla = 'pacientes' AND h.fila_id = $1) OR (h.tabla = 'propietarios' AND h.fila_id = $2)
       ORDER BY h.cuando DESC, h.id DESC LIMIT 200`,
      [String(paciente.id), String(paciente.propietario_id)],
    );
    return { historial: rows };
  });
}
