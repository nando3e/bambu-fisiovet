# Revisión del change `union-por-cif` (Sol, gpt-5.6-sol, 2026-11-01)

Revisión en solo lectura sobre el commit 2b23856. Hallazgos y qué se hizo.

## GRAVE — Retirar un alta pendiente legítima y apropiarse del CIF

Un atacante con el CIF público de una clínica cuya veterinaria aún no había
confirmado el correo hacía que se retirara su clínica y se quedaba con el CIF;
cuando esa clínica llamara, Bambú podía registrar la derivación en la clínica
del atacante. Había además una carrera con la confirmación.

**Arreglado.** Solo se retira una reserva cuyo enlace ya caducó, sin nadie
verificado y sin casos ni pacientes, bloqueando antes a sus usuarios. Test:
el alta pendiente con enlace vigente no se quita; la caducada sí; la que
tiene datos no (quitar el arreglo lo pone en rojo).

**Y la causa de fondo, por decisión de Nando (D18):** Bambú no registra
derivaciones. Aun sin retirar nada, quien se registre antes que nadie con el
CIF de una clínica real ya no puede recibir un caso que no haya derivado él.

## MEDIO — Acoso por correo y enlaces invalidados sin parar

**Arreglado.** Freno por destinatario: como mucho tres correos de cuenta por
hora a una dirección (alta, recuperación, «clínica existent»), sin emitir
enlace nuevo pasado el freno. Test con cinco altas y una recuperación: tres
correos (quitar el freno lo pone en rojo). El reenvío de verificación ya
tenía el suyo. No se añade CAPTCHA: el freno por destinatario corta el acoso
y no hace falta un tercero.

## MEDIO — El CHECK de eventos seguía admitiendo los eventos retirados

**Arreglado.** La migración rehace siempre el CHECK con el catálogo actual,
`NOT VALID` para no tropezar con filas antiguas. Test: insertar
`usuario.solicita_union` falla.

## LEVE — La invitación delata cuentas por tiempo de respuesta

**Descartado.** Solo puede medirlo alguien que ya está dentro, con el freno
de invitaciones (correos con nuestro remitente) y con un canal muy ruidoso.
Hacer la invitación asíncrona para igualar tiempos no compensa hoy. Se
reabre si aparecen invitaciones en masa en la traza.

## Comprobaciones de Sol sin hallazgo

Tokens antiguos con `union_clinica_id` ignorados; solicitudes pendientes
rechazadas por la migración; cálculo de CIF, DNI y NIE correcto; respuesta
del alta idéntica en código y cuerpo.
