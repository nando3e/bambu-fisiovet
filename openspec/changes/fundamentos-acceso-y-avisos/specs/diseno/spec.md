## ADDED Requirements

### Requirement: Identidad visual de la referencia
La interfaz SHALL usar la paleta y la tipografía de la demo de referencia
(`docs/referencia-demo/assets/css/style.css`) como tokens CSS en
`web/src/disseny/tokens.css`: verde `#657d60`, verde oscuro `#344b3b`, verde
profundo `#24392d`, salvia `#a9b69a`, crema `#f8f0df`, papel `#fffdf8`,
melocotón `#dfc2ad`, tinta `#27372d`, apagado `#6d776d`; DM Sans para texto y
Manrope para títulos, **servidas desde la propia app** (sin Google Fonts);
radios de 26 px en tarjetas y 10 px en controles; botones en píldora. Todo
color de la interfaz sale de un token; no hay colores sueltos en los
componentes. Todo par texto/fondo que se usa MUST tener contraste de al menos
4,5:1 (3:1 en texto grande), y la build lo comprueba.

#### Scenario: Contraste insuficiente
- **WHEN** un token de texto sobre `--cream` baja de 4,5:1
- **THEN** el script de contraste falla y la build se para

#### Scenario: Variable CSS inexistente
- **WHEN** un estilo usa `var(--verd)` y ese token no existe
- **THEN** la build falla nombrando la variable y el fichero

#### Scenario: Sin dependencias de fuentes externas
- **WHEN** se carga la app sin acceso a `fonts.googleapis.com`
- **THEN** las fuentes se ven igual

### Requirement: Logo e iconos de la aplicación
El logo de Bambú SHALL mostrarse recortado en círculo (el original tiene fondo
blanco) en la cabecera, en `/acces` y en la landing. El favicon y los iconos
de la PWA se generan a partir de él. Los iconos de la interfaz son de
`lucide-react`, a trazo y en `currentColor`. La aplicación no usa emojis como
iconos; un test falla si aparece uno en `web/src/`.

#### Scenario: Emoji en un componente
- **WHEN** alguien escribe «✳» o «📎» en un componente
- **THEN** el test de la build falla y dice dónde

### Requirement: Esqueleto móvil primero
Las zonas privadas SHALL tener una cabecera con logo y campana, y navegación
en barra inferior por debajo de 900 px y en barra lateral a partir de 900 px.
A 390 px de ancho no hay desplazamiento horizontal en ninguna pantalla. Los
campos de formulario tienen tipografía de al menos 16 px (para que el móvil no
haga zoom al enfocarlos), y la build lo comprueba. Los botones que solo tienen
icono llevan etiqueta accesible. Las animaciones respetan
`prefers-reduced-motion`.

#### Scenario: Pantalla estrecha
- **WHEN** se abre cualquier pantalla a 390 px
- **THEN** cabe a lo ancho y la navegación está abajo

#### Scenario: Escritorio
- **WHEN** se abre a 1280 px
- **THEN** la navegación está en el lateral

### Requirement: Interfaz en valenciano desde un diccionario
Todo texto visible SHALL salir del diccionario `web/src/i18n/va.ts` mediante
una función `t()` cuyas claves están tipadas: usar una clave que no existe no
compila. Las claves están en español y los valores en valenciano. Añadir otro
idioma es añadir un fichero con las mismas claves.

#### Scenario: Clave inexistente
- **WHEN** un componente llama a `t('acceso.botonEntrarr')`
- **THEN** el typecheck falla

### Requirement: Landing con un único acceso
La página pública `/` SHALL presentar el centro (hero, serveis,
instal·lacions, filosofia, «Com funciona» en tres pasos para el veterinario, y
contacte con los datos de la configuración) y tener **una sola puerta de
entrada**: el botón «Deriva un cas» de la cabecera fija y el botón principal
del hero, que llevan los dos a `/acces`. No hay más enlaces a derivar ni a un
acceso privado en tarjetas, bandas o pie: desaparecen el formulario anónimo,
el «Portal veterinari» y el «Accés privat» separados de la demo. Las imágenes
son de Bambú y se sirven desde la app; si falta una, su hueco no se muestra.

#### Scenario: Contar las puertas
- **WHEN** se recorre la landing buscando enlaces a `/acces`
- **THEN** solo existen el de la cabecera y el del hero

#### Scenario: Sin fotos todavía
- **WHEN** Bambú aún no ha aportado la foto de instalaciones
- **THEN** la sección se ve completa sin imagen rota

### Requirement: Una sola pantalla de acceso para todos
`/acces` SHALL servir a veterinarios y a Bambú: pestaña «Entra» (correu o
usuari y contrasenya, «Has oblidat la contrasenya?») y pestaña «Crea un
compte» (solo veterinarios). Tras entrar, cada rol va a su zona: `derivador` a
`/d`, `bambu` y `superadmin` a `/b`. Las rutas de una zona redirigen a
`/acces` sin sesión y a la zona propia con otro rol.

#### Scenario: Fisio entra
- **WHEN** una usuaria `bambu` entra
- **THEN** llega a `/b`

#### Scenario: Derivador abre una ruta de Bambú
- **WHEN** un derivador abre `/b/configuracio`
- **THEN** la app lo lleva a `/d`

### Requirement: PWA que no esconde los despliegues
La web SHALL ser instalable (manifiesto con nombre, colores e iconos de
Bambú). El service worker nunca cachea `/api`. Cuando hay una versión nueva,
la app muestra «Hi ha una versió nova» con un botón para recargar, en vez de
seguir sirviendo la vieja en silencio.

#### Scenario: Despliegue con la app abierta
- **WHEN** se despliega una versión nueva con la PWA abierta
- **THEN** aparece el aviso de versión nueva y al pulsarlo se carga la nueva
