# Revisión del change `fundamentos-acceso-y-avisos`

Revisor: agente `revisor` (Claude Fable 5.1; el código lo escribió Opus).
Ámbito: `git diff 06dfabb..HEAD` sin `package-lock.json`, imágenes ni
`web/public`. Fecha: 2026-10-31.

Leído entero: todo `api/src`, `api/test`, `api/migrations`, `api/plantillas`,
`Dockerfile`, los dos compose, `.env.example`, `web/src` (App, api, sesion,
componentes, pantallas, i18n/index, vite.config, scripts/rutas-api), y en
openspec la proposal, el design, las cuatro specs y tasks.

## Qué ejecuté

| Comando | Resultado |
|---|---|
| `docker compose -f docker-compose.local.yml up -d` | Postgres local ya levantado (healthy) |
| `cd api && npm test` | **81/81 en verde** (9,4 s) |
| `cd api && npm run typecheck` | OK |
| `cd api && npm run comprova-produccio` | OK: 32 módulos cargan con `--experimental-strip-types` |
| `cd web && npm run comprueba` | OK: emojis, variables CSS, contraste, rutas absolutas, 53 llamadas → 43 rutas del API, campos 16 px |
| Sondeo propio (`tsx`, BD `bambu_revision_*_test`, sin tocar el repo) | Ver hallazgos 1, 2, 3 y 6: cuatro sospechas de lectura confirmadas |

No hay ningún hallazgo GRAVE con la configuración por defecto. Hay dos
MEDIOS que pasan a graves según cómo se configure producción (1 y 3), y un
MEDIO de diseño (2) que no muerde en este change pero sí en el siguiente.

---

## Hallazgos

### MEDIO

**[MEDIO] api/src/rutas/auth.ts:89-132 y api/src/superadmin.ts:16-24 — un alta
anónima con el correo que sea `SUPERADMIN_USUARIO` deja la app sin poder
arrancar.**
- Escenario: `SUPERADMIN_USUARIO=nando@rbimprove.com` (el `.env.example` lo
  deja en blanco y nada impide poner un correo). Cualquiera, sin cuenta ni
  verificación, hace `POST /api/auth/registro` con ese correo → 200. En el
  siguiente despliegue `aplicarSuperadmin` lanza «coincide con el correo de un
  usuario» y el contenedor no arranca hasta tocar la base a mano. Confirmado
  con el sondeo: alta 200 → reinicio FALLA.
- Con el valor por defecto (`superadmin`) no pasa porque zod exige un correo
  válido en el alta; por eso no es GRAVE hoy.
- Arreglo: rechazar en `registro`, `POST /usuarios` y
  `POST /clinicas/mia/invitaciones` cualquier correo que `esUsuarioSuperadmin`
  (respuesta idéntica a la genérica, sin revelar nada), **y** que el arranque
  avise en el log pero no muera (el login ya prioriza al superadmin, así que no
  hay ambigüedad real). Test: alta con ese correo → no se crea fila; reinicio
  con una fila ya existente → arranca y loguea.

**[MEDIO] api/src/rutas/clinicas.ts:29-48 y api/src/servicios/clinicas.ts:120-158
— cualquier alta sin verificar crea una clínica visible en las sugerencias, y
cualquier miembro de la clínica destino aprueba uniones.**
- Escenario 1 (confirmado con el sondeo): `POST /auth/registro` con
  `clinica.nombre='Clinica Falsa'` y sin abrir nunca el correo → la clínica
  sale en `GET /clinicas/sugerencias?nombre=Clinica Falsa`. Diez altas por
  minuto y dirección bastan para llenar las sugerencias de basura, y de paso
  `dominio_correo` queda fijado por quien llegó primero.
