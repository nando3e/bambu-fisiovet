# Guía del portal BAMBÚ Fisiovet

Cómo funciona el portal, en orden y en lenguaje llano. Primero el recorrido
del veterinario que deriva; después, qué hace Bambú con cada derivación. Al
final, los diagramas.

Los nombres entre comillas («Accedir», «Ja té cita»…) son los botones y las
pestañas tal como salen en pantalla, en valenciano.

---

## Antes de empezar: quién es quién

| Quién | Qué hace en el portal |
|---|---|
| **Veterinario** | Trabaja en una clínica, deriva casos a Bambú y los sigue. Solo ve los casos de su clínica. |
| **Equipo de Bambú** (fisios) | Recibe las derivaciones, las acepta o no, da la cita en Wakyma, hace los informes y habla con el veterinario por el hilo del caso. Ve todos los casos. |
| **Superadmin** | Una cuenta de Bambú con llave maestra: configura el servidor de correo y las claves de IA. |
| **Propietario del animal** | No entra al portal. Bambú le llama por teléfono para darle cita. |
| **Wakyma** | El programa de agenda de Bambú. Las visitas se apuntan allí, no en el portal. |

**Las tres reglas de oro**

1. **El portal solo recibe derivaciones.** Bambú no las registra en nombre de
   nadie: si una clínica llama por teléfono, se le dice que se registre en el
   portal.
2. **Las visitas van en Wakyma.** El portal solo necesita saber que el animal
   «ya tiene cita».
3. **Cada veterinario solo ve lo de su clínica**, y a una clínica que ya está
   en el portal solo se entra si te invita un compañero.

---

## Parte 1. El recorrido del veterinario

### Paso 1. Darse de alta (una sola vez)

1. Entra en **bambufisiovet.com** y pulsa «Accedir» (o «Deriva un cas»).
   Elige «Crea un compte».
2. Rellena **todo**: nombre, apellidos, correo, teléfono, número de
   colegiado, nombre de la clínica, población y **CIF o NIF de la clínica**.
   Marca que acepta la política de privacidad.
3. La pantalla siempre dice lo mismo: «T'hem enviat un correu».
4. **Le llega un correo** con un enlace para confirmar. El enlace vale
   **48 horas**.
5. Pulsa el enlace, elige su contraseña y ya está dentro, en «Nova
   derivació», listo para derivar.
6. Bambú recibe un aviso: «Nou veterinari». Es solo informativo; nadie tiene
   que aprobar nada.

**Qué puede pasar**

- **El CIF ya es de una clínica que está en el portal.** No se crea nada. A
  su correo (no a la clínica) le llega: «aquesta clínica ja és al portal,
  demana a algú que et convide». Tiene que pedir a un compañero que le
  invite (ver paso 7).
- **No le llega el correo.** Que mire en el correo no deseado. Desde la
  pantalla de acceso puede pedir que se lo reenvíe.
- **Se le pasaron las 48 horas.** Que vuelva a darse de alta con el mismo
  correo: le llega un enlace nuevo.
- **Alguien se registró antes con ese CIF y nunca confirmó.** Mientras su
  enlace siga vigente, la clínica es de quien llegó primero. Cuando caduca y
  sigue sin confirmar, se retira sola y el CIF queda libre.

### Paso 2. Entrar cada día

- «Accedir», correo y contraseña. Entra en su lista de derivaciones.
- **¿Ha olvidado la contraseña?** «Has oblidat la contrasenya?» le manda un
  enlace por correo (vale 1 hora).
- En la lista tiene cuatro pestañas: «Totes», «En curs», «Esborranys» y
  «Tancades». Con la casilla «Amb novetats» ve solo los casos con avisos que
  no ha leído (llevan un punto verde). El círculo con la «i» lo explica.

### Paso 3. Derivar un caso

«Nova derivació» tiene tres pasos:

1. **«Pacient i propietari»**: datos del animal y del propietario. Si el
   animal ya se derivó antes, lo busca y se rellenan solos.
2. **«Motiu clínic»**: por qué lo deriva, historia, tratamiento actual,
   objetivos.
3. **«Consentiment i enviament»**: confirma que el propietario acepta que sus
   datos lleguen a Bambú (si ya lo aceptó antes, no hace falta) y pulsa
   «Envia la derivació».

- **Se guarda solo** mientras escribe. Si lo deja a medias, lo tiene en
  «Esborranys» y lo puede seguir en otro momento o en el ordenador.
- **Un borrador solo lo ve quien lo escribe.** Se puede descartar.
- Si falta algo al enviar, el portal le lleva al campo que falta.

### Paso 4. Después de enviar

La derivación pasa por estos estados. En cada cambio, el veterinario recibe un
aviso:

