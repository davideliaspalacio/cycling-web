-- Esquema de Santander Xtreme. Idempotente: se puede correr las veces que sea.
--
-- Criterio de diseño: las cuotas son filas de verdad porque son el libro de
-- dinero — se actualizan una por una, se consultan por vencimiento y no pueden
-- quedar a medias. Los datos del ciclista van en jsonb porque siempre se leen y
-- escriben completos; los dos campos por los que sí buscamos (documento y
-- correo) tienen su índice de expresión.

CREATE TABLE IF NOT EXISTS inscripciones (
  id               uuid        PRIMARY KEY,
  referencia       text        NOT NULL UNIQUE,
  creada_en        timestamptz NOT NULL DEFAULT now(),
  actualizada_en   timestamptz NOT NULL DEFAULT now(),
  estado           text        NOT NULL,
  categoria_codigo text        NOT NULL,
  ciclista         jsonb       NOT NULL,
  tallas           jsonb       NOT NULL,
  consentimientos  jsonb       NOT NULL,
  plan             text        NOT NULL,
  -- En pesos colombianos enteros: el COP no maneja centavos en la práctica.
  total            integer     NOT NULL CHECK (total >= 0),
  pagado           integer     NOT NULL DEFAULT 0 CHECK (pagado >= 0),
  fuente_pago_id   bigint,
  tarjeta_resumen  jsonb,
  eventos          jsonb       NOT NULL DEFAULT '[]'::jsonb
);

-- Añadida después: constancia de autorización de cobro recurrente.
ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS autorizacion_cobro jsonb;

-- Cómo se cobró esta inscripción. Las viejas se hicieron con la pasarela; las
-- nuevas son transferencia manual con comprobante. El DEFAULT deja las filas
-- que ya existen exactamente como estaban.
ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS medio_pago text NOT NULL DEFAULT 'WOMPI';

ALTER TABLE inscripciones DROP CONSTRAINT IF EXISTS inscripciones_medio_pago_check;
ALTER TABLE inscripciones ADD CONSTRAINT inscripciones_medio_pago_check
  CHECK (medio_pago IN ('WOMPI','TRANSFERENCIA'));

CREATE INDEX IF NOT EXISTS inscripciones_documento_idx
  ON inscripciones ((ciclista ->> 'identificacion'));

CREATE INDEX IF NOT EXISTS inscripciones_correo_idx
  ON inscripciones (lower(ciclista ->> 'correo'));

CREATE INDEX IF NOT EXISTS inscripciones_creada_idx
  ON inscripciones (creada_en DESC);

CREATE TABLE IF NOT EXISTS cuotas (
  inscripcion_id    uuid        NOT NULL
                                REFERENCES inscripciones (id) ON DELETE CASCADE,
  numero            integer     NOT NULL CHECK (numero > 0),
  vence             date        NOT NULL,
  monto             integer     NOT NULL CHECK (monto > 0),
  estado            text        NOT NULL
                                CHECK (estado IN ('PENDIENTE','PAGADA','VENCIDA','FALLIDA')),
  referencia        text        NOT NULL,
  transaccion_id    text,
  pagada_en         timestamptz,
  intentos          integer     NOT NULL DEFAULT 0,
  ultimo_intento_en timestamptz,
  ultimo_error      text,
  PRIMARY KEY (inscripcion_id, numero)
);

-- El estado EN_PROCESO se añadió después de detectar que Wompi liquida en
-- diferido; hay que reemplazar la restricción original.
ALTER TABLE cuotas DROP CONSTRAINT IF EXISTS cuotas_estado_check;
ALTER TABLE cuotas ADD CONSTRAINT cuotas_estado_check
  CHECK (estado IN ('PENDIENTE','EN_PROCESO','PAGADA','VENCIDA','FALLIDA'));

-- El barrido diario del cron pregunta justo por esto.
CREATE INDEX IF NOT EXISTS cuotas_por_cobrar_idx
  ON cuotas (estado, vence)
  WHERE estado <> 'PAGADA';

