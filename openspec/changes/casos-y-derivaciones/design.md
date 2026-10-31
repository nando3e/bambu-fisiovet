## Context

El change 1 dejó en pie cuentas, clínicas (con fusión), sesiones, historial,
configuración y el módulo `avisos/` completo: el catálogo ya tiene
`derivacion.enviada`, `derivacion.aceptada`, `derivacion.rechazada`,
`caso.fisio_asignado`, `caso.abandonado`, `caso.alta` y
`paciente.ficha_modificada`, y `publicarEvento(bd, …)` acepta `casoId`,
`clinicaId`, `fisioResponsableId` y `derivadoresInteresados`. La tabla
`notificaciones` ya tiene `caso_id` y un índice parcial de no leídas por caso.
Este change solo añade datos, dominio, rutas y pantallas; no toca la cola ni
la matriz.

Piezas que se reutilizan tal cual: `enTransaccion`, `registrarCambio`,
`validar`/`idDeRuta`, `exigirSesion` + `ROLES_BAMBU`/`SOLO_DERIVADOR`,
`fusionarClinica` (se amplía), los componentes de formulario de
`componentes/comunes.tsx` y los ayudantes de test de `test/ayuda.ts`
(`veterinarioVerificado`, `fisioVerificada`, `entrarSuperadmin`).

## Goals / Non-Goals

**Goals:**

- Un veterinario deriva desde el móvil en tres pasos, con borrador que
  sobrevive al cambio de dispositivo, y sigue el estado de sus casos.
- Bambú acepta (con fisio), rechaza, abandona, da el alta manual, reasigna,
  edita fichas y registra derivaciones que llegan por teléfono o correo.
- `dominio/visibilidad.ts` y `dominio/estados-caso.ts` quedan como la única
  fuente de ámbito y transiciones para los changes 3-5.
- Desplegable al cerrar: el portal ya sirve para derivar de verdad.

**Non-Goals:**

- Hilo, adjuntos, sesiones y la transición automática a `en_tratamiento`
  (change 3). Los mensajes de sistema de las transiciones se pintarán en el
  change 3 a partir de `eventos` e `historial`; aquí no se crea `mensajes`.
- Informes y alta por informe (change 4). La tarea `sin-noticias` (change 3).
- Caso privado dentro de la clínica, fusión de clínicas duplicadas
  (aplazados).

## Decisions

### D1. Migración `005_casos.sql`

```
propietarios  id, nombre, telefono, email, consentimiento_version, consentimiento_texto,
              consentimiento_el, clinica_origen_id → clinicas NULL, creado_por, creado, actualizado
pacientes     id, nombre, especie CHECK (perro|gato|conejo|ave|otro), especie_otra,
              raza, sexo CHECK (macho|hembra|desconocido), esterilizado bool NULL,
              fecha_nacimiento date NULL, edad_texto, peso_kg numeric(5,2) NULL,
              propietario_id → propietarios, clinica_origen_id → clinicas NULL,
              creado_por → usuarios, creado, actualizado
casos         id, paciente_id, clinica_id NOT NULL, derivador_id NULL,
              derivador_nombre (veterinario sin cuenta, derivaciones registradas por Bambú),
              registrado_por → usuarios NULL (el fisio que registró la derivación), creado_por,
              estado CHECK (borrador|enviada|aceptada|en_tratamiento|alta|rechazada|abandonada),
              motivo, historia_clinica, tratamiento_actual, objetivos, notas_derivador,
              fisio_responsable_id NULL, motivo_cierre (rechazo o abandono),
              descartado_el,
              enviado_el, resuelto_el (aceptada o rechazada), primera_sesion_el, cerrado_el,
              ultima_actividad DEFAULT now(), creado, actualizado
```

- Todo caso es una derivación: `clinica_id` NOT NULL, y CHECK nombrado
  `casos_origen_check`: `derivador_id` NOT NULL o `registrado_por` NOT NULL
  (lo derivó un veterinario desde el portal o lo registró Bambú en su nombre).
  Sin columna `origen` ni `caso_anterior_id`: no hay casos propios y la
  historia de un paciente son sus casos (decisión de Nando, D13).
