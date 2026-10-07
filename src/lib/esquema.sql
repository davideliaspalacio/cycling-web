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

/* ------------------------- Etapas de inscripción --------------------------- */
--
-- La etapa 2 abre con otro precio (470.000 en vez de 380.000), otros cupos y
-- un plan más de cuotas. Eso obliga a que **cada inscripción recuerde su
-- etapa y su precio**: si el saldo se calculara desde la tarifa vigente, abrir
-- la etapa 2 le subiría la deuda a las 142 personas que entraron en la 1, y 95
-- de ellas están a mitad de un plan de cuotas.
--
-- El DEFAULT es lo que deja intactas esas filas: todas son de la etapa 1, su
-- `total` ya está guardado y nada de esto lo toca.
--
-- Sin CHECK a propósito: la lista de etapas vive en `src/lib/catalogo.ts` y
-- abrir una tercera no debería exigir tocar el esquema.
ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS etapa text NOT NULL DEFAULT 'ETAPA_1';

-- Precio de lista de su etapa el día que se inscribió, antes del descuento.
-- `total` es lo que debe de verdad; esto es la constancia de sobre qué cifra
-- se calculó. Nullable: en las filas que ya existen se deduce como
-- `total + descuento` (380.000 + 0), que es exactamente lo que valían.
ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS precio_base integer CHECK (precio_base IS NULL OR precio_base >= 0);

-- Qué código de referido usó. Texto y no clave ajena: si alguien borrara un
-- código, la inscripción tiene que seguir diciendo de dónde salió su
-- descuento. Por eso los códigos se desactivan y solo se borran sin usos.
ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS codigo_referido text;

-- Cuánto se le descontó, EN PESOS y no en porcentaje. Si mañana el 10% cambia,
-- lo que ya se cobró no se puede mover; guardar el porcentaje lo recalcularía.
ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS descuento integer NOT NULL DEFAULT 0 CHECK (descuento >= 0);

-- Las dos preguntas nuevas del panel: cuántos cupos van por etapa, y quién usó
-- cada código.
CREATE INDEX IF NOT EXISTS inscripciones_etapa_idx ON inscripciones (etapa);

CREATE INDEX IF NOT EXISTS inscripciones_codigo_referido_idx
  ON inscripciones (codigo_referido) WHERE codigo_referido IS NOT NULL;

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

-- El tope es el plan más largo de cualquier etapa: la 1 llega a 3 cuotas y la
-- 2 a 4, y un comprobante es una cuota. El límite real de cada inscripción es
-- el de SU plan y lo hace cumplir `registrarAbono`; esto es solo la red.
ALTER TABLE abonos DROP CONSTRAINT IF EXISTS abonos_numero_check;
ALTER TABLE abonos ADD CONSTRAINT abonos_numero_check
  CHECK (numero >= 1 AND numero <= 4);

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

/* ---------------------- Entrega de los correos (webhooks) ------------------ */
--
-- Hasta aquí `correos` solo sabía que el correo se compuso y que el proveedor
-- lo aceptó. Aceptado no es entregado: el rebote ocurre después, cuando el
-- servidor del ciclista contesta. Eso llega por los webhooks de ZeptoMail
-- (Mail Agent → Webhooks) y es lo que estas columnas guardan.
--
-- Mientras no haya webhook configurado se quedan en 'SIN_CONFIRMAR' y la
-- pantalla lo dice con esas palabras. Nunca damos por entregado lo que nadie
-- confirmó.

ALTER TABLE correos
  ADD COLUMN IF NOT EXISTS estado_entrega text NOT NULL DEFAULT 'SIN_CONFIRMAR';

ALTER TABLE correos ADD COLUMN IF NOT EXISTS entregado_en       timestamptz;
ALTER TABLE correos ADD COLUMN IF NOT EXISTS rebotado_en        timestamptz;
-- DURO = la dirección no existe y no va a existir. BLANDO = hoy no se pudo.
ALTER TABLE correos ADD COLUMN IF NOT EXISTS rebote_tipo        text;
-- Tal como lo manda el proveedor ("relaying-issue", "user-unknown"…). La
-- traducción a español llano se hace al pintar, no al guardar: si mañana Zoho
-- estrena un motivo, aquí queda el original y no una etiqueta inventada.
ALTER TABLE correos ADD COLUMN IF NOT EXISTS rebote_motivo      text;
ALTER TABLE correos ADD COLUMN IF NOT EXISTS rebote_diagnostico text;
ALTER TABLE correos ADD COLUMN IF NOT EXISTS abierto_en         timestamptz;
-- Bucle de retroalimentación: el ciclista le dio a "esto es spam".
ALTER TABLE correos ADD COLUMN IF NOT EXISTS queja_en           timestamptz;

