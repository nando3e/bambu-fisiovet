# Revisión del change `casos-y-derivaciones`

Revisor: Sol (gpt-5.6-sol, Codex, solo lectura). El código lo escribió Claude Opus. Fecha: 2026-11-01. Ámbito: `git diff 3bfcc01..fb9287b`.

## Hallazgos

### GRAVE — Bypass de autorización para modificar una ficha clínica aceptada

[api/src/rutas/casos.ts:282](C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/casos.ts:282)

Escenario:

1. Un veterinario tiene acceso a un paciente con un caso ya aceptado.
2. Crea otra derivación en borrador usando `paciente_id`.
3. Ejecuta `PATCH /casos/:id` sobre su borrador incluyendo `paciente` o `propietario`.
4. La ruta solo comprueba el estado del borrador y modifica directamente las tablas en las líneas 285–287.

Esto elude la protección correcta que sí existe en `PATCH /pacientes/:id` ([pacientes.ts:81](C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/pacientes.ts:81)). Permite alterar nombre, especie, peso y nombre/contacto del propietario de una ficha cuyo caso anterior ya está aceptado.

Importa porque es un bypass de autorización sobre datos clínicos y personales; además genera historial y avisos como si la edición fuese legítima.

Arreglo: antes de modificar paciente o propietario desde `PATCH /casos/:id`, aplicar la misma comprobación global de estados que en `PATCH /pacientes/:id`. Alternativamente, para un derivador permitir en esta ruta únicamente `caso`, dejando paciente/propietario exclusivamente en sus endpoints autorizados. Añadir el test exacto: caso aceptado → nuevo borrador con el mismo paciente → PATCH del borrador no altera la ficha.

### MEDIO — El envío puede perder los últimos cambios del autoguardado

[web/src/pantallas/casos/NovaDerivacion.tsx:101](C:/Users/nando/APPS/bambu-fisiovet/web/src/pantallas/casos/NovaDerivacion.tsx:101) y [NovaDerivacion.tsx:151](C:/Users/nando/APPS/bambu-fisiovet/web/src/pantallas/casos/NovaDerivacion.tsx:151)

El autoguardado espera 800 ms, pero `terminar()` llama inmediatamente a `/envia` sin cancelar, forzar ni esperar el PATCH pendiente.

Reproducción: escribir o corregir el motivo y pulsar «Envia» antes de 800 ms. Si la versión previamente guardada ya era válida, el caso se envía con el texto anterior y la navegación desmonta el componente, cancelando el temporizador. También pueden cruzarse dos PATCH en vuelo y dejar en servidor una versión antigua.

Arreglo: serializar los guardados mediante una promesa/cola o número de revisión y, antes de enviar, cancelar el debounce, ejecutar un PATCH con el estado actual, esperar su confirmación y solo entonces llamar a `/envia`. Deshabilitar «Envia» mientras haya un guardado en vuelo.

### MEDIO — Un borrador descartado sigue pudiendo enviarse

[api/src/rutas/casos.ts:340](C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/casos.ts:340) y [estados-caso.ts:28](C:/Users/nando/APPS/bambu-fisiovet/api/src/dominio/estados-caso.ts:28)

Descartar solo fija `descartado_el`; el estado continúa siendo `borrador`. `envia`, `PATCH` y un segundo `descarta` solo miran el estado.

Reproducción: descartar un borrador y después llamar directamente a `POST /casos/:id/envia`. La transición sigue permitida. En una carrera descartar/enviar puede quedar `estado='enviada'` junto con `descartado_el`, publicar el evento y desaparecer de las listas porque estas filtran descartados.

Arreglo: tratar `descartado_el` como condición terminal en `casoVisible` para operaciones mutantes o comprobarlo explícitamente dentro del bloqueo `FOR UPDATE`. Un descartado debería responder 404 o 409, según el contrato elegido, pero nunca transicionar.

### MEDIO — El servicio de avisos rompe el ámbito SQL del actor

[api/src/servicios/casos.ts:232](C:/Users/nando/APPS/bambu-fisiovet/api/src/servicios/casos.ts:232)

`avisarFichaModificada` elige el caso más reciente sin aplicar ámbito y después convierte artificialmente la sesión a rol `bambu` en la línea 238.

Si un paciente queda relacionado con casos de dos clínicas —el esquema no impone que `casos.clinica_id` coincida con `pacientes.clinica_origen_id`— una edición autorizada desde la clínica A puede escoger el caso reciente de B, tocar su actividad y avisar al veterinario de B con datos del cambio y del actor de A.

No encontré una ruta actual que cree normalmente esa incoherencia, pero la barrera de seguridad queda anulada ante importaciones, datos históricos o un fallo futuro.

Arreglo: seleccionar el caso usando `ambitoCaso(sesion, ...)` en la propia SQL y llamar a `casoVisible` con la sesión original. Bambú ya ve globalmente sin necesidad de escalar roles.

### MEDIO — Una clínica no validada ve solicitudes que otra ruta oculta

[api/src/rutas/clinicas.ts:70](C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/clinicas.ts:70)