| Estado en pantalla | Qué significa | Qué le llega al veterinario |
|---|---|---|
| «Nova» (para él, «Enviada») | Bambú la tiene que mirar | Cuando Bambú la abre, en la ficha pone «Rebuda per Bambú» |
| «Pendent de cita» | Bambú la ha aceptado y llamará al propietario | Aviso «Derivació acceptada» |
| «Rebutjada» | Bambú no la acepta | Aviso con el motivo |
| «En tractament» | El animal ya tiene cita | Aviso «ha començat el tractament» |
| «Alta» | Tratamiento acabado | Aviso «ha rebut l'alta» |
| «Tancada» | Se cerró sin tratamiento (no contesta, no viene…) | Aviso con el motivo |

- **Mientras Bambú no la ha aceptado, puede corregir los datos.** Después ya
  no: lo que haga falta añadir, por el hilo.

### Paso 5. Durante el tratamiento

- **El hilo del caso** es para hablar con Bambú. Puede escribir y adjuntar
  documentos (analíticas, radiografías).
- **Los informes** que publica Bambú le llegan al hilo y a la campana, y los
  puede imprimir.
- Los avisos le llegan a la campana y, si no lo ha apagado, también por
  correo. En «Perfil» → «Rebre avisos per correu» decide si quiere correos.

### Paso 6. El final

- Con el alta (o si se cierra), el caso pasa a «Tancades». Queda como archivo.
- **Si el animal vuelve** (recaída, otra lesión): una derivación nueva del
  mismo paciente. En la ficha del paciente se ven todas.

### Paso 7. Los compañeros de la clínica

- Desde «Perfil» → «Convida un company», con nombre y correo.
- Al compañero le llega un correo (vale **7 días**), elige contraseña y entra
  directamente en la clínica. Ve los mismos casos.
- **Es la única forma de entrar en una clínica que ya está en el portal.**
  Nadie puede pedir entrar por su cuenta, ni Bambú mete a nadie.
- Una clínica que prefiera **una sola cuenta** (por ejemplo, la de
  recepción) puede no invitar a nadie.
- **El CIF de la clínica** lo ve en su perfil pero no lo puede cambiar; si
  está mal, lo corrige Bambú.

### Escenarios rápidos

| Qué pasa | Qué hacer |
|---|---|
| Un compañero quiere derivar | Que le invite alguien de la clínica desde su perfil |
| Se registró con el CIF de su clínica y le llegó «demana una invitació» | Pedir a un compañero que le invite. Si no hay nadie en el portal, hablar con Bambú |
| Se equivocó en un dato y la derivación ya está aceptada | Escribirlo en el hilo |
| Quiere dejar de recibir correos | «Perfil» → apagar «Rebre avisos per correu» (la campana sigue) |
| Alguien deja la clínica | Avisar a Bambú: lo desactiva y pierde el acceso al momento |
| Ya tiene cuenta en otra clínica y se cambia | De momento lo resuelve Bambú a mano |
| Su clínica llama por teléfono para derivar | Bambú le pedirá que lo haga por el portal |

---

## Parte 2. Guía para el equipo de Bambú

### Cada mañana: «Inici»

La primera pantalla enseña lo que pide atención, cada cifra con enlace a la
lista ya filtrada:

- **«Sense obrir»**: derivaciones nuevas que nadie ha abierto. Lo primero.
- **«Noves»**: por aceptar o rechazar.
- **«Pendents de cita»**: aceptadas, falta dar cita.
- **«Encallades»**: pendientes de cita desde hace más de 3 días.
- **«En tractament»**.
- **Propuestas de informe por confirmar**, si las hay.
- Debajo, los últimos movimientos y los avisos.

En «Casos», las pestañas son las mismas. El círculo con la «i» explica qué hay
en cada una, qué hay que hacer y qué enciende «Amb novetats».

### Llega una derivación nueva: paso a paso

1. **Llega el aviso «Nova derivació»** a la campana de todo el equipo y por
   correo (ver «Adónde van los correos»).
2. **Abrirla.** Solo con abrirla queda marcada «Rebuda per Bambú» (el
   veterinario lo ve) y deja de estar en «Sense obrir».
3. **Decidir:**
   - **«Accepta»**: si se quiere, elegir el **fisio responsable** (se puede
     cambiar después con «Canvia el fisio»). Pasa a «Pendent de cita».
   - **«Rebutja»**: escribir el motivo. Al veterinario le llega.
4. **Llamar al propietario y darle cita en Wakyma.** El portal no tiene
   agenda.
5. **Volver al portal y pulsar «Ja té cita».** La fecha de la primera visita
   es opcional. Pasa a «En tractament» y el veterinario recibe el aviso.

**Si no hay manera de dar la cita** (no contesta, no viene, lo descarta):
«Tanca» con el motivo. Al veterinario le llega.

### Las «Encallades»

- Si una derivación pasa **más de 3 días en «Pendent de cita»**, sale en
  «Encallades» y **el equipo recibe un aviso** («Pendent de cita: fa més de
  3 dies…»). Llega **una sola vez** por derivación.
- Qué hacer: volver a llamar al propietario o escribir al veterinario por el
  hilo. Si no hay forma, «Tanca».
- Los 3 días se cambian en «Configuració» → «Avisos».

### Durante el tratamiento