- `clinicas.validada boolean NOT NULL DEFAULT false` (D11).
- CHECK `pacientes_especie_otra_check`: `especie='otro'` ⇒ `especie_otra`
  no vacía.
- Índices: `casos (clinica_id, ultima_actividad DESC)`,
  `casos (estado, ultima_actividad DESC)`, `casos (paciente_id)`,
  `pacientes (clinica_origen_id)`.
- `casos.ultima_actividad` entra aquí y no en el 006 como decía el cuaderno:
  la lista de este change ya ordena por actividad. Toda transición y edición
  la toca; el change 3 la toca con mensajes y sesiones.
- El consentimiento vive en el propietario (texto y versión copiados del
  momento de aceptarlo), y no en el caso: es un permiso del dueño sobre sus
  datos, no sobre una derivación. Si el texto vigente cambia de versión, la
  siguiente derivación con ese propietario vuelve a pedirlo.

### D2. Ámbito en `dominio/visibilidad.ts`

Puro: recibe la sesión y el número del siguiente parámetro y devuelve un
fragmento SQL y sus parámetros; no importa `pg`.

```ts
ambitoCaso(sesion, alias = 'c', n = 1)     → { sql, params }
ambitoPaciente(sesion, alias = 'p', n = 1) → { sql, params }
```

- Bambú y superadmin: `c.estado <> 'borrador'` (los borradores no existen
  para Bambú).
- Derivador, caso: `c.clinica_id = $n AND (c.estado <> 'borrador' OR c.derivador_id = $n+1)`.
  **Un borrador solo lo ve quien lo escribe**, aunque el resto del caso sea de
  toda la clínica (decisión de Nando).
- Derivador, paciente: `EXISTS (casos de ese paciente visibles para él)`. No
  basta la clínica de origen: el paciente de un borrador ajeno no se ve. Bambú
  ve todos menos los que solo están en borradores. El propietario se ve a
  través del paciente.
- Todas las consultas por id hacen `WHERE id = $x AND <ámbito>`; sin fila →
  `noEncontrado()`. Un test por ruta comprueba el 404 cruzado entre clínicas.

### D3. Transiciones en `dominio/estados-caso.ts`

```ts
export const ACCIONES = ['enviar', 'descartar', 'aceptar', 'rechazar', 'abandonar',
  'alta_manual', 'iniciar_tratamiento', 'alta_por_informe'] as const;
decidirTransicion(estado, accion, actor: 'derivador' | 'bambu' | 'sistema')
  → { ok: true, a: Estado } | { ok: false, codigo: 403 | 409 }
```

La tabla es la de la spec; `descartar` deja el estado en `borrador` y marca
`descartado_el`. `iniciar_tratamiento` y `alta_por_informe` son solo de
`sistema`: se definen y prueban aquí, y los usan los changes 3 y 4.

En la ruta, dentro de `enTransaccion`: `SELECT … FOR UPDATE` con el ámbito →
404 si no hay fila → `decidirTransicion` → 409/403 sin tocar nada →
`UPDATE` → `registrarCambio` → `publicarEvento`. El `FOR UPDATE` garantiza que
dos «Accepta» simultáneos producen un 200 y un 409, y un solo evento (test con
dos peticiones en paralelo). El rol se comprueba antes que el ámbito
(`exigirSesion` con roles): un derivador que llama a `acepta` recibe 403 tanto
si el caso existe como si no, así que no filtra nada.

### D4. Rutas

