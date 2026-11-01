## Context

El change 2 dejó los casos con su ámbito (`dominio/visibilidad.ts`), sus
transiciones con `SELECT … FOR UPDATE` en `rutas/casos.ts` y los avisos por
`avisarCaso`. El catálogo ya tiene `mensaje.nuevo` y `adjunto.nuevo` con
anti-ruido (un solo correo hasta que se lea). Las visitas se llevan en Wakyma
(ver la propuesta): aquí solo hay conversación, ficheros y rastro.

Nando está fuera durante la construcción y pidió decidir por lo recomendado
sin preguntar; las decisiones de abajo son esas y se anotan como tales.

## Goals / Non-Goals

**Goals:** hilo con notas internas, mensajes de sistema en la misma
transacción que la acción, adjuntos protegidos con miniatura, subida desde el
móvil con vista previa inmediata, «Últims moviments».

**Non-Goals:** sesiones, agenda, «casos sense notícies» (recortado), informes
(change 4), purga física de ficheros (aplazada).

## Decisions

### D1. Migración `006_hilo.sql`

```
mensajes  id, caso_id → casos, autor_id → usuarios NULL (NULL = sistema),
          tipo CHECK (texto|adjunto|informe|sistema), visibilidad CHECK (todos|bambu),
          cuerpo text, adjunto_id NULL, informe_id NULL (la FK llega con el 007), creado
adjuntos  id, caso_id, subido_por, nombre_original, mime, bytes, ruta (hex aleatorio + extensión),
          miniatura_ruta NULL, sha256, eliminado_el NULL, eliminado_por NULL, creado
```

Índice `mensajes (caso_id, creado)`. El CHECK de `eventos.tipo` se redefine
sin `intervencion.registrada` y se borra su fila de `configuracion_avisos`
(es configuración, no un dato clínico; nunca se publicó ningún evento de ese
tipo).

### D2. Mensajes de sistema

`servicios/hilo.ts` → `mensajeSistema(bd, casoId, texto, visibilidad = 'todos')`,
llamado desde cada transición y edición de ficha dentro de su transacción. Los
textos se componen en el servidor en valenciano (son contenido guardado, no
interfaz) a partir de una tabla de etiquetas de campo
(`pes`, `telèfon del propietari`…), con los valores antes → después.

### D3. Hilo

- `GET /casos/:id/mensajes`: ámbito del caso; un derivador solo recibe
  `visibilidad = 'todos'` (en la SQL). Cada mensaje trae autor, tipo y, si es
  adjunto, su id, nombre, mime, bytes, si tiene miniatura y si está retirado.
- `POST /casos/:id/mensajes` `{ cuerpo, interna? }`: 409 en borrador; un
  derivador nunca crea internas (el servidor fuerza `todos`). Un mensaje
  visible publica `mensaje.nuevo`; una nota interna no publica nada.

### D4. Adjuntos

- `POST /casos/:id/adjuntos` (multipart: `fichero`, `interna` opcional):
  límite 12 MB por llamada (`peticion.file({ limits })`; truncado → 413).
  Tipo por contenido en `ficheros/adjuntos.ts` (puro): `%PDF`, JPEG, PNG,
  WEBP, OLE (`D0 CF 11 E0`, DOC) y ZIP (`PK\x03\x04`), que solo se acepta con
  extensión `.zip`, `.docx` o `.xlsx` (todos son ZIP por dentro). El MIME que
  se guarda sale del tipo detectado, nunca del navegador.
- Se escribe en `/datos/adjuntos/<32 hex>.<ext>` con SHA-256; si es imagen,
  miniatura de 480 px en WEBP con `sharp` (trabaja en el pool de libuv). `sharp`
  se importa dinámicamente: si no carga, el adjunto se guarda sin miniatura y
  se registra en el log.
- El fichero se escribe antes de la transacción; si la transacción falla, se
  borra el fichero escrito (no es un dato clínico todavía).
- `GET /adjuntos/:id/fichero` y `/miniatura`: sesión + ámbito del caso + (si
  es derivador) mensaje visible + no retirado; si no, 404. `Content-Type` del
  detectado, `X-Content-Type-Options: nosniff`, `Cache-Control: private`,
  `Content-Disposition` inline para imágenes y PDF, attachment para el resto,
  con el nombre original saneado.
- `DELETE /adjuntos/:id`: Bambú siempre; el derivador autor durante 15
  minutos (después 403). Marca `eliminado_el` y deja «Adjunt retirat» en el
  hilo. No borra el fichero.

### D5. Web

- Ficha con pestañas `Fil · Fitxa` (Fil por defecto en casos no borrador).
- `pantallas/casos/Hilo.tsx`: lista de mensajes (autor, hora, nota interna
  marcada, sistema en gris, adjuntos con miniatura o icono y enlace),
  compositor con área de texto, clip y, para Bambú, «Nota interna».
- Imágenes: se reducen en el navegador a 1600 px (JPEG 0,85) con un canvas si
  pesan más de 1,5 MB; si falla, se sube el original. Vista previa al momento
  (`URL.createObjectURL`), atenuada mientras sube; si falla, se retira con
  aviso.
- Inicio de Bambú: «Últims moviments» con `GET /panel/movimientos` (los 15
  últimos eventos con caso, paciente, actor y hora).

## Risks / Trade-offs

- [`sharp` en Alpine] → binario musl en el lockfile; si no carga, sin
  miniatura pero sin caída. Se comprueba tras desplegar.
- [Ficheros en disco sin borrado] → `/datos` crece; purga física aplazada.
- [ZIP que dice ser DOCX] → se acepta por extensión dentro de la familia ZIP;
  no se ejecuta nada en el servidor y se sirve como descarga.

## Migration Plan

Migración 006 al arrancar, redespliegue con `desplegar-dokploy`, prueba en
producción de mensaje y adjunto con el superadmin.

## Open Questions

Ninguna bloqueante; los supuestos de la propuesta siguen pendientes de Bambú.
