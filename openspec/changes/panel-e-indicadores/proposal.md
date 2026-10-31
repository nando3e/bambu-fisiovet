## Why

Con derivaciones, hilo e informes funcionando, Bambú empieza a acumular datos
que le sirven para decidir: qué clínicas le derivan y cuáles han dejado de
hacerlo, si cumple su promesa de responder rápido, dónde se pierden casos y
cuánto dura un tratamiento. Este change añade **seis indicadores, cada uno
ligado a una decisión**, sin ingresos, tartas de especies ni métricas de
adorno.

## What Changes

- Pantalla `/b/panell` con seis indicadores y un rango de fechas:
  1. Derivaciones recibidas por mes (12 meses) y por clínica (top 10).
  2. Tiempo de respuesta mediano entre el envío y la aceptación o el rechazo.
  3. Embudo de 90 días: enviadas → aceptadas → con primera sesión → alta.
  4. Casos activos por estado.
  5. Sesiones por caso y días hasta el alta (medianas).
  6. Casos sin noticias y propuestas de informe pendientes.
- Cada indicador enlaza a la lista de casos con el filtro equivalente.
- Gráficas con carga diferida, para no pesar en el resto de la app.
- Cierre del proyecto v1: `docs/rgpd.md` completo y `CLAUDE.md` con todo lo
  real.

## Capabilities

### New Capabilities

- `panel`: indicadores de Bambú con sus consultas, rangos y enlaces a las
  listas filtradas.

### Modified Capabilities

_Ninguna._

## Impact

- Consultas en `api/src/db/repos/panel.ts`; rutas `/api/panel/indicadores` y
  `/api/panel/inicio`.
- Dependencia de la web: `recharts`, cargada solo en esa pantalla.
- Sin migraciones: todo sale de `casos`, `intervenciones` y `eventos`.

## Supuestos pendientes de confirmar con Bambú

- *(supuesto)* Si se publica en la landing la promesa «resposta en menys de
  24 h laborables»: el indicador 2 la mide; publicarla es decisión de Bambú.
- *(supuesto)* «Laborables» = lunes a viernes, sin festivos en v1.

## Fuera de alcance

- Indicadores para el propio veterinario (v2).
- Exportar a xlsx (aplazado en el cuaderno).
