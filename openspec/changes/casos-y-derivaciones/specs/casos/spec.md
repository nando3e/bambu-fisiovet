## ADDED Requirements

### Requirement: Paciente y propietario
La aplicación SHALL guardar cada paciente con nombre, especie (perro, gato,
conejo, ave u otro con texto libre), raza, sexo, esterilizado, fecha de
nacimiento o edad en texto, peso y propietario; y cada propietario con
nombre, teléfono, correo y el consentimiento aceptado (texto versionado y
fecha). Un paciente creado por un veterinario queda ligado a su clínica de
origen.

#### Scenario: Especie fuera de la lista
- **WHEN** se guarda un paciente con especie «caball»
- **THEN** 400; para eso existe «otro» con texto libre

### Requirement: El derivador solo ve lo de su clínica
Toda consulta de casos, pacientes y propietarios hecha por un derivador SHALL
filtrar por su clínica en la propia SQL (`dominio/visibilidad.ts`), nunca
después en código. Lo que queda fuera de su ámbito MUST responder 404, nunca
403, para no revelar que existe. Bambú y el superadmin ven todo.

#### Scenario: Caso de otra clínica
- **WHEN** un derivador de la clínica A pide un caso de la clínica B
- **THEN** 404

#### Scenario: Compañero de clínica
- **WHEN** un derivador abre un caso derivado por un compañero de su clínica
- **THEN** lo ve completo

#### Scenario: Listado
- **WHEN** un derivador lista casos sin filtros
- **THEN** solo aparecen los de su clínica

### Requirement: Nueva derivación con borrador autoguardado
La aplicación SHALL permitir al derivador crear una derivación en tres pasos
(paciente y propietario → motivo clínico → consentimiento) que se guarda como
`borrador` en cada paso. Enviar MUST validar en `dominio/validacion-derivacion.ts`
los campos obligatorios y el consentimiento, pasar el caso a `enviada`,
fijar `enviado_el` y publicar `derivacion.enviada`. Un borrador puede
descartarse; no se borra, queda inactivo.

#### Scenario: Retomar en el ordenador
- **WHEN** una veterinaria empieza una derivación en el móvil y la abre después en el ordenador
- **THEN** encuentra el borrador con lo que ya había escrito

#### Scenario: Enviar sin motivo
- **WHEN** se intenta enviar sin motivo de derivación
- **THEN** 400 indicando el campo, y el caso sigue en borrador

#### Scenario: Envío correcto
- **WHEN** se envía una derivación completa
- **THEN** queda `enviada`, todos los usuarios bambu tienen la notificación y hay un correo encolado al correo del centro

### Requirement: Máquina de estados del caso
Los estados SHALL ser `borrador`, `enviada`, `aceptada`, `en_tratamiento`,
`alta`, `rechazada` y `abandonada`, y las transiciones permitidas por rol se
deciden en `dominio/estados-caso.ts`, sin BD:

| Desde | A | Quién |
|---|---|---|
| borrador | enviada | derivador |
| enviada | aceptada | bambu |
| enviada | rechazada (con motivo) | bambu |
| aceptada | en_tratamiento | sistema (primera sesión) |
| aceptada, en_tratamiento | abandonada (con motivo) | bambu |
| en_tratamiento | alta | sistema (informe de alta) o bambu (alta manual) |

Los casos propios nacen en `aceptada`. No hay reapertura: una recaída es un
caso nuevo enlazado con `caso_anterior_id`. Una transición no permitida MUST
responder 409 sin cambiar nada. Toda transición deja `historial` y publica su
evento.

#### Scenario: Aceptar dos veces
- **WHEN** Bambú acepta un caso que ya está aceptado
- **THEN** 409 y no se publica ningún evento

#### Scenario: Derivador intenta aceptar
- **WHEN** un derivador llama a aceptar su propio caso
- **THEN** 403

#### Scenario: Rechazar sin motivo
- **WHEN** Bambú rechaza sin escribir motivo
- **THEN** 400

#### Scenario: Recaída
- **WHEN** Bambú abre un caso nuevo para un paciente con un caso en alta
- **THEN** el caso nuevo queda enlazado al anterior y la ficha del paciente muestra los dos

### Requirement: Aceptar con fisio responsable
Al aceptar, Bambú SHALL poder asignar un fisio responsable, y reasignarlo
después. Aceptar publica `derivacion.aceptada`; asignar o reasignar publica
`caso.fisio_asignado` para el fisio asignado.

#### Scenario: Aceptar y asignar
- **WHEN** Bambú acepta asignando a una fisio
- **THEN** el veterinario recibe la notificación de aceptación y la fisio la de asignación

### Requirement: Quién edita qué
El derivador SHALL poder editar su derivación solo en `borrador` o `enviada`;
después, el texto original queda congelado. Bambú MUST poder editar siempre la
ficha del paciente y del propietario, aunque los creara un derivador: cada
cambio deja `historial` (antes y después) y publica
`paciente.ficha_modificada`. El derivador también puede editar los datos de
contacto del propietario de los pacientes de su clínica.

#### Scenario: Derivador edita tras aceptar
- **WHEN** el derivador intenta cambiar el motivo de un caso aceptado
- **THEN** 409 con «La derivació ja s'ha acceptat; afegeix la informació al fil»

#### Scenario: Bambú corrige el peso
- **WHEN** un fisio cambia el peso de 12,4 a 11,8 kg
- **THEN** queda en el historial y el veterinario recibe la notificación

### Requirement: Pacientes propios de Bambú
Bambú SHALL poder dar de alta pacientes y casos sin derivación (`origen =
propio`), que nacen aceptados, sin clínica ni derivador, y que nunca ve un
derivador.

#### Scenario: Paciente que llega solo
- **WHEN** Bambú da de alta un paciente que llega sin veterinario
- **THEN** el caso aparece en las listas de Bambú con el chip «Propi» y en ninguna de un derivador

### Requirement: Listas y fichas
La lista de casos SHALL ordenarse por actividad más reciente y filtrar por
estado, origen, clínica, fisio, especie, texto (paciente, propietario,
clínica) y «amb novetats» (casos con notificaciones no leídas del usuario).
Cada caso de la lista muestra un punto si tiene novedades. Abrir un caso
marca como leídas las notificaciones de ese caso del usuario.

#### Scenario: Filtro de novedades
- **WHEN** un fisio filtra «amb novetats»
- **THEN** solo aparecen los casos con notificaciones suyas sin leer

#### Scenario: Abrir el caso
- **WHEN** el veterinario abre un caso con dos notificaciones sin leer
- **THEN** el contador de la campana baja en dos

### Requirement: La fusión de clínicas lleva los casos
Al aprobarse una unión a clínica, SHALL moverse a la clínica destino, en la
misma transacción, los casos y pacientes de la clínica provisional.

#### Scenario: Unirse con casos ya derivados
- **WHEN** un veterinario con dos derivaciones en su clínica provisional es aceptado en otra clínica
- **THEN** sus compañeros nuevos ven esas dos derivaciones
