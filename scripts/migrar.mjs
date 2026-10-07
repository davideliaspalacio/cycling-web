/**
 * Crea el esquema en Postgres y, si existe, sube la demo del archivo JSON.
 *
 *   node --env-file=.env.local scripts/migrar.mjs
 *   node --env-file=.env.local scripts/migrar.mjs --sin-importar
 *
 * Es idempotente: correrlo dos veces no rompe nada ni duplica datos.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Usa: node --env-file=.env.local scripts/migrar.mjs");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const importar = !process.argv.includes("--sin-importar");

const leerJson = async (archivo) => {
  try {
    return JSON.parse(await fs.readFile(archivo, "utf8")).registros ?? [];
  } catch {
    return [];
  }
};

try {
  /* ------------------------------- Esquema ------------------------------- */
  const esquema = await fs.readFile(
    path.join(process.cwd(), "src/lib/esquema.sql"),
    "utf8",
  );
  await pool.query(esquema);

  const { rows: tablas } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log(`✓ Esquema aplicado: ${tablas.map((t) => t.table_name).join(", ")}`);

  /* ------------------------- Importar la demo ---------------------------- */
  if (importar) {
    const inscripciones = await leerJson(path.join(process.cwd(), ".datos/inscripciones.json"));
    const correos = await leerJson(path.join(process.cwd(), ".datos/correos.json"));
    const abonos = await leerJson(path.join(process.cwd(), ".datos/abonos.json"));

    let nuevas = 0;
    for (const i of inscripciones) {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        const { rowCount } = await cliente.query(
          `INSERT INTO inscripciones (
             id, referencia, creada_en, actualizada_en, estado, categoria_codigo,
             ciclista, tallas, consentimientos, plan, total, pagado,
             fuente_pago_id, tarjeta_resumen, eventos, autorizacion_cobro,
             medio_pago, etapa, precio_base, codigo_referido, descuento
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                     $18,$19,$20,$21)
           ON CONFLICT (id) DO NOTHING`,
          [
            i.id, i.referencia, i.creadaEn, i.actualizadaEn, i.estado, i.categoriaCodigo,
            JSON.stringify(i.ciclista), JSON.stringify(i.tallas),
            JSON.stringify(i.consentimientos), i.plan, i.total, i.pagado,
            i.fuentePagoId ?? null,
            i.tarjetaResumen ? JSON.stringify(i.tarjetaResumen) : null,
            JSON.stringify(i.eventos ?? []),
            i.autorizacionCobro ? JSON.stringify(i.autorizacionCobro) : null,
            // Un volcado anterior al pago manual no trae el campo: era Wompi.
            i.medioPago ?? "WOMPI",
            // Un volcado anterior a las etapas es de la primera, por fecha.
            // Dejarlo al DEFAULT de la columna daría lo mismo hoy, pero
            // importar un volcado CON inscripciones de la etapa 2 las metería
            // como etapa 1: perderían su cuarto plan de cuotas y su descuento
            // sin que nada avise. Por eso van explícitas.
            i.etapa ?? "ETAPA_1",
            i.precioBase ?? null,
            i.codigoReferido ?? null,
            i.descuento ?? 0,
          ],
        );
        if (rowCount > 0) {
          nuevas += 1;
          for (const c of i.cuotas ?? []) {
            await cliente.query(
              `INSERT INTO cuotas (
                 inscripcion_id, numero, vence, monto, estado, referencia,
                 transaccion_id, pagada_en, intentos, ultimo_intento_en, ultimo_error
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (inscripcion_id, numero) DO NOTHING`,
              [
                i.id, c.numero, c.vence, c.monto, c.estado, c.referencia,
                c.transaccionId ?? null, c.pagadaEn ?? null, c.intentos ?? 0,
                c.ultimoIntentoEn ?? null, c.ultimoError ?? null,
              ],
            );
          }
        }
        await cliente.query("COMMIT");
      } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
      } finally {
        cliente.release();
      }
    }

    // Los abonos van después y en su propio archivo: llevan la evidencia de un
    // pago y su historial de revisión, así que nunca viajan dentro de la
    // inscripción. La clave foránea exige que la inscripción exista, y un
    // volcado puede traer abonos de una inscripción que ya no está.
    const { rows: existentes } = await pool.query(`SELECT id FROM inscripciones`);
    const idsInscripcion = new Set(existentes.map((r) => r.id));

    let abonosNuevos = 0;
    let abonosHuerfanos = 0;
    for (const a of abonos) {
      if (!idsInscripcion.has(a.inscripcionId)) {
        abonosHuerfanos += 1;
        continue;
      }
      const { rowCount } = await pool.query(
        `INSERT INTO abonos (
           id, inscripcion_id, creado_en, numero, canal, monto_declarado,
           transferido_el, referencia_externa, evidencia_clave, evidencia_tipo,
           evidencia_bytes, evidencia_sha256, huella, estado, monto_aprobado,
           revisado_en, revisado_por, motivo_rechazo
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO NOTHING`,
        [
          a.id, a.inscripcionId, a.creadoEn, a.numero, a.canal, a.montoDeclarado,
          a.transferidoEl ?? null, a.referenciaExterna ?? null,
          a.evidenciaClave, a.evidenciaTipo, a.evidenciaBytes, a.evidenciaSha256,
          a.huella ? JSON.stringify(a.huella) : null,
          a.estado, a.montoAprobado ?? null,
          a.revisadoEn ?? null, a.revisadoPor ?? null, a.motivoRechazo ?? null,
        ],
      );
      abonosNuevos += rowCount;
    }
    if (abonosHuerfanos > 0) {
      console.warn(
        `⚠ ${abonosHuerfanos} abonos sin inscripción en la base: no se importaron.`,
      );
    }

    let correosNuevos = 0;
    for (const c of correos) {
      // Las columnas de entrega van aquí también: son lo que dijo el
      // proveedor sobre correos ya enviados y no se pueden volver a pedir.
      // Un volcado anterior al seguimiento no las trae y quedan sin confirmar,
      // que es exactamente lo que se sabe de ellas.
      const { rowCount } = await pool.query(
        `INSERT INTO correos (
           id, para, asunto, plantilla, html, enviado_en, proveedor, proveedor_id,
           proveedor_request_id, referencia, estado_entrega, entregado_en,
           rebotado_en, rebote_tipo, rebote_motivo, rebote_diagnostico,
           abierto_en, queja_en
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO NOTHING`,
        [
          c.id, c.para, c.asunto, c.plantilla, c.html, c.enviadoEn,
          c.proveedor, c.proveedorId ?? null, c.proveedorRequestId ?? null,
          c.referencia ?? null,
          c.estadoEntrega ?? "SIN_CONFIRMAR",
          c.entregadoEn ?? null, c.rebotadoEn ?? null,
          c.reboteTipo ?? null, c.reboteMotivo ?? null,
          c.reboteDiagnostico ?? null,
          c.abiertoEn ?? null, c.quejaEn ?? null,
        ],
      );
      correosNuevos += rowCount;
    }

    console.log(
      `✓ Importadas ${nuevas} inscripciones, ${abonosNuevos} abonos y ${correosNuevos} correos` +
        (inscripciones.length - nuevas > 0
          ? ` (${inscripciones.length - nuevas} ya estaban)`
          : ""),
    );
  }

  /* ------------------------------- Resumen ------------------------------- */
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*) FROM inscripciones) AS inscripciones,
      (SELECT count(*) FROM cuotas)        AS cuotas,
      (SELECT count(*) FROM abonos)        AS abonos,
      (SELECT count(*) FROM abonos WHERE estado IN ('ENVIADA','EN_REVISION')) AS por_revisar,
      (SELECT count(*) FROM correos)       AS correos,
      (SELECT count(*) FROM correos WHERE estado_entrega = 'REBOTADO') AS rebotados,
      (SELECT coalesce(sum(pagado), 0) FROM inscripciones) AS recaudado
  `);
  const r = rows[0];
  console.log(
    `\n  ${r.inscripciones} inscripciones · ${r.cuotas} cuotas · ${r.abonos} abonos · ${r.correos} correos` +
      `\n  recaudado: $${Number(r.recaudado).toLocaleString("es-CO")}` +
      (Number(r.por_revisar) > 0
        ? `\n  ${r.por_revisar} comprobantes esperando revisión`
        : "") +
      (Number(r.rebotados) > 0
        ? `\n  ${r.rebotados} correos rebotados (ver /panel/correos)`
        : ""),
  );
} finally {
  await pool.end();
}
