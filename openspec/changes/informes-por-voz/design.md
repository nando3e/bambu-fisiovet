## Context

Los changes 1-3 dejaron casos, hilo con mensajes de sistema y la clave de
cifrado (`cifrado.ts`) que ya protege la contraseña SMTP. Las visitas van en
Wakyma: el informe se alimenta de los dictados del fisio, no de sesiones
registradas aquí. Nando está fuera durante la construcción y pidió decidir por
lo recomendado; las decisiones de abajo son esas.

## Goals / Non-Goals

**Goals:** dictar, transcribir, proponer un borrador con esquema estricto,
regenerar, editar, confirmar con lease atómico, informe inmutable en el hilo y
en Informes, imprimible; camino sin IA; retención de audios.

**Non-Goals:** asistente de chat, informe para el propietario, PDF en el
servidor (se imprime desde el navegador).

## Decisions

### D1. Migración `007_informes.sql`

```
transcripciones      id, caso_id, autor_id, ruta_audio NULL, mime, bytes, duracion_s NULL, texto, modelo,
                     latencia_ms, error NULL, creado, actualizado
propuestas_informe   id, caso_id, autor_id, tipo CHECK (valoracion|evolucion|alta),
                     estado CHECK (pendiente|confirmada|cancelada|corregida), origen CHECK (ia|manual|edicion),
                     transcripcion_ids int[], instrucciones, datos jsonb, ficha text, modelo NULL,
                     latencia_ms NULL, propuesta_origen_id NULL, sustituye_informe_id NULL, informe_id NULL,
                     creado, resuelto_el NULL
informes             id, caso_id, propuesta_id UNIQUE, autor_id, tipo, contenido jsonb, texto, sustituye_id NULL, creado
```

`mensajes.informe_id` gana su clave foránea. Los informes no tienen UPDATE en
ninguna ruta (inmutables); corregir es confirmar otro con `sustituye_id`.

### D2. Contrato de modelo (`api/src/llm/`)

- `tipos.ts`: `RedactorInforme { redactar({ sistema, texto, esquema }) → { datos, modelo, latenciaMs } }`
  y `Transcriptor { transcribir({ audio, nombre, mime, vocabulario }) → { texto, modelo, latenciaMs } }`.
  Errores propios: `ErrorModelo` con `motivo` (`rechazo`, `respuesta_invalida`, `servicio`).
- `anthropic.ts`: SDK oficial `@anthropic-ai/sdk`, `client.beta.messages.create`
  con `output_config.format` (JSON schema estricto) en vez de herramienta
  forzada, que los modelos actuales rechazan con 400. Modelo por defecto
  `claude-sonnet-5-5` (cuaderno S6), `fallbacks: "default"` con la beta
  `server-side-fallback-2026-07-01` para que un rechazo de política se
  reintente en el modelo de respaldo del servidor; `stop_reason: "refusal"`
  → `ErrorModelo('rechazo')`. Timeout 120 s, 2 reintentos (los del SDK).
- `openai.ts`: SDK `openai`: `chat.completions` con `response_format`
  `json_schema` estricto como redactor de reserva, y `audio.transcriptions`
  (`whisper-1` por defecto, `language: 'ca'`, `prompt` = vocabulario) como
  transcriptor.
- `factory.ts`: lee la configuración `ia` (claves cifradas del panel, o
  `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` del entorno como respaldo). Redactor:
  Anthropic si hay su clave, si no OpenAI, si no ninguno. Transcriptor: OpenAI
  o ninguno. Los tests inyectan los dos por `construirServidor`.

### D3. Informe

- `informes/esquema.ts`: el JSON schema estricto (todas las propiedades
  requeridas, `additionalProperties: false`; lo opcional es `string | null`) y
  su gemelo zod que valida; un test comprueba que tienen las mismas claves.
  Campos: `resumen`, `hallazgos[]`, `tratamiento_realizado[]`, `evolucion`,
  `plan`, `recomendaciones_veterinario[]`, `proxima_revision`, `dudas[]`, y
  en el de alta `estado_al_alta` y `pautas_domicilio`.
