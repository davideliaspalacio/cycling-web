import { NextResponse } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { saldoPendiente } from "@/lib/dinero";
import { confirmarPagoDelWidget } from "@/lib/servicio";

const esquema = z.object({
  referencia: z.string().trim().min(4),
  transaccionId: z.string().trim().min(3),
});

/**
 * Confirma contra la API de Wompi el pago que se hizo en el modal.
 *
 * No confiamos en lo que diga el navegador: el modal nos da un id y nosotros
 * le preguntamos a Wompi cuál es el estado real de esa transacción. El webhook
 * sigue siendo la fuente de verdad; esto solo sirve para responderle de
 * inmediato al ciclista en vez de dejarlo mirando un "procesando".
 */
export async function POST(peticion: Request) {
  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 422 });
  }

  const inscripcion = await inscripcionPorReferencia(parseo.data.referencia);
  if (!inscripcion) {
    return NextResponse.json(
      { error: "No encontramos esa inscripción." },
      { status: 404 },
    );
  }

  try {
    const resultado = await confirmarPagoDelWidget({
      inscripcion,
      transaccionId: parseo.data.transaccionId,
    });
    return NextResponse.json({
      ...resultado,
      referencia: inscripcion.referencia,
      pagado: inscripcion.pagado,
      saldo: saldoPendiente(inscripcion.cuotas),
      cuotas: inscripcion.cuotas,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No pudimos confirmar el pago.",
      },
      { status: 502 },
    );
  }
}
