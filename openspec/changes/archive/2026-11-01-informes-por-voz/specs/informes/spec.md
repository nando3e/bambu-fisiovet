## ADDED Requirements

### Requirement: Notas de voz del fisio
Bambú SHALL poder grabar notas de voz de hasta 10 MB dentro de un caso con un
micrófono de tocar para empezar y para acabar, papelera para descartar y
barras de volumen. Al soltar, aparece al momento una
burbuja «Transcrivint…» que el texto sustituye. Si la pantalla se cierra a
media grabación, el micrófono se para y lo grabado se descarta. El audio se
transcribe con Whisper en catalán, usando como vocabulario el nombre del
paciente, su raza y una lista fija de términos del oficio. La transcripción se
puede corregir a mano y nunca la ve un derivador.

#### Scenario: Dictado correcto
- **WHEN** un fisio dicta un minuto de notas sobre la sesión de Nala
- **THEN** queda una transcripción del caso con su texto, el modelo usado y la latencia

#### Scenario: Derivador pide transcripciones
- **WHEN** un derivador llama a `GET /api/casos/:id/transcripciones` de su caso
- **THEN** 403

#### Scenario: Transcriptor caído
- **WHEN** Whisper no responde
- **THEN** la burbuja muestra el error, el audio se conserva y se puede reintentar

### Requirement: Borrador de informe con esquema estricto
Bambú SHALL poder pedir un borrador de informe de valoración, evolución o alta
a partir de las transcripciones elegidas (por defecto, las posteriores al
último informe). La aplicación MUST hacer una sola llamada al modelo con salida
estructurada y un esquema estricto (resumen, hallazgos, tratamiento
realizado, evolución, plan, recomendaciones al veterinario, próxima revisión
y dudas; en el de alta, además, estado al alta y pautas en casa), validar la
respuesta y guardarla como propuesta `pendiente` con su ficha legible. El
prompt pide redactar en valenciano, con tono clínico, sin inventar: lo que
falta va a «dudas».

#### Scenario: Borrador con dudas
- **WHEN** el dictado no dice la frecuencia de las sesiones
- **THEN** el borrador lo pone en «dudas», que se muestran resaltadas encima de la ficha, y no rellena el dato

#### Scenario: Respuesta del modelo inválida
- **WHEN** el modelo devuelve un objeto que no cumple el esquema
- **THEN** no se guarda ninguna propuesta y la pantalla muestra un error claro

### Requirement: Al modelo no viajan datos personales
El contexto del borrador SHALL contener solo datos del paciente (nombre,
especie, raza, sexo, edad, peso), del caso (motivo, historia, tratamiento,
objetivos), las transcripciones y el informe anterior. Nunca MUST incluir nombre, teléfono o correo del propietario, ni
nombre o correo del veterinario. Un test construye el prompt de un caso real
y falla si aparece cualquiera de esos datos.

#### Scenario: Prompt sin propietario
- **WHEN** se construye el prompt de un caso cuyo propietario es «Marta Puig, 600 123 456»
- **THEN** ni «Marta Puig» ni «600 123 456» aparecen en el texto enviado

### Requirement: Regenerar y editar vuelven a proponer
Regenerar SHALL cancelar la propuesta pendiente y crear otra nueva con el
modelo, aceptando instrucciones opcionales («més breu», «afegeix la
goniometria»). Editar MUST pasar los campos editados por la misma validación
y el mismo renderizado, **sin modelo**, marcar la original como corregida y
crear una nueva pendiente. Nunca se modifica una propuesta en su sitio.

#### Scenario: Editar a mano
- **WHEN** el fisio cambia el plan en el formulario de edición
- **THEN** la original queda `corregida` y hay una nueva `pendiente` con el plan editado

#### Scenario: Regenerar con instrucciones
- **WHEN** el fisio pide regenerar «més breu»
- **THEN** la original queda `cancelada` y la nueva enlaza con ella

### Requirement: Confirmar es atómico y el único camino de salida
Confirmar SHALL, en una transacción, pasar la propuesta de `pendiente` a
`confirmada` solo si seguía pendiente, crear el informe inmutable, añadir el
mensaje de tipo informe al hilo, dejar `historial` y publicar
`informe.publicado`. Si es de alta, además pasa el caso a `alta` (desde
`aceptada` o `en_tratamiento`) y publica `caso.alta`. Si la propuesta ya no estaba pendiente, MUST responder 409 sin
cambiar nada. El modelo no tiene forma de confirmar.

#### Scenario: Doble toque
- **WHEN** llegan dos confirmaciones seguidas de la misma propuesta
- **THEN** solo existe un informe y la segunda petición recibe 409

#### Scenario: Informe de alta
- **WHEN** se confirma un informe de alta
- **THEN** el caso queda en alta y el veterinario recibe las notificaciones de informe y de alta

### Requirement: Informe a mano y app sin IA
Bambú SHALL poder redactar un informe a mano con las mismas secciones, que
crea una propuesta pendiente sin modelo y se confirma igual. Sin claves de IA
configuradas, el micrófono y «Redacta amb IA» no aparecen y todo lo demás
funciona.

#### Scenario: Sin claves
- **WHEN** no hay `ANTHROPIC_API_KEY` ni `OPENAI_API_KEY`
- **THEN** la pantalla del caso no muestra el micrófono y «Redacta a mà» funciona

### Requirement: Informes publicados
Un informe confirmado SHALL ser inmutable. Corregirlo es publicar uno nuevo
que lo sustituye y queda enlazado con él. El derivador ve los informes
confirmados de sus casos en el hilo y en la pestaña Informes, y puede
imprimirlos con un formato limpio (`@media print`). El inicio de Bambú muestra
cuántas propuestas siguen pendientes de confirmar.

#### Scenario: Corrección
- **WHEN** Bambú publica una corrección de un informe
- **THEN** el veterinario ve los dos y el nuevo indica a cuál sustituye

#### Scenario: Imprimir
- **WHEN** el veterinario imprime un informe
- **THEN** sale sin navegación ni botones, con el logo y los datos del caso

### Requirement: Retención de audios
Una tarea diaria SHALL borrar el fichero de audio de las transcripciones más
antiguas que la retención configurada, dejando su ruta a nulo y conservando
el texto.

#### Scenario: Audio caducado
- **WHEN** un audio tiene 31 días y la retención es de 30
- **THEN** el fichero desaparece y la transcripción conserva su texto
