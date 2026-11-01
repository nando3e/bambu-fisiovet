# acceso Specification

## Purpose
TBD - created by archiving change fundamentos-acceso-y-avisos. Update Purpose after archive.
## Requirements
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

### Requirement: Fijar la contraseña desde un enlace de un solo uso
La aplicación SHALL usar el mismo enlace `/acces/estableix/:token` para
verificar el alta, aceptar una invitación y recuperar la contraseña. El token
se guarda solo como hash. Consumirlo MUST ser atómico: solo cuenta si estaba
sin usar y sin caducar. Al consumirlo se fija la contraseña, se marca el
correo como verificado, se abre sesión y se redirige según el rol (derivador
a `/d/nova` la primera vez, Bambú a `/b`). La contraseña MUST tener al menos
10 caracteres y no puede ser el propio correo.

#### Scenario: Enlace válido
- **WHEN** el veterinario abre el enlace y fija una contraseña válida
- **THEN** queda verificado, con sesión abierta y en «Nova derivació»

#### Scenario: Enlace usado dos veces
- **WHEN** se consume un token que ya se consumió
- **THEN** 400 con «Aquest enllaç ja s'ha fet servir o ha caducat» y no cambia nada

#### Scenario: Dos peticiones simultáneas con el mismo token
- **WHEN** llegan a la vez dos peticiones que consumen el mismo token
- **THEN** solo una tiene éxito

#### Scenario: Enlace caducado
- **WHEN** se abre un enlace de verificación pasadas 48 horas
- **THEN** la pantalla lo dice y ofrece reenviar el correo

#### Scenario: Contraseña corta
- **WHEN** se intenta fijar una contraseña de 9 caracteres
- **THEN** 400 y el token sigue sin usar

### Requirement: Reenviar la verificación con freno
La aplicación SHALL permitir reenviar el correo de verificación a una cuenta
no verificada como máximo tres veces por hora y correo. Reenviar invalida los
enlaces de verificación anteriores de esa cuenta.

#### Scenario: Cuarto reenvío en una hora
- **WHEN** se pide el reenvío por cuarta vez en la misma hora
- **THEN** la respuesta es la misma que siempre (la de un correo sin cuenta) y no se encola nada; un 429 solo para las cuentas pendientes revelaría cuáles existen

#### Scenario: El enlace viejo deja de valer
- **WHEN** se reenvía la verificación y se abre el primer enlace
- **THEN** el primer enlace ya no es válido

### Requirement: Entrar con correo o usuario y contraseña
`POST /api/auth/entrar` SHALL aceptar un identificador (correo, o el usuario
del superadmin) y una contraseña. Las contraseñas de usuarios normales se
guardan con scrypt. Cualquier fallo (usuario inexistente, contraseña errónea,
cuenta sin verificar, cuenta desactivada) MUST devolver el mismo 401 con el
mismo texto, «Correu o contrasenya incorrectes», y tardar lo mismo.

#### Scenario: Credenciales correctas
- **WHEN** un usuario verificado y activo entra con su correo y contraseña
- **THEN** se crea una sesión y la respuesta incluye su rol y su clínica

#### Scenario: Usuario inexistente y contraseña errónea son indistinguibles
- **WHEN** se intenta entrar con un correo que no existe y, aparte, con uno que existe y una contraseña errónea
- **THEN** las dos respuestas son el mismo 401 con el mismo cuerpo

#### Scenario: Cuenta sin verificar
- **WHEN** entra alguien que no ha abierto el enlace de verificación
- **THEN** 401 genérico, sin revelar que la cuenta existe

### Requirement: Freno de intentos en las rutas públicas de acceso
La aplicación SHALL limitar las rutas públicas de acceso (entrar, alta,
recuperar, consumir token) a diez peticiones por minuto y dirección.

#### Scenario: Once intentos seguidos
- **WHEN** se hacen once intentos de entrar en un minuto desde la misma dirección
- **THEN** el undécimo devuelve 429 y no se atiende

### Requirement: Sesiones revocables
La sesión SHALL ser un token aleatorio en una cookie `httpOnly`,
`SameSite=Lax` y `Secure` en producción, guardado en BD solo como hash, con
caducidad de 14 días renovada por uso. Cada petición autenticada MUST
comprobar en BD que la sesión existe y que el usuario sigue activo. «Tancar
sessió» borra la sesión.

#### Scenario: Salir
- **WHEN** el usuario cierra sesión y reutiliza la cookie
- **THEN** 401

#### Scenario: Usuario desactivado con sesión abierta
- **WHEN** Bambú desactiva a un usuario que tiene la app abierta
- **THEN** su siguiente petición devuelve 401

### Requirement: Cambiar la contraseña desde dentro
Un usuario con sesión SHALL poder cambiar su contraseña dando la actual y la
nueva. Al cambiarla MUST revocarse todas sus demás sesiones; la actual sigue.

