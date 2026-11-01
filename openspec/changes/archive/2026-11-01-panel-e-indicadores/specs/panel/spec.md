## ADDED Requirements

### Requirement: Indicadores solo para Bambú
La pantalla `/b/panell` y sus rutas SHALL estar disponibles solo para `bambu` y
`superadmin`. Los indicadores aceptan un rango de fechas (por defecto, los
últimos 12 meses), excluyen los borradores y los descartados, y se calculan en
SQL con tests de números exactos sobre una semilla conocida, no con
aserciones del tipo «mayor que cero».

#### Scenario: Derivador en el panel
- **WHEN** un derivador llama a `GET /api/panel/indicadores`
- **THEN** 403

#### Scenario: Números exactos
- **WHEN** la semilla de test tiene 7 derivaciones de la clínica A y 3 de la B en marzo
- **THEN** el indicador por clínica devuelve exactamente 7 y 3, y marzo suma 10

#### Scenario: Rango inválido
- **WHEN** `desde` es posterior a `hasta` o el rango pasa de 36 meses
- **THEN** 400

### Requirement: Derivaciones por mes y por clínica
El panel SHALL mostrar las derivaciones enviadas por mes (con los meses vacíos
a cero) y las 10 clínicas que más derivan en el rango, con su número y la fecha
de su última derivación. Pulsar una clínica abre la lista de casos filtrada por
ella.

#### Scenario: Clínica que deja de derivar
- **WHEN** la última derivación de una clínica del top tiene más de 60 días
- **THEN** la clínica aparece marcada como «fa temps que no deriva»

### Requirement: Tiempo de respuesta
El panel SHALL mostrar la mediana del tiempo entre `enviado_el` y
`resuelto_el` (aceptación o rechazo) en horas laborables (lunes a viernes, hora
de Madrid) y cuántas derivaciones se resolvieron en menos de 24 horas
laborables. Las derivaciones registradas por Bambú no cuentan: nacen resueltas.

#### Scenario: Envío en viernes
- **WHEN** una derivación se envía el viernes a las 18:00 y se acepta el lunes a las 10:00
- **THEN** cuenta como 16 horas laborables

### Requirement: Embudo de los últimos 90 días
El panel SHALL mostrar, para las derivaciones enviadas en los últimos 90 días,
cuántas fueron aceptadas, cuántas tienen cita (`Ja té cita`), cuántas llegaron
al alta, y cuántas se rechazaron, se abandonaron o siguen sin respuesta.

#### Scenario: Pérdida tras aceptar
- **WHEN** de 20 aceptadas solo 12 tienen cita
- **THEN** el embudo muestra 20 → 12 y enlaza a las aceptadas pendientes de cita

### Requirement: Carga y duración
El panel SHALL mostrar los casos activos por estado y, para los casos dados de
alta en el rango, la mediana de días entre la aceptación y la primera visita y
la mediana de días entre la primera visita y el alta. Las visitas se gestionan
en Wakyma: el portal no cuenta sesiones.

#### Scenario: Sin altas en el rango
- **WHEN** no hay ningún alta en el rango elegido
- **THEN** los indicadores de duración muestran «Sense dades» en vez de cero

### Requirement: Indicadores operativos
El panel y el inicio de Bambú SHALL mostrar los casos aceptados sin cita
desde hace más de N días y las propuestas de informe pendientes de confirmar,
cada uno con enlace a su lista.

#### Scenario: Pendientes de cita atascados
- **WHEN** hay dos casos aceptados hace más de N días sin cita
- **THEN** el panel muestra 2 y lleva a la lista filtrada por «atascats»
