## ADDED Requirements

### Requirement: Alta de veterinario con verificación por correo
La aplicación SHALL permitir que un veterinario cree su cuenta desde `/acces`
con nombre, apellidos, clínica, correo, teléfono, número de colegiado
(opcional) y aceptación de la política de privacidad. El alta MUST crear el
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

### Requirement: Clínica provisional en el alta y sugerencias
El alta de un veterinario SHALL crear una clínica nueva con el nombre que
escribió, salvo que se una a una existente. Mientras escribe el nombre de la
clínica, la pantalla MUST sugerir clínicas existentes parecidas
(`GET /api/clinicas/sugerencias`), devolviendo solo nombre y población. Cada
clínica guarda el dominio de correo de su primer veterinario si no es un
dominio genérico (gmail, hotmail, outlook, yahoo, icloud y similares, en una
lista en código).

#### Scenario: Clínica nueva
- **WHEN** un veterinario se da de alta con una clínica que no se parece a ninguna
- **THEN** se crea la clínica y él queda en ella

#### Scenario: Sugerencia por nombre
- **WHEN** escribe «Clinica Sant Roc» y existe «Clínica Veterinària Sant Roc»
- **THEN** la pantalla la sugiere y ofrece «Sol·licita unir-te»

### Requirement: Unirse a una clínica sin cuello de botella
Un veterinario SHALL poder solicitar unirse a una clínica existente, en el
alta o después desde su perfil. La solicitud se aprueba sola si el dominio de
su correo coincide con el de la clínica. Si no, cualquier veterinario activo
de esa clínica o cualquier usuario de Bambú MUST poder aprobarla o rechazarla
con un clic desde la notificación. Mientras está pendiente, el veterinario
trabaja con normalidad en su clínica provisional. Aprobar MUST mover, en una
transacción, al usuario y todo lo de su clínica provisional a la clínica
destino; rechazar lo deja en su clínica. Cada paso publica su evento
(`usuario.solicita_union`, `usuario.union_resuelta`).

#### Scenario: Mismo dominio de correo
- **WHEN** alguien con correo `@santroc.vet` pide unirse a la clínica cuyo dominio es `santroc.vet`
- **THEN** queda unido al momento, sin solicitud pendiente, y se publica `usuario.union_resuelta`

#### Scenario: Correo genérico
- **WHEN** alguien con correo de Gmail pide unirse
- **THEN** la solicitud queda pendiente y llega a los compañeros y a Bambú

#### Scenario: El compañero aprueba
- **WHEN** un compañero aprueba la solicitud
- **THEN** el solicitante pasa a la clínica con todo lo que ya había creado y recibe la notificación

#### Scenario: Un ajeno intenta aprobar
- **WHEN** un veterinario de otra clínica intenta aprobar la solicitud
- **THEN** 404

### Requirement: Invitar a un compañero de clínica
Un veterinario SHALL poder invitar a un compañero por correo. La invitación
lleva la clínica y, al aceptarse, crea al compañero ya dentro de ella, sin
solicitud.

#### Scenario: Invitación aceptada
- **WHEN** el compañero abre la invitación y fija contraseña
- **THEN** entra como derivador de esa misma clínica

### Requirement: Perfil propio
Cada usuario SHALL poder editar su nombre, apellidos, teléfono y número de
colegiado, y el derivador además el interruptor «Rebre avisos per correu».
El correo no se cambia desde el perfil en v1.

#### Scenario: Apagar los correos
- **WHEN** un derivador apaga «Rebre avisos per correu»
- **THEN** sigue recibiendo notificaciones en la campana pero no correos de avisos
