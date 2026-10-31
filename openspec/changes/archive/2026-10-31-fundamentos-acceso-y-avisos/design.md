## Context

Proyecto nuevo. El repo solo tiene el cuaderno, la referencia visual de la
demo y openspec. La casa ya tiene piezas probadas para casi todo lo de este
change, repartidas en varios proyectos:

| Pieza | De dónde se copia |
|---|---|
| Esqueleto Fastify + pg + migraciones + SPA servida + Dockerfile | `forestalolotina/api/src/{servidor,config,errores}.ts`, `db/migraciones.ts`, `Dockerfile`, `docker-compose.dokploy.yml` |
| Comprobación de `--experimental-strip-types` | `forestalolotina/api/comprova-produccio.ts` |
| Superadmin por entorno | `forestalolotina/api/src/superadmin.ts` (adaptado: sin hash, comparación directa) |
| Sesiones revocables en BD | `finques-ketxa/app/src/panel/sesion.ts`, `migrations/002_sesiones.sql` |
| Correo con dry-run y plantillas HTML + texto | `nosolodulce/app/src/correo/{enviar,plantilla}.ts`, `test/correo.test.ts` |
| Tokens de un solo uso para alta e invitación | `nutriapp/src/db/schema.ts`, `src/app/api/auth/{register,verify-email,set-password}` (lógica, no framework) |
| Tokens de diseño, esqueleto y scripts de build | `forestalolotina/web/src/disseny/`, `web/scripts/*.mjs` |

Lo que no existe en ninguna y se diseña aquí: la recuperación de contraseña
por iniciativa del usuario, la unión a clínica, el módulo de avisos con
matriz y cola, y el SMTP configurable desde el panel.

Restricciones: producción arranca con `node --experimental-strip-types`;
Postgres propio en red interna; un solo contenedor; UI en valenciano.

## Goals / Non-Goals

**Goals:**

- Desplegable en Dokploy al cerrar el change: landing, alta, entrar, campana,
  configuración.
- Ciclo de vida completo de cuentas por correo, probado de punta a punta en
  dry-run.
- Módulo `avisos/` terminado: los changes siguientes solo llaman a
  `publicarEvento` y añaden plantillas.
- Base de tests (BD real de test, dominio puro sin red) que los siguientes
  changes amplían.

**Non-Goals:**

- Casos, pacientes, hilo, informes, indicadores (changes 2-5).
- Copias de seguridad automatizadas y monitorización (antes del cutover).
- Cambiar el correo de un usuario desde el perfil.

## Decisions

### D1. Estructura de módulos

```
api/src/
  servidor.ts       arranque: config → pool → migraciones → semilla → superadmin → rutas → cola → SPA
  config.ts         variables de entorno con zod; falla al arrancar si falta algo
  errores.ts        ErrorHttp + manejador uniforme { error }
  superadmin.ts     upsert de la fila es_de_entorno y comparación contra el entorno
  auth/             contrasena.ts (scrypt) · sesion.ts · tokens.ts · permisos.ts (exigirSesion, exigirRol)
  db/               pool.ts · migraciones.ts · historial.ts · repos/{usuarios,clinicas,sesiones,tokens,configuracion,notificaciones}.ts
  dominio/          contrasena-valida.ts · dominios-genericos.ts · union-clinica.ts (decisión pura)
  cifrado.ts        AES-256-GCM para la contraseña SMTP
  correo/           plantilla.ts · transporte.ts (crea el transporte desde la config de BD)
  avisos/           eventos.ts · publicar.ts · destinatarios.ts · matriz.ts · cola.ts · canales/correo.ts
  rutas/            index.ts · publico.ts · auth.ts · usuarios.ts · clinicas.ts · configuracion.ts · notificaciones.ts
api/plantillas/correo/*.html
api/migrations/001_acceso.sql … 004_avisos.sql
```

Alternativa descartada: un paquete `shared/` entre API y web para los tipos.
Más configuración de build por poco: la web declara sus tipos de respuesta y
el script `rutes-api.mjs` comprueba que las rutas que llama existen.

