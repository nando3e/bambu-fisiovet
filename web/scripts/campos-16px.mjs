// Que ningún campo de texto baje de 16 px: Safari y Chrome de iOS hacen zoom
// al enfocar un campo con letra más pequeña y no lo deshacen al salir.
//
// La invariante: de todas las reglas de los CSS que fijan el tamaño de letra
// de un campo, la ÚLTIMA en cargarse tiene que ser la de 16 px. Los CSS se
// cargan en este orden (main.tsx), así que se leen en este orden.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DISENO = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'disseny');
const ORDEN = ['tokens.css', 'base.css', 'componentes.css', 'landing.css'];

const esCampo = (selectores) =>
  selectores.split(',').some((s) => /(^|[\s>+~])(input|select|textarea)\b/.test(s.trim()) && !/type=["']?(checkbox|radio|file)/.test(s));

const reglas = [];
for (const fichero of ORDEN) {
  const css = readFileSync(join(DISENO, fichero), 'utf8');
  for (const [, selectores, cuerpo] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const tam = cuerpo.match(/(^|[;\s])font-size\s*:\s*([^;]+)/);
    if (tam && esCampo(selectores)) reglas.push({ fichero, selectores: selectores.trim().replace(/\s+/g, ' '), valor: tam[2].trim() });
  }
}

if (reglas.length === 0) {
  console.error('No hay ninguna regla de tamaño de letra sobre campos: se ha perdido la protección de los 16 px.');
  process.exit(1);
}
const ultima = reglas[reglas.length - 1];
if (ultima.valor !== '16px') {
  console.error(`La última regla de tamaño sobre campos no es de 16 px:\n  ${ultima.fichero}: ${ultima.selectores} { font-size: ${ultima.valor} }`);
  process.exit(1);
}
console.log('Ningún campo por debajo de 16 px en el móvil.');
