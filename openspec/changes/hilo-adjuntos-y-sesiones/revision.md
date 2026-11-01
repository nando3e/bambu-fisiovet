# Revisión del change `hilo-adjuntos-y-sesiones`

Revisor: Sol (gpt-5.6-sol, Codex, solo lectura). El código lo escribió Claude Opus. Fecha: 2026-11-01. Ámbito: `git diff 198ebd2..dc21268`.

## Hallazgos

### GRAVE — Retirar un adjunto interno revela su nombre al veterinario

[api/src/rutas/hilo.ts:214](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:214>)

Al retirar un adjunto se crea siempre un mensaje de sistema con la visibilidad predeterminada `todos`:

```ts
await mensajeSistema(bd, a.caso_id, `... «${a.nombre_original}».`);
```

Escenario: Bambú sube `sospecha-maltrato-propietario.pdf` como adjunto interno y después lo retira. El veterinario no puede listar ni descargar el adjunto, pero recibe en el hilo «X ha retirat l’adjunt “sospecha-maltrato-propietario.pdf”».

Importa porque revela tanto la existencia como el nombre —potencialmente clínico— de un adjunto interno. Es una fuga directa de la frontera de privacidad principal.

Arreglo: hacer que `adjuntoVisible` devuelva `m.visibilidad` y pasarla a `mensajeSistema`. Idealmente bloquear esa relación con un único mensaje por adjunto o una restricción equivalente. Añadir un test que suba, retire y vuelva a listar un adjunto interno como veterinario.

### GRAVE — La caché del navegador puede saltarse permisos tras cambiar de usuario

[api/src/rutas/hilo.ts:190](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:190>)

Ficheros y miniaturas se entregan con:

```http
Cache-Control: private, max-age=3600
```

Escenario: en un ordenador compartido, un usuario de la clínica A abre `/api/adjuntos/25/fichero`, cierra sesión y entra uno de la clínica B en el mismo perfil del navegador. Durante una hora, la respuesta puede satisfacerse desde la caché privada del navegador sin volver a consultar la ruta y sus permisos. La URL tampoco contiene identidad o versión de autorización.

Importa porque convierte una respuesta correctamente autorizada en un posible acceso posterior entre sesiones y clínicas.

Arreglo: para datos clínicos usar `Cache-Control: private, no-store` en fichero y miniatura. Si se considera imprescindible cachear, exigir revalidación y separar inequívocamente la caché por sesión, aunque `no-store` es la opción segura.

### MEDIO — Las notas y adjuntos internos alteran actividad visible al veterinario

[api/src/rutas/hilo.ts:82](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:82>), [api/src/rutas/hilo.ts:130](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:130>), [api/src/rutas/casos.ts:532](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/casos.ts:532>), [web/src/pantallas/casos/ListaCasos.tsx:160](</C:/Users/nando/APPS/bambu-fisiovet/web/src/pantallas/casos/ListaCasos.tsx:160>)

Aunque una nota o adjunto sea interno, se actualiza `casos.ultima_actividad`. El veterinario recibe ese valor, lo ve en pantalla y el caso se mueve al principio de su lista.

Escenario: Bambú añade varias notas internas; el veterinario observa que el caso acaba de tener actividad aunque su hilo no tenga nada nuevo. No ve el contenido, pero sí la existencia y momento de actividad interna.

Arreglo: separar `ultima_actividad` pública e interna, o calcular para el derivador la última actividad que realmente pueda ver. Añadir una prueba sobre lista, orden y fecha después de una nota interna.

### MEDIO — Un lote inicialmente interno puede acabar parcialmente público

[web/src/pantallas/casos/Hilo.tsx:106](</C:/Users/nando/APPS/bambu-fisiovet/web/src/pantallas/casos/Hilo.tsx:106>), [web/src/pantallas/casos/Hilo.tsx:115](</C:/Users/nando/APPS/bambu-fisiovet/web/src/pantallas/casos/Hilo.tsx:115>), [web/src/pantallas/casos/Hilo.tsx:214](</C:/Users/nando/APPS/bambu-fisiovet/web/src/pantallas/casos/Hilo.tsx:214>)

Los ficheros múltiples se reducen y suben secuencialmente, pero `interna` se consulta de nuevo para cada subida y la casilla sigue activa.

Escenario: Bambú marca «Nota interna», elige tres radiografías y desmarca la casilla mientras se procesa la primera. Las siguientes pueden guardarse con `visibilidad='todos'`.

Arreglo: capturar `const subidaInterna = bambu && interna` al comenzar `adjuntar()` y usarlo para todo el lote; opcionalmente desactivar la casilla mientras haya subidas. Conviene marcar también las previsualizaciones como internas.

### MEDIO — Hay caminos que dejan ficheros huérfanos fuera de la limpieza

[api/src/rutas/hilo.ts:111](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:111>), [api/src/rutas/hilo.ts:113](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:113>), [api/src/rutas/hilo.ts:153](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:153>)

El `try/catch` de limpieza empieza después de escribir el original y generar la miniatura. Una escritura parcial que falle, o una miniatura que deje un fichero parcial pero devuelva `null`, queda fuera de la limpieza. Como la purga física está aplazada, el huérfano permanece indefinidamente.

Importa porque son datos clínicos en disco que ya no tienen registro, política de retirada ni trazabilidad.

Arreglo: envolver escritura, miniatura y transacción en un único `try/finally`, con una bandera de commit. Registrar y borrar siempre las rutas candidatas, incluida `<base>-min.webp`, aunque `miniatura` siga siendo `null`.

### MEDIO — El test de rollback pasa sin probar ningún rollback relevante

[api/test/hilo.test.ts:83](</C:/Users/nando/APPS/bambu-fisiovet/api/test/hilo.test.ts:83>)