- `informes/prompt.ts`: sistema fijo en valenciano («redacta… sense inventar;
  el que falte va a dubtes») y contexto del caso **solo** con datos del
  paciente, del caso, las transcripciones elegidas y el informe anterior.
  Ni propietario ni veterinario ni clínica: un test lo vigila con un caso real.
- `informes/render.ts`: la ficha en texto, determinista, la misma para la
  pantalla, el hilo y la impresión.

### D4. Rutas (todas de Bambú salvo la lectura de informes)

| Ruta | Qué |
|---|---|
| `GET /ia/estado` | qué hay: `{ redactor, transcriptor }` (la web oculta lo que no hay) |
| `POST /casos/:id/transcripciones` | multipart `audio` ≤ 10 MB; guarda en `/datos/audios`, transcribe; si falla, guarda la fila con `error` y el audio |
| `GET /casos/:id/transcripciones` · `PATCH /transcripciones/:id` · `POST /transcripciones/:id/reintenta` | listar, corregir el texto, reintentar |
| `POST /casos/:id/propuestas-informe` | `{ tipo, transcripcion_ids?, instrucciones?, manual?, datos?, sustituye_informe_id? }`; con `manual` no llama al modelo |
| `GET /casos/:id/propuestas-informe` · `GET /propuestas-informe/:id` | |
| `POST /propuestas-informe/:id/regenera` · `/edita` · `/cancela` · `/confirma` | lease `UPDATE … WHERE estado = 'pendiente'`; 409 si ya no lo estaba |
| `GET /casos/:id/informes` · `GET /informes/:id` | cualquiera con ámbito (el derivador, los suyos) |

Confirmar, en una transacción: lease de la propuesta → `INSERT informes` →
mensaje `informe` en el hilo (visible) → `historial` → `informe.publicado`; si
es de alta, transición `alta_por_informe` (que ahora vale desde `aceptada` y
`en_tratamiento`) y `caso.alta`.

### D5. Web

- Pestaña `Informes` en la ficha (los dos lados): lista de informes, vista
  imprimible (`@media print` sin navegación ni botones, con logo y datos del
  caso).
- Bambú: «Nou informe» con tipo, notas de voz (`Microfono.tsx`: tocar para
  grabar y para acabar, barras de volumen con un `AnalyserNode`, papelera, se
  para y descarta al desmontar), transcripciones editables, instrucciones,
  «Redacta amb IA» / «Redacta a mà»; propuesta con `dudas` en ámbar arriba,
  Regenera, Edita (formulario por secciones), Confirma i envia.
- En el hilo, el mensaje de informe enlaza a la vista del informe.
- Configuració → «Intel·ligència artificial» (solo superadmin): claves
  (cifradas, nunca vuelven), modelos y botón de prueba.

### D6. Retención

`tareas/retencion-audios.ts`: al arrancar y cada 24 h borra los audios más
antiguos que `retencion.audio_dias` y deja `ruta_audio` a NULL.

## Risks / Trade-offs

- [Sin claves en producción] → El portal funciona con «Redacta a mà»; la IA se
  enciende cuando el superadmin ponga las claves en el panel.
- [Micrófono simplificado] → Tocar en vez de mantener pulsado: más fácil con
  guantes y con una mano; se itera si los fisios lo piden.
- [Valenciano de Whisper] → Pendiente de cinco dictados reales (supuesto de la
  propuesta); el texto siempre es corregible.

## Migration Plan

Migración 007 al arrancar; redespliegue; prueba en producción del camino «a
mà» con el superadmin (el de IA, cuando haya claves).

## Open Questions

Los supuestos de la propuesta (secciones del informe, calidad de Whisper,
encargados RGPD) siguen pendientes de Bambú.
