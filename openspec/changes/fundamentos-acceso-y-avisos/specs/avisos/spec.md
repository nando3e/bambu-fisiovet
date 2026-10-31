## ADDED Requirements

### Requirement: Catálogo cerrado de eventos
La aplicación SHALL tener una lista cerrada de eventos de dominio, definida en
código y reflejada en un CHECK de la base. Cada evento tiene una audiencia
fija (`bambu`, `derivador` o `ambas`) que no se configura. Los de v1 y sus
valores por defecto son:

| Evento | Audiencia | Notificación | Correo |
|---|---|---|---|
| `derivacion.enviada` | bambu | sí | sí, al correo del centro |
| `derivacion.aceptada` | derivador | sí | sí |
| `derivacion.rechazada` | derivador | sí | sí |
| `caso.fisio_asignado` | bambu | sí | no |
| `caso.en_tratamiento` | derivador | sí | no |
| `caso.alta` | derivador | sí | sí |
| `caso.abandonado` | derivador | sí | sí |
| `mensaje.nuevo` | ambas | sí | sí |
| `adjunto.nuevo` | ambas | sí | sí |
| `intervencion.registrada` | derivador | sí | no |
| `informe.publicado` | derivador | sí | sí |
| `paciente.ficha_modificada` | ambas | sí | no |
| `usuario.derivador_alta` | bambu | sí | sí, al correo del centro |
| `usuario.bambu_alta` | bambu | sí | no |
| `usuario.solicita_union` | ambas | sí | sí |
| `usuario.union_resuelta` | derivador | sí | sí |
| `caso.sin_noticias` | bambu | sí | sí, un resumen diario al correo del centro |

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

### Requirement: El evento se publica dentro de la transacción de la acción
Toda acción que genera un evento SHALL publicarlo con el mismo cliente de BD y
dentro de la misma transacción que su escritura. Si la acción se deshace, no
queda ni el evento, ni las notificaciones, ni los correos encolados.

#### Scenario: La acción falla después de publicar
- **WHEN** una acción publica su evento y después falla y hace rollback
- **THEN** no existe el evento, ni notificaciones, ni correos pendientes de esa acción

### Requirement: Matriz de avisos con efecto inmediato
Para cada evento, la configuración SHALL decidir si genera notificación
interna, si genera correo y, en los de audiencia Bambú, a qué dirección
(«Correu a»; vacío = el correo del centro). La configuración se lee en cada
publicación, sin caché: un cambio afecta al siguiente evento sin reiniciar.

#### Scenario: Apagar la notificación
- **WHEN** Bambú apaga la notificación de `intervencion.registrada` y luego se registra una sesión
- **THEN** no se crea ninguna notificación por esa sesión

#### Scenario: Apagar el correo
- **WHEN** Bambú apaga el correo de `derivacion.aceptada` y luego acepta una derivación
- **THEN** el veterinario tiene la notificación pero no se encola ningún correo

#### Scenario: Correo a una dirección concreta
- **WHEN** «Correu a» de `derivacion.enviada` es `recepcio@bambufisiovet.com` y llega una derivación
- **THEN** se encola un único correo a esa dirección y no al correo del centro

#### Scenario: Correo a vacío
- **WHEN** «Correu a» de `derivacion.enviada` está vacío
- **THEN** el correo va al correo del centro

### Requirement: Destinatarios resueltos sin incluir al actor
Los destinatarios de cada evento SHALL calcularse con una función pura a
partir del caso, los usuarios activos y quién actúa, y nunca incluyen a quien
provocó el evento. Audiencia `bambu`: el fisio responsable del caso si lo hay;
si no, todos los usuarios `bambu` activos (en `derivacion.enviada` y los
`usuario.*`, siempre todos). El superadmin cuenta como usuario de Bambú para la
campana; como no tiene correo, nunca recibe correos. Audiencia `derivador`: el veterinario que derivó
y los compañeros de su clínica que hayan escrito en el hilo. Audiencia
`ambas`: el lado contrario al de quien actúa. En `usuario.solicita_union` son
los veterinarios activos de la clínica destino y los usuarios `bambu`.

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

### Requirement: Centro de notificaciones
Cada usuario SHALL tener sus notificaciones con título, texto corto, enlace a
la pantalla de su zona (`/d/…` o `/b/…`), fecha y estado de lectura. La
cabecera muestra una campana con el número de no leídas (99+ a partir de
cien), que se actualiza cada 60 segundos y al volver a la pestaña. Desde la
lista se puede marcar una como leída, marcar todas, y filtrar solo las no
leídas. Pulsar una la marca como leída y navega a su enlace. Un usuario solo
puede leer y marcar las suyas.

#### Scenario: Contador
- **WHEN** un usuario tiene tres notificaciones sin leer
- **THEN** `GET /api/notificaciones/resumen` devuelve `{ no_leidas: 3 }` y la campana muestra un 3

