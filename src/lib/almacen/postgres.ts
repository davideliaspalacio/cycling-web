import "server-only";
import type { PoolClient } from "pg";
import { consultar, enTransaccion } from "../db";
import type {
  Abono,
  CodigoConUsos,
  CodigoReferido,
  CorreoEnviado,
  CorreoSeguido,
  Cuota,
  EntregaCorreo,
  EstadoEntrega,
  Inscripcion,
  ResumenCorreos,
} from "../tipos";
import { CODIGO_ETAPA_HISTORICA } from "../catalogo";

/**
 * Almacén en Postgres. Es la implementación de producción.
 *
 * Lo que gana frente al archivo JSON: guardar una inscripción con sus cuotas
 * es una sola transacción, así que un cobro no puede dejar la cuota marcada
 * pagada y la inscripción sin actualizar.
 */

/* --------------------------------- Mapeo --------------------------------- */

type FilaInscripcion = {
  id: string;
  referencia: string;
  creada_en: Date;
  actualizada_en: Date;
  estado: string;
  categoria_codigo: string;
  ciclista: Inscripcion["ciclista"];
  tallas: Inscripcion["tallas"];
  consentimientos: Inscripcion["consentimientos"];
  plan: string;
  medio_pago: string;
  etapa: string | null;
  precio_base: number | null;
  codigo_referido: string | null;
  descuento: number | null;
  total: number;
  pagado: number;
  fuente_pago_id: string | null;
  tarjeta_resumen: Inscripcion["tarjetaResumen"] | null;
  autorizacion_cobro: Inscripcion["autorizacionCobro"] | null;
  eventos: Inscripcion["eventos"];
};

type FilaCuota = {
  inscripcion_id: string;
  numero: number;
  vence: Date;
  monto: number;
  estado: Cuota["estado"];
  referencia: string;
  transaccion_id: string | null;
  pagada_en: Date | null;
  intentos: number;
  ultimo_intento_en: Date | null;
  ultimo_error: string | null;
};

const soloFecha = (d: Date): string => d.toISOString().slice(0, 10);

function aCuota(f: FilaCuota): Cuota {
  return {
    numero: f.numero,
    vence: soloFecha(f.vence),
    monto: f.monto,
    estado: f.estado,
    referencia: f.referencia,
    transaccionId: f.transaccion_id ?? undefined,
    pagadaEn: f.pagada_en?.toISOString(),
    intentos: f.intentos,
    ultimoIntentoEn: f.ultimo_intento_en?.toISOString(),
    ultimoError: f.ultimo_error ?? undefined,
  };
}

function aInscripcion(f: FilaInscripcion, cuotas: Cuota[]): Inscripcion {
  return {
    id: f.id,
    referencia: f.referencia,
    creadaEn: f.creada_en.toISOString(),
    actualizadaEn: f.actualizada_en.toISOString(),
    estado: f.estado as Inscripcion["estado"],
    categoriaCodigo: f.categoria_codigo,
    ciclista: f.ciclista,
    tallas: f.tallas,
    consentimientos: f.consentimientos,
    plan: f.plan as Inscripcion["plan"],
    // Las filas anteriores al pago manual no tienen columna llena en un
    // volcado viejo; WOMPI es lo que eran.
    medioPago: (f.medio_pago ?? "WOMPI") as Inscripcion["medioPago"],
    // El respaldo es la etapa 1 y no la activa: un volcado anterior a esta
    // columna es de la primera etapa, y suponer la activa le cambiaría los
    // planes de pago y el precio de referencia.
    etapa: f.etapa ?? CODIGO_ETAPA_HISTORICA,
    descuento: f.descuento ?? 0,
    codigoReferido: f.codigo_referido ?? undefined,
    // Donde no se guardó, el precio de lista se deduce de lo que debe más lo
    // que se le descontó. En las 142 filas de la etapa 1 eso da 380.000, que
    // es exactamente lo que valían.
    precioBase: f.precio_base ?? f.total + (f.descuento ?? 0),
    total: f.total,
    pagado: f.pagado,
    cuotas: cuotas.sort((a, b) => a.numero - b.numero),
    // bigint llega como texto para no perder precisión; aquí cabe en number.
    fuentePagoId: f.fuente_pago_id ? Number(f.fuente_pago_id) : undefined,
    tarjetaResumen: f.tarjeta_resumen ?? undefined,
    autorizacionCobro: f.autorizacion_cobro ?? undefined,
    eventos: f.eventos,
  };
}

/** Trae las cuotas de varias inscripciones en una sola consulta. */
async function cuotasDe(ids: string[]): Promise<Map<string, Cuota[]>> {
  const mapa = new Map<string, Cuota[]>();
  if (ids.length === 0) return mapa;
  const filas = await consultar<FilaCuota>(
    `SELECT * FROM cuotas WHERE inscripcion_id = ANY($1::uuid[]) ORDER BY numero`,
    [ids],
  );
  for (const fila of filas) {
    const lista = mapa.get(fila.inscripcion_id) ?? [];
    lista.push(aCuota(fila));
    mapa.set(fila.inscripcion_id, lista);
  }
  return mapa;
}

