## ADDED Requirements

### Requirement: Paciente y propietario
La aplicación SHALL guardar cada paciente con nombre, especie (perro, gato,
conejo, ave u otro con texto libre), raza, sexo, esterilizado, fecha de
nacimiento o edad en texto, peso y propietario; y cada propietario con
nombre, teléfono, correo y el consentimiento aceptado (texto versionado y
fecha). Todo paciente queda ligado a la clínica que lo derivó.

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
deciden en `dominio/estados-caso.ts`, sin BD. En pantalla se llaman Esborrany,
Nova (Enviada para el veterinario), Acceptada · pendent de cita, En tractament,
Alta, Rebutjada y Tancada (`abandonada`, con motivo). Las visitas se gestionan
en Wakyma: «Ja té cita» es lo único que el portal necesita saber de ellas.

| Desde | A | Quién |
|---|---|---|
| borrador | enviada | derivador |
| enviada | aceptada | bambu |
| enviada | rechazada (con motivo) | bambu |
| aceptada | en_tratamiento | bambu («Ja té cita»: la visita ya está dada en Wakyma) |
| aceptada, en_tratamiento | abandonada (con motivo) | bambu |
| en_tratamiento | alta | bambu (alta manual) o sistema (informe de alta, change 4) |

Las derivaciones que registra Bambú en nombre de una clínica nacen en
`aceptada`. No hay reapertura: si el animal vuelve a necesitar fisioterapia,
es una derivación nueva del mismo paciente. Una transición no permitida MUST
responder 409 sin cambiar nada. Toda transición deja `historial` y publica su
evento.

#### Scenario: Ja té cita
- **WHEN** Bambú marca «Ja té cita» en una derivación aceptada, con la fecha de la primera visita
- **THEN** pasa a `en_tratamiento`, guarda la fecha y el veterinario recibe la notificación

#### Scenario: Registrada por teléfono con cita
- **WHEN** Bambú registra una derivación por teléfono marcando que ya tiene cita
- **THEN** nace directamente en `en_tratamiento`

#### Scenario: Aceptar dos veces
- **WHEN** Bambú acepta un caso que ya está aceptado
- **THEN** 409 y no se publica ningún evento

#### Scenario: Derivador intenta aceptar
- **WHEN** un derivador llama a aceptar su propio caso
- **THEN** 403

#### Scenario: Rechazar sin motivo
- **WHEN** Bambú rechaza sin escribir motivo
- **THEN** 400

#### Scenario: El mismo paciente vuelve a derivarse
- **WHEN** un veterinario deriva otra vez un paciente que ya tuvo un caso en alta
- **THEN** elige el paciente existente, se crea un caso nuevo y la ficha del paciente muestra los dos

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

### Requirement: Derivación registrada por Bambú
Cuando una clínica deriva por teléfono o por correo, un usuario de Bambú SHALL
poder registrar la derivación en su nombre: elige la clínica que la remite
entre las validadas (o la da de alta en ese momento), y opcionalmente el
veterinario, entre los usuarios de esa clínica o escrito a mano si no tiene
cuenta. La derivación nace `aceptada`, con la clínica elegida y
`registrado_por` = quien la registra; el consentimiento del
propietario lo confirma el fisio. Se publica `derivacion.registrada` para el
veterinario elegido o, si no hay ninguno con cuenta, para los veterinarios
activos de la clínica.

#### Scenario: Llamada de una clínica con cuenta
- **WHEN** una fisio registra la derivación que le dicta por teléfono una veterinaria de una clínica validada
- **THEN** el caso queda `aceptada` en esa clínica, la veterinaria lo ve en su lista y recibe la notificación y el correo

#### Scenario: Clínica que no está en el portal
- **WHEN** llama una clínica que no existe en el portal
- **THEN** la fisio la da de alta (validada, sin usuarios) y registra la derivación con el nombre del veterinario escrito a mano

### Requirement: Alta de clínicas por Bambú
Bambú SHALL poder dar de alta clínicas a mano (nombre, población, dirección,
teléfono, correo), que nacen validadas y sin usuarios, y marcar o desmarcar
como validada cualquier clínica. Las clínicas validadas aparecen en las
sugerencias del alta aunque no tengan usuarios, para que sus veterinarios se
unan a ellas al registrarse.

#### Scenario: El veterinario se registra después
- **WHEN** un veterinario de una clínica que Bambú dio de alta se registra en el portal
- **THEN** la sugerencia le ofrece su clínica y, al unirse, ve las derivaciones que Bambú registró a su nombre

### Requirement: El portal solo recibe derivaciones
Todo caso SHALL venir de una clínica: lo deriva un veterinario desde el portal
o lo registra Bambú en nombre de la clínica. Bambú no abre casos propios en el
portal; los animales que llegan sin veterinario, y las visitas, se gestionan
en su programa de gestión (Wakyma).

#### Scenario: Caso sin clínica
- **WHEN** Bambú intenta registrar un caso sin clínica que lo derive
- **THEN** 400 y no se crea nada

### Requirement: Marca de vista
La aplicación SHALL guardar quién y cuándo, la primera vez que un usuario
de Bambú abre una derivación `enviada`, (`vista_el`, `vista_por`) sin que nadie
pulse nada. El veterinario ve «Rebuda per Bambú» en su ficha y Bambú distingue
las nuevas sin abrir. Abrirla otra vez no cambia la marca.

#### Scenario: Primera apertura
- **WHEN** una fisio abre por primera vez una derivación nueva
- **THEN** queda marcada como vista por ella y deja de contar en «Noves sense obrir»

#### Scenario: El veterinario abre la suya
- **WHEN** el veterinario abre su propia derivación
- **THEN** no se marca como vista

### Requirement: Control de lo pendiente de cita
El inicio de Bambú SHALL mostrar tres contadores que llevan a la lista
filtrada: Noves sense obrir, Pendents de cita y En tractament. Una derivación
que lleva más de N días aceptada sin cita (N en Configuració → Avisos, 3 por
defecto) sale marcada en las listas y publica una sola vez
`caso.sin_noticias`. Lo comprueba una tarea que corre al arrancar y cada hora.

#### Scenario: Atasco
- **WHEN** una derivación lleva cuatro días aceptada sin cita y N es 3
- **THEN** sale marcada, el equipo recibe la notificación y el correo del centro un aviso, una sola vez aunque la tarea vuelva a pasar

### Requirement: Listas y fichas
La lista de casos SHALL ordenarse por actividad más reciente y filtrar por
estado, clínica, fisio, especie, texto (paciente, propietario,
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
