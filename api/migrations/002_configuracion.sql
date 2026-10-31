-- Configuración de negocio: clave → valor validado por zod en el código. Se
-- edita desde el panel y tiene efecto en la siguiente petición.

CREATE TABLE IF NOT EXISTS configuracion (
  clave            text PRIMARY KEY,
  valor            jsonb NOT NULL,
  actualizado      timestamptz NOT NULL DEFAULT now(),
  actualizado_por  int REFERENCES usuarios (id)
);
