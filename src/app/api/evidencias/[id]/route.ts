import { NextResponse, type NextRequest } from "next/server";
import { abonoPorId } from "@/lib/almacen";
import { leerEvidencia, urlFirmada } from "@/lib/almacenamiento";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";

/**
 * Entrega el comprobante de un abono.
 *
 * Una evidencia es un extracto bancario con nombre, cuenta y montos de una
 * persona. Nunca se sirve desde una carpeta pública ni por una URL adivinable:
 * se pide por el id del abono, que es un UUID, y el archivo real vive tras una
 * clave que no se publica en ninguna respuesta.
 *
 * Estado del control de acceso: `src/proxy.ts` ya cubre esta ruta con el
 * matcher `/api/evidencias/:path+`, que exige sesión del panel para el GET y
 * deja abierto el POST de subida. Verificado: sin cookie responde 401.
 *
 * Además del proxy, la ruta comprueba la sesión por su cuenta: si alguien
 * cambia el matcher, esto no se queda abierto en silencio.
 *
 * PENDIENTE: el acceso del dueño. Hoy solo entra el panel; el ciclista no
 * puede ver su propio comprobante. Cuando se habilite, responder 404 —y no
 * 403— a quien no tenga permiso, para no confirmar que el comprobante existe.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;

  // Segunda barrera, antes de tocar el almacén: defensa en profundidad frente
  // a `proxy.ts`. 404 y no 401/403 — a quien no tiene permiso no se le
  // confirma que el comprobante exista.
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ error: "No existe." }, { status: 404 });
  }

  // Segunda barrera, ANTES de tocar el almacén. `proxy.ts` ya bloquea al
  // anónimo; esto es para que la ruta no dependa de que nadie toque el
  // matcher. Algo como:
  //
  //   const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  //   const suya   = await esDeLaInscripcionDe(peticion, abono.inscripcionId);
  //   if (!sesion && !suya) {
  //     return NextResponse.json({ error: "No existe." }, { status: 404 });
  //   }
  // ─────────────────────────────────────────────────────────────────────────

  if (!UUID.test(id)) {
    return NextResponse.json({ error: "No existe." }, { status: 404 });
  }

  const abono = await abonoPorId(id);
  if (!abono) {
    return NextResponse.json({ error: "No existe." }, { status: 404 });
  }

  // Con Blob se redirige a una URL firmada de vida corta: el archivo lo sirve
  // el CDN y no se pasa por esta función. Sin token (modo simulación) no hay
  // nada que firmar y los bytes salen de aquí.
  const firmada = await urlFirmada(abono.evidenciaClave);
  if (firmada) {
    return NextResponse.redirect(firmada, {
      status: 302,
      // Una URL firmada caduca; que no se quede pegada en ninguna caché.
      headers: { "Cache-Control": "no-store" },
    });
  }

  const evidencia = await leerEvidencia(abono.evidenciaClave);
  if (!evidencia) {
    return NextResponse.json(
      { error: "El archivo ya no está disponible." },
      { status: 410 },
    );
  }

  return new NextResponse(new Uint8Array(evidencia.contenido), {
    status: 200,
    headers: {
      "Content-Type": evidencia.tipo,
      "Content-Length": String(evidencia.bytes),
      // `inline` para poder verlo en el panel sin descargarlo; el nombre es el
      // del abono, nunca el que puso el ciclista.
      "Content-Disposition": `inline; filename="comprobante-${abono.id}"`,
      "Cache-Control": "private, no-store",
      // Que un comprobante no se pueda incrustar en una página ajena.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
