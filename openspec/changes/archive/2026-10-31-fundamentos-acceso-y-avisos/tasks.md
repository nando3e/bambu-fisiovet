# Tasks — change `fundamentos-acceso-y-avisos`

Regla de la casa: cada task con su test; cada arreglo se verifica quitándolo
y viendo el test en rojo. Toda ruta nueva lleva su test de rol (y de ámbito
cuando haya datos de clínica). Se construye con Opus; al cerrar, el revisor
corre con otro modelo.

## 1. Esqueleto

- [x] 1.1 `api/` desde el molde de forestal: `package.json` (dependencias de
      la propuesta, scripts `dev`, `start` con `--experimental-strip-types`,
      `test`, `typecheck`, `comprova-produccio`, `sembrar`), `tsconfig.json`,
      `servidor.ts`, `config.ts` (zod, falla si falta `DATABASE_URL`,
      `SECRETO_SESION`, `CLAVE_CIFRADO` o `URL_PUBLICA`), `errores.ts`,
      `db/pool.ts` (con comprobación de conexiones antes de entregarlas),
      `GET /api/salud`. Test: el arranque con el entorno mínimo responde 200
      en `/api/salud`; sin `CLAVE_CIFRADO` falla con mensaje claro.
- [x] 1.2 `db/migraciones.ts` + `001_acceso.sql`, `002_configuracion.sql`,
      `003_historial.sql`, `004_avisos.sql`. Test: aplicar dos veces seguidas
      no da error ni duplica nada.
- [x] 1.3 `comprova-produccio.ts` copiado de forestal y en la build. Test:
      un fichero con `enum` hace fallar la comprobación.
- [x] 1.4 Soporte de tests: esquema temporal por fichero contra
      `DATABASE_URL_TEST`, `fastify.inject`, canal de correo falso, reloj
      inyectable.
- [x] 1.5 `web/` con Vite + React 19 + TS + React Router 7 + vite-plugin-pwa;
      el API sirve `web/dist` y hace fallback a `index.html` salvo en `/api`.
      Test: `GET /acces` devuelve el HTML de la SPA; `GET /api/no-existe`
      devuelve 404 JSON.

## 2. Contraseñas, sesiones y superadmin

- [x] 2.1 `auth/contrasena.ts` (scrypt, hash ficticio para tiempo constante)
      y `dominio/contrasena-valida.ts` (≥ 10 caracteres, distinta del correo).
      Tests puros.
- [x] 2.2 `auth/sesion.ts` + repo: crear, validar (usuario activo), renovar,
      revocar una, revocar todas menos la actual. `auth/permisos.ts` con
      `exigirSesion` y `exigirRol`. Tests: cookie reutilizada tras salir → 401;
      usuario desactivado → 401.
- [x] 2.3 `superadmin.ts`: fila `es_de_entorno` creada o renombrada al
      arrancar; login por comparación en tiempo constante contra el entorno;
      choque con el correo de un usuario normal → arranque falla. Tests:
      cambiar `SUPERADMIN_CONTRASENA` → entra la nueva y no la vieja; sin
      variable no se puede entrar y el log lo dice; cambiar el usuario
      renombra, no duplica.
- [x] 2.4 `POST /api/auth/entrar` (correo o usuario), `POST /api/auth/salir`,
      `GET /api/auth/yo`, freno de 10/min por dirección en las rutas
      públicas. Tests: inexistente y contraseña errónea dan el mismo 401 y el
      mismo cuerpo; sin verificar → 401 genérico; undécimo intento → 429.

## 3. Correo y avisos

- [x] 3.1 `cifrado.ts` (AES-256-GCM `v1:iv:tag:dato`). Tests: ida y vuelta;
      clave distinta → error controlado; dos cifrados del mismo texto son
      distintos.
- [x] 3.2 `correo/plantilla.ts` (de nosolodulce: HTML + texto, asunto del
      `<title>`) y `correo/transporte.ts` (desde la config de BD, caché por
      huella). Plantillas en valenciano: `verificacion`, `recuperacion`,
      `invitacion-bambu`, `invitacion-clinica`, `alta-existente`,
      `usuario-nuevo`, `solicitud-union`, `union-resuelta`. Test: cada
      plantilla renderiza, tiene `<title>`, enlace absoluto con `URL_PUBLICA`
      y ninguna variable sin sustituir.
- [x] 3.3 `avisos/eventos.ts` con el catálogo de v1 completo y semilla de
      `configuracion_avisos`. Tests: la lista del código y la del CHECK de la
      migración son iguales; la semilla no pisa una fila editada; publicar un
      tipo desconocido lanza.
