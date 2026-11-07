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

## Revisor (Opus, 07/11)

1 grave, 7 medios, 7 leves. Corregido: el borrador retomado mandaba la ficha
entera y el contrato estricto lo rechazaba (ahora solo los tres campos
retirados con contenido dan 400, y la web manda los dos campos); subida a un
caso descartado (404, sin fichero); retirar en borrador sin plazo; «Envia» se
para si alguna subida falló; la ruta nueva en `roles.test.ts`; el API
devuelve 409 al derivador en un caso cerrado; `GET` en bucle de Documentos;
el correo encolado se comprueba; lectura entera antes de rechazar por
categoría.

### Revisor — descartado

- Test del lado de las burbujas: la web no tiene batería y el cálculo es una
  comparación de dos booleanos; probado a mano en /d y /b.
- Desglose por tipo en el correo de «Nova derivació»: se ajustó la propuesta
  (solo el número); el desglose se ve en la ficha.
- Calidad de las radiografías reducidas (1600 px JPEG): supuesto S9 del
  cuaderno, a confirmar con Nando.

## 4. Cierre

- [x] 4.1 Skill `cerrar-change`: batería, revisor en Opus (dos pasadas), archivar.
