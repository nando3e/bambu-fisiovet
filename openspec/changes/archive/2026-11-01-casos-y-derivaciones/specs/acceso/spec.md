## MODIFIED Requirements

### Requirement: Clínica provisional en el alta y sugerencias
El alta de un veterinario SHALL crear una clínica nueva con el nombre que
escribió, salvo que se una a una existente. Mientras escribe el nombre de la
clínica, la pantalla MUST sugerir clínicas existentes parecidas
(`GET /api/clinicas/sugerencias`), devolviendo solo nombre y población. Solo
se sugieren clínicas activas que estén validadas por Bambú o que tengan algún
usuario activo y verificado; la clínica de un alta sin confirmar no se ofrece
a nadie. Cada clínica guarda el dominio de correo de su primer veterinario si
no es un dominio genérico (gmail, hotmail, outlook, yahoo, icloud y
similares, en una lista en código).

#### Scenario: Clínica nueva
- **WHEN** un veterinario se da de alta con una clínica que no se parece a ninguna
- **THEN** se crea la clínica y él queda en ella

#### Scenario: Sugerencia por nombre
- **WHEN** escribe «Clinica Sant Roc» y existe «Clínica Veterinària Sant Roc»
- **THEN** la pantalla la sugiere y ofrece «Sol·licita unir-te»

#### Scenario: Clínica dada de alta por Bambú
- **WHEN** escribe el nombre de una clínica que Bambú dio de alta y que aún no tiene usuarios
- **THEN** la pantalla la sugiere

#### Scenario: Clínica de un alta sin confirmar
- **WHEN** escribe el nombre de una clínica cuyo único usuario no ha verificado el correo
- **THEN** no se sugiere

### Requirement: Unirse a una clínica sin cuello de botella
Un veterinario SHALL poder solicitar unirse a una clínica existente, en el
alta o después desde su perfil. La solicitud se aprueba sola si el dominio de
su correo coincide con el de la clínica. Si no, la resuelve con un clic desde
la notificación cualquier usuario de Bambú y, **solo si la clínica está
validada por Bambú**, también cualquier veterinario activo de esa clínica; en
una clínica no validada la solicitud solo avisa al lado Bambú y un veterinario
que intente resolverla recibe 404. Mientras está pendiente, el veterinario
trabaja con normalidad en su clínica provisional. Aprobar MUST volver a
comprobar que la clínica de origen no tiene otros miembros y que la de destino
sigue activa, y mover, en una transacción, al usuario y todo lo de su clínica
provisional a la clínica destino; rechazar lo deja en su clínica. Cada paso
publica su evento (`usuario.solicita_union`, `usuario.union_resuelta`).

#### Scenario: Mismo dominio de correo
- **WHEN** alguien con correo `@santroc.vet` pide unirse a la clínica cuyo dominio es `santroc.vet`
- **THEN** queda unido al momento, sin solicitud pendiente, y se publica `usuario.union_resuelta`

#### Scenario: Correo genérico hacia una clínica validada
- **WHEN** alguien con correo de Gmail pide unirse a una clínica validada
- **THEN** la solicitud queda pendiente y llega a los compañeros y a Bambú

#### Scenario: Correo genérico hacia una clínica sin validar
- **WHEN** alguien con correo de Gmail pide unirse a una clínica que Bambú no ha validado
- **THEN** la solicitud queda pendiente, solo llega a Bambú y un veterinario de esa clínica no puede aprobarla (404)

#### Scenario: El compañero aprueba
- **WHEN** un compañero de una clínica validada aprueba la solicitud
- **THEN** el solicitante pasa a la clínica con todo lo que ya había creado y recibe la notificación

#### Scenario: Un ajeno intenta aprobar
- **WHEN** un veterinario de otra clínica intenta aprobar la solicitud
- **THEN** 404

#### Scenario: Cambió algo entre la solicitud y la aprobación
- **WHEN** el solicitante invitó a un compañero a su clínica después de pedir unirse
- **THEN** aprobar responde 409 y nadie se mueve
