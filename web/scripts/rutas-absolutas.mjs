// Los enlaces y redirecciones de la web se escriben enteros, empezando por
// barra. Un enlace relativo dentro de una ruta con comodín se resuelve contra
// la URL entera y, con una redirección también relativa, acaba en un bucle de
// navegación con la pantalla en blanco (pasó en forestalolotina).
//
// (Los ejemplos van en el comentario sin la sintaxis real a propósito: el
// script no distingue código de comentario.)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
function ficheros(carpeta) {
  return readdirSync(carpeta).flatMap((n) => {
    const r = join(carpeta, n);
    return statSync(r).isDirectory() ? ficheros(r) : /\.tsx?$/.test(n) ? [r] : [];
  });
}

// to="algo" o to={`algo`} que no empiezan por barra (ni por una variable).
const RELATIVO = /\bto=(?:"([^"/][^"]*)"|\{`([^`$/][^`]*)`\})/g;
const NAVEGAR = /navegar\(\s*(?:'([^'/][^']*)'|`([^`$/][^`]*)`)/g;

let fallos = 0;
for (const f of ficheros(RAIZ)) {
  readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
    for (const m of [...linea.matchAll(RELATIVO), ...linea.matchAll(NAVEGAR)]) {
      console.error(`${relative(RAIZ, f)}:${i + 1}  ruta a medias: ${m[1] ?? m[2]}`);
      fallos += 1;
    }
  });
}
if (fallos) process.exit(1);
console.log('Todas las rutas de la web están enteras.');
