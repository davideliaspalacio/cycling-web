import { NextResponse } from "next/server";
import { ETAPA_ACTIVA } from "@/lib/catalogo";
import { anotarPeticion, ipDeLaPeticion } from "@/lib/limite-peticiones";
import { revisarCodigo } from "@/lib/servicio";
import { esquemaRevisionCodigo } from "@/lib/validacion";

/**
 * «¿Este código me sirve, y cuánto me queda a pagar?»
 *
 * Existe para cumplir una condición del encargo: el ciclista ve el precio con
 * el descuento aplicado **antes** de pagar. Sin esto tendría que inscribirse a
 * ciegas y enterarse del total al final.
 *
 * ── Qué NO es ──────────────────────────────────────────────────────────────
 * No es por donde se aplica el descuento. Lo que diga esta respuesta no se
 * guarda en ninguna parte: el descuento lo decide `crearInscripcion`,
 * llamando otra vez a `revisarCodigo` en el servidor. Si alguien falsea la
 * respuesta de aquí, lo único que consigue es ver un número bonito en su
 * propia pantalla.
 *
 * ── Por qué es pública, y por qué dice lo mínimo ───────────────────────────
 * El formulario de inscripción es público, así que esta ruta también. Eso la
 * convierte en un oráculo: pregunta gratis y sin identificarse sobre algo que
 * vale el 10% de una inscripción. Y el diccionario para adivinar está en la
 * propia web — los 22 embajadores salen en el desplegable «¿quién te trajo?»,
 * y un código que se llame como su embajador se adivina a la primera.
 *
 * Por eso aquí hay dos cosas que no son adorno:
 *
 * 1. **La respuesta no distingue «no existe» de «ya no está vigente».** Las
 *    dos dan el mismo texto. Distinguirlas le confirma al que va probando
 *    cuáles acertó, que es justo lo que no puede saber. El motivo real sí se
 *    guarda en la bitácora de la inscripción, que es donde hace falta para
 *    contestarle a quien reclame.
 *
 * 2. **Un límite por IP**, que convierte recorrer el diccionario en algo lento
 *    y visible en los registros. No es una defensa completa —el contador vive
 *    en memoria y hay varias instancias—, pero sube el coste de lo que antes
 *    era gratis.
 *
 * Lo que sigue faltando, y es decisión de la organización: un tope de usos por
 * código. Hoy un código filtrado sirve para las 250 inscripciones de la etapa.
 * La tabla admite una columna `max_usos` con `DEFAULT NULL` sin tocar nada más.
 */

export const dynamic = "force-dynamic";

/**
 * Generoso para quien escribe y se corrige; estrecho para quien recorre.
 *
 * Cuarenta por minuto y no veinte porque en Colombia muchas conexiones móviles
 * comparten una sola IP: varios ciclistas inscribiéndose a la vez desde el
 * mismo operador tienen que caber sin tropezarse. Recorrer los 22 nombres de
 * los embajadores con sus variantes sigue costando varios minutos y queda
 * escrito en los registros, que es de lo que se trata.
 *
 * Pasarse de aquí no le cuesta el descuento a nadie: lo único que se pierde es
 * el anticipo del precio en pantalla. El descuento lo aplica `crearInscripcion`
 * en el servidor, que no pasa por esta ruta.
 */
const MAXIMO_POR_VENTANA = 40;
const VENTANA_SEGUNDOS = 60;

/**
 * El mismo texto para «no existe» y para «caducado», a propósito. Sirve para
 * los dos casos sin mentir en ninguno: en ambos el código no se puede usar y
 * la inscripción sigue adelante.
 */
const AVISO_GENERICO =
  "Ese código no se puede aplicar. Revisa que esté bien escrito o pídeselo " +
  "otra vez a tu embajador; tu inscripción sigue adelante sin descuento.";

export async function POST(peticion: Request) {
  const ip = ipDeLaPeticion(peticion);
  const veredicto = anotarPeticion(
    `codigos-validar:${ip}`,
    MAXIMO_POR_VENTANA,
    VENTANA_SEGUNDOS,
  );
  if (!veredicto.permitido) {
    console.warn(
      `[codigos] Límite de validaciones alcanzado desde ${ip}. ` +
        `Más de ${MAXIMO_POR_VENTANA} en ${VENTANA_SEGUNDOS}s.`,
    );
    return NextResponse.json(
      {
        error:
          "Demasiados intentos. Espera un momento antes de probar otro código.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(veredicto.esperaSegundos) },
      },
    );
  }

  const parseo = esquemaRevisionCodigo.safeParse(
    await peticion.json().catch(() => null),
  );
  if (!parseo.success) {
    return NextResponse.json({ error: "Código ilegible." }, { status: 422 });
  }

  const revision = await revisarCodigo(parseo.data.codigo, ETAPA_ACTIVA);

  // `ETAPA_SIN_DESCUENTO` y `SIN_CODIGO` no dicen nada de ningún código y su
  // texto es más útil que el genérico, así que esos sí se pasan tal cual.
  const delata = revision.motivo === "NO_EXISTE" || revision.motivo === "INACTIVO";

  return NextResponse.json(
    {
      codigo: revision.codigo,
      aplica: revision.aplica,
      porcentaje: revision.aplica ? revision.porcentaje : 0,
      descuento: revision.descuento,
      precioBase: revision.precioBase,
      total: revision.total,
      aviso: delata ? AVISO_GENERICO : revision.aviso,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
