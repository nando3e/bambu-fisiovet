# BAMBÚ Fisiovet — cuaderno de decisiones

> **Estado**: fases 1-2 del protocolo `nuevo-proyecto` cerradas y aprobadas por
> Nando el 2026-10-31. Este cuaderno nace como **candidato a plantilla nueva**:
> «portal de gestión con dos poblaciones de usuarios + asistente sobre sus
> datos» (familia happydog, pero en Node y con el ciclo de vida de cuentas por
> correo, que la casa aún no tenía). Lo marcado *(supuesto)* no está validado
> con Bambú; lo marcado *(propuesta)* aún no está construido.

## 1. Contexto

BAMBÚ Fisiovet es un centro de fisioterapia y rehabilitación veterinaria,
cliente de rbimprove. Un competidor le ha enseñado una demo
(`erp.proemisa.com/private/bambu-fisiovet/`, PHP + XAMPP) con landing,
formulario público de derivación y un mini-panel. El diseño visual gusta; la
base técnica es de prototipo (credencial impresa en la página, XAMPP en Windows
de cara a internet, «versión de pruebas» captando datos clínicos).

Lo que quiere Nando: **superarla** con una plataforma real cuyo centro sea la
**derivación de casos por parte de veterinarios** (no los dueños finales):

- Zona privada de **Bambú** (fisios): todas las derivaciones con filtros,
  historial de intervenciones, anotaciones del derivador, alta de pacientes
  propios, edición de fichas, configuración y usuarios.
- Zona privada de **profesionales derivadores** (veterinarios): alta con
  confirmación por email, cambio y recuperación de contraseña, derivar, seguir
  sus casos, aportar informes e imágenes, ver lo que aportan los fisios, hilo
  de comunicación por caso. Solo ven lo suyo.
- **IA v1**: notas de voz del fisio → borrador de informe para el veterinario →
  regenerar / editar a mano / confirmar. Nunca se envía sin confirmar.
- **Avisos por email** (dominio y cuentas de correo propias). WhatsApp e IA
  adicional (asistente de datos estilo happydog, chat FAQ) en v2.
- Estética: paleta, tipografía y estilo de la demo; **UX ágil, minimalista,
  móvil primero y con iconos, como happydog**. Un solo acceso a «derivar».
- Idioma: **valenciano**.
- «Aportar valor sin morralla».

En el repo actual solo hay `bambu.html` (landing estática en catalán) y un
Dockerfile de nginx: se sustituyen enteros.

**Dónde está alojada la competencia** (verificado el 31/10/2026, útil para la
propuesta comercial): `erp.proemisa.com` es un CNAME al DDNS de un router
MikroTik (`*.sn.mynetname.net`) sobre una IP de Movistar → un PC Windows con
XAMPP en la oficina de una electromecánica; la web corporativa de Proemisa
está en un hosting normal con WordPress. Las cinco webs de muestra que enseñó
están en InfinityFree (185.27.134.x, hosting gratuito con reto anti-bots).
«Dominio y hosting gratis» = una carpeta en el servidor del ERP de su
empresa o un subdominio gratuito; sin proveedor, sin contrato, sin copias,
sin encargado de tratamiento para datos clínicos y de dueños.

## 2. Lectura del proyecto (para que la valides)

Es una **app de gestión con dos poblaciones de usuarios que colaboran sobre
el mismo expediente** (el caso derivado), más un **generador de informes
asistido** acotado a una llamada con esquema. La fuente de verdad son filas en
Postgres; no hay documentos ni RAG; no hay conversación con estado en v1. Se
parece a happydog en UX y en el patrón proponer/confirmar, y a forestalolotina
en stack y esqueleto; lo que no existe en la casa y hay que construir con
cuidado es **el ciclo de vida de cuentas por email** (alta, verificación,
recuperación, invitación) y **la visibilidad por rol sobre el mismo caso**.

## 3. Decisiones tomadas

| # | Decisión | Estado | Motivo |
|---|---|---|---|
| D1 | Familia: happydog (app de gestión + asistente sobre datos), en Node | decidido | El usuario pide «xat a modo de happydog»; la plantilla DATOS aplica; la casa manda Node salvo motivo |
| D2 | Front: **SPA React 19 + Vite + PWA servida por el API**, CSS plano con tokens | decidido (Nando: «ágil y minimalista como happydog») | Mismo patrón que forestalolotina (Node) y happydog (Python). Desvío de «Fastify + HTML plano» motivado: pantallas ricas (filtros, hilo, micrófono, fichas) y UX móvil |
| D3 | Estética: tokens de color/tipografía de la demo (`--green #657d60`, `--green-dark #344b3b`, `--cream #f8f0df`, `--paper #fffdf8`, `--peach #dfc2ad`, DM Sans + Manrope, pill buttons, radio 26px) | decidido | Lo pidió Nando. Se copia el `style.css` de la demo como referencia a `docs/referencia-demo/` |
| D4 | Iconos: `lucide-react` (SVG en árbol, sin fuente de iconos) | decidido | happydog usa SVG inline a mano; lucide da el mismo look con menos trabajo y tree-shaking |
| D5 | Idioma: valenciano, único; **textos en diccionario** `web/src/i18n/va.ts` | decidido (idioma) / supuesto (diccionario) | Añadir castellano después no debe obligar a tocar componentes |
| D6 | Avisos: solo email en v1, SMTP del dominio de Bambú, nodemailer con dry-run | decidido | WhatsApp requiere número dedicado y QR/plantillas; se diseña el `avisos/` para que el canal sea enchufable |
| D7 | IA v1: solo **informe por voz** (transcripción Whisper → una llamada LLM con esquema → propuesta → confirmar). Sin bucle de agente | decidido | Valor claro y riesgo bajo; el fisio firma. Asistente de datos y chat FAQ a v2 |
| D8 | Proponer/confirmar como arquitectura de toda escritura asistida | decidido | Plantilla DATOS §4; lease atómico `WHERE estado='pendiente'`; editar = volver a proponer |
| D9 | Sin borrado duro en ningún sitio; historial de cambios por entidad | decidido | Expediente clínico: trazabilidad. Permite que el fisio edite fichas creadas por el derivador sin perder el origen |
| D10 | Un solo punto de entrada a «derivar» en toda la UI | decidido | Petición explícita |
| D11 | Despliegue: Dokploy, **un contenedor** (API + SPA compilada) + **Postgres 16 propio del proyecto** según `SEPARACION-SERVICIOS-DESPLIEGUE.md`: stack del cliente = Postgres + app (sin Chatwoot ni Redis en v1); red interna exclusiva `bambu-internal` donde vive **solo** el Postgres (nunca en `dokploy-network`, sin puerto publicado); la app en `dokploy-network` (dominio vía Traefik) y en `bambu-internal`; conexión por nombre completo `bambu-postgres:5432` (nunca `postgres` a secas); volumen `bambu-postgres-data`; `POSTGRES_USERNAME=bambu_admin`, `POSTGRES_DATABASE=bambu_app`, contraseña inventada que **no se cambia tras el primer despliegue**; credenciales solo en el Environment de Dokploy. Descartado reutilizar el Postgres compartido (5404) como Fisio: deuda de seguridad documentada en su HANDOFF y aquí hay datos clínicos y de propietarios. Más volumen `bambu-datos` → `/datos` para adjuntos y audios | decidido | Convención de la casa (`SEPARACION-SERVICIOS-DESPLIEGUE.md`); skills `compose-dokploy` para generar el compose y `desplegar-dokploy` para subirlo. Copias de seguridad del volumen y de la BD: definir destino antes del cutover (riesgo §10.2). Rol de BD de solo lectura sobre vistas curadas reservado para el asistente de v2 |
| D12 | **Centro de notificaciones interno** (campana con badge y contador de no leídas, lista con enlace al caso) en ambas zonas + **matriz de eventos configurable** en Bambú: por evento, check «notificación», check «email» y «email a» | decidido (Nando) | Toda acción sobre un caso es un evento de dominio; `avisos/publicarEvento` consulta la matriz y crea notificaciones y correos en cola. La nueva derivación llega además al correo de avisos de Bambú configurable en el panel. Config en BD con efecto inmediato; canal enchufable para WhatsApp v2 |
| D13 | Los correos nunca se envían inline en la petición: cola `correos_pendientes` + tarea de fondo con dry-run, reintentos y traza | decidido | Plantilla base §12; un SMTP caído no puede tumbar «enviar derivación» |
| D14 | **Servidor de correo configurable desde el panel** (solo superadmin): servidor, puerto, seguridad (STARTTLS/SSL), usuario, contraseña, remitente y botón «Envia un correu de prova». Correo en **Dondominio**. La contraseña SMTP se guarda **cifrada** (AES-256-GCM con `CLAVE_CIFRADO` del entorno) y **nunca vuelve al navegador** (campo de solo escritura, «configurada»). La cola lee la configuración en cada envío y rehace el transporte si cambió. `CORREO_DRY_RUN=true` en el entorno manda sobre el panel | decidido (Nando, 31/10) | **Desvío motivado** de «credenciales en env» (plantilla base §10): Nando quiere cambiarlo sin tocar el despliegue. Mitigación: cifrado en reposo, solo superadmin, nunca se devuelve, traza de quién lo cambió en `historial` (sin el valor) |
| D15 | **Superadmin fijo en el entorno**: `SUPERADMIN_USUARIO` + `SUPERADMIN_CONTRASENA` **en claro** en el Environment de Dokploy. El login compara contra el entorno en tiempo constante; en BD hay una fila `es_de_entorno` (para claves ajenas, historial y notificaciones) **sin hash** y sin email. No se recupera por correo ni se cambia desde la app: se cambia la variable y se reinicia. El formulario de entrada acepta «correu o usuari». Sin contraseña definida no hay superadmin y el arranque lo avisa | decidido (Nando, 31/10) | Llave maestra que nunca se pierde; mismo patrón que forestal y happydog |

