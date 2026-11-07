# Design — `derivacion-breve-y-documentos`

## Los documentos son adjuntos del hilo con categoría

Decisión: un documento (radiografía, informe, analítica) **es un adjunto
normal** con `adjuntos.categoria`, y sigue creando su mensaje de tipo
`adjunto` en el hilo. No hay tabla nueva ni segunda ruta de descarga.

Por qué:
- El ámbito, el «retirar», la miniatura, el sha y la ruta protegida ya están
  hechos y probados sobre `mensajes JOIN adjuntos`. Una tabla aparte los
  duplicaría.
- El hilo es la cronología del caso: que las radiografías aparezcan en él
  cuando se subieron es información, no ruido.
- El bloque «Documents» de la ficha es solo otra **vista** de los mismos
  adjuntos (`GET /casos/:id/adjuntos`, agrupados por categoría, sin los
  retirados).

Consecuencias:
- En borrador el mensaje se crea igual, pero **sin** `adjunto.nuevo` ni
  `tocarActividad`: el correo de «Nova derivació» ya avisa, y dice cuántos
  documentos trae.
- Los del hilo (clip del compositor) llevan `categoria = NULL` y la ficha los
  enseña como «Altres».
- Un documento no cambia de categoría: se retira y se vuelve a subir.

## Un solo motor de imágenes en la web

`reducir()` sale de `Hilo.tsx` a `web/src/imagenes.ts` y lo usan el hilo y
las zonas de documentos. Subidas en fila (una cada vez) desde un hook
`useSubidas` compartido: vista previa local atenuada, `revokeObjectURL` al
terminar, error por fichero sin cortar la cola.

## Lado de las burbujas

«Propio» = el mensaje es de la misma población que quien mira (Bambú o
derivador). Se calcula en el componente con la sesión; el API no cambia.
Las clases pasan a `propio` / `ajeno` y el color sigue distinguiendo a Bambú
(verde) de la clínica (blanco): el lado dice quién soy, el color quién
escribe.
