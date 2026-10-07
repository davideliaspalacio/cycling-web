import "server-only";
import { consultar, HAY_BASE_DE_DATOS } from "./db";

/**
 * Límite de peticiones para las rutas públicas que responden algo que vale
 * dinero. Hoy solo la usa `/api/codigos/validar`.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Esa ruta tiene que ser pública, porque el formulario de inscripción lo es, y
 * dice si un código da el 10%. Sin límite, probar códigos es gratis.
 *
 * Lo que de verdad cierra ese problema no es esto, es que los códigos lleven
 * seis caracteres al azar (`codigoSugerido` en `catalogo.ts`): mil millones de
 * combinaciones no se recorren. Esto es la segunda capa, y sirve sobre todo
 * para que nadie pueda hacer que cada petición suya nos cueste una consulta.
 *
 * ── Por qué el contador está en la base ────────────────────────────────────
 * La primera versión usaba un Map en memoria y **en producción no limitaba
 * nada**: Vercel reparte las peticiones entre varias instancias y cada una
 * llevaba su propia cuenta. Se comprobó: 120 peticiones seguidas, ni un solo
 * 429. Queda escrito aquí porque es un error fácil de repetir y en local no se
 * ve — con una sola instancia el Map funciona perfectamente.
 *
 * Así que la cuenta que manda está en Postgres, en una sola sentencia atómica.
 * El Map se queda como primer filtro: si una instancia ya vio demasiadas de la
 * misma IP, rechaza sin ir a la base. Eso evita que el propio límite se
 * convierta en el gasto que pretende evitar.
 *
 * ── Si la base falla, se deja pasar ────────────────────────────────────────
 * A propósito. El peor resultado de no limitar es que alguien vea precios
 * rebajados que no le corresponden; el peor resultado de limitar de más es que
 * un ciclista no pueda inscribirse. No son comparables.
 */

type Contador = { cuenta: number; expiraEn: number };

/** Primer filtro, por instancia. La cuenta que manda está en la base. */
const contadores = new Map<string, Contador>();

/** Cuántas claves se aceptan en memoria antes de barrer las vencidas. */
const BARRER_A_PARTIR_DE = 5_000;

/** De cada cuántas peticiones se barren las filas vencidas de la base. */
const BARRIDO_UNA_DE_CADA = 50;

function barrerEnMemoria(ahora: number): void {
  for (const [clave, c] of contadores) {
    if (c.expiraEn <= ahora) contadores.delete(clave);
  }
}

/**
 * La IP del que llama, tal como la deja el proxy de Vercel.
 *
 * `x-forwarded-for` puede traer una cadena de IP; la primera es la del cliente
 * y las siguientes las añaden los proxies. Si no hay ninguna cabecera —en
 * local, por ejemplo— devuelve una clave fija: en desarrollo no hay nada que
 * proteger, y una clave fija es preferible a no limitar nada.
 */
export function ipDeLaPeticion(peticion: Request): string {
  const reenviada = peticion.headers.get("x-forwarded-for");
  if (reenviada) {
    const primera = reenviada.split(",")[0]?.trim();
    if (primera) return primera;
  }
  return peticion.headers.get("x-real-ip")?.trim() || "sin-ip";
}

export type Veredicto = {
  /** `false` si ya se pasó del cupo y hay que responder 429. */
  permitido: boolean;
  /** Segundos que quedan de la ventana; va en `Retry-After`. */
  esperaSegundos: number;
};

/** El primer filtro, sin tocar la base. Devuelve `null` si no decide nada. */
function filtroEnMemoria(
  clave: string,
  maximo: number,
  ventanaSegundos: number,
): Veredicto | null {
  const ahora = Date.now();
  if (contadores.size > BARRER_A_PARTIR_DE) barrerEnMemoria(ahora);

  const actual = contadores.get(clave);
  if (!actual || actual.expiraEn <= ahora) {
    contadores.set(clave, {
      cuenta: 1,
      expiraEn: ahora + ventanaSegundos * 1000,
    });
    return null;
  }

  actual.cuenta += 1;
  if (actual.cuenta > maximo) {
    return {
      permitido: false,
      esperaSegundos: Math.max(
        1,
        Math.ceil((actual.expiraEn - ahora) / 1000),
      ),
    };
  }
  return null;
}

/**
 * Anota una petición y dice si cabe.
 *
 * `clave` tiene que llevar el nombre de la ruta además de la IP: dos rutas
 * distintas no deberían gastarse el mismo cupo.
 */
export async function anotarPeticion(
  clave: string,
  maximo: number,
  ventanaSegundos: number,
): Promise<Veredicto> {
  const enMemoria = filtroEnMemoria(clave, maximo, ventanaSegundos);
  if (enMemoria) return enMemoria;

  // Sin base de datos —la demo local del archivo JSON— el Map es todo lo que
  // hay, y con una sola instancia es suficiente.
  if (!HAY_BASE_DE_DATOS) return { permitido: true, esperaSegundos: 0 };

  try {
    /*
     * Una sola sentencia, así que no hay carrera entre leer y escribir. El
     * CASE reinicia la cuenta cuando la ventana ya venció, que es lo que
     * convierte la fila en algo que caduca solo.
     */
    const filas = await consultar<{ cuenta: number; espera: number }>(
      `INSERT INTO limite_peticiones (clave, cuenta, expira_en)
            VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (clave) DO UPDATE SET
            cuenta = CASE WHEN limite_peticiones.expira_en <= now() THEN 1
                          ELSE limite_peticiones.cuenta + 1 END,
            expira_en = CASE WHEN limite_peticiones.expira_en <= now()
                             THEN now() + make_interval(secs => $2)
                             ELSE limite_peticiones.expira_en END
       RETURNING cuenta,
                 greatest(1, ceil(extract(epoch FROM (expira_en - now()))))::int
                   AS espera`,
      [clave, ventanaSegundos],
    );

    if (Math.random() < 1 / BARRIDO_UNA_DE_CADA) {
      void consultar("DELETE FROM limite_peticiones WHERE expira_en <= now()")
        .catch(() => {});
    }

    const fila = filas[0];
    if (!fila) return { permitido: true, esperaSegundos: 0 };
    return {
      permitido: fila.cuenta <= maximo,
      esperaSegundos: fila.espera,
    };
  } catch (error) {
    // Se deja pasar: ver la nota de arriba. Que no se pueda contar no puede
    // impedirle inscribirse a nadie.
    console.error(
      "[limite] No se pudo contar la petición, se deja pasar:",
      error instanceof Error ? error.message : error,
    );
    return { permitido: true, esperaSegundos: 0 };
  }
}