- Escenario 2 (el que importa de cara al change 2): alguien registra «Clínica
  Veterinària Sant Roc» con un correo cualquiera y lo verifica. El veterinario
  real de Sant Roc se da de alta, ve la sugerencia, pide unirse (`pendiente`
  porque el dominio no coincide) y **el ocupa, como único miembro de la clínica
  destino, aprueba**. `fusionarClinica` mueve al vet real a la clínica del
  ocupa, que a partir del change 2 verá todos sus casos. Bambú recibe la
  notificación `usuario.solicita_union`, pero no es un control: el ocupa
  aprueba antes.
- El design D5 decía «solo clínicas activas y no provisionales de otra
  persona»; la columna `provisional` de D2 no existe en la migración y el
  filtro de la consulta es solo `activa`.
- Arreglo mínimo: sugerencias (y destino de `solicitarUnion`) solo entre
  clínicas con al menos un derivador `activo AND verificado_el IS NOT NULL`.
  Arreglo de fondo (anotar en el cuaderno antes del change 2): que la
  aprobación por un compañero solo valga en clínicas que Bambú haya marcado
  como «validada» (o que tengan ya un caso aceptado); hasta entonces, aprueba
  Bambú. Tests: alta sin verificar → no aparece; solicitud a una clínica sin
  miembro verificado → 404.

**[MEDIO] api/src/servidor.ts:49 — `trustProxy: true` deja que el cliente elija
su IP para el freno de intentos.**
- Confirmado con el sondeo: con `LIMITE_INTENTOS=2`, cuatro `POST /auth/entrar`
  con `X-Forwarded-For` distintos → `401,401,401,401`, nunca 429. Con
  `trustProxy: true`, `proxy-addr` coge la primera dirección de la cabecera,
  que es la que manda el cliente.
- En producción solo está protegido si el Traefik de Dokploy sobrescribe la
  cabecera (comportamiento por defecto de Traefik sin `forwardedHeaders`), es
  decir, por una configuración que no está en este repo.
- Arreglo: `trustProxy: 1` (un salto: Traefik) para que se use la dirección
  que Traefik añade, no la que llega. Test: el de arriba con
  `X-Forwarded-For: 1.2.3.4, 5.6.7.8` repetido debe dar 429 al tercero.

**[MEDIO] api/src/rutas/configuracion.ts:136-156 — el correo de prueba se envía
en la petición, salta `CORREO_DRY_RUN` y no deja traza.**
- Contradice dos reglas escritas: principio 2 de `CLAUDE.md` («el correo
  siempre se encola, nunca se envía en la petición») y la spec de avisos
  («`CORREO_DRY_RUN=true` → ningún correo sale aunque el panel lo diga; el
  entorno manda sobre el panel»). El comentario de la línea 145 lo reconoce
  como decisión, pero no está en la spec de configuración ni en el cuaderno.
- Escenario: en local (`CORREO_DRY_RUN=true` siempre) el superadmin con una
  base clonada de producción pulsa «Envia un correu de prova» y sale un correo
  real desde el buzón de Dondominio. Además no queda fila en `avisos_enviados`,
  así que la traza «cada intento deja una fila» tiene un hueco.
