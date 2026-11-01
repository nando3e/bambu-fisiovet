// Configuración del panel de Bambú: contacto de la web, avisos (matriz, cola),
// retención y, solo para el superadmin, el servidor de correo.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { esHueco, TAMANO_MAXIMO, tipoDeImagen } from '../ficheros/imagenes-web.ts';
import { exigirSesion, ROLES_BAMBU, SOLO_SUPERADMIN } from '../auth/permisos.ts';
import { reintentarCorreo, trazarAviso } from '../avisos/cola.ts';
import { actualizarFilaMatriz, leerMatriz } from '../avisos/matriz.ts';
import { cifrar, descifrar } from '../cifrado.ts';
import {
  guardarConfiguracion, leerConfiguracion, type ValorConfig,
} from '../configuracion.ts';
import { renderizar } from '../correo/plantilla.ts';
import { crearTransporte, enviarCon, servidorCompleto } from '../correo/transporte.ts';
import { enTransaccion } from '../db/pool.ts';
import { clavesIa, modelosDisponibles } from '../llm/factory.ts';
import { conflicto, datosIncorrectos, noEncontrado } from '../errores.ts';
import { idDeRuta, validar, type Deps } from './index.ts';

const CLAVES_PANEL = ['contacto', 'avisos', 'retencion', 'consentimiento'] as const;

/** El servidor de correo tal y como sale por la API: sin la contraseña. */
function servidorPublico(s: ValorConfig<'correo_servidor'>) {
  const { contrasena_cifrada, ...resto } = s;
  return { ...resto, contrasena_configurada: contrasena_cifrada !== '' };
}

