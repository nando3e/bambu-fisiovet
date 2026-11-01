// Cuentas: alta, entrar, salir, enlaces de correo, recuperación, contraseña y
// perfil.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  comprobarContrasena, gastarTiempoComoSiComprobara, hashearContrasena,
} from '../auth/contrasena.ts';
import { exigirSesion } from '../auth/permisos.ts';
import { abrirSesion, cerrarSesion, revocarSesiones } from '../auth/sesion.ts';
import { consultarToken, consumirToken, emitirToken } from '../auth/tokens.ts';
import { encolarCorreo } from '../avisos/cola.ts';
import { publicarEvento } from '../avisos/publicar.ts';
import { enTransaccion, type Consultable } from '../db/pool.ts';
import { registrarCambio } from '../db/historial.ts';
import { problemaDeContrasena } from '../dominio/contrasena-valida.ts';
import { dominioDeClinica } from '../dominio/dominios-genericos.ts';
import { nifValido, normalizarNif } from '../dominio/nif.ts';
import { datosIncorrectos, prohibido } from '../errores.ts';
import {
  contrasenaSuperadminCorrecta, esUsuarioSuperadmin,
} from '../superadmin.ts';
import { frenoIntentos, validar, type Deps } from './index.ts';

/** Versión del texto de privacidad que acepta quien se da de alta. */
export const VERSION_PRIVACIDAD = '2026-10';

const correo = z.string().trim().toLowerCase().email('Correu no vàlid').max(200);
const texto = (max: number) => z.string().trim().max(max);

const esquemaRegistro = z.object({
  nombre: texto(80).min(1, 'Cal el nom'),
  apellidos: texto(120).min(1, 'Cal els cognoms'),
  email: correo,
  telefono: texto(30).min(6, 'Cal un telèfon de contacte'),
  num_colegiado: texto(40).min(1, 'Cal el número de col·legiat'),
  clinica: z.object({
    nombre: texto(150).min(2, 'Cal el nom de la clínica'),
    poblacion: texto(100).min(1, 'Cal la població'),
    cif: texto(20).min(1, 'Cal el CIF o NIF de la clínica').refine((v) => v === '' || nifValido(v), 'CIF o NIF no vàlid')
      .transform(normalizarNif),
  }),
  privacidad: z.literal(true, { errorMap: () => ({ message: 'Cal acceptar la política de privacitat' }) }),
});

const RESPUESTA_ALTA = {
  ok: true,
  mensaje: "T'hem enviat un correu per a confirmar l'adreça i triar la contrasenya.",
};
const RESPUESTA_RECUPERA = {
  ok: true,
  mensaje: "Si existeix un compte amb aquest correu, t'hem enviat un enllaç.",
};
const ENLACE_INVALIDO = "Aquest enllaç ja s'ha fet servir o ha caducat";

/**
 * Correos de cuenta que se pueden provocar desde fuera hacia una dirección:
 * como mucho tres por hora. Pasado el freno no se emite enlace nuevo (los
 * anteriores siguen valiendo) y la respuesta es la de siempre, para que nadie
 * pueda saturar el buzón de un veterinario ni dejarle sin enlace válido.
 */
