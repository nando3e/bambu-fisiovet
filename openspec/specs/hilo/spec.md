# hilo Specification

## Purpose
TBD - created by archiving change hilo-adjuntos-y-sesiones. Update Purpose after archive.
## Requirements
### Requirement: Hilo por caso
Cada caso SHALL tener un hilo con mensajes de tipo texto, adjunto, informe y
sistema, en orden cronológico, con autor (o «Sistema») y fecha. Escribir en el
hilo publica `mensaje.nuevo` y actualiza la actividad del caso. El hilo solo
admite mensajes de texto en casos que no están en borrador; los adjuntos con
categoría sí entran en borrador. La web MUST pintar a la derecha lo que
escribe la población de quien mira (Bambú en `/b`, la clínica en `/d`), a la
izquierda lo del otro lado y en el centro lo del sistema.

#### Scenario: Veterinario pregunta
- **WHEN** el veterinario escribe una pregunta en un caso aceptado
- **THEN** aparece en el hilo y el fisio responsable recibe la notificación

#### Scenario: Caso en borrador
- **WHEN** se intenta escribir en el hilo de un borrador
- **THEN** 409

#### Scenario: Lado de las burbujas
- **WHEN** la veterinaria abre el hilo en `/d`
- **THEN** sus mensajes salen a la derecha y los de Bambú a la izquierda; en `/b` al revés

### Requirement: Notas internas de Bambú
Los usuarios de Bambú SHALL poder escribir mensajes con visibilidad «només
Bambú», que se muestran en el hilo marcados como nota interna. El derivador
MUST no recibirlos nunca: ni en la lista, ni por notificación, ni por correo.
Un derivador no puede crear notas internas: si lo intenta, el servidor guarda
el mensaje como visible para todos.

#### Scenario: Derivador lee el hilo
- **WHEN** un derivador pide los mensajes de un caso con dos notas internas
- **THEN** la respuesta no las contiene

#### Scenario: Nota interna no avisa al veterinario
- **WHEN** un fisio escribe una nota interna
- **THEN** no se crea ninguna notificación para el derivador

### Requirement: Mensajes del sistema
Cada transición de estado y cada cambio de ficha SHALL dejar en el hilo un
mensaje de sistema legible, en valenciano y en la misma transacción. Por
ejemplo: «Bambú ha acceptat la derivació», «Laia Serra ha canviat el pes:
12,4 → 11,8».

#### Scenario: Cambio de peso
- **WHEN** Bambú corrige el peso del paciente
- **THEN** el hilo del caso muestra el mensaje con el valor anterior y el nuevo

### Requirement: Adjuntos validados y protegidos
La aplicación SHALL aceptar adjuntos de hasta 12 MB de los tipos PDF, JPEG,
PNG, WEBP, ZIP, DOC, DOCX y XLSX, comprobando el tipo por el contenido del
fichero y no por la extensión, con una categoría opcional (`radiografia`,
`informe`, `analitica`). Cada adjunto se guarda con un nombre aleatorio fuera
de cualquier carpeta pública, con su huella SHA-256 y, si es imagen, con una
miniatura generada fuera del event loop. Descargarlo MUST pasar por una ruta
que comprueba sesión y ámbito. Subir un adjunto crea un mensaje de tipo
adjunto y, si el caso no es borrador, publica `adjunto.nuevo`. En borrador
solo puede subir el derivador del caso y solo con categoría.

#### Scenario: Ejecutable disfrazado
- **WHEN** se sube un `.exe` renombrado a `.pdf`
- **THEN** 400 y no se guarda nada

#### Scenario: Fichero demasiado grande
- **WHEN** se sube un PDF de 15 MB
- **THEN** 413

#### Scenario: Adjunto de otra clínica
- **WHEN** un derivador pide un adjunto de un caso de otra clínica
- **THEN** 404

#### Scenario: Sin sesión
- **WHEN** se pide la URL de un adjunto sin cookie
- **THEN** 401

#### Scenario: Radiografía en el borrador
- **WHEN** el derivador sube una imagen con `categoria=radiografia` a su borrador
- **THEN** 201, queda con categoría y no hay evento `adjunto.nuevo`

#### Scenario: Clip en el borrador
- **WHEN** se sube un fichero sin categoría a un borrador
- **THEN** 409 «Envia la derivació abans d'adjuntar fitxers» y nada en disco

### Requirement: Subida ágil desde el móvil
La web SHALL reducir las imágenes en el navegador antes de subirlas (si no
puede, sube el original), mostrar la vista previa al instante atenuada
mientras sube y retirarla avisando si la subida falla.

#### Scenario: Foto desde el móvil
- **WHEN** el veterinario adjunta una foto de 5 MB con el móvil
- **THEN** la ve al momento en el hilo y se sube reducida

### Requirement: Retirar adjuntos sin borrarlos
Bambú SHALL poder retirar cualquier adjunto, y su autor derivador durante los
15 minutos posteriores a subirlo; en un borrador, que nadie más ve, el autor
lo retira sin plazo. Retirar marca el adjunto como eliminado y deja en el
hilo «Adjunt retirat»; el fichero no se borra en v1.

#### Scenario: Derivador fuera de plazo
- **WHEN** un derivador intenta retirar su adjunto media hora después
- **THEN** 403

#### Scenario: Placa equivocada en el borrador
- **WHEN** el derivador retira una radiografía de su borrador dos horas después de subirla
- **THEN** 200 y no cuenta en «Porta N documents» al enviar

### Requirement: Últimos movimientos
El inicio de Bambú SHALL mostrar los últimos eventos de todos los casos (qué,
de qué caso, quién y cuándo), con enlace al caso.

#### Scenario: Derivación recién llegada
- **WHEN** entra una derivación nueva
- **THEN** aparece la primera en «Últims moviments»

