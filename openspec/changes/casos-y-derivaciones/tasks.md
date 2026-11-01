# Tasks — change `casos-y-derivaciones`

Regla de la casa: cada task con su test; cada arreglo se verifica quitándolo
y viendo el test en rojo. Toda ruta nueva lleva su test de rol y de ámbito
(404 cruzado entre clínicas). Se construye con Opus; al cerrar, el revisor
corre con otro modelo.

## 1. Datos y dominio

- [x] 1.1 `005_casos.sql`: `propietarios`, `pacientes`, `casos` (design D1),
      CHECK nombrados, índices. Test: aplicar dos veces no falla; un caso
      `derivacion` sin clínica y un paciente `otro` sin `especie_otra` los
      rechaza la propia BD.
- [x] 1.2 `dominio/estados-caso.ts`: estados, acciones y
      `decidirTransicion`. Tests puros recorriendo la tabla entera: cada
      combinación permitida da su estado destino; las demás, 403 (rol) o 409
      (estado).
- [x] 1.3 `dominio/visibilidad.ts`: `ambitoCaso` y `ambitoPaciente`. Tests
      puros: fragmento y parámetros por rol; el derivador nunca sale sin
      filtro de clínica; los borradores ajenos quedan fuera.
- [x] 1.4 `dominio/validacion-derivacion.ts`. Tests puros: cada obligatorio
      que falta aparece en `campos`; consentimiento de versión antigua no vale;
      `otro` sin texto falla.
- [x] 1.5 Clave de configuración `consentimiento` con texto provisional y
      versión que sube sola al cambiar el texto. Test: editar el texto sube la
      versión; guardar el mismo texto no.

## 2. Pacientes, propietarios y casos (API)

- [x] 2.1 `POST /casos` del derivador (borrador con paciente nuevo o
      existente de su clínica) y `GET /casos/:id`. Tests: el borrador se
      recupera con otra sesión del mismo veterinario; un compañero no ve el
      borrador; Bambú tampoco (404); `paciente_id` de otra clínica → 404;
      derivar otra vez un paciente existente crea otro caso y la ficha del
      paciente muestra los dos.
- [x] 2.2 `PATCH /casos/:id`. Tests: derivador en `enviada` edita; tras
      aceptar → 409 con el texto de la spec y nada cambia; Bambú edita
      siempre; cambio real → `historial` con antes y después; PATCH sin cambios
      → ni historial ni evento.
- [x] 2.3 `POST /casos/:id/envia` y `descarta`. Tests: enviar sin motivo → 400
      con `campos.motivo` y sigue en borrador; envío correcto → `enviada`,
      `enviado_el`, notificación a todo el lado Bambú y correo encolado al
      correo del centro (la costura: fila en `correos_pendientes`); descartar
      lo saca de las listas sin borrarlo.
- [x] 2.4 `acepta`, `rechaza`, `abandona`, `alta-manual`, `asigna-fisio`.
      Tests: aceptar con fisio → dos eventos (veterinario y fisio notificados);
      aceptar dos veces → 409 sin evento; dos aceptaciones en paralelo → un 200,
      un 409 y un solo evento; derivador → 403; rechazar sin motivo → 400;
      `fisio_id` de un derivador o inactivo → 400; alta manual desde `aceptada`
      → 409.
- [x] 2.5 `GET /casos` con filtros, `no_leidas` por fila, «amb novetats» y
      cursor. Tests: derivador sin filtros solo ve su clínica; filtro de
      novedades; orden por `ultima_actividad`; paginación sin duplicados ni
      huecos; búsqueda sin acentos («clinica» encuentra «Clínica»).
- [x] 2.6 `POST /casos/:id/leido`. Test: con dos notificaciones del caso sin
      leer, el resumen de la campana baja en dos y las de otros casos siguen.
- [x] 2.7 `GET /pacientes`, `GET /pacientes/:id`,
      `PATCH /pacientes/:id`, `PATCH /propietarios/:id`. Tests: Bambú corrige
      el peso 12,4 → 11,8 → historial y notificación al veterinario; derivador
      edita el teléfono del propietario de su clínica pero no el de otra (404);
      derivador no edita el paciente de un caso aceptado (409).
- [x] 2.8 `GET /casos/:id/historial` y `GET /pacientes/:id/historial` (B).
      Test de rol: derivador → 403.
