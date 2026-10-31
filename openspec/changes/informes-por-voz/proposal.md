## Why

Lo que más tiempo le quita al fisio no es tratar, es escribir: el informe de
valoración, de evolución o de alta para el veterinario que derivó. Y lo que más
valora el veterinario es recibirlo. Este change hace que el fisio **dicte**
al acabar la sesión y obtenga un borrador de informe clínico en valenciano,
que puede regenerar, corregir a mano y, solo cuando lo confirma, enviar. Es el
diferenciador del producto frente a la demo del competidor.

## What Changes

- Notas de voz con el micrófono al estilo de happydog (mantener pulsado,
  deslizar para fijar, papelera, barras de volumen). Se transcriben con
  Whisper (`ca`), usando como vocabulario el nombre del paciente, su raza y
  los términos del oficio. El texto es corregible.
- Borrador de informe (valoración, evolución o alta) en una sola llamada al
  modelo, con herramienta forzada y esquema estricto. Incluye `dudas`: lo que
  el dictado no deja claro se señala, nunca se inventa.
- **Regenerar** (con instrucciones opcionales), **editar** a mano (que vuelve
  a proponer sin modelo) y **confirmar** con lease atómico. Nada sale sin
  confirmar.
- Informe confirmado e inmutable, publicado en el hilo y en la pestaña
  Informes del veterinario, imprimible. Al confirmarlo se publica
  `informe.publicado`; si es de alta, el caso pasa a `alta`.
- «Redacta a mà» como camino sin IA, con el mismo confirmar. Sin claves de
  IA, la app funciona igual y el micrófono no aparece.
- Retención de audios según la configuración (30 días por defecto).
- Contrato propio de LLM con adaptadores Anthropic y OpenAI.

## Capabilities

### New Capabilities

- `informes`: notas de voz, transcripción, borradores de informe con
  proponer/regenerar/editar/confirmar, informes publicados y retención de
  audios.

### Modified Capabilities

_Ninguna._

## Impact

- Migración `007_informes.sql` (`transcripciones`, `propuestas_informe`,
  `informes`).
- Dependencias `@anthropic-ai/sdk` y `openai`. Variables `PROVEEDOR_LLM`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MODELO_INFORME` (por defecto
  `claude-sonnet-5-5`) y `MODELO_TRANSCRIPCION`.
- Volumen `/datos/audios`.
- Rutas `/api/casos/:id/transcripciones`, `/api/casos/:id/propuestas-informe`,
  `/api/propuestas-informe/:id/*`, `/api/casos/:id/informes` e
  `/api/informes/:id`.
- Plantilla `informe-nuevo`.

## Supuestos pendientes de confirmar con Bambú

- *(supuesto)* Secciones del informe: resumen, hallazgos, tratamiento
  realizado, evolución, plan, recomendaciones al veterinario, próxima revisión
  y, en el de alta, estado al alta y pautas en casa. Validar con un informe
  real de Bambú.
- *(supuesto)* Calidad de Whisper con el valenciano y el vocabulario clínico:
  se mide con cinco dictados reales antes de darlo por bueno.
- *(supuesto)* RGPD: el asesor de Bambú acepta Anthropic y OpenAI como
  encargados (al modelo no viaja ningún dato del propietario ni del
  veterinario; Whisper recibe la voz del fisio).

## Fuera de alcance

- Asistente de chat sobre los datos (v2).
- Informe en lenguaje llano para el propietario (v2).
- PDF generado en el servidor (se imprime desde el navegador).
