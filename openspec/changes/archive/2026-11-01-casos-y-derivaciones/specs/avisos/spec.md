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
| `intervencion.registrada` | derivador | sí | no |
| `informe.publicado` | derivador | sí | sí |
| `paciente.ficha_modificada` | ambas | sí | no |
| `usuario.derivador_alta` | bambu | sí | sí, al correo del centro |
| `usuario.bambu_alta` | bambu | sí | no |
| `usuario.solicita_union` | ambas | sí | sí |
| `usuario.union_resuelta` | derivador | sí | sí |
| `caso.sin_noticias` | bambu | sí | sí, al correo del centro, una vez por derivación atascada |

`derivacion.registrada` avisa al veterinario de que Bambú ha registrado en el
portal la derivación que hizo por teléfono o por correo, para que pueda
seguirla. `caso.sin_noticias` avisa de una derivación que lleva más de N días
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

#### Scenario: Eventos nuevos en una base que ya existía
- **WHEN** la aplicación arranca con este change sobre una base que ya tenía la matriz
- **THEN** aparecen las filas de los eventos nuevos con sus valores por defecto y las existentes no cambian
