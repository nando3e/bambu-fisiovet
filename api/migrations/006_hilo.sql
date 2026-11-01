-- Hilo por caso: mensajes (texto, adjunto, informe, sistema) con notas
-- internas de Bambú, y adjuntos guardados fuera de toda carpeta pública.
-- Idempotente.

CREATE TABLE IF NOT EXISTS adjuntos (
  id               serial PRIMARY KEY,
  caso_id          int NOT NULL REFERENCES casos (id),
  subido_por       int NOT NULL REFERENCES usuarios (id),
  nombre_original  text NOT NULL,
  -- El tipo detectado por el contenido, nunca el que diga el navegador.
  mime             text NOT NULL,
  bytes            int NOT NULL,
  -- Nombre aleatorio dentro de /datos/adjuntos.
  ruta             text NOT NULL,
  miniatura_ruta   text,
  sha256           text NOT NULL,
  -- Retirar no borra: marca y deja «Adjunt retirat» en el hilo.
  eliminado_el     timestamptz,
  eliminado_por    int REFERENCES usuarios (id),
  creado           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adjuntos_caso ON adjuntos (caso_id);

CREATE TABLE IF NOT EXISTS mensajes (
  id           bigserial PRIMARY KEY,
  caso_id      int NOT NULL REFERENCES casos (id),
  -- NULL = mensaje del sistema.
  autor_id     int REFERENCES usuarios (id),
  tipo         text NOT NULL,
  visibilidad  text NOT NULL DEFAULT 'todos',
  cuerpo       text NOT NULL DEFAULT '',
  adjunto_id   int REFERENCES adjuntos (id),
  -- La tabla de informes llega con el change informes-por-voz, que añade la FK.
  informe_id   int,
  creado       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mensajes_tipo_check CHECK (tipo IN ('texto', 'adjunto', 'informe', 'sistema')),
  CONSTRAINT mensajes_visibilidad_check CHECK (visibilidad IN ('todos', 'bambu'))
);
CREATE INDEX IF NOT EXISTS mensajes_caso ON mensajes (caso_id, creado, id);

-- Las sesiones se llevan en Wakyma: el evento de sesión registrada sale del
-- catálogo. Nunca se publicó ninguno, así que solo se retira su fila de la
-- matriz (configuración, no datos clínicos).
DELETE FROM configuracion_avisos WHERE evento = 'intervencion.registrada';
ALTER TABLE eventos DROP CONSTRAINT IF EXISTS eventos_tipo_check;
ALTER TABLE eventos ADD CONSTRAINT eventos_tipo_check CHECK (tipo IN (
  'derivacion.enviada', 'derivacion.registrada', 'derivacion.aceptada', 'derivacion.rechazada',
  'caso.fisio_asignado', 'caso.en_tratamiento', 'caso.alta', 'caso.abandonado',
  'mensaje.nuevo', 'adjunto.nuevo',
  'informe.publicado', 'paciente.ficha_modificada',
  'usuario.derivador_alta', 'usuario.bambu_alta',
  'usuario.solicita_union', 'usuario.union_resuelta',
  'caso.sin_noticias'
));