-- El webhook identifica el correo por `request_id`, que es lo que devuelve el
-- envío en la raíz de la respuesta. `proveedor_id` guarda el message_id
-- cuando la respuesta lo trae, y hasta tener un envío real con webhook activo
-- no sabemos con certeza si son el mismo valor. Se guardan los dos por
-- separado: cruzar de más es barato, no poder cruzar deja el seguimiento
-- inservible para siempre.
ALTER TABLE correos ADD COLUMN IF NOT EXISTS proveedor_request_id text;

ALTER TABLE correos DROP CONSTRAINT IF EXISTS correos_estado_entrega_check;
ALTER TABLE correos ADD CONSTRAINT correos_estado_entrega_check
  CHECK (estado_entrega IN ('SIN_CONFIRMAR','ENTREGADO','ABIERTO','REBOTADO','QUEJA'));

ALTER TABLE correos DROP CONSTRAINT IF EXISTS correos_rebote_tipo_check;
ALTER TABLE correos ADD CONSTRAINT correos_rebote_tipo_check
  CHECK (rebote_tipo IS NULL OR rebote_tipo IN ('DURO','BLANDO'));

-- El receptor del webhook busca por aquí, y es el camino que tiene que ser
-- rápido: llega una petición por evento y hay que contestar 200 enseguida.
CREATE INDEX IF NOT EXISTS correos_proveedor_request_idx
  ON correos (proveedor_request_id)
  WHERE proveedor_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS correos_proveedor_id_idx
  ON correos (proveedor_id)
  WHERE proveedor_id IS NOT NULL;

-- Respaldo del emparejamiento cuando el evento no trae identificador nuestro:
-- destinatario (+ referencia) y el más reciente.
CREATE INDEX IF NOT EXISTS correos_para_idx ON correos (lower(para), enviado_en DESC);
CREATE INDEX IF NOT EXISTS correos_referencia_idx
  ON correos (referencia) WHERE referencia IS NOT NULL;

-- Las dos consultas de /panel/correos: el resumen de arriba y el filtro por
-- estado del listado.
CREATE INDEX IF NOT EXISTS correos_estado_entrega_idx
  ON correos (estado_entrega, enviado_en DESC);

-- Los rebotes son lo que dispara trabajo humano: se listan solos y a menudo.
CREATE INDEX IF NOT EXISTS correos_rebotados_idx
  ON correos (rebotado_en DESC) WHERE rebotado_en IS NOT NULL;

/* --------------------------- Códigos de referido --------------------------- */
--
-- Los embajadores traen ciclistas; en la etapa 2 cada código da un 10% de
-- descuento. El porcentaje NO vive aquí: vive en la etapa
-- (`src/lib/catalogo.ts`), porque así lo pidió la organización —es una
-- condición de la etapa, no un acuerdo por embajador— y porque un solo número
-- no se puede desincronizar. Lo que sí vive en la inscripción es el descuento
-- en pesos, así que cambiar el porcentaje nunca mueve lo ya cobrado.
--
-- El código es la clave primaria: es lo que se escribe, lo que se dicta por
-- WhatsApp y lo que guarda la inscripción. Por eso un código **se desactiva,
-- no se borra**: borrar uno que ya usaron veinte personas dejaría esas
-- inscripciones apuntando al vacío y se perdería de dónde salió el descuento.
-- Borrar solo se admite cuando no tiene ningún uso, y eso lo comprueba
-- `borrarCodigo` contra `inscripciones`.
CREATE TABLE IF NOT EXISTS codigos_referido (
  codigo      text        PRIMARY KEY,
  propietario text        NOT NULL,
  activo      boolean     NOT NULL DEFAULT true,
  -- Cuántas veces se aplicó, según el registro. La cifra que manda en el panel
  -- es cuántas inscripciones apuntan al código; este contador existe para que
  -- una diferencia se pueda ver en vez de quedar escondida.
  usos        integer     NOT NULL DEFAULT 0 CHECK (usos >= 0),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  creado_por  text        NOT NULL
);

-- El listado del panel: primero los activos, y dentro de cada grupo el más
-- reciente arriba.
CREATE INDEX IF NOT EXISTS codigos_referido_activo_idx
  ON codigos_referido (activo, creado_en DESC);
