import "server-only";
import { Pool, type PoolClient } from "pg";

/**
 * Pool de conexiones a Postgres.
 *
 * Usamos `pg` normal y no el driver HTTP de Neon a propósito. El despliegue es
 * Vercel con Fluid Compute, que reutiliza la misma instancia entre peticiones
 * concurrentes, así que un pool clásico sí se amortiza — no es el serverless
 * de una-instancia-por-petición donde un pool no tendría sentido.
 *
 * La cadena apunta al endpoint `-pooler` de Neon, que además multiplexa del
 * lado del servidor. Por eso `max` es bajo: lo que hay que evitar es que
 * muchas instancias vivas a la vez agoten el límite de conexiones de Neon.
 *
 * Cuidado al depurar: `SET search_path` sin `LOCAL` se queda pegado en la
 * conexión compartida y contamina a quien la reciba después. Dentro de
 * transacción y con `SET LOCAL`.
 */

declare global {
  // El hot reload de Next recrea los módulos; sin esto abriríamos un pool nuevo
  // en cada recarga hasta agotar las conexiones.
  var __poolSantanderXtreme: Pool | undefined;
}

export const HAY_BASE_DE_DATOS = Boolean(process.env.DATABASE_URL);

function crearPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_MAX_CONEXIONES ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Un error en una conexión ociosa no debe tumbar el proceso.
  pool.on("error", (error) => {
    console.error("[db] conexión ociosa falló:", error.message);
  });
  return pool;
}

export function pool(): Pool {
  if (!HAY_BASE_DE_DATOS) {
    throw new Error("Falta DATABASE_URL.");
  }
  globalThis.__poolSantanderXtreme ??= crearPool();
  return globalThis.__poolSantanderXtreme;
}

export async function consultar<T extends Record<string, unknown>>(
  sql: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const { rows } = await pool().query<T>(sql, valores);
  return rows;
}

/**
 * Ejecuta el callback dentro de una transacción. Si algo revienta, revierte.
 * Es lo que hace que cobrar una cuota no pueda quedar a medias.
 */
export async function enTransaccion<T>(
  fn: (cliente: PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await pool().connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}