- Arreglo: o se respeta el dry-run con un mensaje claro en la pantalla («en
  mode de proves no s'envia res»), o se escribe la excepción en la spec de
  configuración y en el cuaderno (§5/§12) y se añade `trazarAviso` con
  `plantilla='prueba'` y motivo. Lo que no vale es que la excepción viva solo
  en un comentario.

**[MEDIO] api/test — rutas nuevas sin test de rol (regla: «toda ruta nueva
lleva su test de ámbito y de rol»).**
- Sin ninguna petición con el rol equivocado: `PATCH /clinicas/mia`,
  `GET /clinicas/:id/usuarios`, `PATCH /clinicas/:id`,
  `POST /clinicas/mia/invitaciones` (bambu → 403), `POST /usuarios`,
  `PATCH /usuarios/:id` y `POST /usuarios/:id/reenvia-invitacion`
  (derivador → 403), `PUT /configuracion/avisos/:evento`,
  `GET /configuracion/avisos/cola`, `POST …/cola/:id/reintenta`,
  `PUT /configuracion/:clave` (derivador), `POST /configuracion/correo/prueba`
  (bambu → 403), `POST /configuracion/imagenes/:hueco/restaura`.
- Sin test de ámbito: `GET /solicitudes-union` (el filtro
  `s.clinica_destino_id = $1` para derivador no se ejercita; si alguien quita
  ese `AND`, un derivador ve las solicitudes de todas las clínicas y ningún
  test se pone rojo).
- Todas usan `exigirSesion(..., ROLES)` y a ojo están bien, pero el hábito de
  la casa es que un test lo diga. Arreglo barato: un test tabular en
  `acceso.test.ts` que recorra `[método, ruta, rolQueNoPuede]` y espere 401
  sin cookie y 403 con el rol equivocado; más uno de ámbito para
  `GET /solicitudes-union` con dos clínicas.

**[MEDIO] api/test/arranque.test.ts:69-83 — el test «no puede recuperar … desde
la app» pasa siempre y no prueba el escenario de la spec.**
- La spec dice «WHEN se pide recuperar con el usuario del superadmin THEN la
  respuesta es la genérica y no se encola nada». El test manda
  `superadmin@x.es`, que no es el usuario del superadmin ni existe; pasa
  igual aunque se quitara `AND NOT es_de_entorno` de la consulta. Con el
  identificador real (`superadmin`) el API responde **400** «Correu no vàlid»
  (confirmado en el sondeo), no la respuesta genérica.
- Arreglo: decidir qué quiere la spec (400 también es «no revela nada», pero
  entonces escribirlo así) y hacer que el test use `SUPERADMIN_USUARIO`
  configurado como correo y compruebe que no se encola nada. Verificar que el
  test se pone rojo quitando `NOT es_de_entorno`.

### LEVE

**[LEVE] api/src/avisos/cola.ts:133-166 — traza y estado se escriben después
del envío (catálogo §14, «orden de efectos»).**
- Si el proceso muere entre el `sendMail` aceptado y el `UPDATE`, el correo
  vuelve a salir a los 10 minutos (duplicado). La fila `en_curso` sobrevive,
  así que el caso sí se puede investigar; es at-least-once, aceptable para
  avisos. Lo anoto para que conste como decisión y no como descuido.
- `detener()` solo limpia el temporizador: `app.close()` cierra el pool con un
  lote en vuelo y ese lote se queda `en_curso` 10 min. Sugerencia: `detener()`
  devuelve `ocupada ?? Promise.resolve()` y `onClose` lo espera.

**[LEVE] api/src/auth/permisos.ts:13 y api/src/configuracion.ts:68 — funciones
exportadas que nadie llama (`esBambu`, `esClaveConfig`).**
- Catálogo §14 fallo nº 1. Borrarlas o usarlas; la web tiene su propio
  `esBambu` en `sesion.tsx`.

**[LEVE] web — literales fuera de `va.ts`.**
- `web/src/api.ts:31,38,59` (tres mensajes de error en valenciano),
  `componentes/Esqueleto.tsx:23` (`aria-label="Menú"`), `App.tsx:47`,
  `Acceso.tsx:21`, `Enlaces.tsx:16`, `comunes.tsx:9` (`alt`/`aria-label`
  «BAMBÚ Fisiovet»), `Bambu.tsx:65` (`antetitulo="BAMBÚ Fisiovet"`),
  `Landing.tsx:231,254` («Instagram»). La marca puede justificarse; los
  mensajes de `api.ts` y el `aria-label` no. `api.ts` no puede importar `t()`
  si se quiere mantener sin dependencias, pero sí puede recibir los textos.

**[LEVE] api/src/rutas/clinicas.ts:37 — `mismo_dominio` llega como `null`
cuando no se pasa `email`; la web lo tipa `boolean` y además no lo usa.**
- `(dominio_correo IS NOT NULL AND dominio_correo = NULL)` es NULL. Poner
  `coalesce(..., false)` o quitar el campo.

**[LEVE] api/src/rutas/clinicas.ts:183-215 — invitar a un compañero: sin
`historial`, sin freno y con 409 que enumera cuentas.**
- `POST /usuarios` sí deja historial; esta ruta crea una fila de `usuarios`
  y no. Un derivador puede, sin límite, comprobar con el 409 «Aquest correu ja
  té compte» si cualquier correo (de otra clínica o de Bambú) tiene cuenta, y
  crear usuarios invitados a discreción. Sugerencia: `registrarCambio`,
  `frenoIntentos` moderado y respuesta genérica cuando el correo ya existe.

**[LEVE] api/src/rutas/auth.ts:97-107 — alta repetida sobre una cuenta aún sin
verificar pierde `union_clinica_id` y usa un token de una hora.**
- El dueño recibe `alta-existente` con un token `recuperacion` (1 h); al
  consumirlo queda verificado, pero la clínica a la que quería unirse (guardada
  en el token de verificación) se pierde. Con un correo de verificación perdido
  es un caso real. Sugerencia: si `verificado_el IS NULL`, reemitir
  `verificacion` conservando `datos` en lugar de `recuperacion`.

**[LEVE] api/src/servicios/clinicas.ts:25-44 — aprobar mueve a todos los de la
clínica de origen, no solo al solicitante.**
- `decidirUnion` bloquea pedir si ya hay compañeros, pero entre pedir y
  aprobar el solicitante puede invitar a compañeros a su provisional; al
  aprobar se mueven todos. Es coherente con «mover todo lo suyo», pero
  conviene decirlo en la spec o volver a comprobar los miembros en
  `resolverSolicitud`.

**[LEVE] api/src/rutas/configuracion.ts:76-85 — la cola del panel solo enseña
24 h: un `fallido` de anteayer no se ve ni se puede reintentar.**
- Es lo que dice la spec, pero el sexto intento llega a las ~14,6 h del
  primero; un correo encolado a las 20:00 que falla hasta la mañana siguiente
  desaparece del panel a las 20:00 del día siguiente. Sugerencia: los
  `fallido` sin límite de fecha, los demás 24 h.

**[LEVE] api/src/rutas/configuracion.ts:159-177 — la foto se escribe en disco
antes de la transacción y las anteriores no se retiran nunca.**
- Si falla `guardarConfiguracion`, queda un fichero huérfano servible por
  `/api/publico/imagenes/`. Sin borrado duro vale, pero el volumen crece con
  cada subida. Anotar en aplazados junto a la purga de adjuntos.

**[LEVE] api/src/rutas/clinicas.ts:21 — `datosClinica.email` no se valida como
correo (`PATCH /clinicas/mia` y `PATCH /clinicas/:id`).**

**[LEVE] api/src/rutas/auth.ts:352 — `PATCH /auth/perfil` con `telefono: ''`
guarda la cadena vacía, no `NULL` (el alta guarda `NULL`).**

**[LEVE] openspec/changes/fundamentos-acceso-y-avisos/design.md — deriva
respecto al código.**
- D1 nombra `db/repos/*.ts` y `avisos/canales/correo.ts` (no existen: el canal
  vive en `correo/transporte.ts`); D2 nombra `clinicas.provisional` (no está);
  D9 habla de `docker-compose.dokploy.yml` (es `docker-compose.yml`). No es
  un fallo de código, pero el design es lo que leerá quien haga el change 2.

---

## Lo que está bien y comprobé a propósito

- **Principio 2**: `publicarEvento` recibe el cliente de la transacción; el
  test de rollback existe y es real. La cola corre al arrancar (`despertar()`
  en `crearCola`), `SKIP LOCKED` probado con dos colas, reintentos 1/5/30/120/720
  y `en_curso` caducado probados. Los correos de cuenta no pasan por la matriz
  y hay test. `CORREO_DRY_RUN` nace en `true` y manda sobre el panel en la
  cola (la excepción es solo el botón de prueba, hallazgo arriba).
- **Auth**: tokens solo como SHA-256, consumo atómico con test de carrera,
  reenviar invalida el anterior, contraseña corta deja el token sin usar
  (rollback), recuperación revoca sesiones, cambio de contraseña conserva la
  actual, sesión en BD con `u.activo` en cada petición, superadmin comparado
  con `timingSafeEqual` sobre SHA-256, hash ficticio para el usuario
  inexistente, 401 idéntico en los cuatro casos.
- **SMTP del panel**: cifrado AES-256-GCM con IV por cifrado, el test busca
  `contrasena_cifrada` y `v1:` en la respuesta y en el historial y no los
  encuentra, contraseña vacía conserva la anterior, el canal relee la
  configuración en cada envío (test con dos puertos).
- **Trampa de producción**: `erasableSyntaxOnly: true` en tsconfig más
  `comprova-produccio` en el Dockerfile; `satisfies`/`as const` en el catálogo
  son borrables.
- **Fechas**: `pg.types.setTypeParser(1082, v => v)`; no hay `toISOString()`
  sobre `date` en el API.
- **Semillas que no pisan**: `ON CONFLICT DO NOTHING` en configuración y
  matriz, con test de reinicio.
- **Estáticos**: `/datos` no se sirve; las fotos solo por ruta con regex de
  nombre; un `.js` inexistente es 404 y no el index (test).
- **Compose**: Postgres solo en `bambu-internal`, host `bambu-postgres`,
  `COOKIE_SEGURA=true`, `CORREO_DRY_RUN` por defecto `true`.

## Lo que no pude verificar

- Si el Traefik de Dokploy sobrescribe `X-Forwarded-For` (hallazgo 3): no
  está en el repo.
- El despliegue real en `bambu-fisiovet.91-99-128-20.sslip.io` (7.4) ni el
  recorrido con `curl -c` (7.3): no los repetí.
- Principio 1 sobre `dominio/visibilidad.ts`: el fichero no existe todavía
  porque en este change no hay datos clínicos; el ámbito de clínica va en SQL
  inline con `sesion.clinicaId` (`/clinicas/mia`, `/solicitudes-union`,
  `resolverSolicitud` → 404). Vale para hoy; el change 2 debe crearlo y
  pasar esas consultas por él.
- Valenciano de textos y correos: no soy hablante nativo; queda la revisión
  prevista en los supuestos de la proposal.

## Veredicto

Cerrable tras corregir los seis MEDIOS (o justificar por escrito el del correo
de prueba y el de rutas sin test); el nº 2 hay que decidirlo antes de que
existan casos. Los tests son de verdad, el módulo de avisos es el más sólido
del change, y la deuda es sobre todo de bordes de registro y de tests de rol
que faltan.

---

## Nota sobre el árbol de trabajo (añadida al cerrar)

El encargo era `06dfabb..HEAD` (`212c3d0`) y a eso corresponden los números
de línea de arriba (comprobado contra `git diff`). Mientras revisaba, otra
sesión dejó **cambios sin commit** en `api/src/{avisos/cola,configuracion,
db/migraciones,rutas/auth,rutas/clinicas,rutas/usuarios,servicios/clinicas,
servidor}.ts`. No los he revisado como tales, pero por el diff:

- Ya atacan: hallazgo 1 (rechazo de `esUsuarioSuperadmin` en registro,
  `POST /usuarios` e invitaciones; **falta** que el arranque no muera si la
  fila ya existe), hallazgo 2 en su arreglo mínimo (sugerencias con
  `EXISTS … verificado_el IS NOT NULL`; **falta** la decisión de fondo sobre
  quién aprueba en clínicas no validadas), hallazgo 3 (`trustProxy` por salto,
  correcto: `salto < 1` confía solo en Traefik), los LEVES de `datosClinica.email`,
  `esClaveConfig` y la recomprobación de miembros al aprobar.
- Traen cosas que no salen de esta revisión (cerrojo `pg_advisory_lock` en
  migraciones, `en_curso` caducado cuenta como intento, privacidad en la
  invitación, `catch 23505` en el alta). Necesitan su propio test cada una.
- **Aviso**: el cambio en `reenvia-verificacion` (devolver 200 en vez de 429 al
  cuarto reenvío) contradice la spec de `acceso` («Cuarto reenvío en una hora →
  429 y no se encola nada») y el test `acceso.test.ts:132-143` que espera 429.
  O se cambia la spec y el test, o se vuelve al 429.

Siguen abiertos sin tocar: 4 (correo de prueba y dry-run), 5 (tests de rol y
ámbito), 6 (test del superadmin que pasa siempre) y el resto de LEVES.

---

## Resolución (sesión principal, Opus, 2026-10-31)

Hubo dos pasadas del revisor con Fable sobre el mismo diff: la que se lanzó
antes del corte de sesión (llegó tarde, sin fichero) y la de este informe.
Coinciden en lo importante; abajo van las dos juntas. Cada arreglo lleva su
test y se comprobó quitándolo y viendo el test en rojo (22 mutaciones, todas
en rojo, más la del freno de invitaciones). API: 100 tests en verde; web:
build con las seis comprobaciones.

### Corregido

| Hallazgo | Arreglo | Test |
|---|---|---|
| Alta con el correo que es `SUPERADMIN_USUARIO` tumba el arranque | Registro devuelve la respuesta genérica sin crear nada; invitar al equipo → 409; invitar a la clínica → respuesta genérica sin crear nada | `acceso`: «alta con el usuario del superadmin…» (incluye rearrancar sobre la misma base) |
| `trustProxy: true` deja saltar el freno con `X-Forwarded-For` | Un solo salto de confianza (Traefik): vale la dirección que añade Traefik, no la que inventa el cliente | `acceso`: «cambiar X-Forwarded-For…» |
| El 429 del cuarto reenvío enumera cuentas pendientes | Pasado el freno, la respuesta es la de siempre y no se encola nada. **Se modifica la spec de `acceso`** (escenario «Cuarto reenvío en una hora») | `acceso`: «reenviar la verificación…» |
| Sugerencias ofrecen la clínica de un alta sin verificar; `mismo_dominio` podía ser `null` | Solo clínicas con algún usuario activo y verificado; `coalesce(…, false)` | `clinicas`: «sugerencias: la clínica de un alta sin verificar…» |
| Aprobar una unión no revalida (compañeros invitados entre medias, destino desactivado) | `resolverSolicitud` vuelve a mirar miembros de la clínica de origen y que el destino siga activo → 409 | `clinicas`: «aprobar se revalida…», «…clínica desactivada» |
| Invitados sin aceptar la privacidad | `establece-contrasena` exige `privacidad: true` si el usuario no la tiene; `GET /auth/tokens/:t` devuelve `pide_privacidad`; la pantalla enseña la casilla | `acceso`: «invitación: sin aceptar la privacidad…», «recuperar: quien ya aceptó…» |
| `recupera` con el usuario del superadmin → 400; el test usaba un correo que no existe | Cualquier texto que no sea correo → respuesta genérica; el test usa el usuario real | `arranque`: «superadmin: no puede recuperar…» |
| 13 rutas sin test de rol; `GET /solicitudes-union` sin test de ámbito | Test tabular `roles.test.ts` (401 sin sesión, 403 con rol ajeno, 32 rutas) y test de ámbito de solicitudes | `roles`, `clinicas`: «…solo ve las dirigidas a su clínica» |
| Correo de prueba: excepción no escrita y sin traza | Excepción explicada en el código y en `CLAUDE.md`; deja traza en `avisos_enviados` | `configuracion`: «correo de prueba…» |
| `en_curso` caducado no cuenta intentos | Retomarlo suma un intento; al llegar al tope → `fallido` («interromput massa vegades») sin enviar | `avisos`: «…vuelve a salir», «…una y otra vez acaba en fallido» |
| Dos altas simultáneas → 500 | Se captura `23505` y se responde lo mismo | `acceso`: «dos altas simultáneas…» |
| Migraciones sin cerrojo | `pg_advisory_lock` para toda la tanda | `arranque`: «dos arranques a la vez…» |
| Alta repetida sin verificar pierde `union_clinica_id` y manda un enlace de 1 h | Se reenvía la verificación con la clínica elegida | `acceso`: «alta repetida sin haber verificado…» |
| Invitar compañero: 409 que enumera, sin historial, sin freno | Correo ya registrado → misma respuesta y nada; `historial`; freno de intentos | `clinicas`: «invitar a un correo que ya tiene cuenta…», «…deja historial», «…tiene freno» |
| Cola del panel solo 24 h | Pendientes siempre; fallidos, 30 días | `configuracion`: «la cola del panel enseña un correo fallido de hace días…» |
| `PATCH /auth/perfil` con `''` guarda `''` | `nullif` | `acceso`: «perfil: apagar los correos…» |
| Correo de la clínica sin validar | Vacío o correo válido | `clinicas`: «la ficha de la clínica no admite…» |
| Textos fuera de `va.ts` (`api.ts`, `aria-label`) | `comun.sinConexion`, `comun.errorGenerico`, `menu.etiqueta` | build (`comprueba`) |
| «Marca-les totes» sin control de errores | Si falla, se avisa y no se pone el contador a cero | (web, sin test automático) |
| `leerConfiguracion` vuelve a los valores por defecto en silencio | Aviso en el log con la clave y los fallos | (solo log) |
| `esClaveConfig` sin llamador | Quitada | typecheck |
| Design nombra piezas que no existen así | Sección «Diferencias con lo construido» en `design.md` | — |

### Descartado o aplazado, con motivo

- **Que el arranque no muera si `SUPERADMIN_USUARIO` coincide con un
  correo.** Se mantiene: es un error de configuración del operador y el
  mensaje lo explica. Con el arreglo de arriba, desde la aplicación ya no se
  puede provocar.
- **Aprobación de uniones en clínicas «no validadas» solo por Bambú.** El
  arreglo mínimo (solo se sugieren clínicas con alguien verificado; se
  revalida al aprobar) cierra el caso del alta sin confirmar, pero quien
  registre con un correo verificado el nombre de una clínica ajena sigue
  pudiendo aprobar a quien pida unirse. Es una decisión de producto: pasa a
  **decisiones pendientes de Nando** (cuaderno §11) antes de abrir a
  veterinarios.
- **Cola «al menos una vez»** (traza y estado después del envío; si el
  proceso cae entre `sendMail` y el `UPDATE`, puede salir un duplicado).
  Aceptado por diseño: un correo repetido es mejor que uno perdido. Con el
  arreglo de intentos, un envío que se cuelga ya no se repite para siempre.
- **`detener()` no espera el lote en vuelo.** Si el contenedor para a
  mitad, el correo queda `en_curso` y se retoma a los 10 minutos (contando
  intento). No compensa la complejidad.
- **Fotos de la web: el fichero se escribe antes de la transacción y las
  anteriores no se retiran.** Un fallo deja un fichero huérfano en
  `/datos`, sin efecto visible. Va con la purga física del registro de
  aplazados.
- **`esBambu` (API y web) y `CampoTexto` sin llamador.** Se quedan: los usan
  el ámbito y el asistente de derivación del change 2 (anotado en sus
  tasks), donde dejarán de estar huérfanos.
- **«BAMBÚ Fisiovet» e «Instagram» como literales.** Son nombres propios.
