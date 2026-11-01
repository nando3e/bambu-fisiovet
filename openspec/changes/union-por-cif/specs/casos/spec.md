## MODIFIED Requirements

### Requirement: Derivación registrada por Bambú
Cuando una clínica deriva por teléfono o por correo, un usuario de Bambú SHALL
poder registrar la derivación en su nombre: elige la clínica que la remite
entre las activas, buscando por nombre, población o CIF (o la da de alta en ese momento, con su CIF), y opcionalmente el
veterinario, entre los usuarios de esa clínica o escrito a mano si no tiene
cuenta. La derivación nace `aceptada`, con la clínica elegida y
`registrado_por` = quien la registra; el consentimiento del
propietario lo confirma el fisio. Se publica `derivacion.registrada` para el
veterinario elegido o, si no hay ninguno con cuenta, para los veterinarios
activos de la clínica.

#### Scenario: Llamada de una clínica con cuenta
- **WHEN** una fisio registra la derivación que le dicta por teléfono una veterinaria de una clínica que ya está en el portal
- **THEN** el caso queda `aceptada` en esa clínica, la veterinaria lo ve en su lista y recibe la notificación y el correo

#### Scenario: Clínica que no está en el portal
- **WHEN** llama una clínica que no existe en el portal
- **THEN** la fisio la da de alta con su CIF (sin usuarios) y registra la derivación con el nombre del veterinario escrito a mano

### Requirement: Alta de clínicas por Bambú
Bambú SHALL poder dar de alta clínicas a mano (nombre, población y CIF/NIF
obligatorios; dirección, teléfono y correo), que nacen sin usuarios y
marcadas como dadas de alta por Bambú, y editar los datos de cualquier
clínica. Editar una clínica sin CIF pide ponerlo. Un CIF que ya tiene otra
clínica activa → 409. Su primer veterinario entra por invitación de Bambú.
No hay «clínica validada»: el registro telefónico elige cualquier clínica
activa.

#### Scenario: El veterinario se registra después
- **WHEN** un veterinario de una clínica que Bambú dio de alta se registra con su CIF
- **THEN** le llega «demana una invitació»; Bambú le invita y, al entrar, ve las derivaciones que Bambú registró a su nombre

#### Scenario: CIF repetido
- **WHEN** Bambú da de alta una clínica con el CIF de otra activa
- **THEN** 409 y no se crea
