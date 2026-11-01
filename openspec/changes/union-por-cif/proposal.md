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
- A una clínica que ya está en el portal **solo se entra por invitación de un
  compañero**. Se quitan las solicitudes de unión, su aprobación y la fusión de
  clínicas.
- **Bambú no registra derivaciones ni crea clínicas** (D18): si una clínica
  llama, se le dice que se registre; la cita se da en Wakyma. Sale la pantalla
  «Registra una derivació», el alta de clínicas por Bambú y su invitación de
  veterinarios.
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
- Bambú ya no registra derivaciones ni crea clínicas; corrige sus datos (el
  CIF) y desactiva a quien haga falta.
- Freno por destinatario: como mucho tres correos de cuenta por hora a una
  misma dirección.
- El veterinario ve el CIF de su clínica pero no lo cambia; lo cambia Bambú.

## Fuera

- Cambiar de clínica a un veterinario que ya tiene cuenta (va al registro de
  aplazados; mientras, Bambú lo resuelve a mano).
