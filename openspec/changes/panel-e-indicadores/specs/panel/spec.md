## ADDED Requirements

### Requirement: Indicadores solo para Bambú
La pantalla `/b/panell` y sus rutas SHALL estar disponibles solo para `bambu` y
`superadmin`. Todos los indicadores aceptan un rango de fechas (por defecto,
los últimos 12 meses), excluyen los borradores y los casos de prueba de la
semilla de demo, y se calculan en SQL con tests de números exactos sobre una
semilla conocida, no con aserciones del tipo «mayor que cero».

#### Scenario: Derivador en el panel
- **WHEN** un derivador llama a `GET /api/panel/indicadores`
- **THEN** 403

#### Scenario: Números exactos
- **WHEN** la semilla de test tiene 7 derivaciones de la clínica A y 3 de la B en marzo
- **THEN** el indicador por clínica devuelve exactamente 7 y 3 para marzo

### Requirement: Derivaciones por mes y por clínica
El panel SHALL mostrar las derivaciones enviadas por mes y las 10 clínicas que
más derivan en el rango, con su número. Pulsar una clínica abre la lista de
casos filtrada por ella.

#### Scenario: Clínica que deja de derivar
- **WHEN** una clínica derivó cada mes y lleva dos sin hacerlo
- **THEN** su barra de esos meses aparece a cero en la serie mensual de esa clínica

### Requirement: Tiempo de respuesta
El panel SHALL mostrar la mediana del tiempo entre `enviado_el` y
`resuelto_el` (aceptación o rechazo) en horas laborables (lunes a viernes) y
cuántas derivaciones se resolvieron en menos de 24 horas laborables.

#### Scenario: Envío en viernes
- **WHEN** una derivación se envía el viernes a las 18:00 y se acepta el lunes a las 10:00
- **THEN** cuenta como 16 horas laborables

### Requirement: Embudo de los últimos 90 días
El panel SHALL mostrar, para las derivaciones enviadas en los últimos 90 días,
cuántas fueron aceptadas, cuántas llegaron a la primera sesión y cuántas al
alta, y cuántas se rechazaron o abandonaron.

#### Scenario: Pérdida tras aceptar
- **WHEN** de 20 aceptadas solo 12 tuvieron primera sesión
- **THEN** el embudo muestra 20 → 12 y enlaza a las 8 aceptadas sin sesión

### Requirement: Carga y duración de los tratamientos
El panel SHALL mostrar los casos activos por estado y, para los casos dados de
alta en el rango, la mediana de sesiones por caso y la mediana de días entre
la primera sesión y el alta.

#### Scenario: Sin altas en el rango
- **WHEN** no hay ningún alta en el rango elegido
- **THEN** los indicadores de duración muestran «Sense dades» en vez de cero

### Requirement: Indicadores operativos en el inicio
El inicio de Bambú SHALL mostrar como tarjetas accionables las derivaciones
pendientes de aceptar, los casos sin noticias, las propuestas de informe
pendientes de confirmar y las notificaciones sin leer, cada una con enlace a
su lista.

#### Scenario: Derivaciones por aceptar
- **WHEN** hay tres derivaciones enviadas sin resolver
- **THEN** la tarjeta muestra 3 y lleva a la lista filtrada por «enviada»
