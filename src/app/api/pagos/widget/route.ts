import { NextResponse } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { calendarioDeCuotas, aCentavos } from "@/lib/dinero";
import {
  LLAVE_PUBLICA,
  MODO,
  configuracionDeWidget,
  urlDeCheckout,
} from "@/lib/wompi";

const esquema = z.object({
  referencia: z.string().trim().min(4),
  plan: z.enum(["CONTADO", "CUOTAS"]),
});

/**
 * Entrega al navegador lo que necesita para abrir el modal de Wompi.
 *
 * La firma de integridad se calcula aquí porque depende del secreto del
 * comercio, que nunca puede salir del servidor. Lo único que viaja al cliente
 * es la llave pública y una firma válida para ese monto y esa referencia
 * exactos — si alguien manipula el monto en el navegador, Wompi lo rechaza.
 */
export async function POST(peticion: Request) {
  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 422 });
  }

  const ins = await inscripcionPorReferencia(parseo.data.referencia);
  if (!ins) {
    return NextResponse.json({ error: "No encontramos esa inscripción." }, { status: 404 });
  }
  if (ins.estado === "COMPLETA") {
    return NextResponse.json({ error: "Esta inscripción ya está paga." }, { status: 409 });
  }

  const nombre = `${ins.ciclista.nombres} ${ins.ciclista.apellidos}`.trim();
  // En desarrollo el servidor salta de puerto, así que el origen de la
  // petición es más confiable que URL_PUBLICA para la vuelta del checkout.
  const origen = new URL(peticion.url).origin;
  const base =
    process.env.NODE_ENV === "production"
      ? (process.env.URL_PUBLICA ?? origen)
      : origen;

  // Plan de cuotas: el modal se abre en modo `tokenize`, sin monto ni firma —
  // no cobra nada, solo captura la tarjeta y nos devuelve un token reutilizable.
  if (parseo.data.plan === "CUOTAS") {
    const cuotas = calendarioDeCuotas(ins.total, ins.referencia);
    return NextResponse.json({
      modo: MODO,
      operacion: "tokenize",
      publicKey: LLAVE_PUBLICA,
      referencia: ins.referencia,
      primeraCuota: cuotas[0].monto,
      cuotas,
      cliente: { correo: ins.ciclista.correo, nombre },
    });
  }

  // Contado: un cobro normal por el total.
  const centavos = aCentavos(ins.total);
  const referenciaWompi = `${ins.referencia}-C1-${Date.now()}`;

  const urlRetorno = `${base}/ticket/${ins.referencia}`;

  return NextResponse.json({
    modo: MODO,
    operacion: "charge",
    referencia: ins.referencia,
    total: ins.total,
    // Respaldo: si el modal no abre (navegador que bloquea iframes de
    // terceros, modo incógnito estricto), mandamos al checkout alojado.
    urlCheckout: urlDeCheckout({
      referencia: referenciaWompi,
      centavos,
      correo: ins.ciclista.correo,
      urlRetorno,
    }),
    widget: configuracionDeWidget({
      referencia: referenciaWompi,
      centavos,
      correo: ins.ciclista.correo,
      nombre,
      telefono: ins.ciclista.telefono,
      urlRetorno,
      minutosParaPagar: 30,
    }),
  });
}
