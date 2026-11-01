-- Change union-por-cif: CIF/NIF de la clínica y fuera la unión por solicitud.
-- Idempotente.

ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS cif text;
-- Un CIF, una clínica activa (las anteriores al change quedan sin CIF hasta
-- que Bambú lo ponga).
CREATE UNIQUE INDEX IF NOT EXISTS clinicas_cif_activa ON clinicas (cif) WHERE activa AND cif IS NOT NULL;

-- «Validada» ya no decide nada (servía para aprobar uniones). Lo único que
-- importa es si la clínica la dio de alta Bambú: entonces quien se registre
-- con su CIF tiene que pedir invitación. Hasta ahora, en la práctica, las
-- validadas eran las de Bambú. La columna validada se queda sin uso.
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS alta_por_bambu boolean NOT NULL DEFAULT false;
UPDATE clinicas SET alta_por_bambu = true WHERE validada AND NOT alta_por_bambu;

-- A una clínica existente solo se entra por invitación: los eventos de la
-- unión salen de la matriz y del CHECK. NOT VALID: las filas nuevas tienen que
-- cumplirlo, y las históricas de esos tipos (si las hubo) se quedan como están.
-- Bambú tampoco registra derivaciones en nombre de una clínica: fuera
-- derivacion.registrada (los casos que ya se registraron así se quedan).
DELETE FROM configuracion_avisos WHERE evento IN ('usuario.solicita_union', 'usuario.union_resuelta', 'derivacion.registrada');
ALTER TABLE eventos DROP CONSTRAINT IF EXISTS eventos_tipo_check;
ALTER TABLE eventos ADD CONSTRAINT eventos_tipo_check CHECK (tipo IN (
  'derivacion.enviada', 'derivacion.aceptada', 'derivacion.rechazada',
  'caso.fisio_asignado', 'caso.en_tratamiento', 'caso.alta', 'caso.abandonado',
  'mensaje.nuevo', 'adjunto.nuevo', 'informe.publicado', 'paciente.ficha_modificada',
  'usuario.derivador_alta', 'usuario.bambu_alta', 'caso.sin_noticias'
)) NOT VALID;

-- Las solicitudes que quedaran pendientes ya no las resuelve nadie.
UPDATE solicitudes_union SET estado = 'rechazada', resuelta_el = now() WHERE estado = 'pendiente';
