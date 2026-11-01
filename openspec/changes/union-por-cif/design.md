# Design — `union-por-cif`

## D1. El CIF no demuestra nada

El CIF de una clínica es público (facturas, web, registros). Teclearlo no
prueba que trabajes allí, así que nunca da acceso: solo sirve para no duplicar
clínicas y para decirle a quien se registra que pida una invitación. El acceso
a una clínica existente lo da siempre una persona que ya está dentro, o Bambú.

## D2. Formato

`dominio/nif.ts`, puro: normaliza (mayúsculas, sin espacios, puntos ni
guiones) y valida DNI (8 cifras + letra), NIE (X/Y/Z + 7 cifras + letra) y CIF
(letra de entidad + 7 cifras + dígito o letra de control, según la entidad).
Se guarda normalizado.

## D3. Un CIF, una clínica activa

`clinicas.cif` con índice único parcial `WHERE activa AND cif IS NOT NULL`.
Las clínicas anteriores al change quedan sin CIF hasta que Bambú lo ponga
(editar una clínica lo pide).

## D4. Alta con un CIF que ya existe

En la transacción del alta, con el CIF normalizado:

1. **No hay clínica activa con ese CIF** → como hasta ahora: clínica nueva con
   ese CIF, usuario sin verificar y correo de verificación.
2. **Hay una clínica activa y es «real»** (la dio de alta Bambú o tiene algún
   usuario activo y verificado) → no se crea nada; se encola a la dirección
   tecleada la plantilla `clinica-existente` («demana a algú de la teua
   clínica que et convide; si no hi ha ningú, parla amb Bambú»). Pasa por el
   mismo freno que el alta.
3. **Hay una clínica activa sin nadie verificado y que no es de Bambú** (un alta que
   nunca se confirmó) → no tiene datos (sin verificar no se entra): se
   desactiva, se desactivan sus usuarios sin verificar y se caducan sus
   enlaces, con historial, y sigue como en 1. Así un alta abandonada no
   bloquea el CIF para siempre.

La respuesta es la misma en los tres casos. Un 23505 del índice (dos altas a la
vez con el mismo CIF) da también la misma respuesta.

## D5. Invitaciones

- El veterinario invita desde su perfil, como hasta ahora.
- Bambú invita a cualquier clínica activa (`POST /api/clinicas/:id/invitaciones`):
  es como entra el primer veterinario de una clínica que Bambú dio de alta.
- Invitar a un correo que ya tiene cuenta responde lo mismo y no hace nada
  (no se revela quién tiene cuenta). La ayuda lo explica: si ya tiene cuenta
  en otra clínica, lo resuelve Bambú.

## D6. Lo que se retira

`GET /api/clinicas/sugerencias`, `POST /api/clinicas/:id/solicitudes-union`,
`GET /api/solicitudes-union`, `POST /api/solicitudes-union/:id/aprueba|rechaza`,
`servicios/clinicas.ts` (solicitar, resolver, fusionar), `dominio/union-clinica.ts`
y los eventos `usuario.solicita_union` y `usuario.union_resuelta` (fuera del
catálogo y de la matriz; el CHECK de `eventos` se rehace solo si no hay filas
de esos tipos). La tabla `solicitudes_union` se queda (sin borrado duro).

## D6 bis. Sin «clínica validada»

Nunca impidió derivar: servía para decidir quién aprobaba una unión y qué se
sugería en el alta, y las dos cosas se van. Sale de la interfaz y de las
reglas (el registro telefónico elige cualquier clínica activa). En la base
queda `clinicas.alta_por_bambu`, que es lo único que importa para D4; la
migración la pone a las que estaban validadas (en la práctica, las de Bambú)
y la columna `validada` se queda sin uso.

## D7. RGPD

El NIF de una clínica que es un autónomo es su DNI: dato personal. Lo ven el
propio veterinario de la clínica y Bambú; no viaja a la IA (no está en las
columnas del prompt). `docs/rgpd.md` lo recoge.