#### Scenario: Cambio correcto
- **WHEN** una veterinaria cambia su contraseña desde el móvil
- **THEN** la sesión del ordenador de la clínica deja de valer y la del móvil sigue

#### Scenario: Contraseña actual errónea
- **WHEN** se da mal la contraseña actual
- **THEN** 400 y no cambia nada

### Requirement: Recuperar la contraseña por correo
`POST /api/auth/recupera` SHALL responder siempre lo mismo, exista o no el
correo: «Si existeix un compte amb aquest correu, t'hem enviat un enllaç». Si
existe una cuenta activa, se encola un enlace de recuperación de una hora.
Consumirlo fija la contraseña nueva y revoca todas las sesiones del usuario.

#### Scenario: Correo existente
- **WHEN** un usuario activo pide recuperar
- **THEN** se encola un correo de recuperación y la respuesta es la genérica

#### Scenario: Correo inexistente
- **WHEN** se pide recuperar un correo que no tiene cuenta
- **THEN** la respuesta es idéntica y no se encola nada

#### Scenario: Recuperación revoca sesiones
- **WHEN** se fija la contraseña con un enlace de recuperación
- **THEN** todas las sesiones anteriores de ese usuario dejan de valer

### Requirement: Superadmin fijo en el entorno
La aplicación SHALL tener una cuenta de servicio con rol `superadmin` definida
por `SUPERADMIN_USUARIO` y `SUPERADMIN_CONTRASENA`, esta última **en claro**.
El login MUST comparar contra las variables en tiempo constante; en BD existe
una fila marcada `es_de_entorno` (para que sus acciones tengan autor) sin hash
ni correo, creada o renombrada en cada arranque. La variable manda siempre:
cambiarla y reiniciar cambia la contraseña. El superadmin no puede recuperar
ni cambiar su contraseña desde la app. Sin `SUPERADMIN_CONTRASENA` no hay
superadmin y el arranque lo avisa; nunca se inventa una por defecto. El
superadmin puede todo lo que puede un usuario `bambu` y además configurar el
servidor de correo.

#### Scenario: Cambiar la contraseña por entorno
- **WHEN** se cambia `SUPERADMIN_CONTRASENA` y se reinicia
- **THEN** se entra con la nueva y la anterior deja de valer

#### Scenario: Sin contraseña definida
- **WHEN** no existe `SUPERADMIN_CONTRASENA`
- **THEN** nadie puede entrar como superadmin y el arranque lo escribe en el log

#### Scenario: Cambiar el usuario
- **WHEN** se cambia `SUPERADMIN_USUARIO` y se reinicia
- **THEN** se renombra la fila existente, no se crea una segunda

#### Scenario: Recuperar la contraseña del superadmin
- **WHEN** se pide recuperar con el usuario del superadmin
- **THEN** la respuesta es la genérica y no se encola nada

### Requirement: Roles comprobados en el servidor
Hay tres roles: `superadmin`, `bambu` y `derivador`. Toda ruta privada SHALL
comprobar en el servidor la sesión (401 si no hay) y el rol (403 si no le
corresponde). La interfaz oculta lo que no corresponde, pero la frontera es
el servidor.

#### Scenario: Derivador en una ruta de Bambú
- **WHEN** un derivador llama a `GET /api/usuarios`
- **THEN** 403

#### Scenario: Sin sesión
- **WHEN** se llama a una ruta privada sin cookie
- **THEN** 401

### Requirement: Invitar usuarios del equipo de Bambú
Un usuario `bambu` o el superadmin SHALL poder crear usuarios `bambu` con
nombre, apellidos y correo. Se crean sin contraseña y se encola una
invitación con enlace de siete días. La invitación puede reenviarse, lo que
invalida la anterior.

#### Scenario: Invitar a una fisio
- **WHEN** Bambú invita a una fisioterapeuta nueva
- **THEN** se encola el correo de invitación y, al usar el enlace y fijar contraseña, entra en `/b`

### Requirement: Desactivar usuarios sin borrarlos
Bambú SHALL poder desactivar y reactivar usuarios `bambu` y `derivador`.
Desactivar revoca todas sus sesiones e impide entrar; nunca borra la fila ni
lo que el usuario hizo. El superadmin no se puede desactivar.

#### Scenario: Desactivar a un veterinario
- **WHEN** Bambú desactiva a un veterinario
- **THEN** no puede entrar, sus sesiones caducan y su nombre sigue en lo que hizo

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

### Requirement: Perfil propio
Cada usuario SHALL poder editar su nombre, apellidos, teléfono y número de
colegiado, y el derivador además el interruptor «Rebre avisos per correu».
El correo no se cambia desde el perfil en v1.

#### Scenario: Apagar los correos
- **WHEN** un derivador apaga «Rebre avisos per correu»
- **THEN** sigue recibiendo notificaciones en la campana pero no correos de avisos

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