const PLANTILLAS_DE_CUENTA = ['verificacion', 'recuperacion', 'alta-existente', 'clinica-existente'];
async function frenoPorDestinatario(bd: Consultable, email: string): Promise<boolean> {
  const { rows } = await bd.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM correos_pendientes
     WHERE lower(destinatario) = $1 AND plantilla = ANY($2) AND creado > now() - interval '1 hour'`,
    [email, PLANTILLAS_DE_CUENTA],
  );
  return rows[0]!.n >= 3;
}

export interface DatosYo {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  telefono: string | null;
  num_colegiado: string | null;
  rol: 'superadmin' | 'bambu' | 'derivador';
  recibe_correos: boolean;
  es_de_entorno: boolean;
  clinica: { id: number; nombre: string } | null;
}

export async function datosYo(bd: Consultable, usuarioId: number): Promise<DatosYo> {
  const { rows } = await bd.query<DatosYo & { clinica_id: number | null; clinica_nombre: string | null }>(
    `SELECT u.id, u.nombre, u.apellidos, u.email, u.telefono, u.num_colegiado, u.rol,
            u.recibe_correos, u.es_de_entorno, c.id AS clinica_id, c.nombre AS clinica_nombre
     FROM usuarios u LEFT JOIN clinicas c ON c.id = u.clinica_id WHERE u.id = $1`,
    [usuarioId],
  );
  const f = rows[0]!;
  return {
    id: f.id, nombre: f.nombre, apellidos: f.apellidos, email: f.email, telefono: f.telefono,
    num_colegiado: f.num_colegiado, rol: f.rol, recibe_correos: f.recibe_correos,
    es_de_entorno: f.es_de_entorno,
    clinica: f.clinica_id ? { id: f.clinica_id, nombre: f.clinica_nombre! } : null,
  };
}

const enlaceToken = (token: string) => `/acces/estableix/${token}`;

export async function rutasAuth(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, config, cola } = deps;
  const freno = { config: frenoIntentos(config) };

  app.post('/auth/registro', freno, async (peticion) => {
    const d = validar(esquemaRegistro, peticion.body);
    // El usuario del superadmin no puede ser el correo de nadie: el login no
    // sabría a quién se refiere y el siguiente arranque se negaría a levantar.
    // Misma respuesta que siempre, sin crear nada.
    if (esUsuarioSuperadmin(config, d.email)) return RESPUESTA_ALTA;
    try {
      await enTransaccion(pool, async (bd) => {
        const { rows: existentes } = await bd.query<{
          id: number; nombre: string; activo: boolean; es_de_entorno: boolean; verificado: boolean;
        }>(
          `SELECT id, nombre, activo, es_de_entorno, verificado_el IS NOT NULL AS verificado
           FROM usuarios WHERE lower(email) = $1`,
          [d.email],
        );
        const existente = existentes[0];
        if (await frenoPorDestinatario(bd, d.email)) return;
        if (existente) {
          // Misma respuesta que un alta nueva: no se le dice a nadie qué correos
          // tienen cuenta. Si aún no la verificó, le llega otra vez la
          // verificación; si ya la tiene, cómo recuperarla.
          if (existente.activo && !existente.es_de_entorno && !existente.verificado) {
            const token = await emitirToken(bd, existente.id, 'verificacion');
            await encolarCorreo(bd, {
              destinatario: d.email, usuarioId: existente.id, plantilla: 'verificacion',
              datos: { nombre: existente.nombre, enlace: enlaceToken(token) },
            });
          } else if (existente.activo && !existente.es_de_entorno) {
            const token = await emitirToken(bd, existente.id, 'recuperacion');
            await encolarCorreo(bd, {
              destinatario: d.email, usuarioId: existente.id, plantilla: 'alta-existente',
              datos: { nombre: existente.nombre, enlace: enlaceToken(token) },
            });
          }
          return;
        }

        // El CIF no da acceso a nada (es público): solo evita clínicas
        // repetidas. A una clínica que ya está en el portal se entra por
        // invitación; a quien lo intenta se le dice a su propio correo, nunca
        // en la pantalla ni a la clínica.
        const { rows: conCif } = await bd.query<{ id: number; real: boolean }>(
          `SELECT c.id, (c.alta_por_bambu OR EXISTS (SELECT 1 FROM usuarios u WHERE u.clinica_id = c.id
                                                AND u.activo AND u.verificado_el IS NOT NULL)) AS real
           FROM clinicas c WHERE c.activa AND c.cif = $1 FOR UPDATE`,
          [d.clinica.cif],
        );
        const ocupada = conCif[0];
        // Una clínica con ese CIF solo se retira si es una reserva caducada:
        // nadie verificado, ningún enlace vigente y sin casos ni pacientes. Se
        // bloquean sus usuarios antes de mirar, para no cruzarse con quien la
        // está confirmando en ese momento. Mientras haya un enlace vigente, la
        // clínica es de quien se registró primero: nadie se la puede quitar.
        let retirable = false;
        if (ocupada && !ocupada.real) {
          await bd.query('SELECT id FROM usuarios WHERE clinica_id = $1 FOR UPDATE', [ocupada.id]);
          const { rows: viva } = await bd.query(
            `SELECT 1 FROM usuarios u WHERE u.clinica_id = $1 AND (u.verificado_el IS NOT NULL
               OR EXISTS (SELECT 1 FROM tokens_correo t WHERE t.usuario_id = u.id AND t.usado_el IS NULL AND t.caduca > now()))
             UNION ALL SELECT 1 FROM casos WHERE clinica_id = $1
             UNION ALL SELECT 1 FROM pacientes WHERE clinica_origen_id = $1
             LIMIT 1`,
            [ocupada.id],
          );
          retirable = viva.length === 0;
        }
        if (ocupada && !retirable) {
          await encolarCorreo(bd, {
            destinatario: d.email, plantilla: 'clinica-existente', datos: { nombre: d.nombre },
          });
          return;
        }
        if (ocupada) {
          // Un alta que nunca se confirmó y cuyo enlace ya caducó: sin datos,
          // porque sin verificar no se entra. Se retira para que no bloquee el
          // CIF para siempre.
          const { rows: retirados } = await bd.query<{ id: number }>(
            'UPDATE usuarios SET activo = false WHERE clinica_id = $1 AND verificado_el IS NULL RETURNING id',
            [ocupada.id],
          );
          await bd.query(
            'UPDATE tokens_correo SET caduca = least(caduca, now()) WHERE usuario_id = ANY($1) AND usado_el IS NULL',
            [retirados.map((r) => r.id)],
          );
          await bd.query('UPDATE clinicas SET activa = false WHERE id = $1', [ocupada.id]);
          await registrarCambio(bd, {
            tabla: 'clinicas', filaId: ocupada.id, antes: { activa: true },
            despues: { activa: false, motivo: 'alta sin confirmar y caducada, con el mismo CIF que un alta nueva', usuarios_retirados: retirados.map((r) => r.id) },
            usuarioId: null, origen: 'sistema',
          });
        }

        const { rows: clinicas } = await bd.query<{ id: number }>(
          `INSERT INTO clinicas (nombre, poblacion, cif, dominio_correo) VALUES ($1, $2, $3, $4) RETURNING id`,
          [d.clinica.nombre, d.clinica.poblacion, d.clinica.cif, dominioDeClinica(d.email)],
        );
        const { rows: usuarios } = await bd.query<{ id: number }>(
          `INSERT INTO usuarios (email, nombre, apellidos, telefono, num_colegiado, rol, clinica_id,
                                 privacidad_version, privacidad_el)
           VALUES ($1, $2, $3, $4, $5, 'derivador', $6, $7, now()) RETURNING id`,
          [d.email, d.nombre, d.apellidos, d.telefono, d.num_colegiado, clinicas[0]!.id,
            VERSION_PRIVACIDAD],
        );
        const token = await emitirToken(bd, usuarios[0]!.id, 'verificacion');
        await encolarCorreo(bd, {
          destinatario: d.email, usuarioId: usuarios[0]!.id, plantilla: 'verificacion',
          datos: { nombre: d.nombre, enlace: enlaceToken(token) },
        });
      });
    } catch (error) {
      // Dos altas a la vez con el mismo correo o el mismo CIF: la segunda
      // choca con el índice único. Para quien la manda, la misma respuesta.
      if ((error as { code?: string }).code !== '23505') throw error;
    }
    cola.despertar();
    return RESPUESTA_ALTA;
  });

  app.post('/auth/reenvia-verificacion', freno, async (peticion) => {
    const { email } = validar(z.object({ email: correo }), peticion.body);
    await enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query<{ id: number; nombre: string }>(
        `SELECT id, nombre FROM usuarios
         WHERE lower(email) = $1 AND activo AND verificado_el IS NULL AND rol = 'derivador'`,
        [email],
      );
      const usuario = rows[0];
      if (!usuario) return;
      const { rows: recientes } = await bd.query<{ n: number }>(
        `SELECT count(*) AS n FROM tokens_correo
         WHERE usuario_id = $1 AND tipo = 'verificacion' AND creado > now() - interval '1 hour'`,
        [usuario.id],
      );
      // El primero es el del alta; tres reenvíos por hora como mucho. Pasado
      // el freno, la respuesta es la de siempre: un 429 solo para las cuentas
      // pendientes diría a cualquiera qué correos tienen un alta a medias.
      if (Number(recientes[0]?.n ?? 0) >= 4) return;
      const { rows: anterior } = await bd.query<{ datos: Record<string, unknown> }>(
        `SELECT datos FROM tokens_correo WHERE usuario_id = $1 AND tipo = 'verificacion'
         ORDER BY creado DESC LIMIT 1`,
        [usuario.id],
      );
      const token = await emitirToken(bd, usuario.id, 'verificacion', anterior[0]?.datos ?? {});
      await encolarCorreo(bd, {
        destinatario: email, usuarioId: usuario.id, plantilla: 'verificacion',
        datos: { nombre: usuario.nombre, enlace: enlaceToken(token) },
      });
    });
    cola.despertar();
    return RESPUESTA_ALTA;
  });

  app.post('/auth/entrar', freno, async (peticion, respuesta) => {
    const d = validar(
      z.object({ identificador: z.string().trim().min(1).max(200), contrasena: z.string().min(1).max(200) }),
      peticion.body,
    );
    let usuarioId: number | null = null;

    if (esUsuarioSuperadmin(config, d.identificador)) {
      await gastarTiempoComoSiComprobara(d.contrasena);
      if (contrasenaSuperadminCorrecta(config, d.contrasena)) {
        const { rows } = await pool.query<{ id: number }>(
          'SELECT id FROM usuarios WHERE es_de_entorno AND activo LIMIT 1',
        );
        usuarioId = rows[0]?.id ?? null;
      }
    } else {
      const { rows } = await pool.query<{
        id: number; contrasena_hash: string | null; verificado_el: Date | null; activo: boolean;
      }>(
        `SELECT id, contrasena_hash, verificado_el, activo FROM usuarios
         WHERE lower(email) = lower($1) AND NOT es_de_entorno`,
        [d.identificador],
      );
      const u = rows[0];
      // Mismo trabajo y mismo mensaje si no existe, no ha verificado, está
      // desactivado o la contraseña no es: no se revela qué cuentas hay.
      const valida = u && u.contrasena_hash && u.verificado_el && u.activo
        ? await comprobarContrasena(d.contrasena, u.contrasena_hash)
        : await gastarTiempoComoSiComprobara(d.contrasena);
      if (valida) usuarioId = u!.id;
    }

    if (!usuarioId) return respuesta.code(401).send({ error: 'Correu o contrasenya incorrectes' });
    await abrirSesion(pool, respuesta, config, usuarioId, peticion.headers['user-agent']);
    return datosYo(pool, usuarioId);
  });

  app.post('/auth/salir', async (peticion, respuesta) => {
    await cerrarSesion(pool, peticion, respuesta);
    return { ok: true };
  });

  app.get('/auth/yo', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    return datosYo(pool, sesion.usuarioId);
  });

  // Mira un enlace sin gastarlo, para pintar la pantalla adecuada.
  app.get('/auth/tokens/:token', { config: frenoIntentos(config, config.LIMITE_INTENTOS * 3) }, async (peticion) => {
    const { token } = peticion.params as { token: string };
    const info = await consultarToken(pool, token);
    if (info.estado === 'inexistente' || !info.usuarioId) return { estado: 'inexistente' };
    const { rows } = await pool.query<{ nombre: string; email: string | null; rol: string; pide_privacidad: boolean }>(
      'SELECT nombre, email, rol, privacidad_el IS NULL AS pide_privacidad FROM usuarios WHERE id = $1',
      [info.usuarioId],
    );
    const u = rows[0];
    return {
      estado: info.estado,
      tipo: info.tipo,
      nombre: u?.nombre ?? null,
      // El correo solo si el enlace vale o ha caducado (para poder reenviarlo).
      email: info.estado === 'usado' ? null : (u?.email ?? null),
      rol: u?.rol ?? null,
      // Los invitados no pasaron por el alta: aceptan la privacidad aquí.
      pide_privacidad: u?.pide_privacidad ?? false,
    };
  });

  app.post('/auth/establece-contrasena', freno, async (peticion, respuesta) => {
    const d = validar(
      z.object({
        token: z.string().min(10).max(200),
        contrasena: z.string().min(1).max(200),
        privacidad: z.boolean().optional(),
      }),
      peticion.body,
    );
    const resultado = await enTransaccion(pool, async (bd) => {
      const consumido = await consumirToken(bd, d.token);
      if (!consumido) throw datosIncorrectos(ENLACE_INVALIDO);

      const { rows } = await bd.query<{
        id: number; email: string | null; rol: 'bambu' | 'derivador' | 'superadmin'; nombre: string;
        apellidos: string; clinica_id: number | null; verificado_el: Date | null; activo: boolean;
        clinica_nombre: string | null; privacidad_el: Date | null;
      }>(
        `SELECT u.id, u.email, u.rol, u.nombre, u.apellidos, u.clinica_id, u.verificado_el, u.activo,
                u.privacidad_el, c.nombre AS clinica_nombre
         FROM usuarios u LEFT JOIN clinicas c ON c.id = u.clinica_id
         WHERE u.id = $1 FOR UPDATE OF u`,
        [consumido.usuarioId],
      );
      const u = rows[0];
      if (!u || !u.activo || u.rol === 'superadmin') throw datosIncorrectos(ENLACE_INVALIDO);

      // Si la contraseña no vale, el error deshace también el consumo del token.
      const problema = problemaDeContrasena(d.contrasena, u.email);
      if (problema) throw datosIncorrectos(problema);
      // Quien llega por invitación no ha pasado por el alta: acepta aquí la
      // política de privacidad. Sin aceptarla, el enlace sigue sin usar.
      const pidePrivacidad = u.privacidad_el === null;
      if (pidePrivacidad && d.privacidad !== true) {
        throw datosIncorrectos('Cal acceptar la política de privacitat', {
          campos: { privacidad: 'Cal acceptar la política de privacitat' },
        });
      }

      await bd.query(
        `UPDATE usuarios SET contrasena_hash = $2, verificado_el = coalesce(verificado_el, now()),
                privacidad_version = CASE WHEN $3 THEN $4 ELSE privacidad_version END,
                privacidad_el = CASE WHEN $3 THEN now() ELSE privacidad_el END
         WHERE id = $1`,
        [u.id, await hashearContrasena(d.contrasena), pidePrivacidad, VERSION_PRIVACIDAD],
      );
      if (consumido.tipo === 'recuperacion') await revocarSesiones(bd, u.id);

      const primeraVez = u.verificado_el === null;
      if (primeraVez) {
        const nombre = `${u.nombre} ${u.apellidos}`.trim();
        await publicarEvento(bd, {
          tipo: u.rol === 'bambu' ? 'usuario.bambu_alta' : 'usuario.derivador_alta',
          actor: { id: u.id, rol: u.rol },
          clinicaId: u.clinica_id,
          datos: { nombre, clinica: u.clinica_nombre },
        });
      }

      await abrirSesion(bd, respuesta, config, u.id, peticion.headers['user-agent']);
      const destino = u.rol === 'derivador' ? (primeraVez ? '/d/nova' : '/d') : '/b';
      return { destino, usuario: await datosYo(bd, u.id) };
    });
    cola.despertar();
    return resultado;
  });

  app.post('/auth/recupera', freno, async (peticion) => {
    // Cualquier texto: lo que no es un correo (el usuario del superadmin, por
    // ejemplo) recibe la misma respuesta genérica, no un 400 que lo distinga.
    const { email: bruto } = validar(z.object({ email: z.string().max(200) }), peticion.body);
    const comprobado = correo.safeParse(bruto);
    if (!comprobado.success) return RESPUESTA_RECUPERA;
    const email = comprobado.data;
    await enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query<{ id: number; nombre: string }>(
        'SELECT id, nombre FROM usuarios WHERE lower(email) = $1 AND activo AND NOT es_de_entorno',
        [email],
      );
      const u = rows[0];
      if (!u || await frenoPorDestinatario(bd, email)) return;
      const token = await emitirToken(bd, u.id, 'recuperacion');
      await encolarCorreo(bd, {
        destinatario: email, usuarioId: u.id, plantilla: 'recuperacion',
        datos: { nombre: u.nombre, enlace: enlaceToken(token) },
      });
    });
    cola.despertar();
    return RESPUESTA_RECUPERA;
  });

  app.post('/auth/cambia-contrasena', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    if (sesion.esDeEntorno) throw prohibido("La contrasenya del superadmin es canvia a l'entorn");
    const d = validar(
      z.object({ actual: z.string().min(1).max(200), nueva: z.string().min(1).max(200) }),
      peticion.body,
    );
    await enTransaccion(pool, async (bd) => {
      const { rows } = await bd.query<{ contrasena_hash: string | null; email: string | null }>(
        'SELECT contrasena_hash, email FROM usuarios WHERE id = $1 FOR UPDATE',
        [sesion.usuarioId],
      );
      const u = rows[0];
      if (!u?.contrasena_hash || !(await comprobarContrasena(d.actual, u.contrasena_hash))) {
        throw datosIncorrectos('La contrasenya actual no és correcta');
      }
      const problema = problemaDeContrasena(d.nueva, u.email);
      if (problema) throw datosIncorrectos(problema);
      await bd.query('UPDATE usuarios SET contrasena_hash = $2 WHERE id = $1', [
        sesion.usuarioId, await hashearContrasena(d.nueva),
      ]);
      await revocarSesiones(bd, sesion.usuarioId, sesion.tokenHash);
    });
    return { ok: true };
  });

  app.patch('/auth/perfil', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps);
    if (sesion.esDeEntorno) throw prohibido("El perfil del superadmin es defineix a l'entorn");
    const d = validar(
      z.object({
        nombre: texto(80).min(1).optional(),
        apellidos: texto(120).min(1).optional(),
        telefono: texto(30).optional(),
        num_colegiado: texto(40).optional(),
        recibe_correos: z.boolean().optional(),
      }),
      peticion.body,
    );
    await enTransaccion(pool, async (bd) => {
      const antes = await datosYo(bd, sesion.usuarioId);
      await bd.query(
        `UPDATE usuarios SET
           nombre = coalesce($2, nombre), apellidos = coalesce($3, apellidos),
           telefono = CASE WHEN $4::text IS NULL THEN telefono ELSE nullif($4, '') END,
           num_colegiado = CASE WHEN $5::text IS NULL THEN num_colegiado ELSE nullif($5, '') END,
           recibe_correos = coalesce($6, recibe_correos)
         WHERE id = $1`,
        [sesion.usuarioId, d.nombre ?? null, d.apellidos ?? null, d.telefono ?? null,
          d.num_colegiado ?? null, d.recibe_correos ?? null],
      );
      await registrarCambio(bd, {
        tabla: 'usuarios', filaId: sesion.usuarioId, antes, despues: d, usuarioId: sesion.usuarioId,
      });
    });
    return datosYo(pool, sesion.usuarioId);
  });
}
