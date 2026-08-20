-- Esquema de Tibet Epic XCM. Idempotente: se puede correr las veces que sea.
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

-- El estado EN_PROCESO se añadió después de detectar que Wompi liquida en
-- diferido; hay que reemplazar la restricción original.
ALTER TABLE cuotas DROP CONSTRAINT IF EXISTS cuotas_estado_check;
ALTER TABLE cuotas ADD CONSTRAINT cuotas_estado_check
  CHECK (estado IN ('PENDIENTE','EN_PROCESO','PAGADA','VENCIDA','FALLIDA'));

-- Añadida después: constancia de autorización de cobro recurrente.
ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS autorizacion_cobro jsonb;

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

-- El barrido diario del cron pregunta justo por esto.
CREATE INDEX IF NOT EXISTS cuotas_por_cobrar_idx
  ON cuotas (estado, vence)
  WHERE estado <> 'PAGADA';

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
