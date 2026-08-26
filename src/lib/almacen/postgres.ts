import "server-only";
import type { PoolClient } from "pg";
import { consultar, enTransaccion } from "../db";
import type { Abono, CorreoEnviado, Cuota, Inscripcion } from "../tipos";

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
         medio_pago
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
         medio_pago      = EXCLUDED.medio_pago`,
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
       id, para, asunto, plantilla, html, enviado_en, proveedor, proveedor_id, referencia
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
      correo.referencia ?? null,
    ],
  );
}

type FilaCorreo = {
  id: string;
  para: string;
  asunto: string;
  plantilla: string;
  html: string;
  enviado_en: Date;
  proveedor: string;
  proveedor_id: string | null;
  referencia: string | null;
};

const aCorreo = (f: FilaCorreo): CorreoEnviado => ({
  id: f.id,
  para: f.para,
  asunto: f.asunto,
  plantilla: f.plantilla,
  html: f.html,
  enviadoEn: f.enviado_en.toISOString(),
  proveedor: f.proveedor as CorreoEnviado["proveedor"],
  proveedorId: f.proveedor_id ?? undefined,
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