| Ruta | Quién | Qué |
|---|---|---|
| `GET /casos` | * | filtros `estado, clinica_id, fisio_id, especie, q, novedades, antes_de`; 30 por página, cursor `(ultima_actividad, id)`; cada fila trae `no_leidas` |
| `POST /casos` | D: borrador de derivación · B: derivación registrada (D12) | con paciente nuevo o `paciente_id` existente en su ámbito (otra derivación del mismo paciente) |
| `GET /casos/:id` | * | caso + paciente + propietario + nombres de clínica, derivador y fisio |
| `PATCH /casos/:id` | D en borrador/enviada · B siempre | campos clínicos del caso; D tras aceptar → 409 con el texto de la spec |
| `POST /casos/:id/envia` | D | valida con `dominio/validacion-derivacion.ts` → 400 con `campos` |
| `POST /casos/:id/descarta` | D (autor) | solo borrador |
| `POST /casos/:id/acepta` | B | `{ fisio_id? }` |
| `POST /casos/:id/rechaza` · `abandona` | B | `{ motivo }` obligatorio |
| `POST /casos/:id/alta-manual` | B | solo `en_tratamiento` |
| `POST /casos/:id/asigna-fisio` | B | `{ fisio_id }`, usuario `bambu` activo |
| `POST /casos/:id/leido` | * | marca leídas sus notificaciones del caso; devuelve `{ no_leidas }` global |
| `GET /casos/:id/historial` | B | historial del caso, su paciente y su propietario |
| `GET /pacientes?q=` · `GET /pacientes/:id` | * | ficha con sus casos (filtrados por ámbito) |
| `PATCH /pacientes/:id` | B siempre · D solo si todos sus casos están en borrador/enviada | |
| `PATCH /propietarios/:id` | B siempre · D contacto (`telefono`, `email`) de los de su clínica | |
| `GET /pacientes/:id/historial` | B | |
| `GET /consentimiento` | * | texto y versión vigentes |
| `POST /clinicas` | B | alta manual, nace validada |
| `PATCH /clinicas/:id` | B | admite `validada` |

`GET /casos/:id` no marca nada como leído: un GET sin efectos. La web llama a
`leido` al abrir la ficha. Los textos de error van en valenciano, como en el
change 1.

### D5. Ediciones, historial y avisos

- `registrarCambio` guarda solo los campos que cambian (antes/después), con
  `tabla` = `casos`, `pacientes` o `propietarios`. Un PATCH sin cambios reales
  no deja historial ni publica nada.
- `paciente.ficha_modificada` se publica con el caso **más reciente no
  borrador** del paciente (para que el enlace lleve a algún sitio y el anti-
  ruido funcione por caso); si no tiene ninguno, no se publica. Datos:
  `{ paciente, nombre (de quien edita), campos }`. Del lado derivador avisa al
  derivador del caso; del lado Bambú, a quien diga el catálogo.
- Cada transición publica su evento con `derivadoresInteresados =
  [derivador_id]` y `fisioResponsableId`. `acepta` con fisio publica dos
  eventos: `derivacion.aceptada` y `caso.fisio_asignado`.
- Eventos nuevos en el catálogo (y en el CHECK de `eventos.tipo`, ampliado en
  la 005 con `DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT`):
  `derivacion.registrada` (derivador; notificación y correo).
  `sembrarMatriz` ya inserta sin pisar, así que una base existente recibe sus
  filas al arrancar. Destinatarios: el derivador del caso si tiene cuenta; si
  no, los veterinarios activos de la clínica.
- Plantillas de correo: **ninguna nueva**. El catálogo del change 1 ya resuelve
  todos estos eventos con la plantilla genérica `aviso` (título, cuerpo y
  enlace por evento). La propuesta listaba cuatro plantillas específicas que
  sobran; se corrige la propuesta.

### D6. Consentimiento del propietario

Nueva clave de configuración `consentimiento` `{ texto, version }`, sembrada
con un texto provisional en valenciano y `version: 1`, editable por Bambú en
Configuració → Textos legals. `escribirConfiguracion` sube la versión sola
cuando cambia el texto. Al enviar, `validacion-derivacion.ts` exige que el
propietario tenga el consentimiento de la versión vigente o que la petición lo
acepte en ese momento (`acepta_consentimiento: true`), y la ruta copia texto y
versión al propietario.

### D7. Validación de la derivación

