# Tasks — change `panel-e-indicadores`

Regla de la casa: cada task con su test; cada arreglo se verifica quitándolo
y viendo el test en rojo. Toda ruta nueva con su test de rol.

## 1. API

- [x] 1.1 `dominio/indicadores.ts`: `horasLaborables` y `mediana`. Tests:
      viernes 18:00 → lunes 10:00 = 16 h; dentro del mismo día; sábado a
      domingo = 0; mediana par e impar, vacía → null.
- [x] 1.2 `rutas/panel.ts`: `GET /api/panel/indicadores` con los seis
      indicadores (design D1, D5). Tests de números exactos sobre una semilla
      con fechas fijas: 7 y 3 derivaciones de dos clínicas en un mes, meses
      vacíos a cero, clínica sin derivar en 60 días marcada, mediana de
      respuesta en horas laborables sin las registradas por Bambú, embudo,
      activos por estado, duración y «sin datos» sin altas; rango inválido
      → 400; derivador → 403 (tabla de roles).

## 2. Web

- [x] 2.1 `/b/panell` con los seis bloques, selector de rango y enlaces a
      la lista filtrada; entrada en el menú de Bambú. Textos en `va.ts`.
- [x] 2.2 La lista de casos acepta `?clinica=<id>`.
- [x] 2.3 `npm run build` (comprobaciones incluidas) y recorrido en el
      navegador sin errores de consola.

## 3. Cierre

- [x] 3.1 `docs/rgpd.md` y `CLAUDE.md` al día.
- [x] 3.2 Revisor (Sol) sobre el diff; hallazgos corregidos con su test o
      descartados por escrito en `revision.md`.
- [x] 3.3 Desplegar en el portal de pruebas, comprobar `/salud` y el panel, y
      archivar.
