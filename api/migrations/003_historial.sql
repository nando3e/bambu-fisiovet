-- Historial de cambios: antes, después, quién y desde dónde.

CREATE TABLE IF NOT EXISTS historial (
  id          bigserial PRIMARY KEY,
  tabla       text NOT NULL,
  fila_id     text NOT NULL,
  antes       jsonb,
  despues     jsonb,
  usuario_id  int REFERENCES usuarios (id),
  origen      text NOT NULL DEFAULT 'pantalla',
  cuando      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historial_origen_check CHECK (origen IN ('pantalla', 'voz', 'correo', 'sistema'))
);
CREATE INDEX IF NOT EXISTS historial_fila ON historial (tabla, fila_id, cuando DESC);
