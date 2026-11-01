# Tasks — change `hilo-adjuntos-y-sesiones`

Regla de la casa: cada task con su test; cada arreglo se verifica quitándolo
y viendo el test en rojo. Toda ruta nueva con su test de rol y de ámbito.

## 1. Datos y dominio

- [x] 1.1 `006_hilo.sql` (design D1) y catálogo sin `intervencion.registrada`.
      Tests: dos veces sin error; el catálogo coincide con el CHECK vivo; la
      fila retirada desaparece de la matriz.
- [x] 1.2 `ficheros/adjuntos.ts` (puro): tipo por contenido y extensión
      permitida. Tests: PDF, JPEG, PNG, WEBP, DOC, DOCX/XLSX/ZIP aceptados; EXE
      renombrado a PDF, ZIP con extensión `.pdf` y texto plano, rechazados.

## 2. API

- [x] 2.1 `servicios/hilo.ts` y mensajes de sistema en todas las
      transiciones, en la derivación registrada y en los cambios de ficha.
      Tests: aceptar deja «Bambú ha acceptat la derivació»; cambiar el peso
      deja el antes y el después; si la acción se deshace, no queda mensaje.
- [x] 2.2 `GET` y `POST /casos/:id/mensajes`. Tests: el derivador no recibe
      notas internas; una nota interna no notifica al derivador; un derivador
      que manda `interna` crea un mensaje visible; borrador → 409; otra
      clínica → 404; el mensaje visible notifica al fisio responsable.
- [x] 2.3 `POST /casos/:id/adjuntos`, `GET /adjuntos/:id/{fichero,miniatura}`.
      Tests: EXE disfrazado → 400 y nada en disco; 15 MB → 413; adjunto de otra
      clínica → 404; sin sesión → 401; nota interna con adjunto invisible para
      el derivador; huella SHA-256 correcta; miniatura generada para una PNG;
      `adjunto.nuevo` publicado.
- [x] 2.4 `DELETE /adjuntos/:id`. Tests: el derivador dentro de 15 minutos
      puede, fuera → 403; Bambú siempre; retirado → 404 al descargar y
      «Adjunt retirat» en el hilo.
- [x] 2.5 `GET /panel/movimientos` (B). Test: una derivación recién enviada
      sale la primera; derivador → 403.

## 3. Web

- [x] 3.1 Pestañas `Fil · Fitxa` en la ficha; `Hilo.tsx` con mensajes,
      compositor, nota interna (Bambú) y adjuntos.
- [x] 3.2 Reducción de imágenes en el navegador, vista previa inmediata y
      retirada si falla.
- [x] 3.3 «Últims moviments» en el inicio de Bambú.
- [x] 3.4 Build con las seis comprobaciones y recorrido en Chrome a 390 y
      1280 px: mensaje, nota interna, foto y PDF.

## 4. Cierre

- [x] 4.1 `npm test`, typecheck y `comprova-produccio` en verde.
- [ ] 4.2 Revisor con un modelo distinto; corregir y justificar.
- [ ] 4.3 Redesplegar, comprobar `sharp` y una subida en producción; archivar.
