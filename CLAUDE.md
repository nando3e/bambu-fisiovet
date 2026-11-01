# BAMBÚ Fisiovet — portal de derivaciones

Portal de un centro de fisioterapia y rehabilitación veterinaria donde los
**veterinarios derivan casos** y el equipo de Bambú los acepta, los trata, dicta
notas de voz que se convierten en informes y se comunica por un hilo por caso.
Landing pública + zona del derivador (`/d`) + zona de Bambú (`/b`), con centro de
notificaciones y avisos por correo configurables. Sustituye a la demo PHP de un
competidor; el aspecto visual sale de ella.

## Documentos de referencia

- **Cuaderno de decisiones**: `docs/cuaderno-decisiones.md`. Decisiones,
  dictamen de arquitectura, supuestos, diseño funcional (modelo, estados, roles,
  pantallas, avisos, informe por voz, API) y riesgos. Ante cualquier duda de
  negocio, mirar ahí antes de preguntar.
- **RGPD**: `docs/rgpd.md` (qué datos, quién los ve, qué viaja a la IA,
  plazos y lo pendiente para el asesor). Toda funcionalidad que toque datos
  personales lo actualiza.
- **Referencia visual**: `docs/referencia-demo/` (HTML, CSS, JS y logo de la
  demo del competidor; credencial y tokens retirados). Paleta, tipografía y
  estilo salen de su `assets/css/style.css`. La UX no: la nuestra es ágil,
  móvil primero y con iconos, como happydog.
- **Specs y changes**: `openspec/`. El trabajo se hace por changes validados por
  Nando antes de escribir código. Specs vigentes en `openspec/specs/`.
