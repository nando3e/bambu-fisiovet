## ADDED Requirements

### Requirement: Un CIF, una clínica
Cada clínica activa SHALL tener un CIF/NIF distinto (índice único parcial
sobre las activas). Si alguien se da de alta con el CIF de una clínica activa
que tiene algún usuario activo y verificado (o que dio de alta Bambú antes de
este change), no se crea nada: la respuesta es la misma que en un alta
correcta y se encola a la dirección tecleada un correo que le dice que pida a
alguien de su clínica que le invite. Nunca sale ningún correo hacia la clínica
ni hacia sus veterinarios. Una clínica con ese CIF de un alta pendiente es de
quien se registró primero mientras su enlace siga vigente; solo cuando el
enlace ha caducado, nadie la ha confirmado y no tiene casos ni pacientes, se
desactiva con sus usuarios sin verificar y el alta nueva sigue.

#### Scenario: CIF de una clínica que ya está en el portal
- **WHEN** alguien se da de alta con el CIF de una clínica con veterinarios verificados
- **THEN** la pantalla responde lo de siempre, no se crea usuario ni clínica y a su correo le llega «demana una invitació»

#### Scenario: Mismo CIF escrito de otra forma
- **WHEN** el CIF llega con minúsculas, espacios o guiones
- **THEN** se reconoce como el mismo

#### Scenario: CIF de un alta pendiente con el enlace vigente
- **WHEN** el CIF es de una clínica cuyo único usuario aún no ha confirmado y su enlace sigue vigente
- **THEN** no se le quita: a quien llega después le llega «demana una invitació»

#### Scenario: CIF de un alta abandonada
- **WHEN** el CIF es de una clínica cuyo único usuario nunca confirmó, su enlace ya caducó y no tiene datos
- **THEN** esa clínica se desactiva y la nueva alta sigue

#### Scenario: El veterinario no cambia el CIF
- **WHEN** un veterinario edita los datos de su clínica
- **THEN** el CIF no cambia aunque lo envíe; solo lo cambia Bambú

## MODIFIED Requirements

### Requirement: Alta de veterinario con verificación por correo
La aplicación SHALL permitir que un veterinario cree su cuenta desde `/acces`
con nombre, apellidos, teléfono, número de colegiado, correo, nombre de la
clínica, población, CIF/NIF de la clínica y aceptación de la política de
privacidad, **todos obligatorios**. El CIF/NIF se valida con su dígito o letra
de control y se guarda normalizado. El alta no enseña ninguna clínica
existente: no hay sugerencias ni listas antes de entrar. Las clínicas las dan
de alta sus veterinarios así: Bambú no crea clínicas. El alta MUST crear el
usuario con rol `derivador`, sin contraseña y sin verificar, y encolar un
correo de verificación con un enlace de un solo uso a
`/acces/estableix/:token` que caduca a las 48 horas. Se guarda la versión del
texto de privacidad aceptado y la fecha.

#### Scenario: Alta correcta
- **WHEN** una veterinaria rellena el alta con un correo nuevo
- **THEN** se crea su usuario sin contraseña, se encola un correo de verificación y la pantalla dice que revise su correo

#### Scenario: Correo ya registrado
- **WHEN** alguien se da de alta con un correo que ya tiene cuenta
- **THEN** la respuesta es la misma que en un alta correcta, no se crea nada y al dueño de ese correo se le encola un aviso con enlace a recuperar la contraseña

#### Scenario: Sin aceptar la privacidad
- **WHEN** se envía el alta sin marcar la casilla de privacidad
- **THEN** 400 y no se crea el usuario

#### Scenario: Falta un campo
- **WHEN** se envía el alta sin número de colegiado, sin población o sin CIF
- **THEN** 400 con el campo que falta y no se crea nada

#### Scenario: CIF mal escrito
- **WHEN** el CIF/NIF no cuadra con su letra o dígito de control
- **THEN** 400 en el campo CIF

#### Scenario: Demasiados correos a una dirección
- **WHEN** alguien provoca más de tres correos de cuenta en una hora hacia la misma dirección (alta, recuperación o «clínica existent»)
- **THEN** la respuesta es la de siempre, no sale ningún correo más y los enlaces anteriores siguen valiendo

### Requirement: Invitar a un compañero de clínica
A una clínica que ya está en el portal SHALL entrarse solo por invitación de
un compañero: un veterinario invita por correo desde su perfil, y la
invitación lleva su clínica y, al aceptarse, crea al compañero ya dentro de
ella. Nadie puede pedir entrar en una clínica, y Bambú no mete a nadie en
ninguna. Invitar a un correo que ya tiene cuenta responde lo mismo y no hace
nada.

#### Scenario: Invitación aceptada
- **WHEN** el compañero abre la invitación y fija contraseña
- **THEN** entra como derivador de esa misma clínica

#### Scenario: Bambú no invita
- **WHEN** un usuario de Bambú intenta invitar a alguien a una clínica
- **THEN** no hay ruta para ello (404)

## REMOVED Requirements

### Requirement: Clínica provisional en el alta y sugerencias
**Reason**: enseñaba clínicas existentes a quien aún no ha entrado.
**Migration**: el alta pide el CIF; con un CIF que ya existe, «demana una invitació» por correo.

### Requirement: Unirse a una clínica sin cuello de botella
**Reason**: unirse da acceso a los datos de toda la clínica; decisión de Nando: solo por invitación de un compañero.
**Migration**: invitación desde el perfil de un compañero.