`dominio/validacion-derivacion.ts` (puro) recibe el caso con paciente y
propietario y la versión vigente del consentimiento, y devuelve
`{ ok: true } | { ok: false, campos: Record<campo, mensaje> }`. Obligatorios
(supuesto de la propuesta): nombre y especie del paciente (y `especie_otra`
si es «otro»), nombre y teléfono del propietario, motivo y consentimiento.
Los mensajes van en valenciano y la web los pinta en el paso que toca.

### D8. Fusión de clínicas

`fusionarClinica` añade, en la misma transacción y antes de desactivar:

```sql
UPDATE casos        SET clinica_id        = $2 WHERE clinica_id        = $1 RETURNING id
UPDATE pacientes    SET clinica_origen_id = $2 WHERE clinica_origen_id = $1 RETURNING id
UPDATE propietarios SET clinica_origen_id = $2 WHERE clinica_origen_id = $1
```

Los ids movidos van al `historial` de la clínica fusionada. Test de la spec:
el compañero nuevo ve las dos derivaciones y la clínica antigua no deja nada
colgando.

### D9. Web

```
web/src/pantallas/casos/
  ListaCasos.tsx       compartida: /d (derivacions) y /b/casos; chips de estado, punto de novedades,
                       buscador, filtros en hoja (móvil) o barra (≥ 900 px), «Carrega'n més»
  FichaCaso.tsx        compartida: cabecera (paciente, especie, estado, chip «Derivat per …» o
                       «Registrat per Bambú») y
                       pestaña Fitxa; Fil · Sessions · Informes llegan en los changes 3 y 4.
                       Bambú: barra de acciones según la tabla de transiciones (copiada como datos
                       en web/src/estados.ts y vigilada por un test de igualdad)
  NovaDerivacion.tsx   asistente de tres pasos; POST al terminar el paso 1, PATCH con autoguardado
                       (800 ms sin teclear) y aviso «Desat»; «Envia» en el paso 3
  Pacientes.tsx        /d/pacients, /b/pacients y /b/pacients/:id (casos, e historial para Bambú)
  RegistraDerivacio.tsx /b/casos/nou: «Derivació rebuda» (per telèfon o correu): clínica
                       validada con buscador y «+ Nova clínica» en una hoja, veterinari de la
                       clínica o escrit a mà, i els mateixos passos que el veterinari
web/src/componentes/   ChipEstado.tsx · Hoja.tsx (modal inferior en móvil) · SelectorFisio.tsx
```

- Menús: derivador `Inici (derivacions) · Nova · Pacients · Perfil`; Bambú
  `Inici · Casos · Pacients · Clíniques · Configuració · Perfil`.
- `/d` pasa a ser la lista de derivaciones; sin ninguna, el estado vacío
  explica cómo funciona y lleva a «Nova derivació» (lo que hoy enseña la
  portada provisional). FAB «+» en móvil.
- Inici de Bambú: la cifra «Noves derivacions» (enviadas) enlaza a
  `/b/casos?estado=enviada`.
- Al entrar en «Nova derivació» con un borrador propio sin enviar, se ofrece
  continuarlo o empezar uno nuevo.
- Todos los textos en `i18n/va.ts`; `npm run comprueba` vigila literales,
  rutas del API y campos a 16 px.

### D10. Semilla `--demo`

`api/seed/demo.ts` (script `npm run sembrar-demo`): 3 clínicas, 4
veterinarios, 2 fisios, 15 casos repartidos por todos los estados (dos
registrados por Bambú y un paciente derivado dos veces). Se niega si `URL_PUBLICA` es la de producción o
si ya hay casos: nunca pisa datos.

### D11. Uniones a clínicas no validadas: las aprueba Bambú

Decisión de Nando (revisión del change 1). Columna `clinicas.validada`
(boolean, `false` por defecto, también en las existentes) que Bambú marca en
`/b/cliniques` (`PATCH /clinicas/:id`, con `historial`). Las clínicas que da
de alta Bambú (`POST /clinicas`) nacen validadas.

