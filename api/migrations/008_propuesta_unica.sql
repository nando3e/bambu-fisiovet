-- Una sola propuesta de informe pendiente por caso (revisión del change 4):
-- dos toques en «Corregir» o en «Redacta» creaban dos pendientes, cada una con
-- su lease, y se podían publicar las dos. Si alguna base ya tiene duplicadas,
-- se queda la más reciente y las demás pasan a canceladas.
UPDATE propuestas_informe p SET estado = 'cancelada', resuelto_el = now()
WHERE p.estado = 'pendiente'
  AND EXISTS (SELECT 1 FROM propuestas_informe o WHERE o.caso_id = p.caso_id AND o.estado = 'pendiente' AND o.id > p.id);

CREATE UNIQUE INDEX IF NOT EXISTS propuestas_pendiente_unica ON propuestas_informe (caso_id) WHERE estado = 'pendiente';
