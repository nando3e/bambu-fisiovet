# Tasks — change `derivacion-breve-y-documentos`

Regla de la casa: cada task con su test; cada arreglo se verifica quitándolo
y viendo el test en rojo. Toda ruta nueva con su test de ámbito y de rol.

## 1. API

- [x] 1.1 Migración `010_documentos.sql`: `adjuntos.categoria` con CHECK
      (`radiografia`, `informe`, `analitica` o NULL).
- [x] 1.2 Casos: `POST/PATCH /api/casos` solo aceptan `motivo` y
      `tratamiento_actual` (400 con los retirados); la ficha sigue devolviendo
      los tres antiguos. `derivacion.enviada` lleva el número de documentos.
      Test en `casos.test.ts`.
- [x] 1.3 Hilo: `POST /casos/:id/adjuntos` admite `categoria`; en borrador
      solo el derivador del caso y solo con categoría, sin `adjunto.nuevo` ni
      actividad. `GET /casos/:id/adjuntos` con ámbito y sin notas internas al
      derivador. Test en `hilo.test.ts` (borrador con y sin categoría, otra
      clínica 404, nota interna oculta).

## 2. Web

- [x] 2.1 `imagenes.ts` (reducir) y hook `useSubidas` (fila, vista previa,
      errores por fichero) extraídos del hilo; el hilo los usa.
- [x] 2.2 Nova derivació: paso 2 con motivo, tractament actual y las tres
      zonas de documentos; «Envia» espera a las subidas en curso. Edición de
      la ficha con los dos campos; los antiguos solo se enseñan si tienen
      contenido.
- [x] 2.3 Bloque «Documents» en la pestaña Fitxa: grupos, miniaturas
      perezosas, botón por categoría según rol y estado, retirar.
- [x] 2.4 Hilo: clases `propio` / `ajeno` según quién mira; CSS.
- [x] 2.5 Textos nuevos en `va.ts`; `npm run comprueba` y `build`.

## 3. Documentación

- [x] 3.1 Guía del portal (nova derivació, documents), RGPD (documentos =
      adjuntos con categoría), cuaderno D21 + supuesto de los campos retirados.

## 4. Cierre

- [ ] 4.1 Skill `cerrar-change`: batería, revisor en otro modelo, archivar.

Siguiente: task 4.1 — todo construido, probado en local (subida de 4 MB reducida a 977 KB, burbujas en /d y /b) y documentado; falta el cierre con revisor.