async function hidratar(filas: FilaInscripcion[]): Promise<Inscripcion[]> {
  const cuotas = await cuotasDe(filas.map((f) => f.id));
  return filas.map((f) => aInscripcion(f, cuotas.get(f.id) ?? []));
}

async function unaSola(sql: string, valores: unknown[]) {
  const filas = await consultar<FilaInscripcion>(sql, valores);
  if (filas.length === 0) return undefined;
  return (await hidratar(filas))[0];
}

/* ------------------------------ Inscripciones ----------------------------- */

export async function listarInscripciones(): Promise<Inscripcion[]> {
  const filas = await consultar<FilaInscripcion>(
    `SELECT * FROM inscripciones ORDER BY creada_en DESC`,
  );
  return hidratar(filas);
}

export async function guardarInscripcion(
  inscripcion: Inscripcion,
): Promise<Inscripcion> {
  const actualizadaEn = new Date().toISOString();

  await enTransaccion(async (cliente: PoolClient) => {
    await cliente.query(
      `INSERT INTO inscripciones (
         id, referencia, creada_en, actualizada_en, estado, categoria_codigo,
         ciclista, tallas, consentimientos, plan, total, pagado,
         fuente_pago_id, tarjeta_resumen, eventos, autorizacion_cobro,
         medio_pago, etapa, precio_base, codigo_referido, descuento
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18,$19,$20,$21)
       ON CONFLICT (id) DO UPDATE SET
         actualizada_en  = EXCLUDED.actualizada_en,
         estado          = EXCLUDED.estado,
         categoria_codigo= EXCLUDED.categoria_codigo,
         ciclista        = EXCLUDED.ciclista,
         tallas          = EXCLUDED.tallas,
         consentimientos = EXCLUDED.consentimientos,
         plan            = EXCLUDED.plan,
         total           = EXCLUDED.total,
         pagado          = EXCLUDED.pagado,
         fuente_pago_id  = EXCLUDED.fuente_pago_id,
         tarjeta_resumen = EXCLUDED.tarjeta_resumen,
         eventos         = EXCLUDED.eventos,
         autorizacion_cobro = EXCLUDED.autorizacion_cobro,
         medio_pago      = EXCLUDED.medio_pago,
         -- La etapa, el precio de lista, el código y el descuento son hechos
         -- del día en que se inscribió y nadie los cambia: viajan de vuelta
         -- iguales porque quien llama mutó el objeto que leyó de aquí. Van en
         -- el UPDATE —y no se omiten— para que una fila anterior a estas
         -- columnas quede con su precio de lista escrito en vez de deducido,
         -- sin que eso mueva ni su total ni su saldo.
         etapa           = EXCLUDED.etapa,
         precio_base     = EXCLUDED.precio_base,
         codigo_referido = EXCLUDED.codigo_referido,
         descuento       = EXCLUDED.descuento`,
      [
        inscripcion.id,
        inscripcion.referencia,
        inscripcion.creadaEn,
        actualizadaEn,
        inscripcion.estado,
        inscripcion.categoriaCodigo,
        JSON.stringify(inscripcion.ciclista),
        JSON.stringify(inscripcion.tallas),
        JSON.stringify(inscripcion.consentimientos),
        inscripcion.plan,
        inscripcion.total,
        inscripcion.pagado,
        inscripcion.fuentePagoId ?? null,
        inscripcion.tarjetaResumen
          ? JSON.stringify(inscripcion.tarjetaResumen)
          : null,
        JSON.stringify(inscripcion.eventos),
        inscripcion.autorizacionCobro
          ? JSON.stringify(inscripcion.autorizacionCobro)
          : null,
        inscripcion.medioPago ?? "WOMPI",
        inscripcion.etapa ?? CODIGO_ETAPA_HISTORICA,
        inscripcion.precioBase ?? inscripcion.total + (inscripcion.descuento ?? 0),
        inscripcion.codigoReferido ?? null,
        inscripcion.descuento ?? 0,
      ],
    );

    // Las cuotas siempre se guardan como conjunto completo; dentro de la
    // transacción, reemplazarlas es más simple y más seguro que conciliar.
    await cliente.query(`DELETE FROM cuotas WHERE inscripcion_id = $1`, [
      inscripcion.id,
    ]);

    for (const c of inscripcion.cuotas) {
      await cliente.query(
        `INSERT INTO cuotas (
           inscripcion_id, numero, vence, monto, estado, referencia,
           transaccion_id, pagada_en, intentos, ultimo_intento_en, ultimo_error
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          inscripcion.id,
          c.numero,
          c.vence,
          c.monto,
          c.estado,
          c.referencia,
          c.transaccionId ?? null,
          c.pagadaEn ?? null,
          c.intentos,
          c.ultimoIntentoEn ?? null,
          c.ultimoError ?? null,
        ],
      );
    }
  });

  return { ...inscripcion, actualizadaEn };
}

export async function inscripcionPorReferencia(
  referencia: string,
): Promise<Inscripcion | undefined> {
  // Las referencias de cobro llegan como SX27-XXXXXX-C2-1; nos quedamos con la base.
  const base = referencia.split("-").slice(0, 2).join("-").toUpperCase();
  return unaSola(`SELECT * FROM inscripciones WHERE referencia = $1`, [base]);
}

export async function inscripcionPorId(
  id: string,
): Promise<Inscripcion | undefined> {
  return unaSola(`SELECT * FROM inscripciones WHERE id = $1`, [id]);
}

export async function buscarInscripcion(
  identificacion: string,
  correo: string,
): Promise<Inscripcion | undefined> {
  return unaSola(
    `SELECT * FROM inscripciones
      WHERE ciclista ->> 'identificacion' = $1
        AND lower(ciclista ->> 'correo') = lower($2)
      LIMIT 1`,
    [identificacion.trim(), correo.trim()],
  );
}

export async function inscripcionDuplicada(
  identificacion: string,
): Promise<Inscripcion | undefined> {
  return unaSola(
    `SELECT * FROM inscripciones
      WHERE ciclista ->> 'identificacion' = $1
        AND estado <> 'BORRADOR'
      LIMIT 1`,
    [identificacion.trim()],
  );
}

/**
 * Toma la cuota para cobrarla, de forma atómica.
 *
 * Es un solo UPDATE condicional: si dos peticiones entran a la vez, la base
 * deja pasar una y a la otra le devuelve cero filas. Sin esto, ambas leerían
 * "PENDIENTE" y lanzarían dos cobros contra la misma tarjeta.
 */
export async function reclamarCuota(
  inscripcionId: string,
  numero: number,
  /** Un cobro en curso sin transacción y viejo se considera abandonado. */
  minutosAbandono = 15,
): Promise<{ intentos: number } | null> {
  const filas = await consultar<{ intentos: number }>(
    `UPDATE cuotas
        SET estado = 'EN_PROCESO',
            intentos = intentos + 1,
            ultimo_intento_en = now()
      WHERE inscripcion_id = $1
        AND numero = $2
        AND estado <> 'PAGADA'
        AND (
          estado <> 'EN_PROCESO'
          OR (transaccion_id IS NULL
              AND ultimo_intento_en < now() - ($3 || ' minutes')::interval)
        )
      RETURNING intentos`,
    [inscripcionId, numero, String(minutosAbandono)],
  );
  return filas[0] ?? null;
}

/* --------------------------------- Abonos --------------------------------- */

/**
 * Los abonos NO viajan dentro de `guardarInscripcion`.
 *
 * Esa función guarda las cuotas con un DELETE + INSERT del conjunto completo,
 * que para un calendario recalculable es inofensivo. Un abono no: lleva la
 * evidencia del ciclista y el historial de quién la revisó, cuándo y por
 * cuánto. Borrarlo y reinsertarlo desde un objeto en memoria perdería la
 * revisión que otra persona acabara de hacer. Por eso cada operación de abono
 * es su propia sentencia, dirigida y mínima.
 */

type FilaAbono = {
  id: string;
  inscripcion_id: string;
  creado_en: Date;
  numero: number;
  canal: Abono["canal"];
  monto_declarado: number;
  transferido_el: Date | null;
  referencia_externa: string | null;
  evidencia_clave: string;
  evidencia_tipo: string;
  evidencia_bytes: number;
  evidencia_sha256: string;
  huella: Abono["huella"] | null;
  estado: Abono["estado"];
  monto_aprobado: number | null;
  revisado_en: Date | null;
  revisado_por: string | null;
  motivo_rechazo: string | null;
};

function aAbono(f: FilaAbono): Abono {
  return {
    id: f.id,
    inscripcionId: f.inscripcion_id,
    creadoEn: f.creado_en.toISOString(),
    numero: f.numero,
    canal: f.canal,
    montoDeclarado: f.monto_declarado,
    transferidoEl: f.transferido_el ? soloFecha(f.transferido_el) : undefined,
    referenciaExterna: f.referencia_externa ?? undefined,
    evidenciaClave: f.evidencia_clave,
    evidenciaTipo: f.evidencia_tipo,
    evidenciaBytes: f.evidencia_bytes,
    evidenciaSha256: f.evidencia_sha256,
    huella: f.huella ?? undefined,
    estado: f.estado,
    montoAprobado: f.monto_aprobado ?? undefined,
    revisadoEn: f.revisado_en?.toISOString(),
    revisadoPor: f.revisado_por ?? undefined,
    motivoRechazo: f.motivo_rechazo ?? undefined,
  };
}

export async function crearAbono(abono: Abono): Promise<Abono> {
  const filas = await consultar<FilaAbono>(
    `INSERT INTO abonos (
       id, inscripcion_id, creado_en, numero, canal, monto_declarado,
       transferido_el, referencia_externa, evidencia_clave, evidencia_tipo,
       evidencia_bytes, evidencia_sha256, huella, estado, monto_aprobado,
       revisado_en, revisado_por, motivo_rechazo
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      abono.id,
      abono.inscripcionId,
      abono.creadoEn,
      abono.numero,
      abono.canal,
      abono.montoDeclarado,
      abono.transferidoEl ?? null,
      abono.referenciaExterna ?? null,
      abono.evidenciaClave,
      abono.evidenciaTipo,
      abono.evidenciaBytes,
      abono.evidenciaSha256,
      abono.huella ? JSON.stringify(abono.huella) : null,
      abono.estado,
      abono.montoAprobado ?? null,
      abono.revisadoEn ?? null,
      abono.revisadoPor ?? null,
      abono.motivoRechazo ?? null,
    ],
  );
  return aAbono(filas[0]);
}

export async function abonosDe(inscripcionId: string): Promise<Abono[]> {
  const filas = await consultar<FilaAbono>(
    `SELECT * FROM abonos WHERE inscripcion_id = $1 ORDER BY creado_en DESC`,
    [inscripcionId],
  );
  return filas.map(aAbono);
}

export async function abonoPorId(id: string): Promise<Abono | undefined> {
  const filas = await consultar<FilaAbono>(`SELECT * FROM abonos WHERE id = $1`, [
    id,
  ]);
  return filas[0] ? aAbono(filas[0]) : undefined;
}

/** La cola de revisión: lo más viejo primero, que es el que lleva más esperando. */
export async function abonosPorRevisar(limite = 100): Promise<Abono[]> {
  const filas = await consultar<FilaAbono>(
    `SELECT * FROM abonos
      WHERE estado IN ('ENVIADA','EN_REVISION')
      ORDER BY creado_en
      LIMIT $1`,
    [limite],
  );
  return filas.map(aAbono);
}

/**
 * Cuántas veces se subió antes esta misma imagen.
 *
 * No bloquea nada: es un aviso para el revisor. La misma captura reenviada
 * suele ser un error honesto (subió dos veces), pero también es el modo obvio
 * de intentar que un solo pago valga por dos.
 */
export async function abonosConMismaEvidencia(
  sha256: string,
  exceptoId?: string,
): Promise<Abono[]> {
  const filas = await consultar<FilaAbono>(
    `SELECT * FROM abonos
      WHERE evidencia_sha256 = $1
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      ORDER BY creado_en`,
    [sha256, exceptoId ?? null],
  );
  return filas.map(aAbono);
}

/**
 * Toma el abono para revisarlo, de forma atómica.
 *
 * Mismo patrón que `reclamarCuota`: un solo UPDATE condicional. Si dos
 * revisores abren la cola a la vez, la base deja pasar a uno y al otro le
 * devuelve cero filas. Sin esto los dos leerían 'ENVIADA' y podrían aprobar el
 * mismo comprobante por montos distintos, que es dinero contado dos veces.
 *
 * Una revisión abierta y olvidada se libera sola a los 15 minutos: si no,
 * bastaría con que a alguien se le cerrara la pestaña para dejar el abono
 * bloqueado para siempre.
 */
export async function reclamarAbono(
  id: string,
  revisadoPor?: string,
  minutosAbandono = 15,
): Promise<Abono | null> {
  const filas = await consultar<FilaAbono>(
    `UPDATE abonos
        SET estado = 'EN_REVISION',
            revisado_en = now(),
            revisado_por = COALESCE($2, revisado_por)
      WHERE id = $1
        AND (
          estado = 'ENVIADA'
          OR (estado = 'EN_REVISION'
              AND revisado_en < now() - ($3 || ' minutes')::interval)
        )
      RETURNING *`,
    [id, revisadoPor ?? null, String(minutosAbandono)],
  );
  return filas[0] ? aAbono(filas[0]) : null;
}

/**
 * Cierra la revisión: VERIFICADA con su monto, o RECHAZADA con su motivo.
 *
 * También es condicional: solo cierra lo que sigue abierto. Un abono ya
 * resuelto no se puede reescribir por esta vía — corregir una verificación es
 * una decisión distinta y debe dejar su propio rastro.
 */
export async function resolverAbono(params: {
  id: string;
  estado: Extract<Abono["estado"], "VERIFICADA" | "RECHAZADA">;
  montoAprobado?: number;
  motivoRechazo?: string;
  revisadoPor: string;
}): Promise<Abono | null> {
  const filas = await consultar<FilaAbono>(
    `UPDATE abonos
        SET estado = $2,
            monto_aprobado = $3,
            motivo_rechazo = $4,
            revisado_por = $5,
            revisado_en = now()
      WHERE id = $1
        AND estado IN ('ENVIADA','EN_REVISION')
      RETURNING *`,
    [
      params.id,
      params.estado,
      params.estado === "VERIFICADA" ? (params.montoAprobado ?? null) : null,
      params.estado === "RECHAZADA" ? (params.motivoRechazo ?? null) : null,
      params.revisadoPor,
    ],
  );
  return filas[0] ? aAbono(filas[0]) : null;
}

/* --------------------------------- Correos -------------------------------- */

export async function registrarCorreo(correo: CorreoEnviado): Promise<void> {
  await consultar(
    `INSERT INTO correos (
       id, para, asunto, plantilla, html, enviado_en, proveedor, proveedor_id,
       proveedor_request_id, referencia
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      correo.id,
      correo.para,
      correo.asunto,
      correo.plantilla,
      correo.html,
      correo.enviadoEn,
      correo.proveedor,
      correo.proveedorId ?? null,
      correo.proveedorRequestId ?? null,
      correo.referencia ?? null,
    ],
  );
}

type FilaEntrega = {
  estado_entrega: string;
  entregado_en: Date | null;
  rebotado_en: Date | null;
  rebote_tipo: string | null;
  rebote_motivo: string | null;
  rebote_diagnostico: string | null;
  abierto_en: Date | null;
  queja_en: Date | null;
};

type FilaCorreo = FilaEntrega & {
  id: string;
  para: string;
  asunto: string;
  plantilla: string;
  html: string;
  enviado_en: Date;
  proveedor: string;
  proveedor_id: string | null;
  proveedor_request_id: string | null;
  referencia: string | null;
};

const aEntrega = (f: FilaEntrega): EntregaCorreo => ({
  estadoEntrega: (f.estado_entrega ?? "SIN_CONFIRMAR") as EstadoEntrega,
  entregadoEn: f.entregado_en?.toISOString(),
  rebotadoEn: f.rebotado_en?.toISOString(),
  reboteTipo: (f.rebote_tipo ?? undefined) as EntregaCorreo["reboteTipo"],
  reboteMotivo: f.rebote_motivo ?? undefined,
  reboteDiagnostico: f.rebote_diagnostico ?? undefined,
  abiertoEn: f.abierto_en?.toISOString(),
  quejaEn: f.queja_en?.toISOString(),
});

const aCorreo = (f: FilaCorreo): CorreoEnviado => ({
  ...aEntrega(f),
  id: f.id,
  para: f.para,
  asunto: f.asunto,
  plantilla: f.plantilla,
  html: f.html,
  enviadoEn: f.enviado_en.toISOString(),
  proveedor: f.proveedor as CorreoEnviado["proveedor"],
  proveedorId: f.proveedor_id ?? undefined,
  proveedorRequestId: f.proveedor_request_id ?? undefined,
  referencia: f.referencia ?? undefined,
});

export async function listarCorreos(): Promise<CorreoEnviado[]> {
  const filas = await consultar<FilaCorreo>(
    `SELECT * FROM correos ORDER BY enviado_en DESC LIMIT 200`,
  );
  return filas.map(aCorreo);
}

export async function correoPorId(
  id: string,
): Promise<CorreoEnviado | undefined> {
  const filas = await consultar<FilaCorreo>(
    `SELECT * FROM correos WHERE id = $1`,
    [id],
  );
  return filas[0] ? aCorreo(filas[0]) : undefined;
}

/* ------------------------ Seguimiento de la entrega ----------------------- */

/**
 * Busca a qué correo se refiere un evento del proveedor.
 *
 * Se prueban varias llaves porque el webhook de ZeptoMail identifica el correo
 * por `request_id` y no está confirmado que ese valor sea el mismo que el
 * `message_id` que devuelve el envío. Guardamos los dos (`proveedor_request_id`
 * y `proveedor_id`) y aquí se aceptan ambos, más el id nuestro por si el
 * evento devuelve el `client_reference`.
 *
 * El respaldo por destinatario es deliberadamente lo último y exige correo:
 * empareja con el envío más reciente a esa dirección. No es exacto, pero si una
 * dirección rebota rebotan todos sus correos, así que el error posible es
 * señalar la fila vecina, no inventar un rebote.
 */
export async function correoDelProveedor(pistas: {
  /** request_id, message_id, client_reference… lo que traiga el evento. */
  ids: string[];
  destinatario?: string;
  referencia?: string;
}): Promise<{ id: string } | undefined> {
  const ids = pistas.ids.filter(Boolean);
  if (ids.length > 0) {
    const filas = await consultar<{ id: string }>(
      `SELECT id FROM correos
        WHERE proveedor_request_id = ANY($1::text[])
           OR proveedor_id = ANY($1::text[])
           OR id::text = ANY($1::text[])
        ORDER BY enviado_en DESC
        LIMIT 1`,
      [ids],
    );
    if (filas[0]) return filas[0];
  }

  if (!pistas.destinatario) return undefined;
  const filas = await consultar<{ id: string }>(
    `SELECT id FROM correos
      WHERE lower(para) = lower($1)
        AND ($2::text IS NULL OR referencia = $2)
      ORDER BY enviado_en DESC
      LIMIT 1`,
    [pistas.destinatario, pistas.referencia ?? null],
  );
  return filas[0];
}

const RANGO_ESTADO = `CASE estado_entrega
     WHEN 'ENTREGADO' THEN 1
     WHEN 'ABIERTO'   THEN 2
     WHEN 'QUEJA'     THEN 3
     WHEN 'REBOTADO'  THEN 4
     ELSE 0 END`;

/**
 * Anota un evento de entrega sobre un correo ya enviado.
 *
 * Un mismo correo recibe varios eventos —entregado y después marcado como
 * spam— y pueden llegar desordenados, así que `estado_entrega` solo sube de
 * rango y nunca baja: una entrega tardía no puede borrar un rebote. Las marcas
 * de tiempo se guardan por separado, así que aunque el estado se quede en el
 * más grave sigue constando cuándo pasó cada cosa.
 */
export async function anotarEntrega(
  id: string,
  evento: {
    estado: Exclude<EstadoEntrega, "SIN_CONFIRMAR">;
    ocurridoEn: string;
    reboteTipo?: "DURO" | "BLANDO";
    reboteMotivo?: string;
    reboteDiagnostico?: string;
  },
): Promise<boolean> {
  const rango =
    { ENTREGADO: 1, ABIERTO: 2, QUEJA: 3, REBOTADO: 4 }[evento.estado] ?? 0;
  const filas = await consultar<{ id: string }>(
    `UPDATE correos SET
       entregado_en = CASE WHEN $2 = 'ENTREGADO'
         THEN COALESCE(entregado_en, $3::timestamptz) ELSE entregado_en END,
       abierto_en = CASE WHEN $2 = 'ABIERTO'
         THEN COALESCE(abierto_en, $3::timestamptz) ELSE abierto_en END,
       queja_en = CASE WHEN $2 = 'QUEJA'
         THEN COALESCE(queja_en, $3::timestamptz) ELSE queja_en END,
       -- Del rebote sí gana el último: si vuelve a rebotar, el motivo vigente
       -- es el nuevo, que es el que hay que enseñarle a quien atiende.
       rebotado_en = CASE WHEN $2 = 'REBOTADO' THEN $3::timestamptz ELSE rebotado_en END,
       rebote_tipo = CASE WHEN $2 = 'REBOTADO' THEN $4 ELSE rebote_tipo END,
       rebote_motivo = CASE WHEN $2 = 'REBOTADO' THEN $5 ELSE rebote_motivo END,
       rebote_diagnostico = CASE WHEN $2 = 'REBOTADO' THEN $6 ELSE rebote_diagnostico END,
       estado_entrega = CASE WHEN $7::int > (${RANGO_ESTADO})
         THEN $2 ELSE estado_entrega END
     WHERE id = $1
     RETURNING id`,
    [
      id,
      evento.estado,
      evento.ocurridoEn,
      evento.reboteTipo ?? null,
      evento.reboteMotivo ?? null,
      evento.reboteDiagnostico ?? null,
      rango,
    ],
  );
  return filas.length > 0;
}

type FilaSeguida = FilaCorreo & {
  nombres: string | null;
  apellidos: string | null;
  identificacion: string | null;
};

const aSeguido = (f: FilaSeguida): CorreoSeguido => ({
  ...aEntrega(f),
  id: f.id,
  para: f.para,
  asunto: f.asunto,
  plantilla: f.plantilla,
  enviadoEn: f.enviado_en.toISOString(),
  proveedor: f.proveedor as CorreoEnviado["proveedor"],
  proveedorId: f.proveedor_id ?? undefined,
  proveedorRequestId: f.proveedor_request_id ?? undefined,
  referencia: f.referencia ?? undefined,
  ciclista: f.nombres
    ? {
        nombres: f.nombres,
        apellidos: f.apellidos ?? "",
        identificacion: f.identificacion ?? "",
      }
    : undefined,
});

/**
 * El listado de /panel/correos: quién, qué correo, cuándo y si llegó.
 *
 * El nombre del ciclista no vive en `correos`, así que se cruza por
 * `referencia` con `inscripciones` (que la tiene UNIQUE, o sea uno a uno). Es
 * LEFT JOIN a propósito: un correo cuya inscripción se borró sigue existiendo
 * y hay que poder verlo.
 *
 * El HTML se queda fuera de la lista: son cientos de correos de decenas de KB
 * y aquí no se pinta ninguno. Para eso está /correos/[id].
 *
 * La búsqueda es LIKE sin índice a sabiendas: son cientos de filas, no
 * millones, y montar búsqueda de texto completo para eso sería peor negocio.
 */
export async function seguimientoCorreos(params: {
  q?: string;
  estado?: EstadoEntrega;
  limite?: number;
} = {}): Promise<CorreoSeguido[]> {
  const aguja = params.q?.trim().toLowerCase();
  const filas = await consultar<FilaSeguida>(
    `SELECT c.*,
            i.ciclista ->> 'nombres'        AS nombres,
            i.ciclista ->> 'apellidos'      AS apellidos,
            i.ciclista ->> 'identificacion' AS identificacion
       FROM correos c
       LEFT JOIN inscripciones i ON i.referencia = c.referencia
      WHERE ($1::text IS NULL OR (
              lower(c.para) LIKE $1
           OR lower(coalesce(c.referencia, '')) LIKE $1
           OR lower(c.asunto) LIKE $1
           OR lower(coalesce(i.ciclista ->> 'nombres', '') || ' ' ||
                    coalesce(i.ciclista ->> 'apellidos', '')) LIKE $1
           OR coalesce(i.ciclista ->> 'identificacion', '') LIKE $1
            ))
        AND ($2::text IS NULL OR c.estado_entrega = $2)
      ORDER BY c.enviado_en DESC
      LIMIT $3`,
    [aguja ? `%${aguja}%` : null, params.estado ?? null, params.limite ?? 200],
  );
  return filas.map(aSeguido);
}

/**
 * Las cifras de la cabecera. `desde` es el arranque del día en Colombia y lo
 * calcula quien llama, para que Postgres y el almacén JSON cuenten lo mismo.
 */
export async function resumenCorreos(desde: string): Promise<ResumenCorreos> {
  const filas = await consultar<Record<string, string>>(
    `SELECT
       count(*)                                                   AS total,
       count(*) FILTER (WHERE enviado_en >= $1::timestamptz)       AS hoy,
       -- Abierto implica entregado: quien lo abrió, lo recibió.
       count(*) FILTER (WHERE estado_entrega IN ('ENTREGADO','ABIERTO')) AS entregados,
       count(*) FILTER (WHERE estado_entrega = 'REBOTADO')         AS rebotados,
       count(*) FILTER (WHERE estado_entrega = 'QUEJA')            AS quejas,
       -- Un correo simulado o que nunca salió no está "sin confirmar": no hay
       -- nada que confirmar. Se cuentan aparte para que la cifra de arriba
       -- diga lo mismo que las filas de abajo.
       count(*) FILTER (WHERE estado_entrega = 'SIN_CONFIRMAR'
                          AND proveedor NOT IN ('sin-configurar','simulacion'))
                                                                   AS sin_confirmar,
       count(*) FILTER (WHERE proveedor = 'sin-configurar')        AS no_salieron,
       count(*) FILTER (WHERE proveedor = 'simulacion')            AS simulados
     FROM correos`,
    [desde],
  );
  const f = filas[0] ?? {};
  const n = (k: string) => Number(f[k] ?? 0);
  return {
    total: n("total"),
    hoy: n("hoy"),
    entregados: n("entregados"),
    rebotados: n("rebotados"),
    quejas: n("quejas"),
    sinConfirmar: n("sin_confirmar"),
    noSalieron: n("no_salieron"),
    simulados: n("simulados"),
  };
}

/* --------------------------- Códigos de referido --------------------------- */

/**
 * El registro de códigos de los embajadores.
 *
 * Dos reglas gobiernan estas funciones:
 *
 *  1. **El código es la clave.** Llega ya normalizado en mayúsculas
 *     (`normalizarCodigo` en el catálogo); aquí no se vuelve a tocar, porque
 *     si se guardara con una grafía y se buscara con otra el ciclista
 *     escribiría bien y le diríamos que no existe.
 *
 *  2. **Se desactiva, no se borra.** Una inscripción guarda el texto del
 *     código, no una clave ajena: borrar uno usado dejaría veinte
 *     inscripciones con un descuento sin procedencia. `borrarCodigo` solo deja
 *     borrar lo que nadie usó, y lo comprueba contra `inscripciones` en la
 *     misma transacción.
 */

type FilaCodigo = {
  codigo: string;
  propietario: string;
  activo: boolean;
  usos: number;
  creado_en: Date;
  creado_por: string;
};

function aCodigo(f: FilaCodigo): CodigoReferido {
  return {
    codigo: f.codigo,
    propietario: f.propietario,
    activo: f.activo,
    usos: f.usos,
    creadoEn: f.creado_en.toISOString(),
    creadoPor: f.creado_por,
  };
}

export async function codigoPorTexto(
  codigo: string,
): Promise<CodigoReferido | undefined> {
  const filas = await consultar<FilaCodigo>(
    `SELECT * FROM codigos_referido WHERE codigo = $1`,
    [codigo],
  );
  return filas[0] ? aCodigo(filas[0]) : undefined;
}

/**
 * Todos los códigos con quién usó cada uno.
 *
 * Una consulta y no N+1: el panel enseña la lista entera con sus usos, y son
 * dos tablas pequeñas. Los activos primero, porque son los que se dictan.
 */
export async function listarCodigos(): Promise<CodigoConUsos[]> {
  const [codigos, usos] = await Promise.all([
    consultar<FilaCodigo>(
      `SELECT * FROM codigos_referido ORDER BY activo DESC, creado_en DESC`,
    ),
    consultar<{
      codigo_referido: string;
      referencia: string;
      ciclista: Inscripcion["ciclista"];
      creada_en: Date;
      descuento: number | null;
      total: number;
    }>(
      `SELECT codigo_referido, referencia, ciclista, creada_en, descuento, total
         FROM inscripciones
        WHERE codigo_referido IS NOT NULL
        ORDER BY creada_en DESC`,
    ),
  ]);

  const porCodigo = new Map<string, CodigoConUsos["inscripciones"]>();
  for (const u of usos) {
    const lista = porCodigo.get(u.codigo_referido) ?? [];
    lista.push({
      referencia: u.referencia,
      nombres: u.ciclista?.nombres ?? "",
      apellidos: u.ciclista?.apellidos ?? "",
      creadaEn: u.creada_en.toISOString(),
      descuento: u.descuento ?? 0,
      total: u.total,
    });
    porCodigo.set(u.codigo_referido, lista);
  }

  return codigos.map((f) => ({
    ...aCodigo(f),
    inscripciones: porCodigo.get(f.codigo) ?? [],
  }));
}

/**
 * Crea un código. Devuelve `null` si ya existía: el panel lo dice con esas
 * palabras en vez de pisar el que ya estaba —que podría ser de otro embajador
 * y con usos encima.
 */
export async function crearCodigo(params: {
  codigo: string;
  propietario: string;
  creadoPor: string;
}): Promise<CodigoReferido | null> {
  const filas = await consultar<FilaCodigo>(
    `INSERT INTO codigos_referido (codigo, propietario, creado_por)
     VALUES ($1,$2,$3)
     ON CONFLICT (codigo) DO NOTHING
     RETURNING *`,
    [params.codigo, params.propietario, params.creadoPor],
  );
  return filas[0] ? aCodigo(filas[0]) : null;
}

export async function cambiarActivoCodigo(
  codigo: string,
  activo: boolean,
): Promise<CodigoReferido | undefined> {
  const filas = await consultar<FilaCodigo>(
    `UPDATE codigos_referido SET activo = $2 WHERE codigo = $1 RETURNING *`,
    [codigo, activo],
  );
  return filas[0] ? aCodigo(filas[0]) : undefined;
}

/**
 * Suma un uso al código, de forma atómica.
 *
 * Es un UPDATE condicional y no un `SELECT` + `UPDATE`: dos inscripciones
 * simultáneas con el mismo código tienen que sumar dos, no una. Si el código
 * dejó de estar activo entre la validación y aquí, no cuenta y devuelve null;
 * quien llama ya decidió el descuento con la lectura anterior, así que esto es
 * solo el contador.
 */
export async function sumarUsoDeCodigo(
  codigo: string,
): Promise<CodigoReferido | null> {
  const filas = await consultar<FilaCodigo>(
    `UPDATE codigos_referido
        SET usos = usos + 1
      WHERE codigo = $1 AND activo
      RETURNING *`,
    [codigo],
  );
  return filas[0] ? aCodigo(filas[0]) : null;
}

/**
 * Borra un código, y solo si nadie lo usó.
 *
 * El `DELETE` lleva la comprobación dentro (`NOT EXISTS`) y no en un `SELECT`
 * previo: entre las dos sentencias podría entrar una inscripción con ese
 * código y nos lo llevaríamos por delante justo en ese hueco.
 *
 * Devuelve `"CON_USOS"` cuando existe pero tiene inscripciones detrás. Eso no
 * es un error del panel: es la regla, y la pantalla ofrece desactivarlo.
 */
export async function borrarCodigo(
  codigo: string,
): Promise<"BORRADO" | "CON_USOS" | "NO_EXISTE"> {
  const borradas = await consultar<{ codigo: string }>(
    `DELETE FROM codigos_referido
      WHERE codigo = $1
        AND NOT EXISTS (
          SELECT 1 FROM inscripciones WHERE codigo_referido = $1
        )
      RETURNING codigo`,
    [codigo],
  );
  if (borradas.length > 0) return "BORRADO";
  const existe = await codigoPorTexto(codigo);
  return existe ? "CON_USOS" : "NO_EXISTE";
}
