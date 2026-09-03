/**
 * Deja la base como recién instalada: sin inscripciones, cuotas, abonos ni
 * correos. El esquema y el acceso al panel no se tocan — la clave del panel
 * vive en variables de entorno, no en la base.
 *
 *   node --env-file=.env.local scripts/limpiar.mjs            (solo muestra)
 *   node --env-file=.env.local scripts/limpiar.mjs --borrar   (borra de verdad)
 *
 * Sin --borrar no toca nada: enseña qué hay y se va. Esto no se deshace.
 */
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const borrar = process.argv.includes("--borrar");

const contar = async () => {
  const { rows } = await pool.query(`
    SELECT (SELECT count(*)::int FROM inscripciones) AS inscripciones,
           (SELECT count(*)::int FROM cuotas)        AS cuotas,
           (SELECT count(*)::int FROM abonos)        AS abonos,
           (SELECT count(*)::int FROM correos)       AS correos`);
  return rows[0];
};

try {
  const antes = await contar();
  console.log(
    `\n  Ahora hay:\n` +
      `    ${antes.inscripciones} inscripciones\n` +
      `    ${antes.cuotas} cuotas\n` +
      `    ${antes.abonos} abonos\n` +
      `    ${antes.correos} correos\n`,
  );

  if (!borrar) {
    console.log("  No se borró nada. Para borrar de verdad:\n");
    console.log("    node --env-file=.env.local scripts/limpiar.mjs --borrar\n");
    process.exit(0);
  }

  /*
   * Seguro. Este script se escribió para vaciar la base antes de abrir
   * inscripciones; desde que hay gente inscrita de verdad, correrlo por
   * inercia borraría a personas que ya pagaron. Exige confirmar el número
   * exacto de inscripciones que se van a perder.
   */
  const esperado = process.argv.find((a) => a.startsWith("--confirmo="));
  const n = esperado ? Number(esperado.split("=")[1]) : NaN;
  if (n !== antes.inscripciones) {
    console.error(
      `  ALTO. Hay ${antes.inscripciones} inscripciones y este script las borra TODAS.\n` +
        `  Si de verdad quieres perderlas, repite el número:\n\n` +
        `    node --env-file=.env.local scripts/limpiar.mjs --borrar --confirmo=${antes.inscripciones}\n`,
    );
    process.exit(1);
  }

  const cliente = await pool.connect();
  try {
    // En una transacción: o se borra todo o no se borra nada. `cuotas` y
    // `abonos` caen solas por el borrado en cascada de `inscripciones`.
    await cliente.query("BEGIN");
    await cliente.query("DELETE FROM correos");
    await cliente.query("DELETE FROM inscripciones");
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }

  const despues = await contar();
  const limpio = Object.values(despues).every((n) => n === 0);
  console.log(
    `  Después:\n` +
      `    ${despues.inscripciones} inscripciones\n` +
      `    ${despues.cuotas} cuotas\n` +
      `    ${despues.abonos} abonos\n` +
      `    ${despues.correos} correos\n`,
  );
  console.log(limpio ? "  ✓ La base quedó limpia.\n" : "  ✗ Quedó algo. Revísalo.\n");

  console.log(
    "  Ojo: los comprobantes ya subidos siguen en el almacenamiento de\n" +
      "  archivos. Bórralos desde el panel de Vercel → Storage → Blob si\n" +
      "  quieres dejarlo también en cero.\n",
  );
} finally {
  await pool.end();
}
