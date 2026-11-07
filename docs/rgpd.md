# RGPD: qué datos trata el portal y cómo

Para Bambú y su asesor. Describe lo que hace la v1 tal como está programada.
Las decisiones legales (bases jurídicas, plazos definitivos, contratos) las
valida el asesor de Bambú. Lo pendiente está al final.

**Responsable del tratamiento**: BAMBÚ Fisiovet. **Encargados**: el hosting
(VPS con Dokploy), el servidor de correo (Dondominio) y, si se activan, los
proveedores de IA (Anthropic y OpenAI).

## 1. Qué datos hay y de quién

| Quién | Datos | Para qué |
|---|---|---|
| Veterinarios derivadores | Nombre, apellidos, correo, teléfono, número de colegiado, clínica, contraseña (hash scrypt) | Cuenta, derivaciones y avisos |
| Clínicas | Nombre, población, CIF/NIF, dirección, teléfono y correo de contacto. **El NIF de una clínica que es de un autónomo es su DNI o NIE: dato personal** | No duplicar clínicas y saber a quién se le dice «demana una invitació» |
| Equipo de Bambú | Nombre, apellidos, correo, contraseña (hash) | Cuenta y trabajo de los casos |
| Propietarios | Nombre, teléfono, correo y el consentimiento aceptado (texto y versión copiados, con fecha) | Contactar para dar cita |
| Pacientes (animales) | Nombre, especie, raza, sexo, edad, peso | Tratamiento |
| Casos | Motivo y tratamiento actual (historia clínica, objetivos y notas solo en los casos anteriores al 07/11/2026: ya no se piden), hilo de mensajes, adjuntos con su categoría (radiografía, informe, analítica), dictados de voz y su texto, informes | Tratamiento y comunicación con el veterinario |
| Todo el mundo | Sesiones (hash del token, navegador, último uso), historial de cambios de cada ficha y traza de correos enviados | Seguridad y trazabilidad |

## 2. Quién ve qué

- **Un veterinario solo ve lo de su clínica.** El filtro va en la consulta a
  la base, no en la pantalla. Fuera de su ámbito la respuesta es «no existe»
  (404), no «prohibido», para no confirmar que el caso existe. Hay un test por
  ruta.
- Un borrador solo lo ve quien lo escribe.
- **Antes de entrar no se enseña ninguna clínica.** El alta no sugiere
  clínicas ni confirma en pantalla si un CIF ya está en el portal: si lo está,
  se lo dice un correo a la dirección que ha escrito quien se registra, y no
  sale nada hacia la clínica. A una clínica que ya está en el portal solo se
  entra por invitación de un compañero o de Bambú, porque entrar da acceso a
  todos sus casos y a los datos de sus propietarios.
- El CIF/NIF de la clínica lo ven sus veterinarios y Bambú; lo cambia solo
  Bambú. No viaja a la IA.
- Las notas internas y sus adjuntos solo los ve el equipo de Bambú. También
  los dictados y las propuestas de informe sin confirmar.
- Los ficheros clínicos (adjuntos, audios) nunca se sirven como públicos:
  pasan por una ruta que comprueba la sesión y el ámbito, sin caché del
  navegador.

## 3. Dónde están

- **Base de datos y ficheros**: Postgres y el volumen `/datos` en el VPS de
  Bambú (Dokploy). Postgres no tiene puerto publicado: solo lo ve la app, por
  la red interna del proyecto.
- **Secretos del panel** (contraseña SMTP, claves de IA): cifrados con
  `CLAVE_CIFRADO`. Nunca vuelven al navegador ni pasan al historial.
- **Correo**: los avisos salen por el SMTP de Dondominio. Llevan el resumen
  justo y un enlace al portal, nunca adjuntos clínicos.

## 4. Qué viaja a la IA (solo si Bambú pone las claves)

Sin claves, la IA está apagada y los informes se redactan a mano.

- **Redacción del informe (Anthropic, OpenAI de reserva)**: viajan los datos
  del paciente (sin el propietario), el caso, los dictados, el informe
  anterior y las indicaciones de la fisio. Antes de enviar, una capa de
  anonimización sustituye cualquier aparición, en cualquier campo, del nombre,
  el teléfono y el correo del propietario, del nombre y el correo del
  veterinario y del nombre de la clínica, además de cualquier teléfono o
  correo, por `[propietari]`, `[veterinari]`, `[clínica]`, `[telèfon]` y
  `[correu]`. Las notas libres del veterinario no viajan. Hay un test que pone
  esos datos en todos los campos que sí viajan y comprueba que no llegan.
- **Transcripción (Whisper de OpenAI)**: viaja el **audio** del dictado, y lo
  que se dice en voz alta no se puede tapar. Pauta para el equipo: **no dictar
  nombres, teléfonos ni correos**; para referirse al propietario, decir «el
  propietari».
- Es una transferencia internacional (EE. UU.). Necesita el contrato de
  encargado de cada proveedor y aparecer en la información al interesado. La
  alternativa es un proveedor de la UE detrás del mismo contrato interno
  (`api/src/llm/`), sin tocar el resto.
- El modelo nunca publica nada: todo informe lo confirma una persona.

## 5. Cuánto tiempo

| Qué | Plazo en la v1 | Cómo |
|---|---|---|
| Audios de los dictados | 30 días (configurable de 1 a 365 en Configuració → Retenció) | Tarea diaria que borra el fichero; el texto se conserva |
| Sesiones | Caducan solas; cambiar la contraseña o desactivar la cuenta las cierra todas | — |
| Enlaces de correo | Verificación 48 h, recuperación 1 h, invitación 7 días, de un solo uso | — |
| Casos, informes, adjuntos, mensajes | Sin borrado en la v1 | Nada se borra en duro: se desactiva, se cancela o se retira con fecha, y queda historial |

## 6. Derechos y consentimiento

- El veterinario acepta la política de privacidad al darse de alta o al
  aceptar una invitación. La casilla es obligatoria.
- El veterinario declara que tiene el consentimiento del propietario al
  enviar la derivación. Se guarda copia del texto aceptado, su versión y la
  fecha. Si Bambú cambia el texto, la versión sube sola.
- Acceso, rectificación y supresión: por ahora a mano, desde el panel o la
  base. No hay purga física automática (aplazado a la v2).

## 7. Pendiente para el asesor de Bambú

- [ ] Texto definitivo de la política de privacidad y del consentimiento del
      propietario (los de la v1 son provisionales y se editan desde el
      panel).
- [ ] Plazo de conservación de casos, informes y adjuntos después del cierre
      (propuesta: 5 años) y purga física al vencer. Incluye los documentos
      subidos a un borrador que después se descartó: quedan en disco sin que
      nadie los vea (sin borrado duro en v1).
- [ ] Contratos de encargado: hosting, Dondominio y, si se activa la IA,
      Anthropic y OpenAI. Mención de la transferencia internacional.
- [ ] Copias de seguridad de Postgres y de `/datos` fuera del servidor:
      dónde, quién y cada cuánto.
- [ ] Procedimiento para atender los derechos de los interesados.
