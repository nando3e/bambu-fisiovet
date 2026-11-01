-- Informes por voz: transcripciones de los dictados del fisio, propuestas de
-- informe (proponer/regenerar/editar/confirmar) e informes confirmados, que
-- son inmutables. Idempotente.

CREATE TABLE IF NOT EXISTS transcripciones (
  id           serial PRIMARY KEY,
  caso_id      int NOT NULL REFERENCES casos (id),
  autor_id     int NOT NULL REFERENCES usuarios (id),
  -- NULL cuando la retención ya ha borrado el audio; el texto se conserva.
  ruta_audio   text,
  mime         text NOT NULL,
  bytes        int NOT NULL,
  texto        text NOT NULL DEFAULT '',
  modelo       text,
  latencia_ms  int,
  -- El fallo del transcriptor, para enseñarlo y reintentar.
  error        text,
  creado       timestamptz NOT NULL DEFAULT now(),
  actualizado  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transcripciones_caso ON transcripciones (caso_id, creado);

CREATE TABLE IF NOT EXISTS informes (
  id            serial PRIMARY KEY,
  caso_id       int NOT NULL REFERENCES casos (id),
  propuesta_id  int NOT NULL UNIQUE,
  autor_id      int NOT NULL REFERENCES usuarios (id),
  tipo          text NOT NULL,
  contenido     jsonb NOT NULL,
  texto         text NOT NULL,
  -- Corregir un informe es publicar otro que lo sustituye.
  sustituye_id  int REFERENCES informes (id),
  creado        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT informes_tipo_check CHECK (tipo IN ('valoracion', 'evolucion', 'alta'))
);
CREATE INDEX IF NOT EXISTS informes_caso ON informes (caso_id, creado);

CREATE TABLE IF NOT EXISTS propuestas_informe (
  id                    serial PRIMARY KEY,
  caso_id               int NOT NULL REFERENCES casos (id),
  autor_id              int NOT NULL REFERENCES usuarios (id),
  tipo                  text NOT NULL,
  estado                text NOT NULL DEFAULT 'pendiente',
  origen                text NOT NULL,
  transcripcion_ids     int[] NOT NULL DEFAULT '{}',
  instrucciones         text,
  datos                 jsonb NOT NULL,
  ficha                 text NOT NULL,
  modelo                text,
  latencia_ms           int,
  propuesta_origen_id   int REFERENCES propuestas_informe (id),
  sustituye_informe_id  int REFERENCES informes (id),
  informe_id            int REFERENCES informes (id),
  creado                timestamptz NOT NULL DEFAULT now(),
  resuelto_el           timestamptz,
  CONSTRAINT propuestas_tipo_check CHECK (tipo IN ('valoracion', 'evolucion', 'alta')),
  CONSTRAINT propuestas_estado_check CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'corregida')),
  CONSTRAINT propuestas_origen_check CHECK (origen IN ('ia', 'manual', 'edicion'))
);
CREATE INDEX IF NOT EXISTS propuestas_caso ON propuestas_informe (caso_id, creado);
CREATE INDEX IF NOT EXISTS propuestas_pendientes ON propuestas_informe (estado) WHERE estado = 'pendiente';

ALTER TABLE informes DROP CONSTRAINT IF EXISTS informes_propuesta_fk;
ALTER TABLE informes ADD CONSTRAINT informes_propuesta_fk FOREIGN KEY (propuesta_id) REFERENCES propuestas_informe (id);
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_informe_fk;
ALTER TABLE mensajes ADD CONSTRAINT mensajes_informe_fk FOREIGN KEY (informe_id) REFERENCES informes (id);
