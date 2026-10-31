// Ninguna variable CSS usada sin definir. `var(--no-existe)` no avisa:
// degrada en silencio (fondo transparente, texto invisible). Pasó en happydog.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function ficheros(carpeta) {
  return readdirSync(carpeta).flatMap((n) => {
    const r = join(carpeta, n);
    return statSync(r).isDirectory() ? ficheros(r) : /\.(tsx?|css)$/.test(n) ? [r] : [];
  });
}

const todos = ficheros(RAIZ).map((f) => ({ f, texto: readFileSync(f, 'utf8') }));
const definidas = new Set();
for (const { texto } of todos) {
  for (const [, nombre] of texto.matchAll(/(--[a-z0-9-]+)\s*:/g)) definidas.add(nombre);
}

let fallos = 0;
for (const { f, texto } of todos) {
  texto.split('\n').forEach((linea, i) => {
    for (const [, nombre] of linea.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!definidas.has(nombre)) {
        console.error(`${relative(RAIZ, f)}:${i + 1}  ${nombre} no está definida en ningún sitio`);
        fallos += 1;
      }
    }
  });
}
if (fallos) process.exit(1);
console.log(`Variables CSS: ${definidas.size} definidas, todas las usadas existen.`);
