-- Avisos: eventos de dominio, la matriz que decide qué avisa, las
-- notificaciones de la campana, la cola de correos y la traza de cada intento.
--
-- La lista de eventos del CHECK tiene que coincidir con el catálogo de
-- src/avisos/eventos.ts; un test lo comprueba.

CREATE TABLE IF NOT EXISTS eventos (
  id          bigserial PRIMARY KEY,
  tipo        text NOT NULL,
  -- La tabla de casos llega con el change casos-y-derivaciones, que añade la
  -- clave foránea.
  caso_id     int,
  clinica_id  int REFERENCES clinicas (id),
  actor_id    int REFERENCES usuarios (id),
  datos       jsonb NOT NULL DEFAULT '{}',
  creado      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_tipo_check CHECK (tipo IN (
    'derivacion.enviada', 'derivacion.aceptada', 'derivacion.rechazada',
    'caso.fisio_asignado', 'caso.en_tratamiento', 'caso.alta', 'caso.abandonado',
    'mensaje.nuevo', 'adjunto.nuevo', 'intervencion.registrada',
    'informe.publicado', 'paciente.ficha_modificada',
    'usuario.derivador_alta', 'usuario.bambu_alta',
    'usuario.solicita_union', 'usuario.union_resuelta',
    'caso.sin_noticias'
  ))
);
CREATE INDEX IF NOT EXISTS eventos_caso ON eventos (caso_id, creado DESC);
CREATE INDEX IF NOT EXISTS eventos_recientes ON eventos (creado DESC);

-- La matriz: una fila por evento, sembrada con los valores por defecto. La
-- audiencia no se guarda: es fija y vive en el catálogo.
CREATE TABLE IF NOT EXISTS configuracion_avisos (
  evento           text PRIMARY KEY,
  notificacion     boolean NOT NULL,
  correo           boolean NOT NULL,
  -- Solo en eventos de audiencia Bambú. NULL = el correo del centro.
  correo_a         text,
  actualizado      timestamptz NOT NULL DEFAULT now(),
  actualizado_por  int REFERENCES usuarios (id)
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id          bigserial PRIMARY KEY,
  usuario_id  int NOT NULL REFERENCES usuarios (id),
  evento_id   bigint NOT NULL REFERENCES eventos (id),
  caso_id     int,
  titulo      text NOT NULL,
  cuerpo      text NOT NULL DEFAULT '',
  enlace      text NOT NULL,
  leida_el    timestamptz,
  creado      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_no_leidas ON notificaciones (usuario_id) WHERE leida_el IS NULL;
CREATE INDEX IF NOT EXISTS notificaciones_usuario ON notificaciones (usuario_id, creado DESC);
CREATE INDEX IF NOT EXISTS notificaciones_caso_no_leidas
  ON notificaciones (caso_id, usuario_id) WHERE leida_el IS NULL;

CREATE TABLE IF NOT EXISTS correos_pendientes (
  id                       bigserial PRIMARY KEY,
  -- NULL en los correos de cuenta (verificación, recuperación, invitación),
  -- que no pasan por la matriz.
  evento_id                bigint REFERENCES eventos (id),
  destinatario_usuario_id  int REFERENCES usuarios (id),
  destinatario             text NOT NULL,
  plantilla                text NOT NULL,
  datos                    jsonb NOT NULL DEFAULT '{}',
  estado                   text NOT NULL DEFAULT 'pendiente',
  intentos                 int NOT NULL DEFAULT 0,
  proximo_intento          timestamptz NOT NULL DEFAULT now(),
  en_curso_desde           timestamptz,
  error                    text,
  creado                   timestamptz NOT NULL DEFAULT now(),
  enviado_el               timestamptz,
  CONSTRAINT correos_pendientes_estado_check
    CHECK (estado IN ('pendiente', 'en_curso', 'enviado', 'fallido', 'descartado'))
);
CREATE INDEX IF NOT EXISTS correos_pendientes_cola
  ON correos_pendientes (proximo_intento) WHERE estado IN ('pendiente', 'en_curso');

CREATE TABLE IF NOT EXISTS avisos_enviados (
  id                   bigserial PRIMARY KEY,
  canal                text NOT NULL,
  evento_id            bigint REFERENCES eventos (id),
  correo_pendiente_id  bigint REFERENCES correos_pendientes (id),
  destinatario         text NOT NULL,
  plantilla            text,
  enviado              boolean NOT NULL,
  motivo               text,
  creado               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avisos_enviados_canal_check CHECK (canal IN ('correo', 'notificacion', 'whatsapp'))
);
CREATE INDEX IF NOT EXISTS avisos_enviados_evento ON avisos_enviados (evento_id);