Los dos errores usados en la prueba suceden antes de escribir el estado o el mensaje:

- El motivo vacío se rechaza al validar el cuerpo, antes de abrir la transición.
- El fisio inválido se rechaza antes del `UPDATE` y de `mensajeSistema`.

Por tanto, la prueba seguiría verde aunque los mensajes de sistema se escribieran fuera de la transacción.

Arreglo: provocar un error después de haber escrito el mensaje y la acción dentro de la transacción —por ejemplo mediante una dependencia/fallo inyectado— y comprobar que se revierten tanto el estado como el mensaje. Faltan también regresiones para retirar un adjunto interno y para las cabeceras de caché.

### LEVE — El smoke check de producción no carga realmente `sharp`

[api/comprova-produccio.ts:21](</C:/Users/nando/APPS/bambu-fisiovet/api/comprova-produccio.ts:21>), [api/src/rutas/hilo.ts:32](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:32>)

El build importa `hilo.ts`, pero `sharp` solo se importa cuando se intenta crear una miniatura. Por ello un binario musl roto no rompe la build: producción simplemente registrará el error y dejará todas las imágenes sin miniatura.

El lockfile sí contiene los paquetes `sharp-linuxmusl-*` y el patrón `import('sharp').default ?? módulo` es compatible con ESM/CommonJS, por lo que está razonablemente bien encaminado.

Arreglo: ejecutar durante la build una operación mínima real de `sharp`, preferiblemente en la etapa final Alpine.

### LEVE — `filename*` no codifica todos los caracteres exigidos por RFC 5987

[api/src/rutas/hilo.ts:191](</C:/Users/nando/APPS/bambu-fisiovet/api/src/rutas/hilo.ts:191>), [api/src/ficheros/adjuntos.ts:50](</C:/Users/nando/APPS/bambu-fisiovet/api/src/ficheros/adjuntos.ts:50>)

La inyección CR/LF está impedida: los controles se eliminan y el valor se pasa por `encodeURIComponent`. No veo una inyección de cabeceras explotable.

No obstante, `encodeURIComponent` deja sin codificar, entre otros, el apóstrofo, que no es válido tal cual dentro del valor extendido `filename*`. Algunos navegadores pueden interpretar mal nombres como `l'analítica.pdf`.

Arreglo: usar un codificador RFC 5987 completo o reemplazar adicionalmente `['()*]` por sus secuencias porcentuales.

## Lo revisado que está bien

- El ámbito de caso está aplicado en SQL; otra clínica obtiene 404 en lista, descarga y miniatura.
- Los adjuntos internos se filtran en la lista y en `adjuntoVisible`; el 403 de retirada solo aparece para un adjunto que el veterinario ya puede ver. Fuera de ámbito o interno devuelve 404.
- `nosniff` está presente; SVG y HTML no son tipos admitidos y los formatos Office/ZIP se sirven como descarga.
- El límite local de 12 MB sí sustituye al global de 8 MB en la versión instalada de `@fastify/multipart`; el test de 10 MB cubre esta costura.
- El cliente pone los campos multipart antes del fichero, coherente con la lectura del servidor.
- Los avisos `mensaje.nuevo` y `adjunto.nuevo` usan la matriz de destinatarios esperada; las notas internas no publican eventos.
- `/panel/movimientos` está limitado a roles Bambú y, al basarse en eventos, no incluye notas internas.
- Las transiciones, cambios de ficha y sus mensajes de sistema se invocan con el cliente de su transacción.
- La asignación de fisio visible al veterinario coincide con la especificación; no encontré un motivo adicional marcado como interno que se exponga por estas llamadas.
- La subida optimista retira la previsualización al fallar, revoca los `objectURL` y las cadenas visibles nuevas pasan por `va.ts`.
- No se sirven adjuntos desde la carpeta estática.

No he modificado nada ni ejecutado pruebas; he tomado como dato los 158 tests verdes indicados.

---

## Resolución (sesión principal, Opus, 2026-11-01)

Los ocho hallazgos se comprobaron contra el código y eran ciertos. Todos
corregidos; los del API con su test y verificados por mutación (4 en rojo).
API: 162 tests en verde.

| Hallazgo | Arreglo | Test |
|---|---|---|
| GRAVE: retirar un adjunto interno enseñaba su nombre al veterinario | La línea del hilo hereda la visibilidad del adjunto | «retirar un adjunto interno no deja su nombre…» |
| GRAVE: `max-age=3600` en ficheros clínicos | `Cache-Control: private, no-store` en fichero y miniatura | «ficheros y miniaturas sin caché…» |
| MEDIO: la actividad interna movía el caso para el veterinario | Notas, adjuntos y retiradas internos no tocan `ultima_actividad` | «una nota interna no mueve la actividad…» |
| MEDIO: un lote interno podía acabar en parte público | La visibilidad se decide una vez por lote y la casilla se bloquea mientras sube | (web) |
| MEDIO: huecos en la limpieza de ficheros | Escritura, miniatura y transacción en un solo `try/finally`; se borran el original y la miniatura candidata si no se guarda | (cubierto por «ejecutable disfrazado… nada en disco») |
| MEDIO: el test de rollback no probaba un rollback | Test nuevo con un fallo inyectado (trigger) al publicar el evento, después del `UPDATE` y del mensaje de sistema: ni estado ni línea | «si el aviso falla dentro de la transacción…» |
| LEVE: la build no cargaba `sharp` | `comprova-produccio.ts` convierte una imagen con `sharp` en la etapa final de la imagen | build |
| LEVE: `filename*` incompleto | Codificador RFC 5987 (`'()*` también) | «…filename* bien codificado» |
