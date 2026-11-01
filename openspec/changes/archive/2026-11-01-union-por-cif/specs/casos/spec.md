## ADDED Requirements

### Requirement: Bambú corrige los datos de las clínicas
Bambú SHALL poder ver todas las clínicas activas con su CIF y editar sus
datos (nombre, población y CIF/NIF obligatorios; dirección, teléfono y
correo), pero no dar de alta clínicas: las dan de alta sus veterinarios al
registrarse. Un CIF que ya tiene otra clínica activa → 409. Las clínicas
anteriores al change sin CIF se marcan «Sense CIF». No hay «clínica validada».

#### Scenario: CIF repetido
- **WHEN** Bambú pone a una clínica el CIF de otra activa
- **THEN** 409 en el campo CIF y no cambia nada

#### Scenario: Bambú intenta crear una clínica
- **WHEN** un usuario de Bambú llama a `POST /api/clinicas`
- **THEN** 404

## MODIFIED Requirements

### Requirement: Máquina de estados del caso
Los estados SHALL ser `borrador`, `enviada`, `aceptada`, `en_tratamiento`,
`alta`, `rechazada` y `abandonada`, y las transiciones permitidas por rol se
deciden en `dominio/estados-caso.ts`, sin BD. En pantalla se llaman Esborrany,
Nova (Enviada para el veterinario), Acceptada · pendent de cita, En tractament,
Alta, Rebutjada y Tancada (`abandonada`, con motivo). Las visitas se gestionan
en Wakyma: «Ja té cita» es lo único que el portal necesita saber de ellas.

| Desde | A | Quién |
|---|---|---|
| borrador | enviada | derivador |
| enviada | aceptada | bambu |
| enviada | rechazada (con motivo) | bambu |
| aceptada | en_tratamiento | bambu («Ja té cita»: la visita ya está dada en Wakyma) |
| aceptada, en_tratamiento | abandonada (con motivo) | bambu |
| en_tratamiento | alta | bambu (alta manual) o sistema (informe de alta, change 4) |

No hay reapertura: si el animal vuelve a necesitar fisioterapia,
es una derivación nueva del mismo paciente. Una transición no permitida MUST
responder 409 sin cambiar nada. Toda transición deja `historial` y publica su
evento.

#### Scenario: Ja té cita
- **WHEN** Bambú marca «Ja té cita» en una derivación aceptada, con la fecha de la primera visita
- **THEN** pasa a `en_tratamiento`, guarda la fecha y el veterinario recibe la notificación

#### Scenario: Aceptar dos veces
- **WHEN** Bambú acepta un caso que ya está aceptado
- **THEN** 409 y no se publica ningún evento

#### Scenario: Derivador intenta aceptar
- **WHEN** un derivador llama a aceptar su propio caso
- **THEN** 403

#### Scenario: Rechazar sin motivo
- **WHEN** Bambú rechaza sin escribir motivo
- **THEN** 400

#### Scenario: El mismo paciente vuelve a derivarse
- **WHEN** un veterinario deriva otra vez un paciente que ya tuvo un caso en alta
- **THEN** elige el paciente existente, se crea un caso nuevo y la ficha del paciente muestra los dos

### Requirement: El portal solo recibe derivaciones
Todo caso SHALL derivarlo un veterinario desde el portal. Bambú no registra
derivaciones en nombre de una clínica ni abre casos propios: si una clínica
llama, se le dice que se registre en el portal; los animales que llegan sin
veterinario, y las visitas, se gestionan en Wakyma. Los casos que Bambú
registró antes de este change se quedan como están.

#### Scenario: Bambú intenta crear un caso
- **WHEN** un usuario de Bambú llama a `POST /api/casos`
- **THEN** 403 y no se crea nada

## REMOVED Requirements

### Requirement: Derivación registrada por Bambú
**Reason**: el portal es para recibir derivaciones (Nando, 01/11); además permitía que un impostor que registra antes el CIF de una clínica real recibiera casos ajenos.
**Migration**: si una clínica llama, se le dice que se registre; los casos ya registrados se quedan.

### Requirement: Alta de clínicas por Bambú
**Reason**: solo existía para el registro telefónico.
**Migration**: las clínicas las dan de alta sus veterinarios; Bambú corrige sus datos.
