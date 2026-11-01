# Revisión del change `informes-por-voz`

- **Revisor**: Sol (`gpt-5.6-sol` vía Codex, solo lectura). El código lo
  escribió Claude Opus.
- **Alcance**: `git diff 4de4227..HEAD` (informes por voz y la consolidación de
  tests de 173 a 47).
- **Resultado**: 2 GRAVE, 1 MEDIO, 1 LEVE. Los cuatro se comprobaron contra el
  código antes de tocar nada y los cuatro eran ciertos. Todos corregidos.

## GRAVE 1 · Datos personales en campos libres viajaban al modelo — corregido

El prompt excluía las columnas del propietario y del veterinario, pero la
historia clínica, el motivo, los dictados, las instrucciones y el informe
anterior iban tal cual. Si el veterinario escribía «la porta la Sra. Puig,
600 123 456», llegaba a Anthropic. El test de privacidad ponía los datos
prohibidos justo en los campos que no entran, así que no probaba nada útil.

- **Arreglo**: `api/src/informes/anonimizar.ts`, pura. Antes de cada llamada
  al redactor se sustituyen el nombre, el teléfono y el correo del propietario,
  el nombre, los apellidos y el correo del veterinario (o el nombre escrito a
  mano), el nombre de la clínica, y cualquier teléfono o correo, por
  `[propietari]`, `[veterinari]`, `[clínica]`, `[telèfon]` y `[correu]`.
- **Test**: los datos personales van ahora en la historia clínica, un dictado
  corregido, las instrucciones y un informe anterior. Se comprueba que ninguno
  llega y que las etiquetas sí. **Mutación**: sin anonimizar, el test cae
  («Marta» ha viajado al modelo).
- **Lo que queda**: lo que se dice en voz alta va en el audio a Whisper
  (OpenAI) y no se puede tapar. Queda escrito en `docs/rgpd.md`: la pauta para
  el equipo es no dictar nombres ni teléfonos.

## GRAVE 2 · Dos propuestas pendientes en el mismo caso — corregido

Dos toques en «Corregeix» o en «Redacta» creaban dos pendientes. Cada una con
su lease, se podían confirmar las dos: dos informes, dos mensajes y dos avisos.

- **Arreglo**:
  - Migración `008_propuesta_unica.sql` con un índice único parcial (una
    pendiente por caso). Antes de crearlo, cancela las duplicadas que haya.
  - La ruta responde 409 antes de llamar al modelo si ya hay una pendiente, y
    traduce la violación del índice a 409 si dos peticiones se cruzan.
  - En la web, «Nou informe» se desactiva y lo explica mientras hay una
    pendiente, y «Corregeix» tiene freno de doble toque con `ref`.
- **Test**:
  - Con una pendiente, otra da 409 sin llamar al modelo.
  - Dos a la vez dan un 201 y un 409, y queda una sola pendiente.
  - Un INSERT directo de una segunda pendiente choca con el índice.
- **Mutación**: sin el índice, el test cae.

## MEDIO · El micrófono podía quedar abierto — corregido

Si la pantalla se cerraba mientras el navegador pedía permiso, la limpieza
corría antes de que existiera el flujo y la pista quedaba abierta. Dos toques
rápidos abrían dos flujos.

- **Arreglo**: `montado` en un `ref`. Tras `getUserMedia`, si ya no está
  montado, se paran las pistas. El botón se desactiva mientras se pide permiso.
- **Sin test automático**: no hay pruebas de componentes en la web. Queda en el
  registro de aplazados.

## LEVE · Marca fuera del diccionario — corregido

El `alt` del logo y «BAMBÚ Fisiovet» del informe imprimible pasan a `va.ts`.

## Revisado sin hallazgos

Sol confirma lo siguiente:

- El lease de confirmar.
- Que no hay camino para publicar una propuesta en otro caso.
- Que el alta usa `decidirTransicion` y publica sus eventos en la transacción.
- La validación zod de toda respuesta del modelo.
- Las claves cifradas, que no se devuelven ni pasan al historial.
- El ámbito en SQL con 404.
- Los audios por magic bytes y servidos por ruta.
- La retención tolerante a ficheros ausentes.
- Que no hay enums ni namespaces.
- Que la consolidación de tests conserva los casos de uso importantes.
