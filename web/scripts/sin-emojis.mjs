// Ni un emoji en la interfaz: los iconos son de lucide-react, a trazo.
// Un emoji en un componente se cuela fácil al copiar un texto y rompe el
// aspecto (cada sistema los pinta distinto).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
// ©, ® y ™ son «pictográficos» para Unicode pero aquí son tipografía.
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;

function ficheros(carpeta) {
  return readdirSync(carpeta).flatMap((n) => {
    const r = join(carpeta, n);
    return statSync(r).isDirectory() ? ficheros(r) : /\.(tsx?|css)$/.test(n) ? [r] : [];
  });
}

let fallos = 0;
for (const f of ficheros(RAIZ)) {
  readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
    const m = linea.match(EMOJI);
    if (m) {
      console.error(`${relative(RAIZ, f)}:${i + 1}  emoji «${m[0]}»: usa un icono de lucide-react`);
      fallos += 1;
    }
  });
}
if (fallos) process.exit(1);
console.log('Sin emojis en la interfaz.');