## 4. Dictamen de arquitectura

1. **¿Código o n8n?** Código. Es una aplicación con estado, roles, sesiones y
   expedientes; n8n no pinta ni para los avisos (nodemailer en el mismo
   proceso, con dry-run y trazas, es más simple y testeable).
2. **¿Bucle propio o framework de agentes?** En v1 **no hay agente**: el
   informe es una llamada con tool y esquema estricto (patrón extractor de
   forestalolotina). El asistente de v2 será bucle propio (plantilla base §2).
3. **¿Cómo llega el conocimiento al modelo?** Todo inyectado en el prompt:
   transcripción + ficha del paciente + motivo de derivación + sesiones
   previas, compuesto en código de estable a volátil. Cabe de sobra; nada de
   RAG ni de índice.
4. **¿Un agente o varios?** No aplica en v1. En v2, uno con todas las tools.
5. **Stack**: Node 22 · TypeScript · Fastify 5 · `pg` (SQL a mano, migraciones
   numeradas idempotentes) · `zod` en fronteras · `node:test` · React 19 +
   Vite + PWA · CSS plano con tokens · `lucide-react` · LLM con contrato
   propio y dos adaptadores (Anthropic por defecto, OpenAI de reserva) ·
   Whisper para voz (`language=ca`, vocabulario de nombres propios) ·
   `nodemailer` SMTP · `sharp` para imágenes · Dokploy.
   *Desvío respecto al panel «HTML plano» de la casa*: SPA, por la UX pedida
   y por el precedente forestalolotina.
6. **Qué se descarta y por qué**:
   - PHP/XAMPP (la demo): prototipo, sin tests, sin convención de la casa.
   - Next.js como en `Fisio`: dos capas, Tailwind, replicar el CSS de la demo
     cuesta más, se sale del stack y no aporta nada que la SPA no dé.
   - CMS/WordPress: la parte pública es una landing que lee cuatro datos de BD.
   - ORM (Prisma/Drizzle): la casa va con SQL a mano y migraciones propias.
   - S3: un volumen basta para el volumen de adjuntos de un centro.
   - WhatsApp (Evolution/Meta) en v1: número dedicado, QR o plantillas de
     Meta; sin tiempo de maduración. El módulo de avisos nace con el canal
     como parámetro.
   - RAG / framework de agentes: no hay documentos ni conversación en v1.
   - Formulario público de derivación sin cuenta: **ver §6 supuesto S3**.

## 5. Piezas de la casa que se reutilizan (rutas)