- [x] 3.4 `avisos/destinatarios.ts` (puro). Tests de cada audiencia: excluye
      al actor; fisio responsable frente a todos los bambu; participantes del
      hilo; destinatarios de `usuario.solicita_union`.
- [x] 3.5 `avisos/publicar.ts` dentro de la transacción del llamante, con
      matriz, `correo_a`, `recibe_correos` y regla anti-ruido. Tests: rollback de
      la acción → sin evento, notificaciones ni correos; `notificacion=false`
      no crea filas; `correo=false` no encola; `correo_a` manda sobre el
      correo del centro; `recibe_correos=false` deja la traza con su motivo; dos
      eventos anti-ruido sin leer → dos notificaciones y un correo; después de
      leer vuelve a encolar; cambiar la matriz afecta al siguiente evento sin
      reiniciar.
- [x] 3.6 `avisos/cola.ts` + `canales/correo.ts`: lotes con `SKIP LOCKED`,
      reintentos 1/5/30/120/720 min, `fallido` al sexto intento, `en_curso`
      que caduca, reanudación al arrancar, dry-run y `smtp sin configurar`
      con su motivo. Los correos de cuenta no pasan por la matriz. Tests con
      reloj falso: el SMTP caído deja `intentos=1` y el próximo intento en el
      futuro; dos colas a la vez envían cada correo una sola vez; con
      `CORREO_DRY_RUN=true` no se llama al canal real.

## 4. Cuentas y clínicas

- [x] 4.1 `auth/tokens.ts` + repo: emitir (invalida los anteriores del mismo
      tipo), consultar sin consumir, consumir de forma atómica. Tests: dos
      consumos simultáneos → uno gana; caducado → 400; consumido → 400.
- [x] 4.2 `POST /api/auth/registro` con clínica provisional, `dominio_correo`
      (si no es genérico), privacidad aceptada con versión; correo ya
      registrado → misma respuesta y `alta-existente` al dueño.
      `POST /api/auth/reenvia-verificacion` (3/h). Tests de los escenarios
      de la spec.
- [x] 4.3 `GET /api/auth/tokens/:token` y `POST /api/auth/establece-contrasena`
      para verificación, invitación y recuperación; publica
      `usuario.derivador_alta` / `usuario.bambu_alta` al verificar. Tests:
      redirección por rol; contraseña corta → 400 y el token sigue sin usar.
- [x] 4.4 `POST /api/auth/recupera` (respuesta idéntica exista o no, nada
      para el superadmin) y revocación de sesiones al consumirla.
      `POST /api/auth/cambia-contrasena` (revoca las demás). `PATCH
      /api/auth/perfil`. Tests de la spec.
- [x] 4.5 `rutas/usuarios.ts`: listar, invitar, reenviar invitación,
      desactivar y reactivar (revoca sesiones; el superadmin no se toca).
      Tests de rol: derivador → 403.
- [x] 4.6 `dominio/dominios-genericos.ts` y `dominio/union-clinica.ts`
      (auto, pendiente, no_permitida). Tests puros.
- [x] 4.7 `rutas/clinicas.ts`: `GET /clinicas/mia`, sugerencias (trigram +
      dominio, máximo 5, solo nombre y población, con freno), solicitar
      unión, listar, aprobar y rechazar (`fusionarClinica` en transacción,
      eventos), invitar compañero. Tests: dominio coincidente → unido sin
      pendiente; Gmail → pendiente; un compañero aprueba → mueve al usuario
      y desactiva la provisional; un ajeno → 404; clínica provisional con
      compañeros → 409.

## 5. Configuración y notificaciones

- [x] 5.1 Repo de configuración con esquema zod por clave (`contacto`,
      `avisos`, `retencion`, `correo_servidor`), semilla que no pisa,
      `historial` en cada cambio. `GET /api/publico/contacto` sin campos
      vacíos. Tests: derivador → 403; teléfono inválido → 400.
- [x] 5.2 `GET|PUT /api/configuracion/avisos` (matriz + correo del centro +
      indicador de dry-run), `GET /api/configuracion/avisos/cola`,
      `POST …/cola/:id/reintenta`. Tests de la spec.
- [x] 5.3 `GET|PUT /api/configuracion/correo` y
      `POST /api/configuracion/correo/prueba`, solo superadmin, con la
      contraseña nunca devuelta y conservada si llega vacía. Tests: `bambu`
      → 403; la respuesta no contiene ni la contraseña ni su cifrado; el
      error del SMTP de prueba llega a la respuesta.
- [x] 5.4 `rutas/notificaciones.ts`: lista con filtro y paginación,
      resumen, marcar una, marcar todas. Test: la notificación de otro → 404.

## 6. Web

