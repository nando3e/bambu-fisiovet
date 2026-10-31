## Why

Con las cuentas y los avisos en pie (change `fundamentos-acceso-y-avisos`),
falta lo que da sentido al portal: que un veterinario **derive un caso** y que
Bambú lo **acepte o rechace**, con el paciente, el propietario y el motivo
clínico bien recogidos. Este change es el núcleo del producto: sin él no hay
nada que seguir, comentar ni informar.

## What Changes

- Pacientes y propietarios: alta, edición e historial de cambios. Bambú puede
  dar de alta pacientes propios, que no vienen derivados.
- Casos con `origen` derivación o propio y la máquina de estados completa
  (borrador → enviada → aceptada → en tratamiento → alta, más rechazada y
  abandonada). Las transiciones permitidas por rol se definen en `dominio/`.
- Nueva derivación en tres pasos, pensada para el móvil y con **borrador
  autoguardado**. Se envía cuando están los campos obligatorios y el
  consentimiento del propietario.
- Visibilidad por clínica en SQL (`dominio/visibilidad.ts`). Fuera de ámbito
  devuelve 404.
- Aceptar asignando fisio responsable, rechazar con motivo, abandonar, alta
  manual, reasignar fisio. Cada acción con `historial`, mensaje de sistema (el
  hilo llega en el change siguiente; aquí se guarda el evento) y su evento de
  avisos.
- Bambú edita la ficha siempre; el veterinario, solo mientras la derivación
  no está aceptada. Los cambios de ficha publican `paciente.ficha_modificada`.
- Listas con filtros, «amb novetats» a partir de las notificaciones no leídas,
  y marcar como leído al abrir un caso.
- **Derivación registrada por Bambú**: cuando una clínica deriva por teléfono
  o por correo, el fisio la registra en su nombre eligiendo la clínica
  validada que la remite (y el veterinario, con cuenta o escrito a mano). Nace
  aceptada y avisa al veterinario.
- **Alta manual de clínicas** por Bambú, que nacen validadas. Las uniones a
  clínicas no validadas solo las aprueba Bambú (decisión de Nando tras la
  revisión del change 1).
- **El paciente sigue siendo de su clínica**: una recaída que abre Bambú queda
  ligada a la clínica de origen y el veterinario la ve y recibe el aviso.
- `fusionarClinica` se amplía para mover también casos y pacientes.
- Semilla `--demo` para entornos de prueba.

## Capabilities

### New Capabilities

- `casos`: pacientes, propietarios, casos, derivaciones, estados,
  visibilidad por clínica, listas y fichas.

### Modified Capabilities

- `acceso`: sugerencias de clínica (validadas o con alguien verificado) y
  unión a clínicas no validadas resuelta solo por Bambú.
- `avisos`: dos eventos nuevos en el catálogo, `derivacion.registrada` y
  `caso.abierto_por_bambu`.

## Impact

- Migración `005_casos.sql` (`propietarios`, `pacientes`, `casos`).
- Rutas `/api/pacientes`, `/api/propietarios`, `/api/casos` y sus transiciones.
- Sin plantillas de correo nuevas: todos los eventos usan la genérica `aviso`
  del change 1 (design D5).
- `clinicas.validada` y `POST /api/clinicas` (Bambú).
- Pantallas `/d`, `/d/nova`, `/d/casos/:id` (ficha), `/d/pacients`, `/b`,
  `/b/casos`, `/b/casos/:id`, `/b/pacients`, `/b/pacients/:id` y
  `/b/cliniques`.

## Supuestos pendientes de confirmar con Bambú

- *(supuesto)* Especies: perro, gato, conejo, ave y otro (con texto libre).
  ¿Caballos?
- *(supuesto)* Campos obligatorios para enviar: nombre y especie del paciente,
  nombre y teléfono del propietario, motivo, y el consentimiento.
- *(supuesto)* Texto del consentimiento del propietario y su versión inicial.
- *(supuesto)* El veterinario que cambia de clínica deja sus casos en la
  clínica.

## Decisiones de Nando (31/10)

- Un borrador solo lo ve quien lo escribe.
- El paciente sigue siendo de su clínica: los casos que abra Bambú para él
  los ve la clínica, con aviso en la campana (sin correo).
- Bambú registra derivaciones que llegan por teléfono o correo y da de alta
  clínicas a mano.
- Uniones a clínicas no validadas: solo Bambú.

## Fuera de alcance

- Hilo, adjuntos y sesiones → `hilo-adjuntos-y-sesiones`. Mientras tanto, la
  ficha de la derivación no admite ficheros.
- Informes → `informes-por-voz`.
- Caso privado dentro de la clínica (aplazado en el cuaderno).
