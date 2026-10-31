// Roles en todas las rutas privadas: sin sesión 401, rol equivocado 403. La
// frontera es el servidor; esta tabla se amplía con cada ruta nueva.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado, type Servidor,
} from './ayuda.ts';

type Quien = 'cualquiera' | 'bambu' | 'derivador' | 'superadmin';
type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH';

const RUTAS: [Metodo, string, Quien][] = [
  ['GET', '/api/auth/yo', 'cualquiera'],
  ['POST', '/api/auth/cambia-contrasena', 'cualquiera'],
  ['PATCH', '/api/auth/perfil', 'cualquiera'],
  ['GET', '/api/clinicas/mia', 'derivador'],
  ['PATCH', '/api/clinicas/mia', 'derivador'],
  ['GET', '/api/clinicas', 'bambu'],
  ['GET', '/api/clinicas/1/usuarios', 'bambu'],
  ['PATCH', '/api/clinicas/1', 'bambu'],
  ['POST', '/api/clinicas/1/solicitudes-union', 'derivador'],
  ['GET', '/api/solicitudes-union', 'cualquiera'],
  ['POST', '/api/solicitudes-union/1/aprueba', 'cualquiera'],
  ['POST', '/api/solicitudes-union/1/rechaza', 'cualquiera'],
  ['POST', '/api/clinicas/mia/invitaciones', 'derivador'],
  ['GET', '/api/configuracion', 'bambu'],
  ['GET', '/api/configuracion/avisos', 'bambu'],
  ['PUT', '/api/configuracion/avisos/derivacion.enviada', 'bambu'],
  ['GET', '/api/configuracion/avisos/cola', 'bambu'],
  ['POST', '/api/configuracion/avisos/cola/1/reintenta', 'bambu'],
  ['GET', '/api/configuracion/correo', 'superadmin'],
  ['PUT', '/api/configuracion/correo', 'superadmin'],
  ['POST', '/api/configuracion/correo/prueba', 'superadmin'],
  ['POST', '/api/configuracion/imagenes/portada', 'bambu'],
  ['POST', '/api/configuracion/imagenes/portada/restaura', 'bambu'],
  ['PUT', '/api/configuracion/contacto', 'bambu'],
  ['GET', '/api/notificaciones', 'cualquiera'],
  ['GET', '/api/notificaciones/resumen', 'cualquiera'],
  ['POST', '/api/notificaciones/1/leida', 'cualquiera'],
  ['POST', '/api/notificaciones/leidas', 'cualquiera'],
  ['GET', '/api/usuarios', 'bambu'],
  ['POST', '/api/usuarios', 'bambu'],
  ['POST', '/api/usuarios/1/reenvia-invitacion', 'bambu'],
  ['PATCH', '/api/usuarios/1', 'bambu'],
];

let s: Servidor;
let vet: string;
let fisio: string;
before(async () => {
  s = await servidorDePrueba('roles');
  const admin = await entrarSuperadmin(s);
  fisio = (await fisioVerificada(s, admin)).cookie;
  vet = (await veterinarioVerificado(s)).cookie;
});
after(async () => {
  await s.app.close();
});

const conCuerpo = (metodo: Metodo) => (metodo === 'GET' ? {} : { cuerpo: {} });

test('sin sesión: todas las rutas privadas → 401', async () => {
  for (const [metodo, ruta] of RUTAS) {
    const r = await pedir(s.app, metodo, ruta, conCuerpo(metodo));
    assert.equal(r.estado, 401, `${metodo} ${ruta}`);
  }
});

test('rol equivocado → 403', async () => {
  for (const [metodo, ruta, quien] of RUTAS) {
    const ajenos = quien === 'bambu' ? [vet]
      : quien === 'derivador' ? [fisio]
        : quien === 'superadmin' ? [vet, fisio]
          : [];
    for (const cookie of ajenos) {
      const r = await pedir(s.app, metodo, ruta, { cookie, ...conCuerpo(metodo) });
      assert.equal(r.estado, 403, `${metodo} ${ruta}`);
    }
  }
});