#### Scenario: Marcar todas
- **WHEN** pulsa «Marca-les totes com a llegides»
- **THEN** el contador pasa a 0

#### Scenario: Notificación ajena
- **WHEN** un usuario intenta marcar como leída una notificación de otro
- **THEN** 404

### Requirement: El veterinario decide si quiere correos
Para los eventos de audiencia derivador, el correo SHALL enviarse solo a los
destinatarios con «Rebre avisos per correu» encendido. A los que lo tienen
apagado se les crea igualmente la notificación, y la traza registra el motivo
del correo no enviado.

#### Scenario: Correos apagados
- **WHEN** se publica un informe para un veterinario con los correos apagados
- **THEN** tiene la notificación, no se encola correo y la traza dice `recibe_correos=false`

### Requirement: Un solo correo hasta que se lea
La aplicación SHALL omitir el correo a un destinatario que ya tiene una
notificación no leída del mismo caso, en los eventos `mensaje.nuevo`,
`adjunto.nuevo`, `intervencion.registrada` y `paciente.ficha_modificada`. La
notificación sí se crea. Cuando el destinatario lee las notificaciones de ese
caso, el siguiente evento vuelve a mandar correo.

#### Scenario: Dos mensajes seguidos
- **WHEN** el fisio escribe dos mensajes seguidos y el veterinario no ha leído el primero
- **THEN** el veterinario tiene dos notificaciones y un solo correo

#### Scenario: Después de leer
- **WHEN** el veterinario lee las notificaciones del caso y el fisio escribe otra vez
- **THEN** se encola un correo nuevo

### Requirement: El correo nunca se envía en la petición
Todo correo SHALL encolarse y enviarlo una tarea de fondo del mismo proceso,
que despierta cada 15 segundos y justo después de cada acción que encola.
Toma lotes con bloqueo que permite varias instancias sin enviar dos veces. Si
el envío falla, reintenta a los 1, 5, 30, 120 y 720 minutos; al sexto fallo
el correo queda `fallido` con su último error. Al arrancar, retoma lo que
quedó pendiente. Un servidor de correo caído nunca hace fallar la acción del
usuario.

#### Scenario: Servidor de correo caído
- **WHEN** se envía una derivación con el servidor de correo caído
- **THEN** la derivación se guarda, el correo queda pendiente con `intentos = 1` y un próximo intento en el futuro

#### Scenario: Reinicio con correos pendientes
- **WHEN** la aplicación se reinicia con correos pendientes
- **THEN** la cola los envía al arrancar

#### Scenario: Dos instancias a la vez
- **WHEN** dos procesos de la cola leen la cola al mismo tiempo
- **THEN** cada correo se envía una sola vez

### Requirement: Modo de prueba del correo
La cola SHALL no enviar nada si `CORREO_DRY_RUN=true` en el entorno o si
el servidor de correo no está configurado en el panel: marca cada correo como
enviado y deja en la traza el motivo (`dry-run` o `smtp sin configurar`) y el
destinatario. El entorno manda sobre el panel. La pantalla de avisos lo
indica.

#### Scenario: Entorno de pruebas
- **WHEN** `CORREO_DRY_RUN=true` y se da de alta un veterinario
- **THEN** el correo de verificación queda `enviado` con motivo `dry-run` y no sale ningún correo

### Requirement: Correos de cuenta fuera de la matriz
Los correos de verificación, recuperación e invitación SHALL enviarse siempre,
por la misma cola, sin pasar por la matriz: no se pueden desactivar.

#### Scenario: Matriz apagada del todo
- **WHEN** Bambú apaga el correo de todos los eventos y alguien pide recuperar su contraseña
- **THEN** el correo de recuperación se encola igualmente

### Requirement: Traza de cada aviso
Cada intento de aviso SHALL dejar una fila de traza con canal, evento,
destinatario, plantilla, si se envió y el motivo si no. Bambú ve en
Configuració → Avisos los correos pendientes y fallidos de las últimas 24
horas, con el último error, y puede reintentar un fallido.

#### Scenario: Reintentar un fallido
- **WHEN** Bambú pulsa «Reintenta» en un correo fallido
- **THEN** vuelve a `pendiente` con un intento inmediato

### Requirement: Correos sin datos clínicos
Las plantillas de correo SHALL llevar asunto, un resumen corto y un enlace a
la aplicación, en valenciano, en HTML y en texto. Nunca adjuntan informes ni
incluyen historia clínica, tratamiento o datos del propietario: eso se lee
dentro, con sesión.

#### Scenario: Correo de informe
- **WHEN** se encola el correo de un informe publicado
- **THEN** contiene el nombre del paciente, el tipo de informe y el enlace, y no el contenido del informe
