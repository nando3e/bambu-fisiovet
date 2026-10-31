// Comprueba que el código arranca tal y como corre en producción.
//
// En desarrollo y en los tests se usa tsx, que entiende todo TypeScript. En
// producción Node corre con --experimental-strip-types, que solo borra los
// tipos: no admite enums, espacios de nombres ni propiedades declaradas en el
// constructor. Ese código pasa el typecheck y los tests y revienta al arrancar
// el contenedor (pasó en forestalolotina). Esto lo caza en la construcción de
// la imagen: importa todos los módulos sin arrancar nada.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function ficheros(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return ruta.endsWith('.ts') ? [ruta] : [];
  });
}

const modulos = ficheros(join(import.meta.dirname, 'src')).filter((f) => !f.endsWith('servidor.ts'));
for (const modulo of modulos) await import(pathToFileURL(modulo).href);
// servidor.ts se importa sin arrancarlo: solo arranca si es el punto de entrada.
await import(pathToFileURL(join(import.meta.dirname, 'src', 'servidor.ts')).href);

console.log(`${modulos.length + 1} módulos se cargan con --experimental-strip-types.`);
