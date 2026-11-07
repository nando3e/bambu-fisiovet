## MODIFIED Requirements

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
- **THEN** 409 «Envia la derivació abans d'adjuntar fitxers»
