# Tasks — change `union-por-cif`

Regla de la casa: cada task con su test; cada arreglo se verifica quitándolo
y viendo el test en rojo. Toda ruta nueva con su test de ámbito y de rol.

## 1. API

- [x] 1.1 `dominio/nif.ts`: normalizar y validar DNI, NIE y CIF (D2). Test en
      `dominio.test.ts`: válidos de cada tipo, letra o dígito de control
      equivocado, normalización de minúsculas, espacios y guiones.
- [x] 1.2 Migración `009_cif.sql`: `clinicas.cif` con índice único parcial
      sobre las activas; fuera de la matriz y del CHECK de `eventos` los dos
      eventos de unión (el CHECK solo si no hay filas de esos tipos).
- [x] 1.3 Alta (D4): todos los campos obligatorios, CIF validado; clínica
      real con ese CIF → nada creado y plantilla `clinica-existente`; alta
      abandonada con ese CIF → se desactiva y sigue; misma respuesta siempre.
- [x] 1.4 Clínicas: sin sugerencias ni solicitudes; CIF obligatorio en el alta
      y la edición de Bambú (409 si se repite); el veterinario no lo cambia;
      `POST /api/clinicas/:id/invitaciones` para Bambú (D5).
- [x] 1.5 Retirar `servicios/clinicas.ts`, `dominio/union-clinica.ts` y los
      eventos de unión del catálogo (D6).
- [x] 1.6 Semilla de demo con CIF válidos.

## 2. Web

- [x] 2.1 Alta: campos nuevos obligatorios, sin sugerencias.
- [x] 2.2 Perfil: CIF de la clínica a la vista, sin unión; la ayuda de invitar
      explica que quien ya tiene cuenta lo cambia Bambú.
- [x] 2.3 Clíniques: CIF en la lista y en el formulario, «Convida un
      veterinari» por clínica, sin solicitudes. Nova clínica en el registro
      telefónico con CIF.
- [x] 2.4 Textos en `va.ts` y ayudas actualizadas.

## 3. Cierre

- [x] 3.1 `docs/rgpd.md` (NIF de autónomo, D7), cuaderno (decisión y
      aplazado «cambiar de clínica a un veterinario con cuenta»).
- [ ] 3.2 Revisor (Sol) sobre el diff; lo descartado, justificado en
      `revision.md`.
- [ ] 3.3 Desplegar y archivar.