- [x] 6.1 `disseny/tokens.css`, `base.css` y `components.css` con la paleta
      y la tipografía de la referencia; fuentes woff2 en `public/fonts`; logo
      recortado en círculo; favicon e iconos PWA generados del logo.
- [x] 6.2 Scripts de build (de forestal, adaptados): `sin-emojis`,
      `contraste`, `variables-css` (usadas frente a definidas),
      `rutas-absolutas`, `rutas-api` (cada ruta que llama la web existe en el
      API), `campos-16px`. La build falla si alguno falla. Comprobar cada uno
      metiendo a propósito el fallo que caza.
- [x] 6.3 `i18n/va.ts` + `t()` con claves tipadas; `api.ts`; contexto de
      sesión; `App.tsx` con guardas por rol.
- [x] 6.4 `Esquelet`, `Cabecera` con logo y `Campana` (sondeo 60 s y al
      volver a la pestaña, 99+), `ListaNotificaciones`, navegación inferior
      (< 900 px) y lateral (≥ 900 px), `AvisoVersion` de la PWA.
- [x] 6.5 Landing (`/`): hero, serveis, instal·lacions, filosofia, «Com
      funciona», contacte desde la API; solo dos enlaces a `/acces`
      (cabecera y hero); animaciones de la referencia respetando
      `prefers-reduced-motion`.
- [x] 6.6 Acceso: `/acces` (Entra / Crea un compte con sugerencias de
      clínica y «Sol·licita unir-te»), `/acces/recupera`,
      `/acces/estableix/:token`, `/acces/verifica-correu`.
- [x] 6.7 Zona común: perfil (datos, contraseña, «Rebre avisos per correu»,
      clínica, invitar compañero, solicitudes de unión pendientes para el
      derivador), notificaciones. Inicio provisional del derivador.
- [x] 6.8 Zona Bambú: inicio (contador de no leídas) y Configuració con
      pestañas Equip, Contacte web, Avisos (matriz + cola + aviso de
      dry-run), Servidor de correu (solo superadmin) y Retenció.
- [x] 6.9 Recorrido a 390 px y a 1280 px en Chrome: sin scroll
      horizontal, campana, navegación, landing. (Hecho por Claude; queda el
      recorrido con Nando sobre el despliegue.)
- [x] 6.10 Fotos de la web desde el panel (Configuració → Imatges de la
      web): portada e instalaciones, JPG/PNG/WebP hasta 8 MB validados por el
      contenido, nombre aleatorio y caché inmutable; fotos de serie mientras
      no se suba ninguna. Tests: PNG válida, ejecutable disfrazado → 400,
      derivador → 403, ruta con ../ → 404.
- [x] 6.11 Un fichero con extensión que no existe (JS de un despliegue
      anterior) responde 404, nunca el index: servir HTML como JavaScript deja
      la página en blanco. Test en arranque.

## 7. Despliegue y cierre

- [x] 7.1 `Dockerfile` multi-stage (web build → dependencias de producción
      del `package.json` → runtime con `--experimental-strip-types`, `tini`,
      usuario no root, healthcheck), `docker-compose.yml` local con Postgres,
      `.env.example` comentado.
- [x] 7.2 `docker-compose.yml` de producción (patrón de la casa, labels de
      Traefik con `APP_HOST`): `bambu-postgres` solo en `bambu-internal`,
      `bambu-app` en las dos redes, volúmenes `bambu-postgres-data` y
      `bambu-datos`. El de desarrollo pasa a `docker-compose.local.yml`.
- [x] 7.3 Recorrido HTTP con `curl -c` contra el contenedor local: alta →
      correo en dry-run con su enlace en la traza → establecer contraseña →
      `yo` → notificación `usuario.derivador_alta` en la campana de Bambú →
      recuperar → cambiar contraseña revoca la otra sesión.
- [x] 7.4 Despliegue en Dokploy (skill `desplegar-dokploy`) en un subdominio
      de pruebas con `CORREO_DRY_RUN=true`; `/api/salud` 200; logs limpios.
      Hecho: Compose `portal` en https://bambu-fisiovet.91-99-128-20.sslip.io,
      certificado Let's Encrypt, superadmin entra, cookie Secure. La web
      antigua de `bambufisiovet.com` sigue intacta (autodespliegue desactivado).
- [x] 7.5 `CLAUDE.md` con los comandos reales; cuaderno: hallazgos y
      aplazados nuevos.
- [x] 7.6 Agente `revisor` sobre el diff del change con un modelo distinto
      al que programó; corregir o justificar por escrito cada hallazgo.
      Hecho con Fable (dos pasadas): informe y resolución en `revision.md`.
