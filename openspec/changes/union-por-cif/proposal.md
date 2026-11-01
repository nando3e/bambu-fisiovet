# Proposal — `union-por-cif`

## Por qué

El alta del veterinario sugería clínicas existentes mientras escribía (nombre
y población a un desconocido que aún no ha entrado) y permitía pedir unirse a
cualquiera. Unirse a una clínica da acceso a todos sus casos y a los datos de
sus propietarios: es delicado. Nando no quiere enseñar nada fuera antes de
entrar ni que un desconocido pueda provocar correos a un veterinario.

Decisiones de Nando (2026-11-01):

- Cuentas personales por veterinario (trazabilidad, bajas, avisos al que
  deriva). Una clínica que quiera una sola cuenta puede no invitar a nadie.
- A una clínica que ya está en el portal **solo se entra por invitación**: de
  un compañero o de Bambú. Se quitan las solicitudes de unión, su aprobación y
  la fusión de clínicas.
- La clínica lleva **CIF/NIF obligatorio**, también cuando la da de alta Bambú.
- **Se quita «clínica validada»**: nunca impidió derivar y solo servía para
  decidir quién aprobaba las uniones. Las clínicas están activas o no.
- **Todos los campos del alta son obligatorios.**
- Si alguien se registra con un CIF que ya existe, la pantalla responde lo de
  siempre y el aviso de «pide una invitació» le llega a su propio correo; no
  se crea cuenta y no sale nada hacia la clínica.

## Qué cambia

- Alta: nombre, apellidos, teléfono, número de colegiado, correo, clínica,
  población, CIF/NIF y privacidad, todos obligatorios. El CIF/NIF se valida
  con su dígito o letra de control.
- Sin sugerencias de clínicas (`GET /api/clinicas/sugerencias` desaparece).
- Sin solicitudes de unión (rutas, pantallas, eventos `usuario.solicita_union`
  y `usuario.union_resuelta`).
- Bambú puede invitar a un veterinario a cualquier clínica.
- El veterinario ve el CIF de su clínica pero no lo cambia; lo cambia Bambú.

## Fuera

- Cambiar de clínica a un veterinario que ya tiene cuenta (va al registro de
  aplazados; mientras, Bambú lo resuelve a mano).
