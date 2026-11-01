# Revisión del change `panel-e-indicadores`

- **Revisor**: Sol (`gpt-5.6-sol` vía Codex, solo lectura). El código lo
  escribió Claude Opus.
- **Alcance**: `git diff ee0de3b..HEAD`.
- **Resultado**: sin GRAVE; 4 MEDIO y 2 LEVE. Cada hallazgo se comprobó contra
  el código. Corregidos tres MEDIO y parte de un LEVE; descartados, con su
  motivo, un MEDIO y un LEVE.

## MEDIO 1 · La duración mezclaba cohortes — corregido

Las medianas solo contaban las altas con primera visita, pero se presentaban
junto al total de altas: una sola alta con fechas parecía representar a todas.

- **Arreglo**: el API devuelve `con_visita` aparte y la pantalla dice
  «medianes de les N altes amb data de primera visita (de M altes)». Las
  diferencias negativas cuentan como 0.
- **Al arreglarlo saltó un error propio**: en Postgres `greatest(0, NULL)`
  vale 0, así que un alta sin visita entraba como cero días. Ahora las
  medianas llevan `FILTER (WHERE primera_visita IS NOT NULL)`.
- **Test**: un alta sin «Ja té cita» en el rango da `altas: 4, con_visita: 3`
  sin mover las medianas. **Mutación**: sin el FILTER, el test cae.

## MEDIO 2 · Validación del rango — corregido

El límite de 36 meses miraba solo año y mes: rechazaba
`2023-01-02..2026-01-01`, que tiene menos de 36 meses. Además, `2026-02-31`
pasaba la expresión regular y llegaba a Postgres.

- **Arreglo**: la fecha tiene que existir en el calendario, y `hasta` tiene que
  quedar antes de `desde + 36 meses` (el 31 de un mes corto cae en su último
  día).
- **Test**: `2023-01-02..2026-01-01` da 200; `2026-02-31` y `2026-13-01` dan
  400.
- **Mutación**: el límite antiguo y la falta de validación de la fecha hacen
  caer el test, cada uno por su lado.

## MEDIO 3 · El navegador mezclaba hora local y UTC — corregido

A las 00:30 de Madrid, `toISOString()` todavía daba el día anterior.

- **Arreglo**: el rango sale de la fecha civil de Madrid
  (`Intl.DateTimeFormat` con `Europe/Madrid`), igual que el rango por defecto
  del servidor.

## MEDIO 4 · El test depende de la fecha real — descartado

Los casos relativos van como mucho a 100 días antes de hoy. Para cualquier
ejecución desde hoy (2026-11-01) caen después del 2026-07-23, fuera del rango
fijo de enero a junio de 2026, y el reloj no va hacia atrás. El embudo y los
activos usan solo esos casos relativos, que siempre están dentro de los 90
días o claramente fuera (el de 100 días).

## LEVE · Enlaces que no reproducen la cifra exacta — corregido en parte

- **Corregido**: «informes pendents de confirmar» llevaba a la lista de casos
  en tratamiento, en el panel y en el inicio. Ahora lleva a
  `/b/casos?propuestas=1`, con un filtro nuevo del API
  (`propuestas_pendientes`). Solo Bambú puede usarlo: el derivador no filtra
  por algo que no ve.
- **Test**: la lista filtrada devuelve justo el caso con propuesta. Al
  derivador, con dos casos en su clínica y uno con propuesta, el parámetro no
  le cambia la lista. **Mutación**: sin el freno de rol, el test cae.
- **Aceptado como limitación**: el enlace del embudo («acceptades sense cita»)
  y el del top de clínicas abren la lista sin restringir por fechas. La lista
  no filtra por fechas en la v1. Queda en el registro de aplazados.

## LEVE · `horasLaborables` recorre los días uno a uno — descartado

Solo entran las derivaciones resueltas del rango, cientos como mucho, y casi
todas se resuelven en horas o pocos días. Aun con 36 meses y miles de casos,
el coste son milisegundos. Si algún día pesa, se cambia por aritmética de
semanas completas sin tocar el contrato.

## Revisado sin hallazgos

Sol confirma que están bien:

- El agrupado mensual y los `BETWEEN` en fecha civil de Madrid.
- Las restas de `date`, sin errores en los cambios de hora.
- La coherencia del embudo, sin borradores ni descartados.
- La mediana de respuesta y el umbral `< 24`.
- El filtro por clínica con el ámbito en SQL.
- La matriz de roles.
- Los textos en `va.ts`.
- El menú móvil con siete entradas.
