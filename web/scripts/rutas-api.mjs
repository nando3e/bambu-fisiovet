// Que la web no llame a ninguna ruta del API que no existe. Son cadenas de
// texto: ni TypeScript ni los tests del API lo ven, y el botón se rompe solo
// al tocarlo (pasó en forestalolotina).
//
// Compara lo que la web pide (api.get/post/put/patch) con lo que el API
// registra (app.get/post/put/patch/delete). Un tramo variable (${...} o :id)
// casa con cualquiera: se comprueba la forma de la ruta.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = join(AQUI, '..', 'src');
const API = join(AQUI, '..', '..', 'api', 'src', 'rutas');

function ficheros(carpeta, extension) {
  return readdirSync(carpeta).flatMap((n) => {
    const r = join(carpeta, n);
    return statSync(r).isDirectory() ? ficheros(r, extension) : n.endsWith(extension) ? [r] : [];
  });
}

const tramos = (ruta) =>
  ruta.split('?')[0].replace(/\/+$/, '').split('/').map((t) => (t.includes('${') || t.startsWith(':') ? null : t));
const encajan = (a, b) => a.length === b.length && a.every((t, i) => t === null || b[i] === null || t === b[i]);

const METODO = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE', subir: 'POST' };
const registradas = [];
for (const f of ficheros(API, '.ts')) {
  for (const m of readFileSync(f, 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(\s*(['`])([^'`]+)\2/g)) {
    registradas.push({ metodo: METODO[m[1]], tramos: tramos(m[3]) });
  }
}
if (registradas.length === 0) {
  console.error('No he encontrado ninguna ruta del API: el script ya no mira donde toca.');
  process.exit(1);
}

let fallos = 0;
let llamadas = 0;
for (const f of ficheros(WEB, '.tsx').concat(ficheros(WEB, '.ts'))) {
  readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(/\bapi\.(get|post|put|patch|subir)(?:<[^(]*>)?\(\s*(['`])([^'`]+)\2/g)) {
      llamadas += 1;
      const metodo = METODO[m[1]];
      const ruta = m[3];
      // Una ruta elegida con ternario: se comprueban las dos.
      const t = tramos(ruta);
      if (!registradas.some((r) => r.metodo === metodo && encajan(r.tramos, t))) {
        console.error(`${relative(WEB, f)}:${i + 1}  ${metodo} ${ruta} no existe en el API`);
        fallos += 1;
      }
    }
  });
}
if (fallos) process.exit(1);
console.log(`Las ${llamadas} llamadas de la web existen en el API (${registradas.length} rutas).`);