- **El hilo**: lo que se escribe lo ve el veterinario. Las **notas
  internas** solo las ve Bambú.
- **Documentos**: se adjuntan al hilo. Los de una nota interna, solo para
  Bambú.
- **Informes** (valoración, evolución, alta):
  1. «Nou informe»: se dicta con el micrófono (si hay claves de IA) o se
     escribe a mano.
  2. Sale una **propuesta**: se revisa y se corrige.
  3. **«Confirma»**: se publica en el hilo y le llega al veterinario.
  - **Un informe nunca sale sin confirmar.** Corregir uno ya publicado es
    publicar otro que lo sustituye.
- **Fisio responsable**: es quien lleva el caso, pero los avisos (mensajes,
  documentos, cambios de ficha) le llegan a todo el equipo igualmente.
- Si el veterinario cambia datos de la ficha, llega un aviso.

### Terminar

- **«Alta»** (con confirmación), o **confirmar un informe de alta**, que
  también da el alta. El veterinario recibe el aviso.
- **«Tanca»** con el motivo, si se deja sin terminar.
- No hay reapertura: si el animal vuelve, el veterinario hace una derivación
  nueva.

### Avisos: si pasa esto, ¿a quién le llega?

Valores de serie; se cambian en «Configuració» → «Avisos».

| Si pasa… | Le llega a… | Campana | Correo |
|---|---|---|---|
| Un veterinario envía una derivación | Todo el equipo de Bambú | sí | sí |
| Se da de alta un veterinario nuevo | Todo el equipo de Bambú | sí | sí |
| Entra alguien nuevo en el equipo de Bambú | Todo el equipo de Bambú | sí | no |
| A un fisio le asignan un caso | Solo ese fisio | sí | no |
| El veterinario escribe o adjunta en el hilo | Todo el equipo de Bambú | sí | sí |
| El veterinario cambia datos de la ficha | Todo el equipo de Bambú | sí | no |
| Una derivación se encalla (3 días sin cita) | Todo el equipo de Bambú, una vez | sí | sí |
| Bambú acepta, rechaza, da el alta o cierra | El veterinario que derivó y los compañeros que escribieron en el hilo | sí | sí |
| Bambú marca «Ja té cita» | El veterinario | sí | no |
| Bambú escribe o adjunta en el hilo | El veterinario | sí | sí |
| Bambú publica un informe | El veterinario | sí | sí |

- Nadie recibe aviso de lo que hace él mismo.
- **Sin correos repetidos**: en mensajes, documentos y cambios de ficha, si
  la persona ya tiene un aviso sin leer de ese caso, no se le manda otro
  correo hasta que lo lea.

### Adónde van los correos del equipo

Para cada aviso del equipo, el portal mira en este orden:

1. Si el aviso tiene **«Correu a»** (una o varias direcciones separadas por
   comas), a esas.
2. Si no, al **correo del centro**.
3. Si tampoco hay, **a cada persona del equipo**, a su correo.

El correo del centro puede quedar vacío si se rellena «Correu a» en los
avisos que interesen.

### Clínicas y veterinarios («Clíniques»)

- Las clínicas las dan de alta **sus veterinarios** al registrarse. Bambú no
  crea clínicas.
- Al desplegar una clínica se ven sus veterinarios. Se puede:
  - **Desactivar** a un veterinario: pierde el acceso al momento y lo que
    hizo se queda.
  - **«Edita les dades»**: corregir nombre, población, CIF, teléfono o
    correo. El CIF no se puede repetir entre clínicas activas.
- Las clínicas antiguas sin CIF llevan la etiqueta **«Sense CIF»** y salen
  contadas en «Inici».

### Lo que el portal no hace

- **Agenda y visitas**: en Wakyma.
- **Registrar derivaciones por teléfono**: la clínica se registra y deriva.
- **Casos propios de Bambú** (animales que llegan sin veterinario): en
  Wakyma.
- **Borrar**: nada se borra; se desactiva o se cierra, y queda el historial.

### Quién configura qué («Configuració»)

| Pestaña | Quién | Para qué |
|---|---|---|
| «Equip» | Bambú | Invitar a alguien al equipo de Bambú |
| «Avisos» | Bambú | Qué avisos van a la campana y al correo, el correo del centro y los días para «Encallades» |
| «Contacte web», «Imatges de la web», «Textos legals» | Bambú | Contacto y horario de la portada, sus fotos y los textos legales |
| «Retenció» | Bambú | Los plazos de conservación de los datos |
| «Servidor de correu» | Superadmin | El correo de Dondominio, con botón de prueba |
| «Intel·ligència artificial» | Superadmin | Las claves para dictar y redactar informes |

---

## Diagramas

### 1. Alta del veterinario y entrada a una clínica

![Alta del veterinario](guia/alta-veterinario.svg)

### 2. La vida de una derivación

![Estados de una derivación](guia/estados-derivacion.svg)

### 3. Qué hace Bambú con una derivación nueva

![Día a día de Bambú](guia/bambu-dia-a-dia.svg)
