// La cuenta de servicio, definida por variables de entorno.
//
// Decisión de Nando: usuario y contraseña en claro en el entorno, sin hash en
// la base. El login compara contra la variable en tiempo constante, así que
// cambiarla y reiniciar es la forma de recuperar el acceso. En la base hay una
// fila `es_de_entorno` solo para que sus acciones tengan autor.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.ts';
import { enTransaccion, type Pool } from './db/pool.ts';

export async function aplicarSuperadmin(pool: Pool, config: Config): Promise<string> {
  const usuario = config.SUPERADMIN_USUARIO.trim();
  return enTransaccion(pool, async (bd) => {
    // Si el usuario del superadmin es el correo de alguien de verdad, el login
    // no sabría a quién se refiere. Mejor no arrancar.
    const { rows: choque } = await bd.query(
      'SELECT 1 FROM usuarios WHERE NOT es_de_entorno AND lower(email) = lower($1)',
      [usuario],
    );
    if (choque.length > 0) {
      throw new Error(
        `SUPERADMIN_USUARIO («${usuario}») coincide con el correo de un usuario. Cambia la variable.`,
      );
    }

    const { rows } = await bd.query<{ id: number }>(
      'SELECT id FROM usuarios WHERE es_de_entorno LIMIT 1',
    );
    const existente = rows[0];
    let id: number;
    if (existente) {
      id = existente.id;
      await bd.query(
        `UPDATE usuarios SET usuario = $1, rol = 'superadmin', activo = true WHERE id = $2`,
        [usuario, id],
      );
    } else {
      const { rows: nuevos } = await bd.query<{ id: number }>(
        `INSERT INTO usuarios (usuario, nombre, apellidos, rol, es_de_entorno, verificado_el, recibe_correos)
         VALUES ($1, 'Superadmin', '', 'superadmin', true, now(), false)
         RETURNING id`,
        [usuario],
      );
      id = nuevos[0]!.id;
    }

    // Sin hash guardado no se puede saber si la contraseña ha cambiado, así
    // que en cada arranque se cierran sus sesiones: un despliegue le pide
    // volver a entrar, y una contraseña cambiada no deja sesiones viejas vivas.
    await bd.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);

    return config.SUPERADMIN_CONTRASENA
      ? `Superadmin listo: «${usuario}».`
      : 'Aviso: no hay SUPERADMIN_CONTRASENA, así que nadie puede entrar como superadmin.';
  });
}

export function esUsuarioSuperadmin(config: Config, identificador: string): boolean {
  return identificador.trim().toLowerCase() === config.SUPERADMIN_USUARIO.trim().toLowerCase();
}

/** Compara con la variable en tiempo constante (sobre los SHA-256, para igualar longitudes). */
export function contrasenaSuperadminCorrecta(config: Config, contrasena: string): boolean {
  if (!config.SUPERADMIN_CONTRASENA) return false;
  const a = createHash('sha256').update(contrasena).digest();
  const b = createHash('sha256').update(config.SUPERADMIN_CONTRASENA).digest();
  return timingSafeEqual(a, b);
}
