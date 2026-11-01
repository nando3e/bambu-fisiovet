# Dónde estamos — 2026-11-01

Leer esto primero al retomar. Después, `CLAUDE.md` y el cuaderno.

## Estado: v1 construida, revisada y desplegada en el portal de pruebas

Los cinco changes de la v1 están cerrados y archivados en
`openspec/changes/archive/`. Sus specs vigentes están en `openspec/specs/`.
Cada uno tiene su `revision.md` con los hallazgos del revisor (Sol) y lo que
se hizo con cada uno.

| Change | Qué trae |
|---|---|
| 1 `fundamentos-acceso-y-avisos` | Alta y acceso, equipo, clínicas, avisos (matriz, cola de correo, campana), configuración, landing |
| 2 `casos-y-derivaciones` | Nova derivació (autoguardado), estados, Bambú registra derivaciones por teléfono, pacientes, «Ja té cita», aviso de pendientes de cita |
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
| Portal nuevo (Compose `portal`, proyecto Dokploy **BambuFisioVet**) | https://bambu-fisiovet.91-99-128-20.sslip.io: v1 completa, `/salud` 200, camino del informe a mano probado |
| Web antigua (Application `bambu-fisiovet`) | https://bambufisiovet.com: **intacta**, autodespliegue desactivado |
| Environment de producción | `.env.produccion` (raíz, ignorado por git) y Dokploy |

Redesplegar: un push no despliega. Skill `desplegar-dokploy`, `composeId`
`KsDhH9XS4pHR4h-fPxCra`.

**Datos de prueba en el portal de pruebas**: para probar el informe en
producción se creó la clínica «PROVA — Clínica de proves» con un caso
(paciente «Prova») y un informe de evolución. Se puede desactivar desde
Clíniques cuando moleste.

## Lo que necesito de Nando (en este orden)

1. **Mirar el portal de pruebas**: el inicio de Bambú, una derivación por
   teléfono, el informe a mano y `/b/panell`.
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
5. **Pasar `bambufisiovet.com` al portal nuevo**: quitar los dominios del
   Application antiguo, poner `APP_HOST=bambufisiovet.com` en el Compose
   `portal` (y `www` como redirección) y redesplegar. El DNS ya apunta al VPS.
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