-- Abonos: el libro de dinero del pago manual por transferencia.
--
-- Cada fila es un comprobante que subió el ciclista y que alguien de la
-- organización revisó a mano. A diferencia de las cuotas, un abono NO se
-- borra ni se reescribe en bloque: guarda evidencia y un historial de revisión
-- (quién, cuándo, por cuánto), que es justamente lo que hay que poder mostrar
-- si el ciclista reclama. Por eso tiene id propio y funciones propias en el
-- almacén, fuera del camino de `guardarInscripcion`.
--
-- El archivo en sí no vive aquí: solo su clave en el almacenamiento privado,
-- más tamaño, tipo y SHA-256 del contenido para poder detectar reenvíos.
CREATE TABLE IF NOT EXISTS abonos (
  id                uuid        PRIMARY KEY,
  inscripcion_id    uuid        NOT NULL
                                REFERENCES inscripciones (id) ON DELETE CASCADE,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  numero            integer     NOT NULL,
  canal             text        NOT NULL,
  -- En pesos colombianos enteros, igual que el resto del dinero del proyecto.
  monto_declarado   integer     NOT NULL CHECK (monto_declarado > 0),
  transferido_el    date,
  referencia_externa text,
  evidencia_clave   text        NOT NULL,
  evidencia_tipo    text        NOT NULL,
  evidencia_bytes   integer     NOT NULL,
  evidencia_sha256  text        NOT NULL,
  huella            jsonb,
  estado            text        NOT NULL,
  -- El revisor puede aprobar por un monto distinto al declarado: pasa siempre.
  monto_aprobado    integer     CHECK (monto_aprobado >= 0),
  revisado_en       timestamptz,
  revisado_por      text,
  motivo_rechazo    text
);

ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abonos_numero_check;
ALTER TABLE abonos ADD CONSTRAINT abonos_numero_check
  CHECK (numero >= 1 AND numero <= 3);

ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abonos_canal_check;
ALTER TABLE abonos ADD CONSTRAINT abonos_canal_check
  CHECK (canal IN ('BANCOLOMBIA','NEQUI','DAVIPLATA','BRE_B'));

ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abonos_estado_check;
ALTER TABLE abonos ADD CONSTRAINT abonos_estado_check
  CHECK (estado IN ('ENVIADA','EN_REVISION','VERIFICADA','RECHAZADA'));

-- Un abono verificado sin monto aprobado sería dinero sin cifra: no cuadra.
ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abonos_verificada_con_monto_check;
ALTER TABLE abonos ADD CONSTRAINT abonos_verificada_con_monto_check
  CHECK (estado <> 'VERIFICADA' OR monto_aprobado IS NOT NULL);

-- La cola de revisión del panel pregunta exactamente esto, en este orden.
CREATE INDEX IF NOT EXISTS abonos_por_revisar_idx
  ON abonos (estado, creado_en)
  WHERE estado IN ('ENVIADA','EN_REVISION');

-- El historial de una inscripción, del más reciente al más viejo.
CREATE INDEX IF NOT EXISTS abonos_inscripcion_idx
  ON abonos (inscripcion_id, creado_en DESC);

-- La misma captura subida dos veces. Índice y no restricción única a
-- propósito: que el revisor lo vea y decida, no que la base bloquee el envío
-- (un mismo comprobante puede amparar legítimamente a dos ciclistas).
CREATE INDEX IF NOT EXISTS abonos_evidencia_sha256_idx
  ON abonos (evidencia_sha256);

CREATE TABLE IF NOT EXISTS correos (
  id           uuid        PRIMARY KEY,
  para         text        NOT NULL,
  asunto       text        NOT NULL,
  plantilla    text        NOT NULL,
  html         text        NOT NULL,
  enviado_en   timestamptz NOT NULL DEFAULT now(),
  proveedor    text        NOT NULL,
  proveedor_id text,
  referencia   text
);

CREATE INDEX IF NOT EXISTS correos_enviado_idx ON correos (enviado_en DESC);
