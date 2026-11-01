# Tasks — change `informes-por-voz`

Regla de la casa: cada task con su test; cada arreglo se verifica quitándolo
y viendo el test en rojo. Toda ruta nueva con su test de rol y de ámbito.

## 1. Datos, contrato y dominio

- [ ] 1.1 `007_informes.sql` (design D1) y `alta_por_informe` desde
      `aceptada` y `en_tratamiento` (dominio y web). Tests: dos veces sin
      error; tabla de transiciones.
- [ ] 1.2 `llm/` (tipos, anthropic, openai, factory) y configuración `ia`
      cifrada. Tests: sin claves no hay redactor ni transcriptor; con clave en
      el panel o en el entorno sí; la clave nunca vuelve por la API.
- [ ] 1.3 `informes/esquema.ts`, `prompt.ts`, `render.ts`. Tests: esquema JSON
      y zod con las mismas claves; el prompt de un caso real no contiene
      propietario, veterinario ni clínica; la ficha es determinista.

## 2. API

- [ ] 2.1 Transcripciones: subir, listar, corregir, reintentar. Tests: dictado
      correcto guarda texto, modelo y latencia; transcriptor caído guarda el
      error y el audio y se puede reintentar; derivador → 403; > 10 MB → 413.
- [ ] 2.2 Propuestas: con IA, a mano, regenerar, editar, cancelar. Tests:
      respuesta inválida → no se guarda nada; dudas guardadas; editar deja la
      original `corregida`; regenerar la deja `cancelada` y enlaza.
- [ ] 2.3 Confirmar. Tests: doble confirmación → un informe y un 409;
      informe de alta pasa el caso a alta y avisa de los dos; mensaje de
      informe en el hilo; corrección enlazada con `sustituye_id`.
- [ ] 2.4 Informes: listar y leer con ámbito. Tests: otra clínica → 404; el
      derivador no ve propuestas ni transcripciones.
- [ ] 2.5 Retención de audios. Test: un audio de 31 días con retención de 30
      desaparece y el texto queda.
- [ ] 2.6 Contador de propuestas pendientes en `/panel/contadores`.

## 3. Web

- [ ] 3.1 Pestaña Informes, vista imprimible y enlace desde el hilo.
- [ ] 3.2 Nou informe: micrófono, transcripciones, IA o a mano, propuesta con
      dudas, regenera, edita, confirma.
- [ ] 3.3 Configuració → Intel·ligència artificial (superadmin).
- [ ] 3.4 Build y recorrido en Chrome (camino a mano y con IA simulada).

## 4. Cierre

- [ ] 4.1 `npm test`, typecheck, `comprova-produccio`.
- [ ] 4.2 Revisor con un modelo distinto; corregir y justificar.
- [ ] 4.3 Redesplegar, probar el camino a mano en producción y archivar.
