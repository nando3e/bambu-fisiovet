## MODIFIED Requirements

### Requirement: Nueva derivación con borrador autoguardado
La aplicación SHALL permitir al derivador crear una derivación en tres pasos
(paciente y propietario → motivo y documentos → consentimiento) que se guarda
como `borrador` en cada paso. El segundo paso pide solo el motivo de la
derivación y el tratamiento actual, y ofrece tres zonas de documentos
(radiografies, informes, analítiques) que se suben desde el borrador. Enviar
MUST validar en `dominio/validacion-derivacion.ts` los campos obligatorios y
el consentimiento, esperar a que terminen las subidas en curso, pasar el caso
a `enviada`, fijar `enviado_el` y publicar `derivacion.enviada` con el número
de documentos que trae. Un borrador puede descartarse; no se borra, queda
inactivo. Los campos història clínica, objectius y altres notes ya no se
piden ni se aceptan; los casos que los tenían los siguen enseñando.

#### Scenario: Retomar en el ordenador
- **WHEN** una veterinaria empieza una derivación en el móvil y la abre después en el ordenador
- **THEN** encuentra el borrador con lo que ya había escrito y los documentos que ya había subido

#### Scenario: Enviar sin motivo
- **WHEN** se intenta enviar sin motivo de derivación
- **THEN** 400 indicando el campo, y el caso sigue en borrador

#### Scenario: Envío correcto con documentos
- **WHEN** se envía una derivación completa con dos radiografías subidas en el borrador
- **THEN** queda `enviada`, todos los usuarios bambu tienen la notificación, el correo encolado dice que trae 2 documents y en el hilo constan los dos adjuntos sin aviso `adjunto.nuevo`

#### Scenario: Campo retirado
- **WHEN** se manda `historia_clinica` en `POST` o `PATCH /api/casos`
- **THEN** 400: el campo ya no existe en el contrato

### Requirement: Quién edita qué
El derivador SHALL poder editar su derivación (motivo y tratamiento actual)
solo en `borrador` o `enviada`; después, el texto original queda congelado.
Bambú MUST poder editar siempre la ficha del paciente y del propietario,
aunque los creara un derivador: cada cambio deja `historial` (antes y
después) y publica `paciente.ficha_modificada`. El derivador también puede
editar los datos de contacto del propietario de los pacientes de su clínica.

#### Scenario: Derivador edita tras aceptar
- **WHEN** el derivador intenta cambiar el motivo de un caso aceptado
- **THEN** 409 con «La derivació ja s'ha acceptat; afegeix la informació al fil»

#### Scenario: Bambú corrige el peso
- **WHEN** un fisio cambia el peso de 12,4 a 11,8 kg
- **THEN** queda en el historial y el veterinario recibe la notificación

## ADDED Requirements

### Requirement: Documentos del caso por categoría
La ficha del caso SHALL tener un bloque «Documents» con los adjuntos no
retirados agrupados por categoría (`radiografia`, `informe`, `analitica` y
«altres» para los del hilo), con miniatura para las imágenes y un botón para
añadir en cada categoría. Pueden añadir el derivador de la clínica del caso
(en borrador, enviada, aceptada y en tratamiento) y Bambú (en cualquier
estado que no sea borrador). `GET /api/casos/:id/adjuntos` MUST aplicar el
mismo ámbito que el caso y excluir las notas internas al derivador.

#### Scenario: Analítica después de enviar
- **WHEN** el veterinario añade una analítica a un caso aceptado desde «Documents»
- **THEN** aparece en «Analítiques», en el hilo como adjunto y Bambú recibe `adjunto.nuevo`

#### Scenario: Otra clínica
- **WHEN** un derivador pide los documentos de un caso de otra clínica
- **THEN** 404

#### Scenario: Nota interna
- **WHEN** Bambú sube un documento como nota interna
- **THEN** el derivador no lo ve en «Documents» ni en el hilo
