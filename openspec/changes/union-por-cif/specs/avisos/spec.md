## MODIFIED Requirements

### Requirement: Catálogo cerrado de eventos
La aplicación SHALL tener una lista cerrada de eventos de dominio, definida en
código y reflejada en un CHECK de la base. Cada evento tiene una audiencia
fija (`bambu`, `derivador` o `ambas`) que no se configura. Los de v1 y sus
valores por defecto son:

| Evento | Audiencia | Notificación | Correo |
|---|---|---|---|
| `derivacion.enviada` | bambu | sí | sí, al correo del centro |
| `derivacion.registrada` | derivador | sí | sí |
| `derivacion.aceptada` | derivador | sí | sí |
| `derivacion.rechazada` | derivador | sí | sí |
| `caso.fisio_asignado` | bambu | sí | no |
| `caso.en_tratamiento` | derivador | sí | no |
| `caso.alta` | derivador | sí | sí |
| `caso.abandonado` | derivador | sí | sí |
| `mensaje.nuevo` | ambas | sí | sí |
| `adjunto.nuevo` | ambas | sí | sí |
| `informe.publicado` | derivador | sí | sí |
| `paciente.ficha_modificada` | ambas | sí | no |
| `usuario.derivador_alta` | bambu | sí | sí, al correo del centro |
| `usuario.bambu_alta` | bambu | sí | no |
| `caso.sin_noticias` | bambu | sí | sí, al correo del centro, una vez por derivación atascada |

`derivacion.registrada` avisa al veterinario de que Bambú ha registrado en el
portal la derivación que hizo por teléfono o por correo, para que pueda
seguirla. Las sesiones se llevan en Wakyma, así que no hay evento de sesión registrada. `caso.sin_noticias` avisa de una derivación que lleva más de N días
aceptada sin cita.

Publicar un tipo que no está en la lista MUST fallar en el servidor.

#### Scenario: Evento desconocido
- **WHEN** el código intenta publicar `caso.inventado`
- **THEN** la publicación lanza un error y la transacción se deshace

#### Scenario: Semilla de la matriz
- **WHEN** la aplicación arranca por primera vez
- **THEN** existe una fila de configuración por cada evento de la lista con los valores por defecto

#### Scenario: La semilla no pisa
- **WHEN** Bambú ha apagado el correo de `mensaje.nuevo` y la aplicación se reinicia
- **THEN** sigue apagado

#### Scenario: Evento retirado del catálogo
- **WHEN** la aplicación arranca con este change sobre una base que tenía la fila de `intervencion.registrada` en la matriz
- **THEN** la fila ya no aparece en Configuració → Avisos

#### Scenario: Eventos nuevos en una base que ya existía
- **WHEN** la aplicación arranca con este change sobre una base que ya tenía la matriz
- **THEN** aparecen las filas de los eventos nuevos con sus valores por defecto y las existentes no cambian

### Requirement: Destinatarios resueltos sin incluir al actor
Los destinatarios de cada evento SHALL calcularse con una función pura a
partir del caso, los usuarios activos y quién actúa, y nunca incluyen a quien
provocó el evento. Audiencia `bambu`: el fisio responsable del caso si lo hay;
si no, todos los usuarios `bambu` activos (en `derivacion.enviada` y los
`usuario.*`, siempre todos). El superadmin cuenta como usuario de Bambú para la
campana; como no tiene correo, nunca recibe correos. Audiencia `derivador`: el veterinario que derivó
y los compañeros de su clínica que hayan escrito en el hilo. Audiencia
`ambas`: el lado contrario al de quien actúa.

#### Scenario: Escribe el veterinario
- **WHEN** el veterinario escribe un mensaje en un caso con fisio responsable
- **THEN** la notificación va al fisio responsable y no al veterinario

#### Scenario: Escribe Bambú
- **WHEN** un fisio escribe en el hilo
- **THEN** la notificación va al veterinario derivador y a los compañeros que han participado, no al fisio

#### Scenario: El superadmin ve la campana
- **WHEN** se da de alta un veterinario y en Bambú solo existe el superadmin
- **THEN** el superadmin tiene la notificación `usuario.derivador_alta`

#### Scenario: Caso sin fisio asignado
- **WHEN** llega un mensaje del veterinario en un caso sin fisio responsable
- **THEN** reciben la notificación todos los usuarios `bambu` activos
