# Dónde estamos — 2026-11-01

Leer esto primero al retomar. Después, `CLAUDE.md` y el cuaderno. Cómo funciona
el portal, para explicarlo a Bambú: `docs/guia-del-portal.md`.

## Estado: v1 construida, revisada y desplegada en el portal de pruebas

Los cinco changes de la v1 están cerrados y archivados en
`openspec/changes/archive/`. Sus specs vigentes están en `openspec/specs/`.
Cada uno tiene su `revision.md` con los hallazgos del revisor (Sol) y lo que
se hizo con cada uno.

| Change | Qué trae |
|---|---|
| 1 `fundamentos-acceso-y-avisos` | Alta y acceso, equipo, clínicas, avisos (matriz, cola de correo, campana), configuración, landing |
| 2 `casos-y-derivaciones` | Nova derivació (autoguardado), estados, pacientes, «Ja té cita», aviso de pendientes de cita. El registro telefónico por Bambú se retiró después (D18) |
| 3 `hilo-adjuntos-y-sesiones` | Hilo por caso, notas internas, adjuntos protegidos con miniaturas, últimos movimientos |
| 4 `informes-por-voz` | Dictado, propuesta con IA o a mano, confirmar, informe imprimible; IA cifrada en el panel; anonimización antes del modelo |
| 5 `panel-e-indicadores` | `/b/panell`: seis indicadores sin sesiones, con enlaces a la lista filtrada |

**Tests**: 51, uno por caso de uso, en unos 10 s (`cd api && npm test`).
También pasan el typecheck, `comprova-produccio` y la build de la web con
sus comprobaciones.

**RGPD**: `docs/rgpd.md` describe qué datos hay, quién los ve, qué viaja a
la IA y los plazos, con la lista de lo pendiente para el asesor.

## Desplegado

| Qué | Dónde |
|---|---|
| Portal nuevo (Compose `portal`, proyecto Dokploy **BambuFisioVet**) | **https://bambufisiovet.com** (y `www`) desde el 2026-11-01; también https://bambu-fisiovet.91-99-128-20.sslip.io |
| Web antigua (Application `bambu-fisiovet`) | https://web-antiga.91-99-128-20.sslip.io: intacta, solo para consulta; sus dominios se renombraron, no se borraron |
| Environment de producción | `.env.produccion` (raíz, ignorado por git) y Dokploy |

Redesplegar: un push no despliega. Skill `desplegar-dokploy`, `composeId`
`KsDhH9XS4pHR4h-fPxCra`.

**Dominios**: en la interfaz de Dokploy (Compose `portal` → Domains:
servicio `bambu-app`, puerto 8105, HTTPS con Let's Encrypt), no con labels
en el compose. `APP_HOST` solo da la URL de los enlaces de los correos.
`www` sirve el mismo portal (no redirige).

**Datos de prueba** (ahora en el dominio real):

- La clínica «PROVA — Clínica de proves» con un caso (paciente «Prova») y un
  informe de evolución, de la prueba del informe a mano.
- La semilla de demo (`api/seed/demo.ts`), sembrada el 2026-11-01: tres
  clínicas (Sant Roc, Montgó, La Marina), cuatro veterinarios, dos fisios,
  15 derivaciones en todos los estados y conversación en los hilos.
  - Veterinaria Marta Puig (Sant Roc): `nando3e@gmail.com`.
  - Las demás cuentas: `nando3e+pau|anna|biel|laia|jordi@gmail.com`. Laia y
    Jordi son fisios de Bambú. Los avisos de todas llegan al Gmail de Nando.
  - Contraseña de todas: `DEMO_CONTRASENA` en `.env.produccion`.
  - Se lanzó con la tarea `sembrar-demo` de Dokploy (Compose `portal` →
    Schedules, desactivada). El comando guardado lleva `<DEMO_CONTRASENA>`
    en lugar de la contraseña. La semilla se niega si ya está sembrada o si
    la URL es bambufisiovet.com.
  - Antes de pasar el dominio de verdad, desactivar estas cuentas y clínicas
    desde el panel.

## Lo que necesito de Nando (en este orden)

1. **Mirar el portal**: el alta de un veterinario con CIF, una derivación, el
   informe a mano y `/b/panell`.
2. **Claves de IA** (Configuració → Intel·ligència artificial, como
   superadmin): Anthropic para redactar y OpenAI para Whisper. Sin ellas, los
   informes se redactan a mano y el micrófono no aparece. Antes, que el
   asesor vea el §4 de `docs/rgpd.md` (transferencia internacional y pauta de
   no dictar nombres).
3. **SMTP de Dondominio**: configurarlo en Configuració → Servidor de correu,
   mandar el correo de prueba, publicar SPF/DKIM/DMARC y poner
   `CORREO_DRY_RUN=false` en Dokploy. Mientras tanto, ningún correo sale de
   verdad.
4. **Correo del centro** para los avisos (Configuració → Avisos).
5. **Datos de demo en el dominio real**: cuando acabe la prueba, desactivar
   las cuentas `nando3e+…` y las clínicas de demo desde el panel.
6. **Textos legales** definitivos (privacidad y consentimiento del
   propietario) y revisión del valenciano por un nativo; fotos reales.
7. **Supuestos de Bambú** que siguen abiertos (cuaderno §6 y §10): plazo de
   conservación, copias de seguridad fuera del servidor, la promesa de «menys
   de 24 h laborables».

## Ideas para Wakyma (sin API)

Lo que se puede hacer sin integración, por si interesa en una iteración:

- Enlace iCal de solo lectura con las primeras visitas que se apuntan en «Ja
  té cita», para suscribirse desde el calendario.
- Exportar a CSV las derivaciones aceptadas para importarlas en Wakyma.
- Preguntar a Wakyma si tienen importación por fichero o una API privada para
  socios.

## Registro de aplazados

Cuaderno §11. Lo nuevo de esta sesión:

- Pruebas de componentes de la web.
- Festivos en las horas laborables.
- Filtro por fechas en la lista de casos.
- Indicadores para el veterinario.
- Datos dichos en voz alta en los dictados.
