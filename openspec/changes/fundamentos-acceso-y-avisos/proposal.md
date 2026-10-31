## Why

BAMBÚ Fisiovet necesita un portal donde los veterinarios le deriven casos y le
den seguimiento. La demo que le ha enseñado un competidor (PHP + XAMPP en el
servidor de otra empresa, credencial impresa en la página, formulario anónimo
que guarda datos clínicos sin avisar a nadie) acierta en el aspecto y falla en
todo lo demás: no hay cuentas, ni correo, ni seguimiento, ni garantías.

Este primer change pone **los cimientos sobre los que se apoya todo lo demás**
y deja algo desplegable desde el primer día: la landing de Bambú viva en
`bambufisiovet.com`, el ciclo de vida completo de las cuentas por correo
(alta, verificación, recuperación, invitaciones, unión a clínica), el centro de
notificaciones con su campana y la matriz de avisos configurable. Sin estas
piezas, cada change posterior tendría que inventarse su propia forma de
identificar al usuario y de avisar; con ellas, los siguientes solo añaden
eventos y pantallas.

## What Changes

- **Esqueleto** de `api/` (Fastify + pg + zod + node:test) y `web/` (React 19 +
  Vite, PWA) copiado del molde de `forestalolotina`, servido en un solo
  contenedor, con migraciones numeradas que se aplican al arrancar, semilla que
  no pisa y la comprobación de `--experimental-strip-types` en la build.
- **Cuentas**: alta autónoma del veterinario con confirmación por correo y
  contraseña fijada desde el enlace; entrar y salir; cambiar la contraseña
  desde dentro (revoca las demás sesiones); recuperarla por correo; invitación
  de usuarios del equipo de Bambú; invitación de un compañero de clínica;
  sesiones en BD revocables; freno de intentos. **Superadmin fijo en el
  entorno** (`SUPERADMIN_USUARIO` + `SUPERADMIN_CONTRASENA` en claro): se
  compara contra el entorno en cada login, sin hash en BD; cambiar la variable
  y reiniciar devuelve el acceso.
- **Clínicas**: el alta crea una clínica provisional; si el nombre o el dominio
  de correo coinciden con una existente se ofrece **solicitar unirse**, que
  aprueba con un clic cualquier compañero o Bambú, o se aprueba sola si el
  dominio del correo es el de la clínica. El veterinario trabaja desde el
  primer minuto; al aprobarse, todo lo suyo pasa a la clínica.
- **Avisos**: módulo único `avisos/` con catálogo cerrado de eventos, matriz
  configurable en BD (notificación sí/no, correo sí/no, correo a…), centro de
  notificaciones con contador de no leídas, cola de correos con reintentos y
  traza, `CORREO_DRY_RUN`. Se siembra la matriz completa de v1 aunque la
  mayoría de eventos los publiquen changes posteriores.
- **Configuración** en el panel de Bambú: equipo (crear usuarios por
  invitación, desactivar), contacto de la web (lo que lee la landing), avisos
  (correo del centro, matriz, cola de correos), retención y, **solo para el
  superadmin, el servidor de correo** (SMTP de Dondominio: servidor, puerto,
  seguridad, usuario, contraseña, remitente, correo de prueba). La contraseña
  SMTP se guarda cifrada con una clave de entorno y nunca vuelve al navegador.
  Desvío motivado de «credenciales en env»: Nando quiere poder cambiarlo sin
  tocar el despliegue.
- **Diseño**: tokens de la paleta y tipografía de la demo, fuentes servidas en
  local, logo recortado, esqueleto con barra inferior en móvil y lateral en
  escritorio, campana en la cabecera, diccionario en valenciano, landing con
  un único acceso a «Deriva un cas».
- **Despliegue**: Dockerfile multi-stage, `docker-compose.yml` local y
  `docker-compose.dokploy.yml` con Postgres propio en la red interna
  `bambu-internal`.
- Se **retira** la landing estática anterior y su Dockerfile de nginx (ya
  movidos a `docs/referencia-anterior/` en el commit de arranque).

## Capabilities

### New Capabilities

- `acceso`: cuentas y sesiones — alta con verificación, entrar/salir,
  recuperación y cambio de contraseña, invitaciones, roles, superadmin por
  entorno, freno de intentos, clínicas y solicitudes de unión.
- `avisos`: eventos de dominio, matriz configurable, centro de notificaciones,
  cola de correos con reintentos, regla anti-ruido, traza de cada aviso.
- `configuracion`: ajustes de negocio en BD con efecto inmediato — contacto de
  la web, correo del centro, retención — y gestión del equipo de Bambú.
- `diseno`: identidad visual, esqueleto de navegación, diccionario en
  valenciano, landing pública y comprobaciones automáticas de la build.

### Modified Capabilities

_Ninguna: es el primer change del proyecto._

## Impact