- **Esqueleto**: `C:\Users\nando\APPS\forestalolotina\api\src\` (`auth.ts`
  scrypt + cookie firmada, `servidor.ts` multipart 12 MB + static, `fotos.ts`
  sharp grande + miniatura, `db/migraciones.ts`, `superadmin.ts` por env),
  `forestalolotina\Dockerfile` (multi-stage, no root, volumen),
  `web\src\disseny\tokens.css`. Ojo: producción arranca con
  `node --experimental-strip-types` → sin enums/namespaces/parameter
  properties; copiar también `comprova-produccio.ts`.
- **Sesiones revocables en BD**: `finques-ketxa\app\src\panel\sesion.ts`,
  `migrations\002_sesiones.sql` (invalidar al cambiar contraseña).
- **Correo**: `nosolodulce\app\src\correo\{enviar,plantilla}.ts` +
  `test\correo.test.ts` (dry-run con motivo).
- **Alta con token de un uso**: `nutriapp\src\db\schema.ts`
  (`verification_tokens`), `src\app\api\auth\{register,verify-email,set-password}\route.ts`
  → portar la lógica a Fastify. Recuperación: mismo flujo con otro `tipo`.
- **Proponer/confirmar + voz** (patrón, no código):
  `happydogApp\api\app\agente\{propuestas,edicion}.py`,
  `api\app\llm\transcripcion.py`, `web\src\componentes\{Microfono,FichaConfirmacion}.tsx`.
- **Plantillas**: `PLANTILLA-CHATBOT.md` §2, §10, §14, §16;
  `PLANTILLA-CHATBOT-DATOS.md` §4, §7, §8, §9.

## 6. Supuestos y preguntas abiertas (a validar con Nando)

| # | Supuesto / pregunta | Propuesta elegida |
|---|---|---|
| S1 | Dominio definitivo y buzón remitente | **`bambufisiovet.com`**, correo en **Dondominio** (Nando, 31/10). Remitente `avisos@bambufisiovet.com`, configurado desde el panel (D14); publicar SPF/DKIM/DMARC. Confirmar quién gestiona hoy el DNS del dominio |
| S2 | Derivador: visibilidad **por clínica** (todos los veterinarios de la misma clínica ven sus casos), autoría por usuario | **Decidido (Nando 31/10)**, con la objeción resuelta de que la invitación no sea cuello de botella: **unirse a una clínica = solicitud que aprueba cualquier compañero o Bambú con un clic desde la campana** (evento `usuario.solicita_union`); **auto-aprobación** si el dominio del email coincide con el de la clínica (dominios genéricos tipo Gmail requieren aprobación); mientras está pendiente el vet **trabaja igual** sobre una clínica provisional propia y al aprobarse `UPDATE casos SET clinica_id` la funde; si se rechaza queda como clínica independiente. La invitación del compañero sigue como atajo. Tablas: `solicitudes_union` (`usuario_id, clinica_id, estado, resuelta_por, resuelta_el`), `clinicas.dominio_correo` |
| S3 | ¿Sigue existiendo el formulario público de derivación sin cuenta? | **Decidido (Nando 31/10): No.** Derivar exige cuenta (alta en 1 minuto, confirmación por email). Un caso sin cuenta no puede seguirse ni tener hilo, y es la puerta a spam. La landing tiene un único CTA → `/acces` |
| S4 | Fisio edita ficha creada por derivador | Sí, con historial de cambios visible en el hilo del caso («Bambú ha actualitzat el pes»); el derivador no edita lo que escribe el fisio |
| S5 | Retención de adjuntos y texto RGPD (datos de dueños + clínicos) | Lo aporta Bambú/asesor; la app guarda consentimiento con fecha y versión del texto |
| S6 | Modelo LLM para informes | `claude-sonnet-5-5` por defecto; variable de entorno. Comparar con el banco si hace falta |
| S7 | Whisper y valenciano | `language=ca` (Whisper no distingue variante); revisar con audios reales |
| S8 | Diccionario de textos un solo idioma (va) | Sí; `es` cuando se pida |

## 7. Diseño funcional y técnico

### 7.1 Decisiones estructurales adicionales (salidas del diseño)

| Decisión | Elección | Por qué |
|---|---|---|
| Derivar exige cuenta (S3 confirmado en diseño) | La landing tiene **un solo CTA** «Deriva un cas» → `/acces` (entrar / crear compte). Desaparecen `derivar.php`, el enlace duplicado y `admin.php` como login aparte | El valor es el seguimiento (hilo, informes, estado); sin identidad no existe. Alta mínima: nombre, clínica, email, teléfono → enlace → contraseña → aterriza en «Nova derivació» |
| Concepto central: tabla **`casos`** con `origen IN ('derivacion','propio')` | En la zona del vet se llaman «Derivacions», en Bambú «Casos» con chip «Derivat per…» / «Propi» | Los pacientes propios necesitan sesiones, informes y adjuntos igual; una tabla evita duplicar el 80 %. Un paciente puede tener varios casos (`caso_anterior_id`) |
| Visibilidad del derivador **por clínica** con autoría por usuario | El alta autónoma crea clínica provisional; si el nombre o el dominio del email casan con una existente se ofrece **solicitar unirse** (aprobación con un clic por compañero o Bambú; automática si el dominio de correo coincide). El vet deriva desde el primer minuto; al aprobarse se fusiona (ver S2) | Sustitutos ven el caso; relación comercial es con la clínica; nadie espera y nadie se cuela |
| Edición de ficha por Bambú: siempre, con `historial` + mensaje `sistema` en el hilo («Bambú ha actualitzat el pes: 12,4 → 11,8 kg»), sin email | El vet se entera al entrar; el email se reserva para hitos |
| Edición de la derivación por el vet: libre en `borrador`/`enviada`; tras `aceptada` el texto original se congela y lo nuevo va al hilo o adjunto | El fisio valora sobre un texto; no puede cambiar por debajo |
| Sesiones de login **en BD con token hasheado** (finques-ketxa), no cookie sin estado | Cambiar contraseña revoca las demás; «tancar sessió» es real |
| Contraseñas con scrypt de `node:crypto` | Cero dependencias |
| Ficheros clínicos **nunca por `@fastify/static`**: `GET /api/adjuntos/:id/fichero` con permisos y stream | Son historias clínicas y datos de dueños (diferencia clave con forestal) |
| Al prompt del informe **no viaja ningún dato del propietario ni del vet** | Minimización RGPD; test que falla si aparecen |
| Identificadores de código y tablas **en español**; UI en valenciano por diccionario `web/src/i18n/va.ts` | Convención de la casa (corrige la propuesta del agente de nombrar tablas en valenciano) |
| Sin enums/namespaces/parameter properties; uniones `as const` | `node --experimental-strip-types` en producción |

### 7.2 Modelo de dominio (migraciones `api/migrations/NNN_*.sql`, idempotentes)

**Acceso**: `usuarios` (email único por `lower(email)`, nombre, apellidos, teléfono, `rol IN ('superadmin','bambu','derivador')`, `clinica_id` obligatorio si derivador, `num_colegiado`, `contrasena_hash` NULL hasta fijarla, `verificado_el`, `activo`, `es_de_entorno`) · `clinicas` · `sesiones` (`token_hash PK`, `usuario_id`, `caduca`, `ultimo_uso`, `user_agent`) · `tokens_correo` (`tipo IN ('verificacion','recuperacion','invitacion')`, `token_hash UNIQUE`, `datos jsonb`, `caduca`, `usado_el`; consumo = `UPDATE … WHERE usado_el IS NULL AND caduca > now()` con `rowCount = 1`; verificación 48 h, recuperación 1 h, invitación 7 días) · `configuracion` (`clave PK`, `valor jsonb`; claves sembradas `contacto`, `avisos`, `retencion`, `textos_legales`, sin pisar).

**Clínica**: `propietarios` (nombre, teléfono, email, `consentimiento_texto` versionado, `consentimiento_el`) · `pacientes` (nombre, `especie IN ('perro','gato','conejo','ave','otro')` + `especie_otra`, raza, sexo, esterilizado, `fecha_nacimiento`/`edad_texto`, `peso_kg`, `propietario_id`, `clinica_origen_id`, `creado_por`) · **`casos`** (`paciente_id`, `origen`, `clinica_id`, `derivador_id`, `estado`, motivo, historia_clinica, tratamiento_actual, objetivos, notas_derivador, consentimiento_propietario, `fisio_responsable_id`, `motivo_rechazo`, `caso_anterior_id`, `enviado_el`, `resuelto_el`, `primera_sesion_el`, `cerrado_el`; CHECK `origen='derivacion' ⇒ clinica_id y derivador_id NOT NULL`) · `intervenciones` (`caso_id`, fecha, hora, `fisio_id`, `tipo IN ('valoracion','sesion','revision')`, `duracion_min`, `notas` internas) · `transcripciones` (`caso_id`, `intervencion_id`, `ruta_audio` NULL tras purga, bytes, `duracion_s`, texto, vocabulario, modelo, `latencia_ms`, error) · `propuestas_informe` (`tipo IN ('valoracion','evolucion','alta')`, `transcripcion_ids int[]`, instrucciones, `datos jsonb`, `ficha jsonb`, `estado IN ('pendiente','confirmada','cancelada','corregida')`, `propuesta_origen_id`, modelo, `informe_id`) · `informes` (inmutable: `contenido jsonb`, texto, `propuesta_id`, `autor_id`, `sustituye_id`, `correo_enviado_el`) · `mensajes` (`caso_id`, `autor_id` NULL = sistema, `tipo IN ('texto','adjunto','informe','sistema')`, `visibilidad IN ('todos','bambu')`, cuerpo, `adjunto_id`, `informe_id`) · `adjuntos` (`caso_id`, `mensaje_id`, `subido_por`, `nombre_original`, mime de lista blanca verificada por **magic bytes**, bytes ≤ 12 MB, `ruta` hex aleatoria, `miniatura_ruta`, sha256, `eliminado_el`).

**Trazabilidad y avisos**: `historial` (tabla, fila_id, antes, después, usuario_id, `origen IN ('pantalla','voz','correo','sistema')`, cuando) · `eventos`, `configuracion_avisos`, `notificaciones`, `correos_pendientes`, `avisos_enviados` (detalle en §7.6) · `migraciones`. Columnas derivadas del diseño de avisos: `usuarios.recibe_correos`, `casos.ultima_actividad`, `intervenciones.resumen_veterinario`.

**Orden de migraciones**: `001_acceso` · `002_configuracion` · `003_historial` · `004_avisos` · `005_casos` · `006_hilo` · `007_informes`.

**Máquina de estados del caso**

```
borrador ─vet: enviar─▶ enviada ─Bambú: aceptar─▶ aceptada ─1ª intervención─▶ en_tratamiento ─confirmar informe de alta─▶ alta
   │ vet: descartar          │ Bambú: rechazar (motivo)      │ Bambú: abandonar                 │ Bambú: abandonar
   ▼                         ▼                               ▼                                  ▼
