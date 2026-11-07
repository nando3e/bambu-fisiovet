# Proposal — `derivacion-breve-y-documentos`

## Petición original

> necestio aplicar algunos cambios: en el momento de nueva derivación por parte
> de un veterinario, no quiero tantos campos. solo el de derivación y
> trtamiento. lo demás no. y tambien deben poder adjuntar archivos en ese
> momento. ojo a las imagenes y el peso y la carga de la app.r ecuerda lo que
> nos pasó con las imagenes en happydog. además, para cargar, podran hacerlo
> por separado en Radiografías, Informe, Analiticas. Revisa tambien que en la
> vista bambu el hilo chat se ve bien, pero en la vista clinica veterianria que
> deriva, las burbujas salen al contrario de como deberían ser: se copia como
> el de bambu, cuando ala derecha debería salir lo que escribe el veterinario

(Nando, 2026-11-07)

## Por qué

- El paso «motiu clínic» de la nova derivació pide cinco textos (motiu,
  història clínica, tractament actual, objectius, altres notes). Para un
  veterinario con prisa es demasiado: con el motivo y el tratamiento actual
  Bambú ya sabe qué le llega; el resto va en el hilo o en los documentos.
- Hoy **no se puede adjuntar nada hasta haber enviado** la derivación (409
  «Envia la derivació abans d'adjuntar fitxers»). Lo normal es que el
  veterinario tenga las radiografías y las analíticas delante en el momento
  de derivar, no después.
- Los adjuntos viven solo en el hilo, sin tipo: para encontrar una analítica
  hay que leer la conversación entera.
- El hilo pinta siempre al veterinario a la izquierda y a Bambú a la derecha,
  para los dos. En la zona del veterinario se ve al revés de un chat: lo que
  escribe él sale a la izquierda.

## Qué cambia

### 1. Nova derivació con dos campos

- Paso 2 del formulario: solo «Motiu de la derivació» (obligatorio, como
  ahora) y «Tractament actual». Fuera del formulario y de la edición
  história clínica, objectius y altres notes.
- Las columnas `historia_clinica`, `objetivos` y `notas_derivador` **se
  quedan en la base** (sin borrado duro): el API deja de aceptarlas en
  `POST/PATCH /api/casos` y la ficha solo las enseña si tienen contenido
  (casos antiguos).

### 2. Documentos de la derivación, por categoría

- Tres zonas de carga en el paso 2: **Radiografies**, **Informes** y
  **Analítiques**, cada una con su botón y su lista de ficheros con
  miniatura. Se puede adjuntar **desde el borrador**: los ficheros van
  subiendo mientras el veterinario sigue escribiendo, y el «Envia» espera a
  que terminen.
- `adjuntos.categoria` (`radiografia` | `informe` | `analitica` | NULL para
  los del hilo). Cada adjunto sigue siendo también un mensaje del hilo (misma
  cronología, mismo ámbito, mismo «retirar»); mientras el caso es borrador no
  publica `adjunto.nuevo` ni toca la actividad: el aviso de
  «derivació enviada» ya lo cubre.
- Aclaración de Nando (2026-11-07): la categoría **Informes** son documentos
  que cuelga el veterinario o Bambú (informes previos, de otro centro); nada
  que ver con la pestaña «Informes» de generar informes por voz, que sigue
  desactivada.
- Bloque **«Documents»** en la pestaña Fitxa, con los adjuntos agrupados por
  categoría (y «Altres» para los del hilo), miniaturas y botón de añadir por
  categoría. Ahí pueden seguir subiendo después de enviar: el veterinario de
  la clínica y Bambú, con el aviso `adjunto.nuevo` de siempre.
- Los avisos: el correo de «nova derivació» a Bambú dice cuántos documentos
  trae.

### 3. Imágenes sin cargar la app (lección de happydog)

Lo que ya hace el hilo se extrae a un módulo común y lo usan las dos
pantallas:

- **Reducir en el navegador antes de subir** (canvas, 1600 px, JPEG): la
  espera era la subida del original de 4-6 MB por el móvil, no el servidor.
  Si no puede, sube el original.
- **Una subida cada vez**, en fila, con vista previa local atenuada; la vista
  previa se libera (`revokeObjectURL`) al terminar.
- Servidor: miniatura WebP de 480 px con `sharp` **fuera del event loop**; el
  grande solo se descarga al tocar (pestaña nueva). Las listas y el bloque de
  documentos piden siempre la miniatura con `loading="lazy"`.
- Nada nuevo en el bundle: ni visor de imágenes ni pdf.js. Límite de 12 MB
  por fichero igual que ahora.
- Se mantiene `Cache-Control: private, no-store` (datos clínicos, RGPD):
  cada miniatura son ~20-40 KB, asumible.

### 4. Hilo como chat de verdad

- Lo propio a la derecha, lo del otro a la izquierda, **según quién mira**:
  en `/d` el veterinario a la derecha; en `/b` Bambú a la derecha. Sistema en
  el centro y notas internas con su color, como ahora. Clases `propio` /
  `ajeno` en lugar de `de-bambu` / `de-veterinario`.

## Fuera (apuntado, no se hace)

- DICOM u otros formatos médicos: siguen fuera; una radiografía entra como
  JPEG/PNG/PDF.
- Visor de imágenes dentro de la app (zoom, comparar): se abren en pestaña.
- Cambiar la categoría de un adjunto ya subido: se retira y se vuelve a subir.
- Caché de miniaturas en el navegador (`max-age`): decisión RGPD aparte.

## Specs afectadas

- `casos`: MODIFIED «Nueva derivación con borrador autoguardado» (dos
  campos, documentos desde el borrador); MODIFIED «Quién edita qué» (los
  campos retirados); ADDED «Documentos del caso por categoría».
- `hilo`: MODIFIED «Adjuntos validados y protegidos» (categoría, borrador);
  MODIFIED «Hilo por caso» (lado según quién mira).

## Docs

`docs/guia-del-portal.md` (flujo de nova derivació y documentos),
`docs/rgpd.md` (los documentos son adjuntos con categoría: nada nuevo viaja
a la IA), cuaderno D21 y supuestos.
