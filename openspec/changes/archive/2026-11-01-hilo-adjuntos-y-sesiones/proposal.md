## Why

Una derivación aceptada necesita conversación: el veterinario sube la
radiografía que faltaba, el fisio pregunta por la medicación y los dos ven en
qué punto está el caso. Hoy eso se hace por WhatsApp y correo sueltos, y se
pierde. Este change convierte cada caso en una **línea de tiempo compartida**:
hilo, adjuntos y eventos del sistema, con notas internas que solo ve Bambú.

## What Changes

- Hilo por caso con mensajes de texto, adjuntos, eventos del sistema (y, en el
  change siguiente, informes), en orden cronológico.
- Notas internas de Bambú dentro del mismo hilo, invisibles para el derivador.
- Adjuntos de hasta 12 MB (PDF, imágenes, ZIP, DOC/DOCX, XLSX) validados por
  su contenido real y no por la extensión, con nombre aleatorio, huella
  SHA-256 y miniatura para las imágenes. Siempre se sirven por una ruta con
  permisos, nunca como estáticos. Las imágenes se reducen en el móvil antes de
  subirlas y se ven al momento.
- Mensajes de sistema en las transiciones y en los cambios de ficha, y eventos
  `mensaje.nuevo` y `adjunto.nuevo`.
- Inicio de Bambú con «Últims moviments».

## Recorte respecto a la propuesta inicial (decisión de Nando, 31/10)

Las visitas y sesiones se llevan en Wakyma, que no tiene API, y el portal no
debe obligar a apuntar nada dos veces. Por eso este change **ya no incluye**:

- Registro de sesiones de fisioterapia ni la transición automática a
  `en_tratamiento` por la primera sesión: la sustituye el botón «Ja té cita»
  del change `casos-y-derivaciones`.
- La tarea diaria «casos sense notícies» de casos en tratamiento: sin sesiones
  en el portal, un caso en tratamiento sin actividad aquí es lo normal. El
  control útil es el de derivaciones aceptadas sin cita, que ya existe.
- El evento `intervencion.registrada` sale del catálogo.

El nombre del change se mantiene para no romper las referencias del cuaderno.

## Capabilities

### New Capabilities

- `hilo`: hilo por caso, notas internas, mensajes de sistema, adjuntos y
  últimos movimientos.

### Modified Capabilities

- `avisos`: el catálogo pierde `intervencion.registrada`.

## Impact

- Migración `006_hilo.sql` (`mensajes`, `adjuntos`).
- Dependencia `sharp` (miniaturas, en el pool de hilos de libuv, fuera del
  event loop), cargada de forma que si falla el adjunto se guarda sin
  miniatura.
- Volumen `/datos/adjuntos`.
- Rutas `/api/casos/:id/mensajes`, `/api/casos/:id/adjuntos`,
  `/api/adjuntos/:id/{fichero,miniatura}`, `DELETE /api/adjuntos/:id` y
  `/api/panel/movimientos`.

## Supuestos pendientes de confirmar con Bambú

- *(supuesto)* El vídeo no se sube como fichero: se pega un enlace (YouTube no
  listado, Drive).
- *(supuesto)* Un derivador puede retirar un adjunto propio durante 15
  minutos; después, solo Bambú.

## Fuera de alcance

- Informes y notas de voz → `informes-por-voz`.
- Purga física de adjuntos (aplazada en el cuaderno).
- Agenda y sesiones (en Wakyma).
