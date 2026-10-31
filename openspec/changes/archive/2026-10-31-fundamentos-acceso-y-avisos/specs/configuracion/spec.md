## ADDED Requirements

### Requirement: Configuración de negocio en BD con efecto inmediato
Los ajustes que decide el negocio SHALL guardarse en BD como pares clave →
valor, validados por un esquema por clave, y tener efecto en la siguiente
petición sin reiniciar ni desplegar. La semilla crea los valores por defecto y
nunca pisa lo que ya existe. Solo `bambu` y `superadmin` leen y escriben la
configuración; cada cambio deja `historial` con quién y cuándo.

#### Scenario: Derivador en configuración
- **WHEN** un derivador llama a `GET /api/configuracion`
- **THEN** 403

#### Scenario: Valor inválido
- **WHEN** se guarda un teléfono de contacto con letras
- **THEN** 400 y no cambia nada

### Requirement: Contacto de la web desde el panel
Configuració → «Contacte web» SHALL editar el correo, teléfono, dirección,
horario, enlace de mapa e Instagram del centro. La landing los lee de
`GET /api/publico/contacto` (público, solo esos campos). Un dato vacío MUST
ocultar su línea en la web: nunca se muestran textos de relleno del tipo
«configura el teléfono en el panel».

#### Scenario: Cambiar el teléfono
- **WHEN** Bambú cambia el teléfono en el panel
- **THEN** la landing muestra el nuevo al recargar, sin desplegar

#### Scenario: Sin dirección
- **WHEN** la dirección está vacía
- **THEN** la landing no muestra la línea de dirección ni el enlace al mapa

### Requirement: Correo del centro
Configuració → «Avisos» SHALL tener el «Correu del centre per als avisos», que
es el destino por defecto de los correos de audiencia Bambú, y la matriz de
eventos descrita en la capacidad `avisos`, editable fila a fila con guardado
inmediato.

#### Scenario: Guardar una fila
- **WHEN** Bambú marca «Correu» en `mensaje.nuevo`
- **THEN** se guarda al momento y el siguiente mensaje ya encola correo

### Requirement: Servidor de correo configurable solo por el superadmin
La aplicación SHALL permitir solo al superadmin, en Configuració →
«Servidor de correu», editar servidor SMTP, puerto, seguridad
(STARTTLS o SSL), usuario, contraseña, nombre y dirección del remitente. La
contraseña MUST guardarse cifrada con `CLAVE_CIFRADO` del entorno y nunca
devolverse al navegador: el campo es de solo escritura y la pantalla solo
indica si hay una configurada. Dejar el campo vacío al guardar conserva la
anterior. Un botón «Envia un correu de prova» manda un correo a la dirección
que se indique, usando la configuración guardada, y muestra el resultado o el
error del servidor. Los cambios dejan `historial` sin el valor de la
contraseña. La cola usa la configuración vigente en cada envío.

#### Scenario: Usuario bambu en el servidor de correo
- **WHEN** un usuario `bambu` llama a `GET /api/configuracion/correo`
- **THEN** 403

#### Scenario: La contraseña no vuelve
- **WHEN** el superadmin abre la pantalla con una contraseña ya guardada
- **THEN** la respuesta indica `contrasena_configurada: true` y no contiene la contraseña ni su cifrado

#### Scenario: Guardar sin tocar la contraseña
- **WHEN** el superadmin cambia el puerto y deja la contraseña vacía
- **THEN** se guarda el puerto y la contraseña sigue siendo la anterior

#### Scenario: Correo de prueba con error
- **WHEN** el superadmin prueba con un usuario SMTP equivocado
- **THEN** la pantalla muestra el error del servidor y no se guarda nada nuevo

#### Scenario: Sin clave de cifrado
- **WHEN** falta `CLAVE_CIFRADO` en el entorno
- **THEN** el arranque falla con un mensaje claro

#### Scenario: Cambio en caliente
- **WHEN** el superadmin cambia el servidor y hay correos pendientes
- **THEN** los siguientes envíos usan el servidor nuevo sin reiniciar

### Requirement: Equipo de Bambú
Configuració → «Equip» SHALL listar los usuarios `bambu` con su estado
(invitado, activo, desactivado), invitar a uno nuevo, reenviar la invitación y
desactivar o reactivar, según la capacidad `acceso`. El superadmin aparece
marcado y sin acciones.

#### Scenario: Invitación pendiente
- **WHEN** una fisio invitada aún no ha fijado contraseña
- **THEN** aparece como «Convidada» con el botón «Torna a enviar»

### Requirement: Retención de audios
Configuració → «Retenció» SHALL guardar cuántos días se conservan los audios
de las notas de voz (30 por defecto, entre 1 y 365). La tarea que los purga
llega con el change `informes-por-voz`; este change solo guarda el valor.

#### Scenario: Fuera de rango
- **WHEN** se guarda una retención de 0 días
- **THEN** 400

### Requirement: Fotos de la web desde el panel
La aplicación SHALL permitir a Bambú cambiar desde Configuració → «Imatges de
la web» la foto de portada y la de las instalaciones, subiendo un JPG, PNG o
WebP de hasta 8 MB. El tipo se comprueba por el contenido del fichero, no por
la extensión. Cada subida se guarda con un nombre aleatorio y se sirve con
caché inmutable; «Torna a la de serie» vuelve a la foto que trae la web.
Mientras no se suba ninguna, la web muestra unas fotos de serie.

#### Scenario: Subir la foto de portada
- **WHEN** Bambú sube una foto PNG de portada
- **THEN** la web pública la muestra en el hero al recargar

#### Scenario: Ejecutable disfrazado
- **WHEN** se sube un ejecutable con extensión .png
- **THEN** 400 y la web sigue con la foto anterior

#### Scenario: Derivador
- **WHEN** un derivador intenta subir una foto de la web
- **THEN** 403
