# Dónde estamos — 2026-10-31 (corte de sesión)

Leer esto primero al retomar. Después, `CLAUDE.md` y el cuaderno.

## Estado

- **Fases 1-4 del protocolo `nuevo-proyecto`: cerradas.** Cuaderno en
  `docs/cuaderno-decisiones.md` (decisiones D1-D16, dictamen, riesgos,
  aplazados §11, hallazgos §12, despliegue §13).
- **Fase 5, change 1 `fundamentos-acceso-y-avisos`: construido y desplegado.**
  Tareas en `openspec/changes/fundamentos-acceso-y-avisos/tasks.md`: todas
  hechas salvo **7.6 (revisor)**, ver abajo.
  - API: 81 tests en verde (`cd api && npm test`, necesita el Postgres local).
  - Web: build con las seis comprobaciones en verde (`cd web && npm run build`).
  - Probado en Chrome a 1280 px y a 390 px, y recorrido HTTP completo.
- **Changes 2-5** (`casos-y-derivaciones`, `hilo-adjuntos-y-sesiones`,
  `informes-por-voz`, `panel-e-indicadores`): propuesta y specs escritas y
  válidas; **les faltan design.md y tasks.md**, que se escriben al empezar
  cada uno.

## Desplegado

| Qué | Dónde |
|---|---|
| Portal nuevo (Compose `portal`, proyecto Dokploy **BambuFisioVet**) | https://bambu-fisiovet.91-99-128-20.sslip.io |
| Web antigua (Application `bambu-fisiovet`, landing estática) | https://bambufisiovet.com y www — **intacta**, autodespliegue **desactivado** el 31/10 |
| Environment de producción (secretos) | `.env.produccion` en la raíz del repo (ignorado por git) y en Dokploy |
| Superadmin de producción | usuario y contraseña en `.env.produccion` |
| Local | `docker compose -f docker-compose.local.yml up -d` (Postgres 5438) + `api/.env` |

Redesplegar: un push no despliega. Skill `desplegar-dokploy`, `composeId`
`KsDhH9XS4pHR4h-fPxCra`. Cliente de la API usado en esta sesión: llamadas con
Node `fetch` (UTF-8), credenciales en las variables de usuario de Windows.

## Por dónde seguir (en este orden)

1. **Revisor del change 1 (tarea 7.6).** Se lanzó el agente `revisor` con
   Fable sobre `git diff 06dfabb..HEAD`. Si sus hallazgos no están recogidos
   abajo, **relanzarlo** (con un modelo distinto al que programe), corregir lo
   GRAVE y lo MEDIO con su test, justificar por escrito lo descartado en el
   change y redesplegar.
2. **Archivar el change 1** (`/opsx:archive fundamentos-acceso-y-avisos`), que
   pasa sus specs a `openspec/specs/`.
3. **Change 2 `casos-y-derivaciones`**: escribir `design.md` y `tasks.md`
   (Nando valida), y construir. Ampliar `fusionarClinica` para mover casos y
   pacientes; la pantalla `/d/nova` deja de ser provisional.

## Decisiones pendientes de Nando

- **Pasar `bambufisiovet.com` al portal nuevo.** Pasos: en Dokploy quitar los
  dominios del Application antiguo, poner `APP_HOST=bambufisiovet.com` en el
  Compose `portal` (y añadir `www` como segundo router o redirección) y
  redesplegar. El DNS ya apunta al VPS. Hasta entonces la web pública es la
  antigua.
- **SMTP de Dondominio**: configurarlo como superadmin en Configuració →
  Servidor de correu, mandar el correo de prueba, publicar SPF/DKIM/DMARC y
  poner `CORREO_DRY_RUN=false` en Dokploy.
- **Correo del centro** para los avisos (Configuració → Avisos).
- Fotos reales de Bambú (Configuració → Imatges de la web), textos legales,
  revisión del valenciano por un nativo.
- Servidor: si se usa la CPX12 de 2 GB, swap y limpieza de imágenes (cuaderno
  §10.12).

## Hallazgos del revisor

_(Pendiente: se rellenan al recibirlos.)_