(borrador inactivo)      rechazada                       abandonada                         abandonada
```
Casos `propio` nacen en `aceptada`. **Sin reapertura**: una recaída es caso nuevo con `caso_anterior_id`. Toda transición → `historial` + mensaje `sistema` + evento de avisos. Transiciones permitidas por rol en `dominio/estados-caso.ts` (puro, con tests).

### 7.3 Roles y visibilidad

| Recurso | `superadmin` (env) | `bambu` | `derivador` |
|---|---|---|---|
| Casos / pacientes / propietarios | todo | todo | solo `casos.clinica_id = sesión.clinica_id` |
| Crear caso | sí | `propio` (nace aceptado) | `derivacion` de su clínica, `derivador_id = yo` |
| Editar caso | sí | siempre | solo `borrador`/`enviada` y de su clínica |
| Transiciones | todas | aceptar, rechazar, abandonar, alta | enviar, descartar borrador |
| Intervenciones | todo | CRUD con notas | lista (fecha, tipo, fisio) sin notas |
| Mensajes | todo | todo incl. `bambu` | solo `visibilidad='todos'`; escribe texto/adjunto (el servidor lo fuerza) |
| Informes | todo | crear, confirmar | leer confirmados |
| Transcripciones / propuestas | todo | sí | nada |
| Usuarios Bambú | sí | sí | no |
| Derivadores / clínicas | ver, asignar, desactivar | ver, asignar, desactivar | su perfil; invitar compañero |
| Configuración, KPIs | sí | sí | no |

Regla dura: **toda consulta de derivador lleva el filtro de clínica en SQL** (`ambitoCaso(sesion)` en `dominio/visibilidad.ts`), nunca en JS después. Fuera de ámbito → **404**, no 403. Un test por ruta.

### 7.4 Pantallas (móvil primero 390 px; barra inferior en móvil, lateral ≥ 900 px)

**Pública**: `/` landing (hero, serveis, instal·lacions, filosofia, «Com funciona», contacte desde `GET /api/publico/contacto`; **un solo CTA**) · `/acces` entrar / crear compte · `/acces/recupera` · `/acces/estableix/:token` (mismo formulario para alta, recuperación e invitación) · `/acces/verifica-correu` · `/legal/privacitat`.

**Derivador `/d`**: `/d` les meves derivacions (chips de estado, badge novetats, buscador, FAB «+ Nova derivació») · `/d/nova` wizard 3 pasos con **autoguardado de borrador** · `/d/casos/:id` pestañas Fil · Informes · Sessions · Fitxa · `/d/casos/:id/informes/:iid` (imprimible con `print.css`) · `/d/pacients` · `/d/perfil` (datos, clínica, cambiar contraseña, «Convida un company», tancar sessió) · campana de notificaciones en la cabecera.

**Bambú `/b`**: `/b` inici (contadores accionables: noves derivacions · casos sense notícies · informes pendents) · `/b/casos` filtros (estat, origen, clínica, fisio, espècie, text, novetats) · `/b/casos/:id` = el del vet + Notes internes, botones de transición, asignar fisio, «+ Sessió», **micrófono**, «Redacta informe» · `/b/casos/:id/informe/nou` (Regenera · Edita · Confirma i envia) · `/b/pacients`, `/b/pacients/:id` (casos + historial) · `/b/cliniques` · `/b/panell` KPIs · `/b/configuracio` (Equip, Contacte web, **Avisos**, Retenció) · `/b/perfil` · campana.

Estética: `web/src/disseny/tokens.css` con la paleta de la demo, radios 26/10 px, pill buttons, DM Sans + Manrope **servidas en local** (`/fonts`, PWA sin Google). Scripts de build heredados de forestal: `sense-emojis`, `contrast`, `rutes-absolutes`, `rutes-api`, `camps-16px`.

### 7.5 Flujos de email (nodemailer; dry-run con motivo; HTML + texto en `api/plantillas/correo/*.html`)

Servidor SMTP y remitente (`avisos@bambufisiovet.com`, Dondominio) desde el panel (D14), `CORREO_DRY_RUN=true` en local, enlaces absolutos con `URL_PUBLICA`. Todo envío → `avisos_enviados`. **Nunca inline**: cola + tarea de fondo (D13). Las plantillas no llevan contenido clínico.

| Evento | Destinatario | Plantilla / regla |
|---|---|---|
| Alta derivador | el vet | `verificacion` → `/acces/estableix/:token` (48 h); al consumir: login y redirige a `/d/nova`; reenvío 3/h |
| Alta usuario Bambú | el fisio | `invitacion-bambu` (7 días), mismo `/acces/estableix` |
| Invitación compañero | colega | `invitacion-clinica`, `datos.clinica_id` |
| Recuperación | el usuario | `recuperacion` (1 h); al consumir revoca otras sesiones; respuesta HTTP idéntica exista o no |
| Nueva derivación | `correo_a` de la matriz o `configuracion.avisos.correo_centro` | `derivacion-nueva` |
| Aceptada / rechazada | derivador autor (si `recibe_correos`) | `derivacion-resuelta` |
| Informe confirmado | derivador autor | `informe-nuevo`: resumen + enlace, **sin adjuntar el informe** |
| Actividad en el caso | la otra parte | `actividad-caso` con **regla anti-ruido**: un solo correo por caso y destinatario mientras tenga una notificación no leída de ese caso (§7.6) |
| Casos sin noticias | `correo_a` o `correo_centro` | `sin-noticias`: resumen diario, tarea al arrancar + cada 24 h |

_(Qué evento dispara email y a qué dirección pasa a ser **configurable** por la matriz de §7.6; la tabla de arriba son los valores por defecto sembrados.)_

### 7.6 Centro de notificaciones y matriz de eventos (D12, D13)

**Principio**: toda acción relevante publica un **evento de dominio dentro de la misma transacción** que la escritura. El evento, según la **matriz configurable en BD** (leída en cada publicación, sin caché → efecto inmediato), produce notificaciones internas (campana) y/o correos **encolados** que envía una tarea de fondo con reintentos. Los correos transaccionales de cuenta (verificación, recuperación, invitaciones) **no pasan por la matriz**: siempre se envían, por la misma cola. Sin websockets: la campana sondea `GET /notificaciones/resumen` cada 60 s y al recuperar el foco.

**Tablas** (migración `004_avisos.sql`):
- `eventos` (`tipo` de lista cerrada con CHECK, `caso_id`, `actor_id` NULL = sistema, `datos jsonb`, `creado`) — alimenta notificaciones, correos, «Últims moviments» del inicio y KPIs.
- `configuracion_avisos` (la matriz; una fila por evento, sembrada): `evento PK · audiencia IN ('bambu','derivador','ambas')` (fija) `· notificacion bool · correo bool · correo_a text NULL` (solo audiencia Bambú; NULL = `configuracion.avisos.correo_centro`).
- `notificaciones` (`usuario_id`, `evento_id`, `caso_id`, `titulo`, `cuerpo`, `enlace` ruta SPA, `leida_el`). Las «novetats» de un caso son `COUNT(*) WHERE caso_id AND usuario_id AND leida_el IS NULL` (sustituye a `lecturas_caso`).
- `correos_pendientes` (`evento_id` NULL en transaccionales, `destinatario`, `plantilla`, `datos`, `estado IN ('pendiente','enviado','fallido','descartado')`, `intentos`, `proximo_intento`, `error`).
- `avisos_enviados` (traza por intento y canal: `canal IN ('correo','notificacion','whatsapp')`, `enviado`, `motivo`: dry-run, SMTP, «recibe_correos=false», «ya tiene notificación no leída»).
- `usuarios.recibe_correos bool` («Rebre avisos per correu», interruptor único del derivador; la campana no se apaga).

**Lista cerrada de eventos v1** (defaults sembrados; Bambú los cambia en vivo):

| Evento | Audiencia | Notif. | Correo | Plantilla |
|---|---|---|---|---|
| `derivacion.enviada` | bambu | sí | sí → `correo_a` | `derivacion-nueva` |
| `derivacion.aceptada` / `.rechazada` | derivador | sí | sí | `derivacion-resuelta` |
| `caso.fisio_asignado` | bambu (el fisio) | sí | no | `caso-asignado` |
| `caso.en_tratamiento` | derivador | sí | no | `caso-estado` |
| `caso.alta` / `caso.abandonado` | derivador | sí | sí | `caso-estado` |
| `mensaje.nuevo` / `adjunto.nuevo` | ambas (la otra parte) | sí | sí | `actividad-caso` |
| `intervencion.registrada` | derivador | sí | no | `actividad-caso` |
| `informe.publicado` | derivador | sí | sí | `informe-nuevo` |
| `paciente.ficha_modificada` | ambas | sí | no | `actividad-caso` |
| `usuario.derivador_alta` | bambu | sí | sí → `correo_a` | `usuario-nuevo` |
| `usuario.solicita_union` | bambu + compañeros de la clínica | sí | sí → `correo_a` | `solicitud-union` (con botones Aprova / Rebutja → enlace a la app) |
| `usuario.union_resuelta` | derivador (el solicitante) | sí | sí | `union-resuelta` |
| `usuario.bambu_alta` | bambu | sí | no | `usuario-nuevo` |
| `caso.sin_noticias` | bambu | sí | sí → `correo_a` (un resumen diario) | `sin-noticias` |

**Destinatarios** (`avisos/destinatarios.ts`, función pura con tests; **siempre excluye al actor**): audiencia Bambú → `fisio_responsable_id` si existe, si no todos los `bambu` activos (para `derivacion.enviada` y `usuario.*`, todos); audiencia derivador → `derivador_id` + compañeros de clínica que hayan escrito en el hilo, correo solo con `recibe_correos=true`; `ambas` → el lado contrario al actor. **Regla anti-ruido** (mensajes, adjuntos, intervenciones, ficha): no se encola correo si el destinatario ya tiene una notificación no leída del mismo caso; abrir el caso las marca leídas y el siguiente evento vuelve a enviar.

**Módulo `api/src/avisos/`**: `eventos.ts` (catálogo cerrado `{tipo, audiencia, plantilla, titulo(datos), cuerpo(datos), enlace(datos, rol)}` con `as const`) · `publicar.ts` (`publicarEvento(cliente, {tipo, casoId, actorId, datos})` con el `ClientePg` de la transacción; tras COMMIT la ruta llama a `cola.despertar()`) · `destinatarios.ts` · `matriz.ts` (lectura/escritura zod, semilla de las filas con `ON CONFLICT DO NOTHING`) · `cola.ts` (bucle en el mismo proceso: cada 15 s o al despertar, `SELECT … WHERE estado='pendiente' AND proximo_intento<=now() ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`; reintentos a 1, 5, 30, 120, 720 min; al 6.º → `fallido`; dry-run cuenta como enviado con motivo; al arrancar se reanuda lo pendiente) · `canales/correo.ts` (interfaz `Canal { enviar(pendiente) }` con nodemailer; `canales/whatsapp.ts` en v2 = una columna más en la matriz).

**UI**: componente `Campana` en el `Esquelet` de ambas zonas (badge rojo con número, 99+; desplegable ≥ 900 px o página `/d|/b/notificacions`; pulsar una entrada la marca leída y navega a `enlace`; abrir un caso marca leídas las suyas). Pantalla **Configuració → Avisos** (Bambú): «Correu del centre per als avisos»; **matriz** con una fila por evento (etiqueta del diccionario + a quién va) y columnas Notificació ☐ · Correu ☐ · Correu a (editable solo en filas Bambú; vacío = correo del centro), guardado por fila; al pie **«Cua de correus»** (pendientes/fallidos 24 h, «Reintenta», último error) y aviso si `CORREO_DRY_RUN` está activo. Perfil del derivador: interruptor `recibe_correos`. Inicio de Bambú: contador de no leídas + «Últims moviments» desde `eventos`.

**Columnas añadidas por el diseño**: `casos.ultima_actividad` (orden de listas), `intervenciones.resumen_veterinario` (una línea opcional que sí ve el vet).

### 7.7 Flujo del informe por voz

Piezas: `api/src/llm/{tipos,factory,anthropic,openai,transcripcion}.ts` (contrato `extraer({sistema, texto, herramienta, maxTokens})`, sin bucle) y `api/src/informes/{esquema,prompt,render,propuestas}.ts`.

1. **Dictar**: `Microfono.tsx` (de happydog: mantener pulsado / deslizar para fijar / papelera / barras de volumen / descartar al desmontar) → `POST /api/casos/:id/transcripciones` (≤ 10 MB). Servidor guarda audio en `RUTA_DATOS/audios/<hex>.webm`, vocabulario = nombre del paciente + raza + `VOCABULARIO_BASE` (TENS, làser, hidroteràpia, propiocepció, goniometria, TPLO…), Whisper `language=ca`, inserta `transcripciones`. El fisio puede corregir el texto (`PATCH`). Las transcripciones **no** son mensajes visibles al vet.
2. **Proponer**: `POST /api/casos/:id/propuestas-informe {tipo, transcripcion_ids?, instrucciones?}`. Contexto al modelo (sin propietario ni vet): paciente, caso, intervenciones del periodo, transcripciones, informe anterior. Una llamada con herramienta forzada `redactar_informe`, esquema estricto: `resumen`, `hallazgos[]`, `tratamiento_realizado[]`, `evolucion`, `plan`, `recomendaciones_veterinario[]`, `proxima_revision?`, **`dudas[]`** (lo que el dictado no deja claro: nunca se rellena, se pregunta); para `alta` además `estado_al_alta`, `pautas_domicilio`. Sistema: «redacta en valencià, tono clínico, sin inventar nada que no esté en las notas». zod valida; `render.ts` genera la `ficha` determinista; fila `pendiente` con traza.
3. **Pantalla**: ficha por secciones, `dudas` en ámbar arriba. **Regenera** (cancela la original `WHERE estado='pendiente'`, crea otra con `propuesta_origen_id`, instrucciones opcionales) · **Edita** (formulario de secciones → **vuelve a proponer sin modelo**, original `corregida`) · **Confirma i envia** (transacción: `UPDATE … WHERE estado='pendiente'` → 409 si rowCount 0; `INSERT informes`; mensaje `informe` en el hilo; si `alta` → `casos.estado='alta'`; `historial`; publica `informe.publicado` en la misma transacción (y `caso.alta` si procede); tras COMMIT despierta la cola).
4. **Qué recibe el vet**: notificación + email con resumen y enlace; informe en el hilo y en Informes, imprimible; puede responder en el hilo.
5. **Retención**: tarea diaria borra audios > `retencion.audio_dias` (texto se conserva).
6. **Sin IA** (sin claves): micro y «Redacta amb IA» se ocultan; «Redacta a mà» crea una propuesta sin modelo y sigue el mismo confirmar. La app nunca depende de la IA para operar.

### 7.8 Funcionalidades: v1 / v2 / descartadas

**v1**: hilo por caso con eventos de sistema · notas internas Bambú · borrador autoguardado · invitar compañero · adjuntos 12 MB con miniaturas · informe por voz proponer/confirmar · informe a mano · imprimir informe (`@media print`) · alerta casos sin noticias · historial por fila · contacto web desde BD · PWA · centro de notificaciones + matriz configurable · KPIs.

**v2**: push PWA · WhatsApp (aviso de informe / mensaje) · asistente de datos sobre la BD (plantilla DATOS) · chat FAQ público · invitar al veterinario desde un paciente propio (palanca comercial) · informe de alta para el propietario en lenguaje llano · plantillas de derivación por patología · castellano · export xlsx · PDF en servidor · purga física.

**Descartadas**: portal del propietario (el foco es el vet; duplica RGPD) · vídeo como fichero (enlace externo en v1) · facturación · integración con software veterinario (sin API estándar) · 2FA/SSO · modo oscuro · agenda (solo si piden sustituir la suya).

**KPIs** (`/b/panell`, seis, cada uno mueve una decisión): derivaciones por mes y por clínica (top 10) · tiempo de respuesta mediano `enviado_el → resuelto_el` · embudo enviadas → aceptadas → primera sesión → alta (90 días) · casos activos por estado · sesiones por caso y duración hasta el alta por motivo · casos sin noticias > N días e informes pendientes. Nada de ingresos, tartas ni NPS.

### 7.9 Estructura de carpetas

```
bambu-fisiovet/
├─ CLAUDE.md · README.md · Dockerfile (multi-stage: web build → deps → runtime strip-types + tini)
├─ docker-compose.yml (local) · docker-compose.dokploy.yml (aislamiento ${CLIENT_KEY}) · .env.example
├─ docs/ cuaderno-decisiones.md · rgpd.md · referencia-demo/ (html+css de la demo)
├─ openspec/ config.yaml · specs/{acceso,casos,hilo,informes,avisos,configuracion,diseno,panel}/spec.md · changes/
├─ api/
│  ├─ package.json (fastify, @fastify/{cookie,multipart,rate-limit,static}, pg, zod, nodemailer, sharp, @anthropic-ai/sdk, openai)
│  ├─ comprova-produccio.ts · migrations/ · plantillas/correo/*.html · seed/{sembrar,datos}.ts
│  ├─ src/ servidor.ts config.ts errores.ts superadmin.ts
│  │   auth/{contrasena,sesion,tokens,permisos}.ts · db/{pool,migraciones,historial,repos/*}.ts
│  │   dominio/{estados-caso,visibilidad,validacion-derivacion,informe-render}.ts   (puro, sin pg/HTTP)
│  │   correo/{enviar,plantilla}.ts · avisos/{eventos,publicar,cola}.ts · ficheros/{adjuntos,miniaturas,audios}.ts
│  │   llm/{tipos,factory,anthropic,openai,transcripcion}.ts · informes/{esquema,prompt,propuestas}.ts
│  │   tareas/{sin-noticias,retencion,correos}.ts · rutas/*.ts
│  └─ test/*.test.ts (node:test; `DATABASE_URL_TEST`)
└─ web/
   ├─ package.json (react 19, react-router 7, vite 7, vite-plugin-pwa, lucide-react, recharts lazy)
   ├─ public/fonts/ (DM Sans + Manrope woff2) · scripts/*.mjs
   └─ src/ main.tsx App.tsx api.ts · i18n/{va,index}.ts · disseny/{tokens,base,components,print}.css
       components/{Esquelet,BarraInferior,Chip,Hoja,Microfono,FichaConfirmacion,SubidorAdjuntos,HiloMensajes,Campana,…}.tsx
       pantallas/{publico,acceso,derivador,bambu}/…
```

### 7.10 Superficie de API (`/api`; `pub` sin sesión, `*` cualquier sesión con ámbito, `D` derivador, `B` bambu/superadmin)

- **Público**: `GET /publico/contacto`, `GET /salud`.
- **Auth** (rate limit 10/min/IP en `pub`): `POST /auth/registro` · `POST /auth/entrar` · `POST /auth/salir` · `GET /auth/yo` · `POST /auth/recupera` · `GET /auth/tokens/:token` (tipo y validez sin consumir) · `POST /auth/establece-contrasena` · `POST /auth/reenvia-verificacion` (3/h) · `POST /auth/cambia-contrasena` (revoca otras sesiones) · `PATCH /auth/perfil`.
- **Usuarios/clínicas**: `GET|POST /usuarios` (B) · `PATCH /usuarios/:id` (B) · `POST /usuarios/:id/reenvia-invitacion` (B) · `GET /clinicas` (B) · `GET /clinicas/mia` (D) · `PATCH /clinicas/:id` · `POST /clinicas/mia/invitaciones` (D) · `GET /clinicas/:id/usuarios` (B) · `GET /clinicas/sugerencias?nombre&email` (pub, en el alta: coincidencias difusas / por dominio) · `POST /clinicas/:id/solicitudes-union` (D) · `GET /solicitudes-union?estado=pendiente` (B, o D de su clínica) · `POST /solicitudes-union/:id/{aprueba,rechaza}` (B, o D de la clínica destino; aprobar = transacción que mueve usuario y casos y publica `usuario.union_resuelta`).
- **Pacientes/propietarios**: `GET /pacientes?q=` · `POST /pacientes` · `GET|PATCH /pacientes/:id` · `PATCH /propietarios/:id` · `GET /pacientes/:id/historial`.
- **Casos**: `GET /casos?estado&origen&clinica_id&fisio_id&especie&q&novedades` · `POST /casos` · `GET|PATCH /casos/:id` · `POST /casos/:id/{envia,acepta,rechaza,abandona,alta-manual,leido}` · `GET /casos/:id/historial` (B).
- **Hilo/adjuntos**: `GET|POST /casos/:id/mensajes` · `POST /casos/:id/adjuntos` (multipart ≤ 12 MB) · `GET /adjuntos/:id/{fichero,miniatura}` (stream con permisos) · `DELETE /adjuntos/:id` (lógico).
- **Intervenciones**: `GET|POST /casos/:id/intervenciones` (D sin notas) · `PATCH /intervenciones/:id` (B).
- **Voz e informes** (B salvo lectura): `POST|GET /casos/:id/transcripciones` · `PATCH /transcripciones/:id` · `POST /casos/:id/propuestas-informe` · `GET /propuestas-informe/:id[/edicion]` · `POST /propuestas-informe/:id/{edita,regenera,cancela,confirma}` · `GET /propuestas-informe?estado=pendiente` · `GET /casos/:id/informes` (*) · `GET /informes/:id` (*) · `POST /casos/:id/informes/manual`.
- **Notificaciones** (*): `GET /notificaciones?solo_no_leidas&limite&antes_de` · `GET /notificaciones/resumen` → `{no_leidas}` · `POST /notificaciones/:id/leida` · `POST /notificaciones/leidas` (todas). Además `GET /casos/:id/eventos` (B) para «Últims moviments» y `POST /casos/:id/asigna-fisio` (B).
- **Configuración/avisos/panel** (B): `GET /configuracion` · `PUT /configuracion/:clave` (zod por clave) · `GET /configuracion/avisos` (matriz + `correo_centro` + `dry_run`) · `PUT /configuracion/avisos/:evento` `{notificacion, correo, correo_a}` · `GET /configuracion/avisos/cola?estado` · `POST /configuracion/avisos/cola/:id/reintenta` · `GET /panel/indicadores?desde&hasta` · `GET /panel/inicio`.

Errores uniformes `{error}` con `ErrorHttp` (forestal).

## 8. Plan de arranque y orden de changes

**Fase 3 — init técnico** (el repo ya tiene git; se sustituyen `bambu.html` y el Dockerfile de nginx):
1. `.gitignore` (node, dist, .env, datos), `openspec init`.
2. `CLAUDE.md` a mano: qué es en 3 líneas, punteros a plantillas y al cuaderno, convenciones, el hábito del revisor al cerrar cada change, la trampa de `--experimental-strip-types`.
3. `docs/cuaderno-decisiones.md` ← este fichero (§1-§7 + §10 de riesgos). `docs/referencia-demo/` con `index.html`, `derivar.html`, `admin.html`, `style.css`, `main.js` de la demo (volver a descargar con curl; `/tmp` no es persistente) y el logo.
4. Estructura de carpetas §7.9 vacía. Primer commit.

**Fase 4 — especificar**: escribir **las specs de openspec** (lo pidió Nando) y el primer change:
- `openspec/specs/{acceso,casos,hilo,informes,avisos,configuracion,diseno,panel}/spec.md` con requisitos y escenarios derivados de §7 (una capacidad por carpeta; los escenarios son los tests de visibilidad, transiciones, tokens de un uso, lease atómico, matriz de avisos…).
- Change 1 `fundamentos-acceso-y-avisos`: `proposal.md` (con el dictamen §4 y los supuestos §6 marcados), `design.md`, `tasks.md`, `specs/` delta.
- **Gate**: Nando valida la proposal antes de escribir código. Entonces fase 5 con Opus; el revisor, con otro modelo.

**Fase 5 — changes en orden** (cada uno acaba con `npm test`, `typecheck`, `comprova-produccio`, `web build`, recorrido HTTP con `curl -c`, y el agente `revisor` con modelo distinto al que programó):

1. **`fundamentos-acceso-y-avisos`** (deja algo desplegable: landing viva, cuentas, campana y matriz): esqueleto api/web desde forestal (`servidor.ts`: migraciones → semilla → superadmin → rutas → tareas → SPA; `config.ts` zod; `comprova-produccio.ts`) · migraciones 001-004 · semilla (`configuracion` + las filas de `configuracion_avisos`) y superadmin por email desde env · `auth/` (scrypt, sesión en BD, tokens de un uso, rate limit; tests: 401 uniforme, token dos veces → 400, cambio de contraseña revoca, 429 al undécimo) · `correo/` (nosolodulce) + **`avisos/`** completo (catálogo, `publicarEvento` en transacción, `destinatarios` puro, `matriz`, `cola` con `SKIP LOCKED` y reintentos; tests: `notificacion=false` no crea filas, `correo=false` no encola, `correo_a` manda sobre `correo_centro`, `recibe_correos=false` deja traza, SMTP caído → `intentos=1` y `proximo_intento` futuro, cambiar la matriz afecta al siguiente evento sin reiniciar, reinicio reanuda pendientes) · rutas auth/usuarios/clinicas (invitación, **sugerencias de clínica en el alta y solicitudes de unión** con aprobación por compañero o Bambú, auto-aprobación por dominio de correo; migración `001` incluye `solicitudes_union` y `clinicas.dominio_correo`; tests: dominio coincidente → unido sin aprobación; Gmail → pendiente; aprobar mueve los casos de la clínica provisional; rechazar la deja independiente)/publico/configuracion/configuracion-avisos (+cola)/notificaciones; eventos `usuario.*` · web: tokens, `Esquelet` con `Campana`, `ListaNotificaciones`, i18n, pantallas públicas y de acceso, perfil con `recibe_correos`, Configuració (Equip, Contacte web, **Avisos** con `MatrizAvisos` y cola) · Dockerfile, composes, `.env.example`, `CLAUDE.md`. Verificación: contenedor arriba, landing visible, alta de derivador en dry-run → `correos_pendientes` a `enviado` con traza `dry-run`, y al verificar el vet aparece una notificación en la campana de Bambú.
2. **`casos-y-derivaciones`**: migración 005 · `dominio/estados-caso`, `validacion-derivacion`, `visibilidad` con tests puros (A pide caso de B → 404) · rutas pacientes/propietarios/casos (CRUD, transiciones, `asigna-fisio`, `leido`), cada escritura con `historial` + `publicarEvento` · plantillas `derivacion-nueva`, `derivacion-resuelta`, `caso-estado`, `caso-asignado` · tests: enviar derivación → notificación a todos los bambu + un correo a `correo_a`; aceptar → notificación y correo al vet autor; el actor nunca se notifica a sí mismo · web `/d`, `/d/nova` (autoguardado), `/d/casos/:id` Fitxa, `/d/pacients`, `/b`, `/b/casos` (filtro «amb novetats»), `/b/casos/:id` transiciones, `/b/pacients`, `/b/cliniques`, puntos rojos por caso · semilla `--demo` · recorrido: registro → contraseña → nova derivació → envia → campana Bambú → accepta → campana vet.
3. **`hilo-adjuntos-y-sesiones`**: migración 006 (+ `casos.ultima_actividad`) · `ficheros/adjuntos` (magic bytes, sha256, miniaturas sharp fuera del event loop; test: `.exe` como `.pdf` → 400) · rutas mensajes/adjuntos (stream protegido)/intervenciones (1ª → `en_tratamiento` + evento) · eventos `mensaje.nuevo`, `adjunto.nuevo`, `intervencion.registrada`, `caso.en_tratamiento`; mensajes `sistema` en transiciones y ediciones de ficha · tests: vet no ve `bambu`, no descarga adjunto ajeno, **anti-ruido**: dos mensajes sin leer → dos notificaciones pero un solo correo; abrir el caso rearma el correo · tarea `sin-noticias` + evento + plantilla; contador en Inici · web `HiloMensajes`, compositor con clip y vista previa optimista, Sessions, Notes internes, «Últims moviments».
4. **`informes-por-voz`**: migración 007 · `llm/` con adaptador falso inyectable por `Deps` · `informes/esquema,prompt` (test: ningún dato del dueño/vet en el prompt) y `dominio/informe-render` · `propuestas` con lease atómico (tests: doble confirmar → 409; editar deja `corregida` + nueva `pendiente`; confirmar alta cambia estado y publica `informe.publicado` + `caso.alta`) · rutas transcripciones/propuestas/informes/manual · tarea `retencion` de audios · plantilla `informe-nuevo` · web `Microfono`, transcripciones editables, `/b/casos/:id/informe/nou` con `FichaConfirmacion` (estados cargando/fallo separados), informe con `print.css`, pestaña Informes del vet, contador «informes pendents» · banco manual con 5 dictados reales en valenciano.
5. **`panel-e-indicadores`**: SQL de los 6 KPIs con tests de números exactos sobre semilla · `GET /panel/*` · `/b/panell` con recharts lazy y tarjetas que enlazan a `/b/casos?filtro` · `docs/rgpd.md` cerrado · archivo de changes.

**Fase 6-7**: despliegue en Dokploy con `desplegar-dokploy` (un contenedor + Postgres propio + volumen `/datos`), `CORREO_DRY_RUN=true` el primer día, Bambú prueba antes del cutover; destilar el cuaderno a `PLANTILLA-PORTAL-GESTION.md` (familia nueva).

## 9. Verificación

- **Sin red**: `npm test` en `api/` (dominio puro: transiciones, visibilidad, validación, render; auth: tokens de un uso, revocación, rate limit; adjuntos: magic bytes; propuestas: lease; prompt sin datos de propietario; correo en dry-run; KPIs con números exactos). Regla de la casa: cada arreglo se verifica quitándolo y viendo el test en rojo.
- **Costuras**: recorrido HTTP con `curl -c` por change (registro → token → contraseña → derivación → aceptación → mensaje → adjunto → informe → notificación/email en `avisos_enviados`); `comprova-produccio` en la build de la imagen; scripts de web (`contrast`, `rutes-api`, `camps-16px`).
- **Con modelo real**: banco manual de dictados en valenciano (qué devolvió en `dudas`, que no inventa); comparar `MODELO_INFORME` por variable.
- **En navegador** (Chrome, con Nando): móvil 390 px y escritorio; campana con badge; micro en HTTPS.
- **Despliegue**: `/salud`, logs de Dokploy, un alta real en dry-run, luego `CORREO_DRY_RUN=false`.

## 10. Riesgos y supuestos a validar con Nando / Bambú

1. **RGPD**: datos del propietario y del vet son personales; Bambú responsable; consentimiento versionado en la derivación; política de privacidad, cláusula en el alta, contratos de encargado con hosting, SMTP y **Anthropic/OpenAI** (transferencia internacional; minimización en el prompt; alternativa: proveedor UE vía el mismo contrato LLM). Validar con su asesor.
2. **Retención**: audios 30 días; adjuntos e informes 5 años tras el cierre (confirmar); copias de seguridad de `/datos` y Postgres: definir quién y dónde.
3. **Dominio y correo**: buzón `avisos@`, **SPF + DKIM + DMARC** publicados o los avisos a clínicas en Gmail/Outlook caen en spam; límite de envíos del proveedor.
4. **Un solo dominio HTTPS** (el micrófono lo exige); cookie `secure` en producción.
5. Promesa «< 24 h laborables» en la landing: el KPI la mide; decidir si se publica.
6. Buzón común de derivaciones vs todos los fisios (propuesta: buzón configurable + asignar fisio al aceptar).
7. Clínica como unidad de visibilidad: confirmar con los vets; v2 `visibilidad='privada'` si alguna lo rechaza. Vet que cambia de clínica: sus casos se quedan en la clínica.
8. Textos en valenciano y prompt: **revisión por hablante nativo** antes de producción.
9. Especies: lista cerrada + «otro»; ¿caballos?
10. Coste IA ~1-3 €/mes a volumen de un centro; sin claves la app funciona igual.
11. Lo que **no** va en v1 y hay que decir en la propuesta comercial: WhatsApp, agenda, portal del dueño, PDF servidor, push, castellano.
12. **Servidor** (pregunta de Nando, 31/10: Hetzner CPX12, 2 vCPU AMD, 2 GB, 40 GB SSD). En reposo: app ~150 MB + Postgres ~150 MB + Dokploy con Traefik, su Postgres y Redis ~600 MB ≈ 1 GB. Suficiente **si es solo para Bambú**, con tres condiciones: (a) swap de 2–4 GB o build de la imagen fuera (GitHub Actions), porque `vite build` + `tsc` + `sharp` piden 1–1,5 GB de golpe y matan el despliegue por falta de memoria; (b) limpieza periódica de imágenes Docker en Dokploy (lo que llena los 40 GB son las imágenes viejas, no los adjuntos); (c) copias de Postgres y de `/datos` fuera del servidor (Storage Box o S3). Para varios clientes en el mismo Dokploy, 4 GB.

## 11. Registro de aplazados

Lo que se decidió no hacer ahora, con el change o la condición que lo
reabre. Nada se aplaza sin apuntarlo aquí.

| Qué | Por qué no ahora | Cuándo se reabre |
|---|---|---|
| WhatsApp como canal de avisos | Número dedicado, QR o plantillas de Meta | v2: `avisos/canales/whatsapp.ts` + columna en la matriz |
| Push PWA (VAPID) | Primero medir si campana + correo bastan | Si Bambú o los vets lo piden |
| Asistente de datos sobre la BD (estilo happydog) | Sin histórico no hay preguntas que valgan | v2, con rol de BD de solo lectura sobre vistas |
| Chat FAQ público | Sin contenido real que responder todavía | v2 |
| Invitar al veterinario desde un paciente propio | Palanca comercial; requiere consentimiento del dueño | v2 |
| Informe de alta para el propietario en lenguaje llano | Después de validar el informe clínico | v2 |
| Plantillas de derivación por patología | Esperar a ver los motivos reales | v2 |
| Castellano en la UI | Diccionario preparado desde v1 | Cuando se pida |
| Export xlsx y PDF en servidor | `@media print` cubre el «dame el PDF» | Si lo piden |
| Purga física de adjuntos y poda de eventos/notificaciones | Borrado lógico en v1 | Antes de un año en producción |
| Caso privado dentro de la clínica | Visibilidad por clínica decidida | Si una clínica lo exige (`casos.visibilidad`) |
| Fusionar clínicas duplicadas | La solicitud de unión cubre el caso normal | Si aparecen duplicadas en uso real |
| Límite de propuestas pendientes que caducan | Riesgo bajo con pocos fisios | Si se acumulan en el inicio |

## 12. Hallazgos y lecciones

_(Se rellena durante la construcción: lo que costó encontrar, para la futura
plantilla.)_