- Código nuevo en `api/` y `web/`; migraciones `001_acceso` a `004_avisos`.
- Dependencias de producción del API: `fastify`, `@fastify/cookie`,
  `@fastify/multipart`, `@fastify/rate-limit`, `@fastify/static`, `pg`, `zod`,
  `nodemailer`. De la web: `react`, `react-dom`, `react-router`,
  `lucide-react`, `vite-plugin-pwa`. Sin SDK de LLM todavía (llega con
  `informes-por-voz`).
- Variables de entorno (las mínimas; el correo NO va aquí): `DATABASE_URL`,
  `SECRETO_SESION`, `CLAVE_CIFRADO` (cifra la contraseña SMTP guardada en BD),
  `URL_PUBLICA`, `SUPERADMIN_USUARIO`, `SUPERADMIN_CONTRASENA` (en claro),
  `CORREO_DRY_RUN` (si es `true`, ningún correo sale aunque el panel lo diga),
  `RUTA_DATOS`, `COOKIE_SEGURA`.
- Infraestructura: proyecto nuevo en Dokploy con app + Postgres 16 propio,
  dominio `bambufisiovet.com` (y `www`) apuntando a Traefik; buzón
  `avisos@bambufisiovet.com` en **Dondominio** con SPF, DKIM y DMARC.

## Dictamen de arquitectura

Copiado del cuaderno (§4), como pide la regla del proyecto.

1. **¿Código o n8n?** Código. Es una aplicación con estado, roles, sesiones y
   expedientes; los avisos también van en el mismo proceso (nodemailer con
   dry-run y trazas es más simple y testeable que un flujo externo).
2. **¿Bucle propio o framework de agentes?** En v1 no hay agente: el informe
   es una llamada con herramienta forzada y esquema estricto. El asistente de
   v2 será bucle propio.
3. **¿Cómo llega el conocimiento al modelo?** Inyectado en el prompt y
   compuesto en código de estable a volátil. Nada de RAG ni de índice.
4. **¿Un agente o varios?** No aplica en v1; en v2, uno con todas las tools.
5. **Stack**: Node 22 · TypeScript · Fastify 5 · `pg` con SQL a mano · `zod` ·
   `node:test` · React 19 + Vite + PWA · CSS plano con tokens ·
   `lucide-react` · LLM con contrato propio (Anthropic, OpenAI de reserva) ·
   Whisper · nodemailer · `sharp` · Postgres 16 propio · Dokploy. Desvío
   respecto al panel «HTML plano» de la casa: SPA, por la UX pedida (móvil
   primero, hilo, micrófono, filtros) y por el precedente de forestalolotina.
6. **Qué se descarta y por qué**: PHP/XAMPP (prototipo sin tests); Next.js
   (dos capas y Tailwind, sin ganancia); CMS (la parte pública lee cuatro
   datos de BD); ORM (la casa va con SQL a mano); S3 (un volumen basta);
   WhatsApp en v1 (número dedicado y plantillas); RAG y frameworks de agentes
   (no hay documentos ni conversación); formulario público de derivación sin
   cuenta (sin identidad no hay seguimiento, y es la puerta al spam); reusar el
   Postgres compartido de la casa (aquí hay datos clínicos y de propietarios).

## Supuestos pendientes de confirmar con Bambú

- *(supuesto)* **DNS de `bambufisiovet.com`**: quién lo gestiona hoy y si
  podemos publicar los registros A/CNAME y los de correo (SPF, DKIM, DMARC).
  Sin ellos el change se despliega en un subdominio de pruebas.
- **Proveedor de correo: Dondominio** (Nando, 2026-10-31). *(supuesto)*
  Servidor, puerto y seguridad exactos se toman de su panel al configurarlo
  desde la app; el límite de envíos por hora del buzón se confirma allí y la
  cola lo respeta.
- *(supuesto)* **Correo del centro** que recibe los avisos por defecto
  (`correo_centro`) y quién lo lee.
- *(supuesto)* **Textos legales**: política de privacidad y cláusula del alta
  los aporta Bambú o su asesor; el change deja el hueco y guarda la versión
  aceptada.
- *(supuesto)* **Caducidades**: verificación 48 h, recuperación 1 h,
  invitación 7 días, sesión 14 días.
- *(supuesto)* **Valenciano**: los textos de la interfaz y de los correos se
  revisan por un hablante nativo antes de abrir a veterinarios reales.

## Fuera de alcance

Se vuelca al registro de aplazados del cuaderno (§11) lo que no tenía ya
entrada.

- Casos, pacientes, derivaciones y sus pantallas → change `casos-y-derivaciones`.
- Hilo, adjuntos, sesiones de fisioterapia → change `hilo-adjuntos-y-sesiones`.
- Notas de voz e informes → change `informes-por-voz`.
- Indicadores → change `panel-e-indicadores`.
- WhatsApp, push, castellano, 2FA/SSO, fusión de clínicas duplicadas.
- Copias de seguridad automatizadas del volumen y de la BD: se definen antes
  del cutover, no en este change.
