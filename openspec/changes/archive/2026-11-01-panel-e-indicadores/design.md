# Design — change `panel-e-indicadores`

## Contexto

La propuesta se escribió cuando el portal iba a llevar las sesiones. Después
Nando decidió que **las visitas se gestionan en Wakyma** (sin API) y el portal
solo recibe derivaciones: no hay tabla `intervenciones` ni sesiones. Los seis
indicadores se recalculan con lo que el portal sí sabe: `enviado_el`,
`resuelto_el` (aceptación o rechazo), `en_tratamiento_el` y `primera_visita`
(«Ja té cita»), `cerrado_el` y el estado.

## Decisiones

**D1. Los seis indicadores, sin sesiones.**

1. **Derivaciones por mes** (serie de los meses del rango, con ceros) y **top
   10 de clínicas** del rango, cada una con su total y la fecha de su última
   derivación. La decisión es «a qué clínica hay que llamar»: una clínica
   cuya última derivación tiene más de 60 días se marca. Es más directo que
   una serie mensual por clínica y se lee bien en el móvil.
2. **Tiempo de respuesta**: mediana de horas laborables entre `enviado_el` y
   `resuelto_el`, y cuántas se resolvieron en menos de 24 h laborables. Solo
   las derivaciones del portal: las que registra Bambú por teléfono nacen
   resueltas y falsearían la mediana.
3. **Embudo de 90 días**: de las derivaciones enviadas en los últimos 90
   días, cuántas se aceptaron, cuántas tienen cita (`en_tratamiento_el`),
   cuántas acabaron en alta, y cuántas se rechazaron, se abandonaron o siguen
   sin respuesta. «Acceptades sense cita» enlaza a la lista de pendientes.
4. **Casos activos por estado** (ahora, no en el rango): enviada, aceptada y
   en tratamiento, cada uno enlazado a su filtro.
5. **Duración**: para las altas del rango, mediana de días entre la
   aceptación y la primera visita (la espera que sufre el propietario) y
   mediana de días entre la primera visita y el alta. Sin altas: «Sense
   dades», nunca cero.
6. **Operativos** (ahora): pendientes de cita más de N días y propuestas de
   informe sin confirmar, ya presentes en el inicio y repetidos aquí con su
   enlace.

**D2. Horas laborables en `dominio/`**: `horasLaborables(desde, hasta)` es
pura y cuenta las horas de calendario de lunes a viernes (viernes 18:00 →
lunes 10:00 = 16 h). Las fechas llegan ya en hora de Madrid desde SQL
(`AT TIME ZONE 'Europe/Madrid'`), así el dominio no sabe de husos. Sin
festivos en v1 (supuesto de la propuesta).

**D3. Agregados en SQL, mediana en SQL.** Recuentos y series con `count(*)
FILTER` y `generate_series` para los meses vacíos; medianas con
`percentile_cont(0.5)` salvo la de horas laborables, que se calcula en el
dominio sobre las parejas de fechas del rango (cientos de filas como mucho).

**D4. Sin recharts.** Las barras son `div` con anchura proporcional, con la
cifra escrita al lado: sin dependencia nueva, legibles en el móvil y sin
carga diferida que mantener. Se aparta de la propuesta (que pedía recharts
diferido) porque seis indicadores de barras y cifras no justifican la
librería.

**D5. Rango.** `GET /api/panel/indicadores?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`;
por defecto los últimos 12 meses, hasta hoy. Más de 36 meses o `desde >
hasta` → 400. El rango afecta a 1, 2 y 5; el embudo son siempre 90 días y 4 y
6 son «ahora». Excluye borradores y descartados. La semilla de demo nunca
corre en producción (se niega), así que no hace falta excluirla.

**D6. Enlaces.** Cada cifra lleva a `/b/casos` con su filtro. La lista acepta
`?clinica=<id>` además de `?f=`, para el top de clínicas.

**D7. Cierre de la v1.** `docs/rgpd.md` con los tratamientos reales (qué
datos, dónde, cuánto tiempo, quién los ve, qué viaja a la IA) y `CLAUDE.md`
al día.

## Riesgos

- **Husos**: una derivación enviada a las 23:30 del domingo en Madrid es
  lunes en UTC; por eso se convierte en SQL antes de contar (D2), con test.
- **Medianas con pocas filas**: con menos de 3 casos el número engaña; se
  muestra igual, con el «n» al lado.