### D2. Migraciones

- `001_acceso.sql`: `clinicas` (con `dominio_correo`, `activa`,
  `provisional`), `usuarios` (rol con CHECK; `email` nullable solo si
  `es_de_entorno`; `usuario` para el superadmin; `contrasena_hash` nullable;
  `verificado_el`, `activo`, `recibe_correos`, `privacidad_version`,
  `privacidad_el`), `sesiones` (token_hash PK), `tokens_correo`,
  `solicitudes_union`. Extensiones `pg_trgm` y `unaccent` para las
  sugerencias de clínica.
- `002_configuracion.sql`: `configuracion (clave PK, valor jsonb, actualizado,
  actualizado_por)`.
- `003_historial.sql`: `historial` como en forestal.
- `004_avisos.sql`: `eventos`, `configuracion_avisos`, `notificaciones`,
  `correos_pendientes`, `avisos_enviados`.

Todas idempotentes (`IF NOT EXISTS`); los CHECK de listas cerradas se
nombran para poder ampliarlos en changes posteriores con
`DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT`.

### D3. Contraseñas, tokens y sesiones

- scrypt de `node:crypto` (N=16384, r=8, p=1, sal de 16 bytes), formato
  `scrypt$N$r$p$sal$hash`. Para tardar lo mismo cuando el usuario no existe se
  compara contra un hash ficticio precalculado.
- Tokens de correo y de sesión: `randomBytes(32)` en base64url; en BD solo su
  SHA-256. Consumo atómico:
  `UPDATE tokens_correo SET usado_el = now() WHERE token_hash = $1 AND usado_el IS NULL AND caduca > now() RETURNING …`.
- Sesión: cookie `bambu_sesion`, 14 días, renovada si queda menos de la mitad;
  `ultimo_uso` actualizado como mucho una vez por minuto para no escribir en
  cada petición.
- Alternativa descartada: cookie firmada sin estado (forestal). No permite
  revocar al cambiar la contraseña ni al desactivar.

### D4. Superadmin sin hash

`SUPERADMIN_USUARIO` y `SUPERADMIN_CONTRASENA` se leen en cada login. El
login, si el identificador coincide con `SUPERADMIN_USUARIO`, compara la
contraseña con `timingSafeEqual` sobre los SHA-256 de ambas (para igualar
longitudes) y abre sesión sobre la fila `es_de_entorno`. Al arrancar,
`superadmin.ts` crea o renombra esa fila; si `SUPERADMIN_USUARIO` coincide con
el correo de un usuario normal, el arranque falla con mensaje claro.

### D5. Unión a clínica

`dominio/union-clinica.ts` decide, sin BD, qué pasa con una solicitud:
`auto` (dominio del correo = dominio de la clínica y no genérico),
`pendiente`, o `no_permitida`. Esta última se da si la clínica provisional
del solicitante ya tiene otros miembros, y entonces se responde 409 «La teua
clínica ja té companys; demana a Bambú que les fusione»; la fusión de
clínicas está aplazada. Aprobar ejecuta `fusionarClinica(origen, destino)` en
una transacción: mueve al usuario y marca la provisional como inactiva. Los
changes posteriores **amplían esa función** para mover también casos y
pacientes; su test vive con ella.

Las sugerencias usan `similarity(unaccent(lower(nombre)), unaccent(lower($1))) > 0.35`
y coincidencia exacta de dominio, máximo 5, solo clínicas activas y no
provisionales de otra persona. Devuelven nombre y población, nunca usuarios.

### D6. Avisos

- `eventos.ts`: catálogo `as const` con tipo, audiencia, plantilla y funciones
  de título, cuerpo y enlace por rol. El tipo `TipoEvento` sale del catálogo.
  La migración tiene el mismo CHECK y un test compara las dos listas.