export async function rutasConfiguracion(app: FastifyInstance, deps: Deps): Promise<void> {
  const { pool, config, cola } = deps;

  app.get('/configuracion', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    return {
      contacto: await leerConfiguracion(pool, 'contacto'),
      avisos: await leerConfiguracion(pool, 'avisos'),
      retencion: await leerConfiguracion(pool, 'retencion'),
      consentimiento: await leerConfiguracion(pool, 'consentimiento'),
    };
  });

  // --- Avisos: matriz, correo del centro y cola ---
  app.get('/configuracion/avisos', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const avisos = await leerConfiguracion(pool, 'avisos');
    const servidor = await leerConfiguracion(pool, 'correo_servidor');
    return {
      correo_centro: avisos.correo_centro,
      dias_sin_noticias: avisos.dias_sin_noticias,
      dias_pendiente_cita: avisos.dias_pendiente_cita,
      dry_run: config.CORREO_DRY_RUN,
      smtp_configurado: servidorCompleto(servidor),
      matriz: await leerMatriz(pool),
    };
  });

  app.put('/configuracion/avisos/:evento', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { evento } = peticion.params as { evento: string };
    const d = validar(
      z.object({
        notificacion: z.boolean(),
        correo: z.boolean(),
        correo_a: z
          .string()
          .trim()
          .max(200)
          .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Correu no vàlid')
          .nullable()
          .default(null),
      }),
      peticion.body,
    );
    return enTransaccion(pool, (bd) => actualizarFilaMatriz(bd, evento, d, sesion.usuarioId));
  });

  app.get('/configuracion/avisos/cola', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { rows } = await pool.query(
      `SELECT id, destinatario, plantilla, estado, intentos, error, creado, proximo_intento
       FROM correos_pendientes
       -- Lo que está por salir, siempre; lo fallido, un mes, para poder verlo
       -- y reintentarlo aunque nadie haya entrado al panel en unos días.
       WHERE estado IN ('pendiente', 'en_curso')
          OR (estado = 'fallido' AND creado > now() - interval '30 days')
       ORDER BY id DESC LIMIT 100`,
    );
    return { correos: rows };
  });

  app.post('/configuracion/avisos/cola/:id/reintenta', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    if (!(await reintentarCorreo(pool, idDeRuta(peticion.params)))) {
      throw conflicto('Només es poden reintentar els correus fallits');
    }
    cola.despertar();
    return { ok: true };
  });

  // --- Servidor de correo: solo superadmin ---
  app.get('/configuracion/correo', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, SOLO_SUPERADMIN);
    return servidorPublico(await leerConfiguracion(pool, 'correo_servidor'));
  });

  app.put('/configuracion/correo', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_SUPERADMIN);
    const d = validar(
      z.object({
        host: z.string().trim().max(200),
        puerto: z.coerce.number().int().min(1).max(65535),
        seguridad: z.enum(['starttls', 'ssl']),
        usuario: z.string().trim().max(200),
        // Vacía = conservar la que hay.
        contrasena: z.string().max(500).optional().default(''),
        remitente_nombre: z.string().trim().max(100),
        remitente_email: z.string().trim().max(200),
      }),
      peticion.body,
    );
    const guardado = await enTransaccion(pool, async (bd) => {
      const actual = await leerConfiguracion(bd, 'correo_servidor');
      const { contrasena, ...resto } = d;
      return guardarConfiguracion(
        bd,
        'correo_servidor',
        {
          ...resto,
          contrasena_cifrada: contrasena ? cifrar(contrasena, config.CLAVE_CIFRADO) : actual.contrasena_cifrada,
        },
        sesion.usuarioId,
        // En el historial queda que cambió, nunca el valor.
        servidorPublico,
      );
    });
    cola.despertar();
    return servidorPublico(guardado);
  });

  app.post('/configuracion/correo/prueba', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, SOLO_SUPERADMIN);
    const { para } = validar(z.object({ para: z.string().trim().email('Correu no vàlid') }), peticion.body);
    const servidor = await leerConfiguracion(pool, 'correo_servidor');
    if (!servidorCompleto(servidor)) {
      throw datosIncorrectos('Guarda primer el servidor, el usuari, la contrasenya i el remitent');
    }
    const contrasena = descifrar(servidor.contrasena_cifrada, config.CLAVE_CIFRADO);
    if (contrasena === null) throw datosIncorrectos('No es pot llegir la contrasenya guardada: torna a escriure-la');
    // Excepción deliberada a «todo correo pasa por la cola» y a «el dry-run
    // del entorno manda»: es la prueba explícita del superadmin para comprobar
    // el SMTP antes de quitar el dry-run (design D7, plan de migración). Sale
    // en la petición para poder enseñar el error, y deja su traza igual.
    const transporte = crearTransporte(servidor, contrasena);
    try {
      const r = renderizar('prueba', { urlPublica: config.URL_PUBLICA });
      const resultado = await enviarCon(transporte, servidor, { para, ...r });
      const enviado = resultado.resultado === 'enviado';
      await trazarAviso(pool, {
        canal: 'correo', destinatario: para, plantilla: 'prueba', enviado,
        motivo: enviado ? null : `prova: ${resultado.motivo}`,
      });
      return enviado ? { enviado: true } : { enviado: false, error: resultado.motivo };
    } finally {
      transporte.close();
    }
  });

  // --- Inteligencia artificial: solo superadmin ---
  const iaPublica = async () => {
    const { ia, anthropic, openai } = await clavesIa(pool, config);
    return {
      anthropic_configurada: Boolean(ia.anthropic_cifrada),
      openai_configurada: Boolean(ia.openai_cifrada),
      // Hay clave aunque no sea del panel (la del entorno de respaldo).
      anthropic_disponible: Boolean(anthropic),
      openai_disponible: Boolean(openai),
      modelo_informe: ia.modelo_informe,
      modelo_informe_openai: ia.modelo_informe_openai,
      modelo_transcripcion: ia.modelo_transcripcion,
    };
  };

  app.get('/configuracion/ia', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, SOLO_SUPERADMIN);
    return iaPublica();
  });

  app.put('/configuracion/ia', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, SOLO_SUPERADMIN);
    const d = validar(z.object({
      // Vacío = se conserva la guardada; quitar_* la borra.
      anthropic: z.string().trim().max(500).default(''),
      openai: z.string().trim().max(500).default(''),
      quitar_anthropic: z.boolean().default(false),
      quitar_openai: z.boolean().default(false),
      modelo_informe: z.string().trim().min(1).max(80),
      modelo_informe_openai: z.string().trim().min(1).max(80),
      modelo_transcripcion: z.string().trim().min(1).max(80),
    }), peticion.body);
    await enTransaccion(pool, async (bd) => {
      const actual = await leerConfiguracion(bd, 'ia');
      const nueva = {
        anthropic_cifrada: d.quitar_anthropic ? '' : d.anthropic ? cifrar(d.anthropic, config.CLAVE_CIFRADO) : actual.anthropic_cifrada,
        openai_cifrada: d.quitar_openai ? '' : d.openai ? cifrar(d.openai, config.CLAVE_CIFRADO) : actual.openai_cifrada,
        modelo_informe: d.modelo_informe,
        modelo_informe_openai: d.modelo_informe_openai,
        modelo_transcripcion: d.modelo_transcripcion,
      };
      // El historial nunca guarda las claves, ni cifradas.
      await guardarConfiguracion(bd, 'ia', nueva, sesion.usuarioId, (v) => ({
        ...v, anthropic_cifrada: v.anthropic_cifrada ? '(configurada)' : '', openai_cifrada: v.openai_cifrada ? '(configurada)' : '',
      }));
    });
    return iaPublica();
  });

  app.post('/configuracion/ia/prueba', async (peticion, respuesta) => {
    await exigirSesion(peticion, respuesta, deps, SOLO_SUPERADMIN);
    const { redactor } = await modelosDisponibles(pool, config, deps.ia);
    if (!redactor) return { ok: false, error: 'No hi ha cap clau configurada.' };
    try {
      const r = await redactor.redactar({
        sistema: 'Respon en valencià.',
        texto: 'Escriu «correcte» al camp estat.',
        esquema: { type: 'object', additionalProperties: false, properties: { estat: { type: 'string' } }, required: ['estat'] },
        nombreEsquema: 'prova',
      });
      return { ok: true, modelo: r.modelo, latencia_ms: r.latenciaMs };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Error desconegut' };
    }
  });

  // --- Fotos de la web pública ---
  app.post('/configuracion/imagenes/:hueco', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { hueco } = peticion.params as { hueco: string };
    if (!esHueco(hueco)) throw noEncontrado();
    const archivo = await peticion.file({ limits: { fileSize: TAMANO_MAXIMO, files: 1 } });
    if (!archivo) throw datosIncorrectos('Tria una imatge');
    const datos = await archivo.toBuffer();
    const tipo = tipoDeImagen(datos);
    if (!tipo) throw datosIncorrectos('Només imatges JPG, PNG o WebP');
    const nombre = `${hueco}-${randomBytes(8).toString('hex')}.${tipo}`;
    const carpeta = join(resolve(config.RUTA_DATOS), 'web');
    await mkdir(carpeta, { recursive: true });
    await writeFile(join(carpeta, nombre), datos);
    await enTransaccion(pool, async (bd) => {
      const actual = await leerConfiguracion(bd, 'imagenes_web');
      await guardarConfiguracion(bd, 'imagenes_web', { ...actual, [hueco]: nombre }, sesion.usuarioId);
    });
    return { url: `/api/publico/imagenes/${nombre}` };
  });

  app.post('/configuracion/imagenes/:hueco/restaura', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { hueco } = peticion.params as { hueco: string };
    if (!esHueco(hueco)) throw noEncontrado();
    await enTransaccion(pool, async (bd) => {
      const actual = await leerConfiguracion(bd, 'imagenes_web');
      await guardarConfiguracion(bd, 'imagenes_web', { ...actual, [hueco]: '' }, sesion.usuarioId);
    });
    return { url: null };
  });

  // --- Claves simples: contacto, avisos (correo del centro), retención ---
  app.put('/configuracion/:clave', async (peticion, respuesta) => {
    const sesion = await exigirSesion(peticion, respuesta, deps, ROLES_BAMBU);
    const { clave } = peticion.params as { clave: string };
    if (!(CLAVES_PANEL as readonly string[]).includes(clave)) throw noEncontrado();
    return enTransaccion(pool, (bd) =>
      guardarConfiguracion(bd, clave as (typeof CLAVES_PANEL)[number], peticion.body, sesion.usuarioId),
    );
  });
}
