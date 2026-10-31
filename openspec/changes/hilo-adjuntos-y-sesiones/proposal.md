## Why

Una derivación aceptada necesita conversación: el veterinario sube la
radiografía que faltaba, el fisio pregunta por la medicación, Bambú registra
las sesiones y el veterinario ve que su paciente avanza. Hoy eso se hace por
WhatsApp y correo sueltos, y se pierde. Este change convierte cada caso en una
**línea de tiempo compartida**: hilo, adjuntos, sesiones y eventos del
sistema, con notas internas que solo ve Bambú.

## What Changes

- Hilo por caso con mensajes de texto, adjuntos, eventos del sistema (y, en el
  change siguiente, informes), en orden cronológico.
- Notas internas de Bambú dentro del mismo hilo, invisibles para el derivador.
- Adjuntos de hasta 12 MB (PDF, imágenes, ZIP, DOC/DOCX, XLSX) validados por
  su contenido real y no por la extensión, con nombre aleatorio, huella
  SHA-256 y miniatura para las imágenes. Siempre se sirven por una ruta con
  permisos, nunca como estáticos. Las imágenes se reducen en el móvil antes de
  subirlas y se ven al momento.
- Sesiones de fisioterapia (valoración, sesión, revisión) con notas internas y
  una línea opcional para el veterinario. La primera pasa el caso a
  `en_tratamiento`.
- Eventos `mensaje.nuevo`, `adjunto.nuevo`, `intervencion.registrada` y
  `caso.en_tratamiento`, y mensajes de sistema en las transiciones y en los
  cambios de ficha.
- Tarea diaria «casos sense notícies»: evento por caso y un solo correo
  resumen.
- Inicio de Bambú con «Últims moviments» y el contador de casos sin noticias.

## Capabilities

### New Capabilities

- `hilo`: hilo por caso, notas internas, adjuntos, sesiones de fisioterapia y
  aviso de casos sin noticias.

### Modified Capabilities

_Ninguna._

## Impact

- Migración `006_hilo.sql` (`mensajes`, `adjuntos`, `intervenciones`,
  `casos.ultima_actividad`).
- Dependencia `sharp` (miniaturas, fuera del event loop).
- Volumen `/datos/adjuntos`.
- Rutas `/api/casos/:id/mensajes`, `/api/casos/:id/adjuntos`,
  `/api/adjuntos/:id/{fichero,miniatura}` e `/api/casos/:id/intervenciones`.
- Plantillas `actividad-caso` y `sin-noticias`.

## Supuestos pendientes de confirmar con Bambú

- *(supuesto)* Tras cuántos días sin actividad un caso en tratamiento se
  considera «sin noticias» (7 por defecto, configurable).
- *(supuesto)* El vídeo no se sube como fichero: se pega un enlace (YouTube no
  listado, Drive).
- *(supuesto)* Un derivador puede retirar un adjunto propio durante 15
  minutos; después, solo Bambú.

## Fuera de alcance

- Informes y notas de voz → `informes-por-voz`.
- Purga física de adjuntos (aplazada en el cuaderno).