- Mientras la clínica destino no está validada, una solicitud de unión
  pendiente solo la puede aprobar o rechazar Bambú; un veterinario de esa
  clínica recibe 404 al intentarlo, y `usuario.solicita_union` solo avisa al
  lado Bambú.
- La unión automática por dominio de correo se mantiene: para que coincida
  hay que haber verificado un buzón de ese dominio.
- `decidirUnion` (puro) recibe `destinoValidado` y devuelve quién puede
  resolver; `resolverSolicitud` lo aplica.
- Sugerencias del alta: clínicas activas validadas o con algún usuario activo
  y verificado. Así un veterinario encuentra la clínica que Bambú dio de alta
  al registrar sus derivaciones por teléfono.

### D12. Derivación registrada por Bambú

`POST /casos` de Bambú (la única forma de crear casos que tiene Bambú), `clinica_id` (activa y
validada; si no está, la hoja «Nova clínica» la crea antes con
`POST /clinicas`), y `derivador_id` (un veterinario activo de esa clínica) o
`derivador_nombre` (texto). Mismos datos de paciente, propietario y motivo
que el asistente del veterinario, validados con `validacion-derivacion.ts`;
el consentimiento lo marca el fisio («El propietari ha donat el
consentiment»). Nace `aceptada` con `resuelto_el = enviado_el = now()`,
`registrado_por` = sesión, fisio responsable opcional, y el paciente queda con
`clinica_origen_id` = esa clínica. Publica `derivacion.registrada` (y
`caso.fisio_asignado` si se asigna). La clínica y el veterinario lo ven igual
que una derivación hecha desde el portal; en la ficha pone «Registrada per
Bambú (telèfon)».

### D13. El portal solo recibe derivaciones

Decisión de Nando: el portal es para recibir derivaciones. Bambú no abre
casos propios ni recaídas en él; los animales que llegan sin veterinario, la
agenda y las visitas se gestionan en Wakyma. Por eso todo caso tiene clínica
y lo derivó un veterinario o lo registró Bambú en su nombre (D12). Si un
paciente vuelve a necesitar fisioterapia, la clínica lo deriva otra vez
eligiendo el paciente existente, y la ficha del paciente muestra todos sus
casos. Cada caso nuevo de un paciente hereda su `clinica_origen_id`.

## Risks / Trade-offs

- [Borradores visibles solo para su autor] → Si un compañero sustituye al
  autor, no ve el borrador. Es trabajo no enviado; se cambia en una línea de
  `visibilidad.ts` si Bambú o las clínicas lo piden.
- [Tabla de transiciones copiada en la web] → Puede desincronizarse; un test
  del API importa los dos ficheros y los compara.
- [`paciente.ficha_modificada` atado al caso más reciente] → Con varios casos
  activos del mismo paciente, el aviso apunta a uno solo. Es raro: una
  derivación nueva del mismo paciente suele llegar con la anterior cerrada.
- [Búsqueda con `ILIKE` + `unaccent`] → Suficiente para cientos de casos; si
  crece, índice trigram (la extensión ya está instalada).

## Migration Plan

1. La migración 005 se aplica al arrancar; no toca tablas existentes, solo
   añade la clave `consentimiento` (sin pisar).
2. Redesplegar el Compose `portal` con la skill `desplegar-dokploy`.
3. Recorrido en producción: derivar como veterinario, aceptar como Bambú y
   comprobar la campana de los dos lados y el correo en dry-run.

Rollback: volver a desplegar el commit anterior. Las tablas nuevas quedan sin
uso; antes de abrir a veterinarios no hay datos reales que perder.

## Open Questions

- Resueltas por Nando el 31/10: borradores solo para su autor; el portal solo
  recibe derivaciones, sin casos propios ni recaídas de Bambú (D13);
  derivaciones por teléfono (D12) y alta de clínicas; uniones a clínicas no
  validadas solo por Bambú (D11).
- Los supuestos de la propuesta (especies, obligatorios, texto del
  consentimiento) siguen pendientes de Bambú; quedan aislados en
  `validacion-derivacion.ts`, el CHECK de especie y la clave `consentimiento`.
