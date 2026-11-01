// Indicadores del panel de Bambú (/b/panell). Las visitas van en Wakyma: aquí
// solo se mide lo que el portal sabe (envío, respuesta, cita, alta). Todo se
// cuenta en SQL; la mediana de horas laborables, en el dominio.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exigirSesion, ROLES_BAMBU } from '../auth/permisos.ts';
import { leerConfiguracion } from '../configuracion.ts';
import { horasLaborables, mediana } from '../dominio/indicadores.ts';
import { datosIncorrectos } from '../errores.ts';
import { validar, type Deps } from './index.ts';

const ZONA = 'Europe/Madrid';
const MESES_MAXIMOS = 36;
/** Hora de Madrid como texto: pg leería un timestamp sin huso con la hora local del proceso. */
const LOCAL = "'YYYY-MM-DD\"T\"HH24:MI:SS'";
/** Una clínica del top sin derivar desde hace más de esto se marca. */
const DIAS_SIN_DERIVAR = 60;

const hoyEnMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
/** Una fecha civil que existe (el 31 de febrero no pasa a la base). */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Data no vàlida');

/** La misma fecha n meses después (el 31 de un mes corto cae en el último día). */
function sumarMeses(s: string, n: number) {
  const [a, m, d] = s.split('-').map(Number) as [number, number, number];
  const ultimo = new Date(Date.UTC(a, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + n, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

/** Por defecto, los 12 últimos meses enteros contando el actual. */
function rangoPorDefecto(hasta: string) {
  const [a, m] = hasta.split('-').map(Number) as [number, number];
  const inicio = new Date(Date.UTC(a, m - 1 - 11, 1));
  return inicio.toISOString().slice(0, 10);
}

export async function rutasPanel(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool } = deps;

  app.get('/panel/indicadores', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const q = validar(z.object({ desde: fecha.optional(), hasta: fecha.optional() }), peticion.query);
    const hasta = q.hasta ?? hoyEnMadrid();
    const desde = q.desde ?? rangoPorDefecto(hasta);
    // Como mucho 36 meses: hasta tiene que quedar antes de desde + 36 meses.
    if (desde > hasta || hasta >= sumarMeses(desde, MESES_MAXIMOS)) {
      throw datosIncorrectos(`El rang ha d'anar de més antic a més recent i no passar de ${MESES_MAXIMOS} mesos`);
    }
    const avisos = await leerConfiguracion(pool, 'avisos');

    // Derivaciones del rango por la fecha de envío en hora de Madrid.
    const rango = `WITH rango AS (
      SELECT c.*, c.enviado_el AT TIME ZONE '${ZONA}' AS enviado_local
      FROM casos c
      WHERE c.descartado_el IS NULL AND c.enviado_el IS NOT NULL
        AND (c.enviado_el AT TIME ZONE '${ZONA}')::date BETWEEN $1::date AND $2::date)`;

    const [porMes, clinicas, respuestas, sinResolver, embudo, activos, duracion, operativos] = await Promise.all([
      pool.query(
        `${rango}
         SELECT to_char(m, 'YYYY-MM') AS mes, count(r.id)::int AS n
         FROM generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') m
         LEFT JOIN rango r ON date_trunc('month', r.enviado_local) = m
         GROUP BY m ORDER BY m`,
        [desde, hasta],
      ),
      pool.query(
        `${rango}, top AS (
           SELECT r.clinica_id, count(*)::int AS n FROM rango r GROUP BY r.clinica_id
         )
         SELECT cl.id, cl.nombre, top.n, u.ultima,
                u.ultima < now() - make_interval(days => $3) AS sin_derivar
         FROM top
         JOIN clinicas cl ON cl.id = top.clinica_id
         CROSS JOIN LATERAL (
           SELECT max(c.enviado_el) AS ultima FROM casos c
           WHERE c.clinica_id = cl.id AND c.descartado_el IS NULL AND c.enviado_el IS NOT NULL
         ) u
         ORDER BY top.n DESC, cl.nombre LIMIT 10`,
        [desde, hasta, DIAS_SIN_DERIVAR],
      ),
      // Las que registra Bambú nacen resueltas: no cuentan para la respuesta.
      pool.query<{ enviado: string; resuelto: string }>(
        `${rango}
         SELECT to_char(r.enviado_local, ${LOCAL}) AS enviado, to_char(r.resuelto_el AT TIME ZONE '${ZONA}', ${LOCAL}) AS resuelto
         FROM rango r WHERE r.registrado_por IS NULL AND r.resuelto_el IS NOT NULL`,
        [desde, hasta],
      ),
      pool.query(`${rango} SELECT count(*)::int AS n FROM rango WHERE estado = 'enviada'`, [desde, hasta]),
      // Un alta desde «acceptada» (informe de alta sin pasar por «Ja té cita»)
      // también tuvo visitas: cuenta como con cita.
      pool.query(
        `SELECT count(*)::int AS enviadas,
                count(*) FILTER (WHERE resuelto_el IS NOT NULL AND estado <> 'rechazada')::int AS aceptadas,
                count(*) FILTER (WHERE en_tratamiento_el IS NOT NULL OR estado = 'alta')::int AS con_cita,
                count(*) FILTER (WHERE estado = 'alta')::int AS alta,
                count(*) FILTER (WHERE estado = 'aceptada')::int AS pendientes_cita,
                count(*) FILTER (WHERE estado = 'rechazada')::int AS rechazadas,
                count(*) FILTER (WHERE estado = 'abandonada')::int AS abandonadas,
                count(*) FILTER (WHERE estado = 'enviada')::int AS sin_respuesta
         FROM casos WHERE descartado_el IS NULL AND enviado_el >= now() - interval '90 days'`,
      ),
      pool.query(
        `SELECT count(*) FILTER (WHERE estado = 'enviada')::int AS enviada,
                count(*) FILTER (WHERE estado = 'aceptada')::int AS aceptada,
                count(*) FILTER (WHERE estado = 'en_tratamiento')::int AS en_tratamiento
         FROM casos WHERE descartado_el IS NULL`,
      ),
      pool.query(
        // Las medianas, solo sobre las altas con fecha de primera visita (un alta
        // desde «acceptada» no la tiene), y con cuántas son: así no parece que
        // una sola represente a todas. Ojo: greatest(0, NULL) es 0, de ahí el FILTER.
        `SELECT count(*)::int AS altas,
                count(*) FILTER (WHERE primera_visita IS NOT NULL)::int AS con_visita,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY greatest(0, primera_visita - (resuelto_el AT TIME ZONE '${ZONA}')::date)) FILTER (WHERE primera_visita IS NOT NULL) AS espera_dias,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY greatest(0, (cerrado_el AT TIME ZONE '${ZONA}')::date - primera_visita)) FILTER (WHERE primera_visita IS NOT NULL) AS tratamiento_dias
         FROM casos
         WHERE estado = 'alta' AND descartado_el IS NULL
           AND (cerrado_el AT TIME ZONE '${ZONA}')::date BETWEEN $1::date AND $2::date`,
        [desde, hasta],
      ),
      pool.query(
        `SELECT (SELECT count(*) FROM casos WHERE estado = 'aceptada' AND descartado_el IS NULL
                   AND resuelto_el < now() - make_interval(days => $1))::int AS atascados,
                (SELECT count(*) FROM propuestas_informe WHERE estado = 'pendiente')::int AS propuestas_pendientes`,
        [avisos.dias_pendiente_cita],
      ),
    ]);

    const horas = respuestas.rows.map((r) => horasLaborables(new Date(`${r.enviado}Z`), new Date(`${r.resuelto}Z`)));
    const d = duracion.rows[0];
    return {
      rango: { desde, hasta },
      por_mes: porMes.rows,
      clinicas: clinicas.rows,
      respuesta: {
        mediana_horas: mediana(horas),
        resueltas: horas.length,
        en_24h: horas.filter((h) => h < 24).length,
        sin_resolver: sinResolver.rows[0].n,
      },
      embudo: embudo.rows[0],
      activos: activos.rows[0],
      duracion: {
        altas: d.altas,
        con_visita: d.con_visita,
        espera_dias: d.espera_dias === null ? null : Number(d.espera_dias),
        tratamiento_dias: d.tratamiento_dias === null ? null : Number(d.tratamiento_dias),
      },
      operativos: { ...operativos.rows[0], dias_pendiente_cita: avisos.dias_pendiente_cita },
    };
  });
}
