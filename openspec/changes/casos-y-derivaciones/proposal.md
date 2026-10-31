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
- `fusionarClinica` se amplía para mover también casos y pacientes.
- Semilla `--demo` para entornos de prueba.

## Capabilities

### New Capabilities

- `casos`: pacientes, propietarios, casos, derivaciones, estados,
  visibilidad por clínica, listas y fichas.

### Modified Capabilities

_Ninguna a nivel de requisito: los eventos que publica ya están en el catálogo
de `avisos`, y la fusión de clínicas de `acceso` ya dice «todo lo de su
clínica provisional»._

## Impact

- Migración `005_casos.sql` (`propietarios`, `pacientes`, `casos`).
- Rutas `/api/pacientes`, `/api/propietarios`, `/api/casos` y sus transiciones.
- Plantillas de correo `derivacion-nueva`, `derivacion-resuelta`,
  `caso-estado` y `caso-asignado`.
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

## Fuera de alcance

- Hilo, adjuntos y sesiones → `hilo-adjuntos-y-sesiones`. Mientras tanto, la
  ficha de la derivación no admite ficheros.
- Informes → `informes-por-voz`.
- Caso privado dentro de la clínica (aplazado en el cuaderno).
