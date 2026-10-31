-- Casos: propietarios, pacientes y casos, la marca de clínica validada y el
-- evento nuevo del catálogo. Idempotente.
--
-- El portal solo recibe derivaciones: todo caso tiene clínica y lo derivó un
-- veterinario o lo registró Bambú en su nombre. Los casos propios de Bambú se
-- gestionan en su programa (Wakyma).

-- Bambú valida las clínicas: las que da de alta a mano nacen validadas, y en
-- una no validada las uniones solo las aprueba Bambú.
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS validada boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS propietarios (
  id                      serial PRIMARY KEY,
  nombre                  text NOT NULL DEFAULT '',
  telefono                text,
  email                   text,
  -- El consentimiento es del dueño sobre sus datos: texto y versión copiados
  -- tal como los aceptó.
  consentimiento_version  int,
  consentimiento_texto    text,
  consentimiento_el       timestamptz,
  clinica_origen_id       int REFERENCES clinicas (id),
  creado_por              int REFERENCES usuarios (id),
  creado                  timestamptz NOT NULL DEFAULT now(),
  actualizado             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS propietarios_clinica ON propietarios (clinica_origen_id);

CREATE TABLE IF NOT EXISTS pacientes (
  id                 serial PRIMARY KEY,
  nombre             text NOT NULL DEFAULT '',
  especie            text,
  especie_otra       text,
  raza               text,
  sexo               text,
  esterilizado       boolean,
  fecha_nacimiento   date,
  edad_texto         text,
  peso_kg            numeric(5, 2),
  propietario_id     int NOT NULL REFERENCES propietarios (id),
  -- La clínica que lo derivó; una derivación nueva del mismo paciente la hereda.
  clinica_origen_id  int REFERENCES clinicas (id),
  creado_por         int REFERENCES usuarios (id),
  creado             timestamptz NOT NULL DEFAULT now(),
  actualizado        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pacientes_especie_check
    CHECK (especie IS NULL OR especie IN ('perro', 'gato', 'conejo', 'ave', 'otro')),
  CONSTRAINT pacientes_especie_otra_check
    CHECK (especie IS DISTINCT FROM 'otro' OR coalesce(trim(especie_otra), '') <> ''),
  CONSTRAINT pacientes_sexo_check
    CHECK (sexo IS NULL OR sexo IN ('macho', 'hembra', 'desconocido')),
  CONSTRAINT pacientes_peso_check CHECK (peso_kg IS NULL OR peso_kg > 0)
);
CREATE INDEX IF NOT EXISTS pacientes_clinica ON pacientes (clinica_origen_id);
CREATE INDEX IF NOT EXISTS pacientes_propietario ON pacientes (propietario_id);

CREATE TABLE IF NOT EXISTS casos (
  id                    serial PRIMARY KEY,
  paciente_id           int NOT NULL REFERENCES pacientes (id),
  clinica_id            int NOT NULL REFERENCES clinicas (id),
  derivador_id          int REFERENCES usuarios (id),
  -- Veterinario sin cuenta en una derivación que registra Bambú por teléfono.
  derivador_nombre      text,
  -- El usuario de Bambú que registró la derivación en nombre de la clínica.
  registrado_por        int REFERENCES usuarios (id),
  creado_por            int NOT NULL REFERENCES usuarios (id),
  estado                text NOT NULL,
  motivo                text NOT NULL DEFAULT '',
  historia_clinica      text NOT NULL DEFAULT '',
  tratamiento_actual    text NOT NULL DEFAULT '',
  objetivos             text NOT NULL DEFAULT '',
  notas_derivador       text NOT NULL DEFAULT '',
  fisio_responsable_id  int REFERENCES usuarios (id),
  -- Motivo de rechazo o de abandono.
  motivo_cierre         text,
  -- Un borrador descartado no se borra: queda fuera de las listas.
  descartado_el         timestamptz,
  enviado_el            timestamptz,
  resuelto_el           timestamptz,
  primera_sesion_el     timestamptz,
  cerrado_el            timestamptz,
  ultima_actividad      timestamptz NOT NULL DEFAULT now(),
  creado                timestamptz NOT NULL DEFAULT now(),
  actualizado           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT casos_estado_check CHECK (estado IN (
    'borrador', 'enviada', 'aceptada', 'en_tratamiento', 'alta', 'rechazada', 'abandonada'
  )),
  -- Lo derivó un veterinario desde el portal o lo registró Bambú en su nombre.
  CONSTRAINT casos_origen_check CHECK (derivador_id IS NOT NULL OR registrado_por IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS casos_clinica ON casos (clinica_id, ultima_actividad DESC);
CREATE INDEX IF NOT EXISTS casos_estado ON casos (estado, ultima_actividad DESC);
CREATE INDEX IF NOT EXISTS casos_paciente ON casos (paciente_id);

-- Las tablas de avisos ya guardaban el caso; ahora existe y lleva su clave.
ALTER TABLE eventos DROP CONSTRAINT IF EXISTS eventos_caso_fk;
ALTER TABLE eventos ADD CONSTRAINT eventos_caso_fk FOREIGN KEY (caso_id) REFERENCES casos (id);

-- Catálogo ampliado: tiene que coincidir con src/avisos/eventos.ts (un test lo
-- compara con la restricción viva de la base).
ALTER TABLE eventos DROP CONSTRAINT IF EXISTS eventos_tipo_check;
ALTER TABLE eventos ADD CONSTRAINT eventos_tipo_check CHECK (tipo IN (
  'derivacion.enviada', 'derivacion.registrada', 'derivacion.aceptada', 'derivacion.rechazada',
  'caso.fisio_asignado', 'caso.en_tratamiento', 'caso.alta',
  'caso.abandonado',
  'mensaje.nuevo', 'adjunto.nuevo', 'intervencion.registrada',
  'informe.publicado', 'paciente.ficha_modificada',
  'usuario.derivador_alta', 'usuario.bambu_alta',
  'usuario.solicita_union', 'usuario.union_resuelta',
  'caso.sin_noticias'
));