- **Plantillas de la casa** (`C:\Users\nando\APPS\`): `PLANTILLA-CHATBOT.md`
  (convenciones, reglas duras, trazas, §14 catálogo de fallos silenciosos),
  `PLANTILLA-CHATBOT-DATOS.md` §4 proponer/confirmar, §7 voz, §8 fotos, §9
  operación, y `SEPARACION-SERVICIOS-DESPLIEGUE.md`. Este proyecto es candidato
  a plantilla nueva (portal de gestión con dos poblaciones de usuarios).
- **Código de la casa que se copia** (rutas en el cuaderno §5): esqueleto de
  `forestalolotina/api`, sesiones de `finques-ketxa`, correo de `nosolodulce`,
  tokens de alta de `nutriapp`, micrófono y ficha de confirmación de
  `happydogApp`.

## Stack (convención de la casa)

- **API** (`api/`): Node 22, TypeScript, Fastify 5, `pg` con SQL a mano, `zod`
  en toda frontera externa, `node:test`. Migraciones SQL numeradas e
  idempotentes aplicadas al arrancar; semilla que no pisa.
- **Web** (`web/`): React 19 + Vite + TypeScript, PWA servida por el propio API
  (un contenedor, un dominio, sin CORS). CSS plano con tokens, `lucide-react`.
- **LLM**: contrato propio (`api/src/llm/`) con adaptador Anthropic por defecto y
  OpenAI de reserva. Sin bucle de agente en v1: el informe es una llamada con
  herramienta forzada y esquema estricto. Whisper para voz (`language=ca`).
- **Correo**: nodemailer por el SMTP de Dondominio (`avisos@bambufisiovet.com`),
  siempre a través de la cola de `avisos/`. **El servidor SMTP se configura desde
  el panel** (solo superadmin), no en el entorno: la contraseña va cifrada con
  `CLAVE_CIFRADO` y nunca vuelve al navegador. `CORREO_DRY_RUN=true` en el
  entorno manda sobre el panel (en local, siempre). Única excepción a las dos
  reglas: el botón «correu de prova» del superadmin, que envía en la petición
  y aunque haya dry-run para comprobar el SMTP antes de quitarlo (deja traza).
- **Superadmin**: `SUPERADMIN_USUARIO` + `SUPERADMIN_CONTRASENA` en claro en el
  entorno; se compara contra la variable en cada login, sin hash en BD.
- **Deploy**: Dokploy, `docker-compose.yml`. Stack = app + **Postgres propio** en la red interna
  `bambu-internal` (nunca en `dokploy-network`, sin puerto publicado); la app se
  conecta a `bambu-postgres:5432`, nunca a `postgres` a secas. Volumen
  `bambu-datos` → `/datos` para adjuntos y audios. **Dominios en la interfaz
  de Dokploy** (Compose `portal` → Domains), nunca labels de Traefik en el
  compose; `APP_HOST` solo da la URL de los correos.

## Idiomas

- **Código, identificadores, tablas, columnas, comentarios y documentación: en
  español.**
- **Interfaz: en valenciano**, siempre a través del diccionario
  (`web/src/i18n/va.ts`), nunca literales en los componentes. Plantillas de
  correo y prompt del informe también en valenciano.

## Principios duros

1. **El derivador solo ve lo de su clínica**, y el filtro va en SQL
   (`dominio/visibilidad.ts`), nunca en JS después. Fuera de ámbito → **404**,
   no 403. Toda ruta nueva lleva su test de ámbito y de rol.
2. **Los avisos salen solo por `api/src/avisos/`**: la acción publica un evento
   dentro de su transacción; la matriz (en BD, efecto inmediato) decide
   notificación y correo; el correo siempre se encola, nunca se envía en la
   petición. Los transaccionales de cuenta no pasan por la matriz.
3. **El informe nunca sale sin confirmar.** Proponer/confirmar con lease atómico
   (`UPDATE … WHERE estado='pendiente'`); editar es volver a proponer; el modelo
   no tiene forma de confirmar.
4. **Al modelo no viaja ningún dato del propietario ni del veterinario.** Las
   columnas no entran en el prompt y `informes/anonimizar.ts` tapa lo que
   venga copiado en campos libres (nombres, teléfonos, correos). El test pone
   esos datos en cada campo que sí viaja.
5. **Sin borrado duro.** Desactivar, cancelar, `eliminado_el`; todo cambio de
   ficha deja `historial`.
6. **`dominio/` es puro**: sin `pg`, sin HTTP, sin LLM. Se prueba sin red.
7. **Ficheros clínicos nunca por estáticos**: se sirven por ruta con permisos.
8. **El portal recibe derivaciones; las visitas van en Wakyma** (sin API). Ni
   agenda, ni sesiones, ni casos propios de Bambú: los estados acaban en «Ja té
   cita» → alta, y los indicadores solo miden lo que el portal sabe. **Bambú no
   registra derivaciones ni crea clínicas**: si una clínica llama, que se
   registre. A una clínica que ya está solo se entra por invitación de un
   compañero (D17, D18).

## Trampas conocidas

- **Producción no corre el mismo TypeScript que el desarrollo.** Los tests usan
  `tsx`, pero la imagen arranca con `node --experimental-strip-types`, que no
  admite enums, namespaces ni propiedades declaradas en el constructor. Pasa el
  typecheck y revienta al arrancar. Usar uniones `as const`;
  `api/comprova-produccio.ts` lo caza en la build: no quitarlo.
- **Contraseña de Postgres**: no se cambia tras el primer despliegue; el volumen
  se queda con la primera.
- **Una variable CSS inexistente no avisa** (degrada en silencio): el script de
  contraste y el barrido de variables corren en la build.
- **El API local lista los estáticos de `web/dist` al arrancar**: tras un
  `npm run build` de la web hay que reiniciarlo o servirá el index nuevo con
  assets que dan 404 (página en blanco). En producción no pasa: la imagen se
  construye una vez.
- **pg lee un `timestamp` sin huso con la hora local del proceso** (distinta
  en local y en el contenedor): las fechas en hora de Madrid se sacan como
  texto con `to_char` y se leen como UTC (ver `rutas/panel.ts`).
- **Pipes que enmascaran códigos de salida** en scripts de verificación
  (`cmd | tail` devuelve el exit de tail).

## Hábito de trabajo

- **Un test por caso de uso**, que recorre el camino entero con sus bordes; no
  tests casi iguales que repiten preparación (la batería tiene que correr en
  segundos). Cada task con su test; **cada arreglo se verifica quitándolo y
  viendo el test en rojo**. Probar las costuras (¿llega de verdad a la BD, a la cola, al
  correo?), no solo las piezas.
- **Al cerrar cada change de openspec, lanzar el agente `revisor` sobre el
  diff**, con un modelo distinto al que escribió el código. Corregir lo que
  proceda; lo descartado se justifica por escrito en el change.
- Nada aplazado sin anotarlo en el registro de aplazados del cuaderno.

## Comandos

```bash
# Postgres local (puerto 5438; credenciales de prueba en el propio compose)
docker compose -f docker-compose.local.yml up -d

# API (api/): copia .env.example a api/.env y pon los valores de desarrollo
cd api
npm test                 # node:test contra Postgres real; cada fichero crea su base *_test (~10 s, un test por caso de uso)
npm run typecheck
npm run comprova-produccio   # todos los módulos cargan con --experimental-strip-types
npm run dev              # tsx watch en http://localhost:8105 (sirve web/dist si existe)

# Web (web/)
cd web
npm run dev              # Vite en http://localhost:5205 con proxy /api → 8105
npm run comprueba        # emojis, variables CSS, contraste, rutas, rutas del API, campos 16 px
npm run build            # comprueba + typecheck + vite build → web/dist

# Imagen de producción (la misma que construye Dokploy)
docker build -t bambu-fisiovet .
```

Despliegue: Dokploy, aplicación Compose con `./docker-compose.yml` (app +
Postgres propio en `bambu-internal`). Un push no despliega: hay que lanzar el
despliegue (skill `desplegar-dokploy`). Las variables están en `.env.example`.
