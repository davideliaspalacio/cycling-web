/**
 * Un limitador de peticiones por IP, en memoria.
 *
 * Existe por una ruta concreta: `/api/codigos/validar` es pública y tiene que
 * serlo —el formulario de inscripción lo es—, pero responde «sí o no» sobre un
 * código que vale el 10% de una inscripción. Sin límite, probar códigos sale
 * gratis, y el diccionario para adivinarlos está publicado en la propia web:
 * los 22 embajadores salen en el desplegable «¿quién te trajo?». Doscientas
 * peticiones y alguien tiene un descuento que no le dieron.
 *
 * ── Lo que esto es y lo que no ─────────────────────────────────────────────
 * Es un contador por instancia, no un límite global. En Vercel las instancias
 * se reutilizan pero hay varias, así que el techo real es `maximo` por
 * instancia y no `maximo` a secas. No es una defensa contra alguien decidido y
 * con muchas IP; es lo que convierte «doscientas peticiones en diez segundos»
 * en algo lento y visible. El resto del trabajo lo hace la respuesta genérica
 * de la ruta, que ya no dice si un código existe.
 *
 * No se usa Redis ni nada externo a propósito: meter una dependencia de red en
 * el camino de un campo opcional del formulario significa que, si esa
 * dependencia falla, el ciclista no puede inscribirse. El riesgo no lo
 * justifica.
 *
 * ── La ventana ─────────────────────────────────────────────────────────────
 * Ventana fija, no deslizante. Una fija deja pasar hasta `2 × maximo` a
 * caballo entre dos ventanas, y da igual: la diferencia entre 20 y 40
 * peticiones por minuto no cambia nada aquí, y una deslizante obliga a guardar
 * la marca de tiempo de cada petición.
 */

type Contador = { cuenta: number; expiraEn: number };

/** Se limpia al vencer, así que no crece sin tope mientras haya tráfico. */
const contadores = new Map<string, Contador>();

/** Cuántas IP distintas se aceptan antes de barrer las vencidas. */
const BARRER_A_PARTIR_DE = 5_000;

function barrerVencidos(ahora: number): void {
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

/**
 * Anota una petición y dice si cabe.
 *
 * `clave` tiene que llevar el nombre de la ruta además de la IP: dos rutas
 * distintas no deberían gastarse el mismo cupo.
 */
export function anotarPeticion(
  clave: string,
  maximo: number,
  ventanaSegundos: number,
): Veredicto {
  const ahora = Date.now();

  if (contadores.size > BARRER_A_PARTIR_DE) barrerVencidos(ahora);

  const actual = contadores.get(clave);
  if (!actual || actual.expiraEn <= ahora) {
    contadores.set(clave, {
      cuenta: 1,
      expiraEn: ahora + ventanaSegundos * 1000,
    });
    return { permitido: true, esperaSegundos: 0 };
  }

  actual.cuenta += 1;
  const esperaSegundos = Math.max(
    1,
    Math.ceil((actual.expiraEn - ahora) / 1000),
  );
  return { permitido: actual.cuenta <= maximo, esperaSegundos };
}
