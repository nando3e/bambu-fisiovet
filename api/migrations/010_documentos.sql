-- Change derivacion-breve-y-documentos: los documentos de la derivación
-- (radiografies, informes, analítiques) son adjuntos con categoría; los que
-- entran por el clip del hilo van sin ella. Idempotente.

ALTER TABLE adjuntos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE adjuntos DROP CONSTRAINT IF EXISTS adjuntos_categoria_check;
ALTER TABLE adjuntos ADD CONSTRAINT adjuntos_categoria_check
  CHECK (categoria IS NULL OR categoria IN ('radiografia', 'informe', 'analitica'));

-- La derivación ya no pide història clínica, objectius ni altres notes: las
-- columnas se quedan (sin borrado duro) con lo que tuvieran los casos viejos.
