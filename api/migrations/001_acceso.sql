-- Acceso: clínicas, usuarios, sesiones, tokens de correo y solicitudes de
-- unión a clínica. Idempotente.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS clinicas (
  id              serial PRIMARY KEY,
  nombre          text NOT NULL,
  poblacion       text,
  direccion       text,
  codigo_postal   text,
  telefono        text,
  email           text,
  -- Dominio del correo de sus veterinarios cuando no es genérico (gmail…):
  -- quien se da de alta con ese dominio se une sin esperar aprobación.
  dominio_correo  text,
  activa          boolean NOT NULL DEFAULT true,
  creado          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinicas_dominio ON clinicas (dominio_correo) WHERE dominio_correo IS NOT NULL;

CREATE TABLE IF NOT EXISTS usuarios (
  id                  serial PRIMARY KEY,
  email               text,
  -- Solo el superadmin: entra con este usuario en vez de con correo.
  usuario             text,
  nombre              text NOT NULL,
  apellidos           text NOT NULL DEFAULT '',
  telefono            text,
  num_colegiado       text,
  rol                 text NOT NULL,
  clinica_id          int REFERENCES clinicas (id),
  -- NULL hasta que la persona fija su contraseña desde el enlace. El
  -- superadmin nunca tiene: se compara contra el entorno.
  contrasena_hash     text,
  verificado_el       timestamptz,
  activo              boolean NOT NULL DEFAULT true,
  recibe_correos      boolean NOT NULL DEFAULT true,
  es_de_entorno       boolean NOT NULL DEFAULT false,
  privacidad_version  text,
  privacidad_el       timestamptz,
  creado              timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso       timestamptz,
  CONSTRAINT usuarios_rol_check CHECK (rol IN ('superadmin', 'bambu', 'derivador')),
  CONSTRAINT usuarios_email_check CHECK (es_de_entorno OR email IS NOT NULL),
  CONSTRAINT usuarios_clinica_check CHECK (rol <> 'derivador' OR clinica_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico ON usuarios (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_entorno_unico ON usuarios ((true)) WHERE es_de_entorno;
CREATE INDEX IF NOT EXISTS usuarios_clinica ON usuarios (clinica_id);

CREATE TABLE IF NOT EXISTS sesiones (
  -- En la base solo el SHA-256 del token: una copia de la base no abre sesiones.
  token_hash  text PRIMARY KEY,
  usuario_id  int NOT NULL REFERENCES usuarios (id),
  caduca      timestamptz NOT NULL,
  creado      timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz NOT NULL DEFAULT now(),
  user_agent  text
);
CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones (usuario_id);

CREATE TABLE IF NOT EXISTS tokens_correo (
  id          serial PRIMARY KEY,
  usuario_id  int NOT NULL REFERENCES usuarios (id),
  tipo        text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  datos       jsonb NOT NULL DEFAULT '{}',
  caduca      timestamptz NOT NULL,
  usado_el    timestamptz,
  creado      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tokens_correo_tipo_check CHECK (tipo IN ('verificacion', 'recuperacion', 'invitacion'))
);
CREATE INDEX IF NOT EXISTS tokens_correo_usuario ON tokens_correo (usuario_id, tipo);

CREATE TABLE IF NOT EXISTS solicitudes_union (
  id                  serial PRIMARY KEY,
  usuario_id          int NOT NULL REFERENCES usuarios (id),
  clinica_origen_id   int NOT NULL REFERENCES clinicas (id),
  clinica_destino_id  int NOT NULL REFERENCES clinicas (id),
  estado              text NOT NULL DEFAULT 'pendiente',
  resuelta_por        int REFERENCES usuarios (id),
  resuelta_el         timestamptz,
  creado              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitudes_union_estado_check
    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada'))
);
-- Una sola solicitud pendiente por persona.
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_union_una_pendiente
  ON solicitudes_union (usuario_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS solicitudes_union_destino
  ON solicitudes_union (clinica_destino_id) WHERE estado = 'pendiente';
