// Utilidades para los tests de integración.
//
// Candado heredado de happydog y forestal: estos tests hacen DROP DATABASE. Si
// el nombre no acaba en `_test`, se niegan a arrancar. Cada fichero tiene su
// base, porque los ficheros corren en paralelo.
import pg from 'pg';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { construirServidor, type Opciones } from '../src/servidor.ts';
import type { CanalCorreo, MensajeCorreo, ResultadoCanal } from '../src/correo/transporte.ts';

const BASE_ADMIN = process.env.DATABASE_URL_ADMIN ?? 'postgres://bambu:bambu_local@localhost:5438/postgres';

export async function baseLimpia(sufijo: string): Promise<string> {
  const nombre = `bambu_${sufijo.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_test`;
  if (!nombre.endsWith('_test')) throw new Error(`La base de tests debe acabar en _test, y es ${nombre}`);
  const admin = new pg.Client({ connectionString: BASE_ADMIN });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [nombre],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${nombre}`);
    await admin.query(`CREATE DATABASE ${nombre}`);
  } finally {
    await admin.end();
  }
  return BASE_ADMIN.replace(/\/[^/]*$/, `/${nombre}`);
}

/** Canal de correo falso: apunta lo que se envía y puede fallar a voluntad. */
export class CanalFalso implements CanalCorreo {
  enviados: MensajeCorreo[] = [];
  fallar: string | null = null;
  async enviar(m: MensajeCorreo): Promise<ResultadoCanal> {
    if (this.fallar) return { resultado: 'error', motivo: this.fallar };
    this.enviados.push(m);
    return { resultado: 'enviado' };
  }
}

export const ENTORNO_BASE = {
  SECRETO_SESION: 'secreto-de-sesion-solo-para-tests',
  CLAVE_CIFRADO: 'clave-de-cifrado-solo-para-tests',
  URL_PUBLICA: 'https://bambu.test',
  SUPERADMIN_USUARIO: 'superadmin',
  SUPERADMIN_CONTRASENA: 'contrasena-del-superadmin',
  CORREO_DRY_RUN: 'false',
  COLA_ACTIVA: 'false',
  LIMITE_INTENTOS: '10000',
  NIVEL_LOG: 'silent',
  RUTA_DATOS: './datos-test',
};

export async function servidorDePrueba(
  sufijo: string,
  entorno: Record<string, string> = {},
  opciones: Opciones & { url?: string } = {},
) {
  const url = opciones.url ?? (await baseLimpia(sufijo));
  const canal = (opciones.canal as CanalFalso | undefined) ?? new CanalFalso();
  const servidor = await construirServidor(
    { ...ENTORNO_BASE, DATABASE_URL: url, ...entorno } as NodeJS.ProcessEnv,
    { carpetaWeb: './no-hay-web', ...opciones, canal },
  );
  await servidor.app.ready();
  return { ...servidor, canal, url };
}

export type Servidor = Awaited<ReturnType<typeof servidorDePrueba>>;

export function cookieDe(r: LightMyRequestResponse): string {
  const cookies = r.headers['set-cookie'];
  const lista = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  return lista.map((c) => c.split(';')[0]).join('; ');
}

export async function pedir(
  app: FastifyInstance,
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  opciones: { cookie?: string; cuerpo?: unknown } = {},
) {
  const r = await app.inject({
    method: metodo,
    url,
    ...(opciones.cookie ? { headers: { cookie: opciones.cookie } } : {}),
    ...(opciones.cuerpo !== undefined ? { payload: opciones.cuerpo as object } : {}),
  });
  let cuerpo: any = null;
  try {
    cuerpo = r.json();
  } catch {
    cuerpo = r.body;
  }
  return { estado: r.statusCode, cuerpo, cookie: cookieDe(r), respuesta: r };
}

/** El token del último correo encolado a esa dirección con esa plantilla. */
export async function tokenDelCorreo(pool: pg.Pool, destinatario: string, plantilla?: string): Promise<string> {
  const { rows } = await pool.query<{ datos: { enlace?: string } }>(
    `SELECT datos FROM correos_pendientes
     WHERE lower(destinatario) = lower($1) AND ($2::text IS NULL OR plantilla = $2)
     ORDER BY id DESC LIMIT 1`,
    [destinatario, plantilla ?? null],
  );
  const enlace = rows[0]?.datos.enlace;
  if (!enlace) throw new Error(`No hay correo con enlace para ${destinatario}`);
  return enlace.split('/').pop()!;
}

let contador = 0;
export function correoUnico(prefijo = 'vet', dominio = 'gmail.com'): string {
  contador += 1;
  return `${prefijo}${Date.now()}${contador}@${dominio}`;
}

export const CONTRASENA = 'una-contrasena-larga';

/** Da de alta a un veterinario, verifica su correo y devuelve su cookie. */
export async function veterinarioVerificado(
  s: Servidor,
  datos: { email?: string; clinica?: string; nombre?: string; union_clinica_id?: number } = {},
) {
  const email = datos.email ?? correoUnico();
  const alta = await pedir(s.app, 'POST', '/api/auth/registro', {
    cuerpo: {
      nombre: datos.nombre ?? 'Marta',
      apellidos: 'Puig',
      email,
      telefono: '600123456',
      clinica: { nombre: datos.clinica ?? `Clínica ${email}` },
      privacidad: true,
      ...(datos.union_clinica_id ? { union_clinica_id: datos.union_clinica_id } : {}),
    },
  });
  if (alta.estado !== 200) throw new Error(`Alta fallida: ${JSON.stringify(alta.cuerpo)}`);
  const token = await tokenDelCorreo(s.pool, email, 'verificacion');
  const r = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token, contrasena: CONTRASENA },
  });
  if (r.estado !== 200) throw new Error(`Verificación fallida: ${JSON.stringify(r.cuerpo)}`);
  return { email, cookie: r.cookie, usuario: r.cuerpo.usuario as { id: number; clinica: { id: number; nombre: string } } };
}

export async function entrarSuperadmin(s: Servidor): Promise<string> {
  const r = await pedir(s.app, 'POST', '/api/auth/entrar', {
    cuerpo: { identificador: 'superadmin', contrasena: ENTORNO_BASE.SUPERADMIN_CONTRASENA },
  });
  if (r.estado !== 200) throw new Error(`Superadmin no entra: ${JSON.stringify(r.cuerpo)}`);
  return r.cookie;
}

/** Invita a un usuario de Bambú, acepta la invitación y devuelve su cookie. */
export async function fisioVerificada(s: Servidor, cookieAdmin: string, nombre = 'Laia') {
  const email = correoUnico('fisio', 'bambufisiovet.com');
  const r = await pedir(s.app, 'POST', '/api/usuarios', {
    cookie: cookieAdmin,
    cuerpo: { nombre, apellidos: 'Serra', email },
  });
  if (r.estado !== 201) throw new Error(`Invitación fallida: ${JSON.stringify(r.cuerpo)}`);
  const token = await tokenDelCorreo(s.pool, email, 'invitacion-bambu');
  const e = await pedir(s.app, 'POST', '/api/auth/establece-contrasena', {
    cuerpo: { token, contrasena: CONTRASENA },
  });
  if (e.estado !== 200) throw new Error(`Aceptar invitación fallida: ${JSON.stringify(e.cuerpo)}`);
  return { email, cookie: e.cookie, id: r.cuerpo.id as number };
}