- `publicar.ts`: `publicarEvento(cliente, { tipo, casoId, actorId, datos })`.
  Inserta el evento, lee la fila de la matriz y el correo del centro, resuelve
  destinatarios con `destinatarios.ts` (puro), inserta notificaciones y encola
  correos aplicando `recibe_correos` y la regla anti-ruido. Devuelve un resumen
  para los tests.
- `cola.ts`: `iniciarCola(deps)` con temporizador de 15 s y `despertar()`.
  Lote: `SELECT … FOR UPDATE SKIP LOCKED LIMIT 20` dentro de una transacción
  corta que marca `en_curso`. El envío va fuera de la transacción, y después
  otra transacción marca `enviado` o programa el reintento. `en_curso` caduca
  a los 10 minutos, para no perder correos si el proceso muere a mitad.
- `canales/correo.ts`: interfaz `Canal { enviar(pendiente) → { enviado, motivo?, error? } }`.
  Nunca lanza. Inyectable en tests.

Alternativa descartada: enviar el correo en la misma petición, con
`try/catch`. Acopla la latencia y la disponibilidad del SMTP a cada acción, y
pierde el correo si el proceso cae.

Alternativa descartada: un worker o cola externa (BullMQ/Redis). Es un
servicio más en un servidor de 2 GB, para un volumen de decenas de correos al
día.

### D7. SMTP desde el panel

La clave de configuración `correo_servidor` guarda
`{ host, puerto, seguridad, usuario, contrasena_cifrada, remitente_nombre, remitente_email }`.
`cifrado.ts` usa AES-256-GCM, con la clave derivada de `CLAVE_CIFRADO` por
SHA-256 y un IV aleatorio por cifrado; guarda `v1:iv:tag:dato` en base64. El
repositorio de configuración **nunca** devuelve `contrasena_cifrada` por la
ruta: la sustituye por `contrasena_configurada: boolean`. `transporte.ts`
cachea el transporte de nodemailer por la huella de la configuración y lo
rehace si cambia. Si la configuración está incompleta, la cola marca
`smtp sin configurar`, igual que el dry-run.

Alternativa descartada: SMTP en el entorno (la regla de la casa). Nando lo
quiere en el panel; el desvío está anotado en el cuaderno (D14).

### D8. Web

```
web/src/
  main.tsx · App.tsx (rutas y guardas por rol) · api.ts (fetch con credenciales, errores uniformes)
  i18n/{va.ts, index.ts}   t() con claves tipadas: keyof typeof va
  disseny/{tokens,base,components}.css
  components/{Esquelet,Cabecera,Campana,ListaNotificaciones,BarraNavegacion,Boton,Campo,Pestanas,AvisoVersion}.tsx
  pantallas/publico/{Landing}.tsx
  pantallas/acceso/{Acceso,Recupera,Establece,VerificaCorreo}.tsx
  pantallas/comun/{Perfil,Notificaciones}.tsx
  pantallas/bambu/{Inicio,Configuracion/{Equipo,ContactoWeb,Avisos,ServidorCorreo,Retencion}}.tsx
  pantallas/derivador/{Inicio}.tsx    (provisional: «Aviat podràs derivar casos» hasta el change 2)
```

React Router 7 en modo librería, sin carga de datos del router: cada pantalla
pide lo suyo con `api.ts`. Sin librería de estado: el usuario de la sesión va
en un contexto. `vite-plugin-pwa` con `registerType: 'prompt'` para el aviso
de versión nueva y `navigateFallbackDenylist: [/^\/api/]`.

### D9. Despliegue

`docker-compose.dokploy.yml`:

- servicio `app` en `dokploy-network` + `bambu-internal`, con un volumen
  `bambu-datos:/datos` y etiquetas de Traefik para `bambufisiovet.com` y
  `www`;
- servicio `bambu-postgres` (Postgres 16) **solo** en `bambu-internal`, sin
  puertos, con el volumen `bambu-postgres-data`;
- `DATABASE_URL=postgres://bambu_admin:${POSTGRES_PASSWORD}@bambu-postgres:5432/bambu_app`.