- [x] 2.9 Ampliar `fusionarClinica` (design D8). Test de la spec: veterinario
      con dos derivaciones en su clínica provisional aceptado en otra → sus
      compañeros nuevos las ven y la clínica antigua queda sin casos.
- [x] 2.10 Test transversal: ninguna ruta de `casos`, `pacientes` o
      `propietarios` devuelve datos de otra clínica a un derivador (recorre
      todas las rutas con un caso ajeno y espera 404 o lista vacía).
- [x] 2.11 Uniones a clínicas no validadas (design D11): columna
      `validada` en `005_casos.sql`, Bambú la marca, `decidirUnion` y
      `resolverSolicitud` la aplican, el aviso solo va a Bambú. Tests: un
      veterinario de una clínica no validada no aprueba (404) y no recibe el
      aviso; validada, sí; la unión por dominio sigue siendo automática.
- [x] 2.12 `POST /clinicas` (B, nace validada) y `validada` en
      `PATCH /clinicas/:id`. Tests: la clínica creada por Bambú sale en las
      sugerencias sin tener usuarios; derivador → 403.
- [x] 2.13 Derivación registrada por Bambú (design D12). Tests: nace
      `aceptada` en la clínica elegida con `registrado_por`; el veterinario
      elegido la ve y recibe `derivacion.registrada` (notificación y correo
      encolado); sin veterinario con cuenta, avisa a los de la clínica; con
      `derivador_nombre` y clínica sin usuarios no avisa a nadie y no falla;
      clínica no validada → 400; un veterinario que se registra después y se
      une a la clínica la ve.
- [x] 2.14 Catálogo de eventos: `derivacion.registrada` en `eventos.ts` y en
      el CHECK (005); Bambú sin clínica que derive → 400 (design D13). Test: el
      test que compara catálogo y CHECK sigue en verde; una base del change 1
      recibe las filas nuevas de la matriz al arrancar sin tocar las demás.

## 3. Web

- [x] 3.1 `web/src/estados.ts` (tabla de transiciones como datos), test del
      API que la compara con `dominio/estados-caso.ts`; `ChipEstado`, `Hoja`,
      `SelectorFisio`. Usar los `esBambu` (API y web) y `CampoTexto` que el
      change 1 dejó sin llamador (revisión del change 1).
- [x] 3.2 `ListaCasos` en `/d` y `/b/casos`: chips, punto de novedades,
      buscador, filtros, «Carrega'n més», estado vacío y FAB. Menús nuevos.
- [x] 3.3 `NovaDerivacion` de tres pasos con autoguardado, «Desat», errores
      por paso y oferta de continuar el borrador. Sustituye la pantalla
      provisional.
- [x] 3.4 `FichaCaso` (Fitxa) con edición según rol y estado; barra de
      acciones de Bambú (acepta con fisio, rebutja, abandona, alta manual,
      reassigna); marca como leído al abrir.
- [x] 3.5 `Pacientes` (`/d/pacients`, `/b/pacients`, `/b/pacients/:id` con
      casos e historial) y `RegistraDerivacio` (`/b/casos/nou`): clínica
      validada, «+ Nova clínica», veterinari amb compte o escrit a mà.
- [x] 3.8 `/b/cliniques`: alta manual de clínica y marca «Validada».
- [x] 3.6 Inici de Bambú con «Noves derivacions»; Configuració → Textos
      legals (consentimiento).
- [x] 3.7 `npm run build` en verde (las seis comprobaciones) y recorrido en
      Chrome a 390 px y 1280 px: derivar en el móvil, retomar en el ordenador,
      enviar, aceptar como Bambú, ver la campana en los dos lados.

## 4. Semilla y cierre

- [x] 4.1 `api/seed/demo.ts` + script `sembrar-demo`. Test: se niega con
      casos existentes y con la URL de producción.
- [x] 4.2 `npm test`, `npm run typecheck`, `npm run comprova-produccio` en
      verde; corregir la propuesta (plantillas de correo, D5).
- [x] 4.3 Revisor sobre el diff del change con un modelo distinto; corregir lo
      que proceda y justificar aquí lo descartado.
- [ ] 4.4 Redesplegar y recorrido en producción (design, Migration Plan).
      Anotar hallazgos en el cuaderno §12 y aplazados en §11.
