// Contraste de las parejas de tokens que se pintan juntas, leyendo
// tokens.css tal cual (no una tabla copiada que se queda vieja). 4,5:1 para
// texto; 3:1 para lo que solo tiene que distinguirse.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'disseny', 'tokens.css'), 'utf8');
const tema = {};
for (const [, nombre, valor] of TOKENS.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) tema[nombre] = valor;

function canales(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function luminancia(hex) {
  const [r, g, b] = canales(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PAREJAS = [
  ['tinta', 'papel', 4.5],
  ['tinta', 'crema', 4.5],
  ['tinta', 'superficie', 4.5],
  ['tinta', 'fondo-app', 4.5],
  ['texto-suave', 'papel', 4.5],
  ['texto-suave', 'crema', 4.5],
  ['texto-suave', 'superficie', 4.5],
  ['texto-suave', 'superficie-2', 4.5],
  ['texto-suave', 'fondo-app', 4.5],
  ['texto-suave', 'arena', 4.5],
  ['texto-suave', 'hoja', 4.5],
  ['texto-tenue', 'superficie', 3],
  ['verde', 'papel', 3],
  ['verde', 'crema', 3],
  ['verde-oscuro', 'hoja', 4.5],
  ['verde-oscuro', 'papel', 4.5],
  ['sobre-verde', 'verde-oscuro', 4.5],
  ['sobre-oscuro', 'verde-oscuro', 4.5],
  ['sobre-oscuro', 'verde-profundo', 4.5],
  ['crema', 'verde', 3],
  ['ok', 'ok-fondo', 4.5],
  ['aviso-texto', 'aviso-fondo', 4.5],
  ['alerta', 'alerta-fondo', 4.5],
  ['alerta', 'superficie', 4.5],
  ['sobre-verde', 'insignia', 4.5],
  ['linea-fuerte', 'superficie', 1.5],
];

let fallos = 0;
for (const [a, b, minimo] of PAREJAS) {
  if (!tema[a] || !tema[b]) {
    console.error(`FALTA  ${a} sobre ${b}: algún token no existe`);
    fallos += 1;
    continue;
  }
  const r = contraste(tema[a], tema[b]);
  const pasa = r >= minimo;
  if (!pasa) fallos += 1;
  console.log(`${pasa ? 'OK   ' : 'FALLA'}  ${a} sobre ${b}: ${r.toFixed(2)}:1 (mínimo ${minimo})`);
}
if (fallos) {
  console.error(`\n${fallos} parejas por debajo del mínimo.`);
  process.exit(1);
}
console.log('Contraste correcto.');
