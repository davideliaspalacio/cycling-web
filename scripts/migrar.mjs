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

    let nuevas = 0;
    for (const i of inscripciones) {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        const { rowCount } = await cliente.query(
          `INSERT INTO inscripciones (
             id, referencia, creada_en, actualizada_en, estado, categoria_codigo,
             ciclista, tallas, consentimientos, plan, total, pagado,
             fuente_pago_id, tarjeta_resumen, eventos
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO NOTHING`,
          [
            i.id, i.referencia, i.creadaEn, i.actualizadaEn, i.estado, i.categoriaCodigo,
            JSON.stringify(i.ciclista), JSON.stringify(i.tallas),
            JSON.stringify(i.consentimientos), i.plan, i.total, i.pagado,
            i.fuentePagoId ?? null,
            i.tarjetaResumen ? JSON.stringify(i.tarjetaResumen) : null,
            JSON.stringify(i.eventos ?? []),
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

    let correosNuevos = 0;
    for (const c of correos) {
      const { rowCount } = await pool.query(
        `INSERT INTO correos (
           id, para, asunto, plantilla, html, enviado_en, proveedor, proveedor_id, referencia
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [
          c.id, c.para, c.asunto, c.plantilla, c.html, c.enviadoEn,
          c.proveedor, c.proveedorId ?? null, c.referencia ?? null,
        ],
      );
      correosNuevos += rowCount;
    }

    console.log(
      `✓ Importadas ${nuevas} inscripciones y ${correosNuevos} correos` +
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
      (SELECT count(*) FROM correos)       AS correos,
      (SELECT coalesce(sum(pagado), 0) FROM inscripciones) AS recaudado
  `);
  const r = rows[0];
  console.log(
    `\n  ${r.inscripciones} inscripciones · ${r.cuotas} cuotas · ${r.correos} correos` +
      `\n  recaudado: $${Number(r.recaudado).toLocaleString("es-CO")}`,
  );
} finally {
  await pool.end();
}
