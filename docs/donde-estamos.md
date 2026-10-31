# Dónde estamos — 2026-10-31 (segunda sesión)

Leer esto primero al retomar. Después, `CLAUDE.md` y el cuaderno.

## Estado

- **Fases 1-4 del protocolo `nuevo-proyecto`: cerradas.** Cuaderno en
  `docs/cuaderno-decisiones.md` (decisiones D1-D16, dictamen, riesgos,
  aplazados §11, hallazgos §12, despliegue §13).
- **Change 1 `fundamentos-acceso-y-avisos`: cerrado y archivado** en
  `openspec/changes/archive/2026-10-31-fundamentos-acceso-y-avisos/`. Sus
  specs ya están en `openspec/specs/` (acceso, avisos, configuracion,
  diseno).
  - Revisor con Fable (dos pasadas): informe y resolución de cada hallazgo en
    `revision.md` dentro del change archivado. Todo lo GRAVE y lo MEDIO
    corregido con su test; cada arreglo verificado por mutación (quitarlo →
    test en rojo).
  - API: 100 tests en verde (`cd api && npm test`, necesita el Postgres
    local). Web: build con las seis comprobaciones en verde.
  - **Los arreglos de la revisión están sin commit y sin desplegar.**
    Producción todavía corre la versión anterior.
- **Change 2 `casos-y-derivaciones`: `design.md` y `tasks.md` escritos y
  válidos, pendientes de que Nando los valide** (dos preguntas abiertas,
  abajo). No hay código del change 2.
- **Changes 3-5** (`hilo-adjuntos-y-sesiones`, `informes-por-voz`,
  `panel-e-indicadores`): propuesta y specs; les faltan design.md y tasks.md.

## Desplegado

| Qué | Dónde |
|---|---|
| Portal nuevo (Compose `portal`, proyecto Dokploy **BambuFisioVet**) | https://bambu-fisiovet.91-99-128-20.sslip.io |
| Web antigua (Application `bambu-fisiovet`, landing estática) | https://bambufisiovet.com y www — **intacta**, autodespliegue **desactivado** el 31/10 |
| Environment de producción (secretos) | `.env.produccion` en la raíz del repo (ignorado por git) y en Dokploy |
| Superadmin de producción | usuario y contraseña en `.env.produccion` |
| Local | `docker compose -f docker-compose.local.yml up -d` (Postgres 5438) + `api/.env` |

Redesplegar: un push no despliega. Skill `desplegar-dokploy`, `composeId`
`KsDhH9XS4pHR4h-fPxCra`. Cliente de la API: llamadas con Node `fetch`
(UTF-8), credenciales en las variables de usuario de Windows.

## Por dónde seguir (en este orden)

1. **Commit, push y redespliegue** de los arreglos de la revisión (esperan
   el visto bueno de Nando). Después del despliegue, comprobar en producción
   que una invitación pide la casilla de privacidad y que el alta sigue
   funcionando.
2. **Change 2 `casos-y-derivaciones`**: con el design validado, construir
   por el orden de `tasks.md`. Al cerrar, revisor con un modelo distinto
   (Nando ofrece Sol/Codex, skill `codex`, como revisor de otra casa).

## Decisiones pendientes de Nando

- **Change 2, borradores**: ¿solo los ve quien los escribe (propuesta) o
  toda la clínica?
- **Change 2, recaída de un paciente derivado**: ¿el caso nuevo es `propio`
  de Bambú (propuesta; el veterinario no lo ve) o sigue ligado a la clínica?
- **Uniones a clínicas no validadas** (revisión del change 1, cuaderno §11):
  ¿que las apruebe solo Bambú hasta que la clínica esté validada? Antes de
  abrir a veterinarios reales.
- **Pasar `bambufisiovet.com` al portal nuevo.** Pasos: en Dokploy quitar los
  dominios del Application antiguo, poner `APP_HOST=bambufisiovet.com` en el
  Compose `portal` (y añadir `www` como segundo router o redirección) y
  redesplegar. El DNS ya apunta al VPS.
- **SMTP de Dondominio**: configurarlo como superadmin en Configuració →
  Servidor de correu, mandar el correo de prueba, publicar SPF/DKIM/DMARC y
  poner `CORREO_DRY_RUN=false` en Dokploy.
- **Correo del centro** para los avisos (Configuració → Avisos).
- Fotos reales de Bambú, textos legales (privacidad y consentimiento del
  propietario), revisión del valenciano por un nativo.
- Servidor: si se usa la CPX12 de 2 GB, swap y limpieza de imágenes
  (cuaderno §10.12).