`GET /solicitudes-union` filtra correctamente las solicitudes para clínicas no validadas, pero `GET /clinicas/mia` devuelve `solicitudes_recibidas` sin comprobar `validada`.

Reproducción: solicitar unión a una clínica no validada y entrar como miembro de la clínica destino. `/solicitudes-union` devuelve vacío y resolver devuelve 404, pero `/clinicas/mia` revela nombre, apellidos y correo del solicitante.

Arreglo: aplicar en `/clinicas/mia` el mismo filtro de clínica validada o devolver siempre una lista vacía mientras no esté validada. El test actual solo cubre `/solicitudes-union`.

### LEVE — Comparación numérica aplicada a todos los campos del paciente

[api/src/servicios/casos.ts:167](C:/Users/nando/APPS/bambu-fisiovet/api/src/servicios/casos.ts:167)

Aunque el comentario dice que normaliza el peso, cualquier cadena numérica de `pacientes` se compara como número. Por ejemplo, cambiar nombre o raza de `"001"` a `"1"` se considera “sin cambios”: no actualiza ni crea historial.

Arreglo: normalizar numéricamente únicamente `peso_kg`; el resto debe compararse como texto, fecha, booleano o `null` según su campo.

### LEVE — El test de “una sola vez” no prueba dos instancias

[api/test/casos.test.ts:507](C:/Users/nando/APPS/bambu-fisiovet/api/test/casos.test.ts:507)

El test ejecuta `comprobarPendientesCita` dos veces secuencialmente. Verifica repetición, pero no la carrera indicada en el diseño.

Arreglo: lanzar dos llamadas simultáneas con `Promise.all`, comprobar que la suma de resultados es uno y que queda un único evento, una notificación y un correo. El código actual sí parece seguro: el `UPDATE … IS NULL RETURNING` y el evento están en la misma transacción.

## Comprobaciones ejecutadas

- `web npm run comprueba`: pasa.
- Typecheck de API y web: pasa.
- `api npm run comprova-produccio`: pasa; 39 módulos cargan con `--experimental-strip-types`.
- `api npm test`: no llegó a ejecutar pruebas. El sandbox impide a `tsx` crear `C:\Users\nando\AppData\Local\Temp\tsx-CodexSandboxOffline`; no es un fallo de la aplicación.
- No modifiqué ningún fichero. `docs/cuaderno-decisiones.md` ya figuraba modificado antes y sigue siendo el único cambio local.

## Revisado y correcto

- Los accesos normales por ID y las listas aplican el ámbito SQL y devuelven 404 fuera de clínica.
- Los borradores ajenos quedan fuera tanto para compañeros como para Bambú.
- Las transiciones usan `SELECT … FOR UPDATE`; aceptar concurrentemente queda serializado.
- La marca automática de vista es atómica e idempotente.
- La tarea de pendientes marca y publica dentro de una única transacción.
- Los identificadores interpolados por `guardarCambios` proceden de tablas y listas internas cerradas; no encontré inyección SQL desde entrada HTTP.
- Las transiciones principales publican sus eventos dentro de la transacción y con los destinatarios esperados.

---

## Resolución (sesión principal, Opus, 2026-11-01)

Los siete hallazgos se comprobaron contra el código y los siete eran ciertos.
Todos corregidos con su test; cada arreglo del API se verificó quitándolo y
viendo el test en rojo (5 mutaciones, todas en rojo). API: 144 tests en verde.

| Hallazgo | Arreglo | Test |
|---|---|---|
| GRAVE: `PATCH /casos/:id` del borrador cambiaba la ficha de un paciente con otra derivación aceptada | El derivador que toca paciente o propietario pasa la misma comprobación que `PATCH /pacientes/:id` (409) | «el borrador de un paciente con otra derivación aceptada no cambia la ficha…» |
| MEDIO: el envío podía saltarse el último autoguardado | Guardados en fila (una promesa encadenada) y «Envia» cancela el temporizador, guarda lo último y espera antes de enviar | Recorrido en Chrome escribiendo y enviando en 50 ms: el motivo llega |
| MEDIO: un borrador descartado se podía enviar | Descartado = 404 en `PATCH` y en cualquier transición | «un borrador descartado no se envía, no se edita ni se descarta dos veces» |
| MEDIO: `avisarFichaModificada` escalaba a rol Bambú | Elige el caso con el ámbito de quien edita y sin descartados | «el aviso de ficha modificada no salta a un caso de otra clínica…» |
| MEDIO: `/clinicas/mia` enseñaba solicitudes en clínicas sin validar | Mismo filtro de `validada` que `GET /solicitudes-union` | «/clinicas/mia no enseña solicitudes…» |
| LEVE: comparación numérica en todos los campos del paciente | Solo `peso_kg` se compara como número | ««001» → «1» en la raza es un cambio» |
| LEVE: el test de «una sola vez» no probaba concurrencia | Test con dos pasadas a la vez (`Promise.all`) | «dos pasadas a la vez de pendientes de cita avisan una sola vez» |

Sol no pudo ejecutar `npm test` dentro de su sandbox (tsx no puede crear su
carpeta temporal); los tests los ejecutó la sesión principal.
