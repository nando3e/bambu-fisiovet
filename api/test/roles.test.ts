// Roles en todas las rutas privadas: sin sesión 401, rol equivocado 403. La
// frontera es el servidor; esta tabla se amplía con cada ruta nueva.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  entrarSuperadmin, fisioVerificada, pedir, servidorDePrueba, veterinarioVerificado, type Servidor,
} from './ayuda.ts';

type Quien = 'cualquiera' | 'bambu' | 'derivador' | 'superadmin';
type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const RUTAS: [Metodo, string, Quien][] = [
  ['GET', '/api/auth/yo', 'cualquiera'],
  ['POST', '/api/auth/cambia-contrasena', 'cualquiera'],
  ['PATCH', '/api/auth/perfil', 'cualquiera'],
  ['GET', '/api/clinicas/mia', 'derivador'],
  ['PATCH', '/api/clinicas/mia', 'derivador'],
  ['GET', '/api/clinicas', 'bambu'],
  ['GET', '/api/clinicas/1/usuarios', 'bambu'],
  ['PATCH', '/api/clinicas/1', 'bambu'],
  ['POST', '/api/clinicas/mia/invitaciones', 'derivador'],
  ['POST', '/api/clinicas/1/invitaciones', 'bambu'],
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
  ['POST', '/api/clinicas', 'bambu'],
  ['GET', '/api/consentimiento', 'cualquiera'],
  ['GET', '/api/casos', 'cualquiera'],
  ['POST', '/api/casos', 'cualquiera'],
  ['GET', '/api/casos/1', 'cualquiera'],
  ['PATCH', '/api/casos/1', 'cualquiera'],
  ['POST', '/api/casos/1/envia', 'derivador'],
  ['POST', '/api/casos/1/descarta', 'derivador'],
  ['POST', '/api/casos/1/acepta', 'bambu'],
  ['POST', '/api/casos/1/rechaza', 'bambu'],
  ['POST', '/api/casos/1/cita', 'bambu'],
  ['POST', '/api/casos/1/abandona', 'bambu'],
  ['POST', '/api/casos/1/alta-manual', 'bambu'],
  ['POST', '/api/casos/1/asigna-fisio', 'bambu'],
  ['POST', '/api/casos/1/leido', 'cualquiera'],
  ['GET', '/api/casos/1/historial', 'bambu'],
  ['GET', '/api/panel/contadores', 'bambu'],
  ['GET', '/api/panel/indicadores', 'bambu'],
  ['GET', '/api/pacientes', 'cualquiera'],
  ['GET', '/api/pacientes/1', 'cualquiera'],
  ['PATCH', '/api/pacientes/1', 'cualquiera'],
  ['GET', '/api/pacientes/1/historial', 'bambu'],
  ['PATCH', '/api/propietarios/1', 'cualquiera'],
  ['GET', '/api/casos/1/mensajes', 'cualquiera'],
  ['POST', '/api/casos/1/mensajes', 'cualquiera'],
  ['POST', '/api/casos/1/adjuntos', 'cualquiera'],
  ['GET', '/api/adjuntos/1/fichero', 'cualquiera'],
  ['GET', '/api/adjuntos/1/miniatura', 'cualquiera'],
  ['DELETE', '/api/adjuntos/1', 'cualquiera'],
  ['GET', '/api/panel/movimientos', 'bambu'],
  ['GET', '/api/ia/estado', 'bambu'],
  ['GET', '/api/casos/1/transcripciones', 'bambu'],
  ['POST', '/api/casos/1/transcripciones', 'bambu'],
  ['PATCH', '/api/transcripciones/1', 'bambu'],
  ['POST', '/api/transcripciones/1/reintenta', 'bambu'],
  ['POST', '/api/casos/1/propuestas-informe', 'bambu'],
  ['GET', '/api/casos/1/propuestas-informe', 'bambu'],
  ['GET', '/api/propuestas-informe/1', 'bambu'],
  ['POST', '/api/propuestas-informe/1/regenera', 'bambu'],
  ['POST', '/api/propuestas-informe/1/edita', 'bambu'],
  ['POST', '/api/propuestas-informe/1/cancela', 'bambu'],
  ['POST', '/api/propuestas-informe/1/confirma', 'bambu'],
  ['GET', '/api/casos/1/informes', 'cualquiera'],
  ['GET', '/api/informes/1', 'cualquiera'],
  ['GET', '/api/configuracion/ia', 'superadmin'],
  ['PUT', '/api/configuracion/ia', 'superadmin'],
  ['POST', '/api/configuracion/ia/prueba', 'superadmin'],
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

const conCuerpo = (metodo: Metodo) => (metodo === 'GET' || metodo === 'DELETE' ? {} : { cuerpo: {} });

test('cada ruta privada: sin sesión 401 y con el rol equivocado 403', async () => {
  for (const [metodo, ruta, quien] of RUTAS) {
    assert.equal((await pedir(s.app, metodo, ruta, conCuerpo(metodo))).estado, 401, `${metodo} ${ruta}`);
    const ajenos = quien === 'bambu' ? [vet] : quien === 'derivador' ? [fisio] : quien === 'superadmin' ? [vet, fisio] : [];
    for (const cookie of ajenos) {
      assert.equal((await pedir(s.app, metodo, ruta, { cookie, ...conCuerpo(metodo) })).estado, 403, `${metodo} ${ruta}`);
    }
  }
});