Lo genera la skill `compose-dokploy` y lo sube `desplegar-dokploy`. El
Dockerfile, multi-stage como el de forestal, copia las dependencias **del
package.json**, nunca de una lista a mano. Healthcheck contra `/api/salud`.

### D10. Tests

- `node:test` + `tsx`. Los tests de dominio son puros. Los de rutas usan
  `fastify.inject` contra una BD real de test (`DATABASE_URL_TEST`): cada
  fichero crea un esquema temporal, aplica las migraciones y lo borra al
  terminar.
- El correo se prueba con un canal falso que registra lo enviado. Los tests de
  la cola usan un reloj inyectable.
- Regla de la casa: cada arreglo se verifica quitándolo y viendo el test en
  rojo.

## Risks / Trade-offs

- [DNS de `bambufisiovet.com` en manos de un tercero] → Desplegar primero en un
  subdominio de la casa; el dominio se apunta cuando Bambú dé acceso.
- [Correos a Gmail/Outlook en spam] → SPF, DKIM y DMARC de Dondominio
  publicados antes de abrir a veterinarios; el botón de prueba lo verifica con
  un buzón de Gmail.
- [Contraseña SMTP en BD] → Cifrada, solo superadmin, nunca se devuelve. Si se
  pierde `CLAVE_CIFRADO`, la contraseña deja de descifrarse: la cola marca
  `smtp sin configurar` y basta con volver a escribirla en el panel.
- [Builds sin memoria en un servidor de 2 GB] → Swap o build en CI (cuaderno
  §10.12).
- [Sugerencias de clínica que filtran nombres de clientes de Bambú] → Solo
  nombre y población de clínicas activas, con freno de peticiones. Es
  información pública del sector.
- [Superadmin con contraseña en claro en el entorno] → Decisión explícita de
  Nando; el Environment de Dokploy es la frontera. Se recomienda una
  contraseña larga y no reutilizada.

## Migration Plan

1. Proyecto nuevo en Dokploy con el compose de D9 y el Environment mínimo
   (`CORREO_DRY_RUN=true`).
2. Despliegue en un subdominio de pruebas y recorrido completo en dry-run.
3. El superadmin configura el SMTP de Dondominio desde el panel y manda un
   correo de prueba.
4. `CORREO_DRY_RUN=false`; alta real de prueba.
5. Se apunta `bambufisiovet.com` cuando el DNS esté accesible.

Rollback: la landing anterior está en `docs/referencia-anterior/bambu.html` y
en el historial; volver a ella es desplegar ese commit.

## Open Questions

- ¿Quién tiene hoy el DNS de `bambufisiovet.com` y desde dónde se gestiona?
- ¿Fotos reales de Bambú para la landing (instalaciones, equipo)?
- Texto de la política de privacidad y versión inicial.

## Diferencias con lo construido

Anotadas al cerrar el change (revisión del change 1, hallazgo 18):

- No hay `db/repos/`: el SQL vive en las rutas y en `servicios/` (por
  ejemplo `servicios/clinicas.ts`), que es lo que pide «SQL a mano» sin una
  capa que solo reenvía llamadas.
- No hay `avisos/canales/correo.ts`: el canal real es `canalSmtp` en
  `correo/transporte.ts`, y la interfaz `CanalCorreo` está en `avisos/cola.ts`.
- `clinicas` no tiene columna `provisional`. Las sugerencias de D5 ofrecen
  las clínicas activas con algún usuario activo y verificado; la regla de
  «la clínica de origen ya tiene compañeros» se mira al pedir y otra vez al
  aprobar.
- El compose de producción es `docker-compose.yml` (no
  `docker-compose.dokploy.yml`), y Postgres local va en
  `docker-compose.local.yml`.
- El correo de prueba del superadmin sale en la petición y aunque haya
  dry-run (excepción deliberada a D6/D7, escrita en el código y en
  `CLAUDE.md`), con su traza en `avisos_enviados`.
