import { NextResponse } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { cobrarSiguienteCuota } from "@/lib/servicio";
import { saldoPendiente } from "@/lib/dinero";

const esquema = z.object({
  referencia: z.string().trim().min(4),
  /** Omitido = la siguiente cuota pendiente. */
  numero: z.number().int().min(1).max(12).optional(),
});

/**
 * Cobra una cuota contra la tarjeta ya guardada. Lo usa el ciclista para
 * adelantar cuotas desde su portal, y la demo para simular el paso del mes.
 */
export async function POST(peticion: Request) {
  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 422 });
  }

  const inscripcion = await inscripcionPorReferencia(parseo.data.referencia);
  if (!inscripcion) {
    return NextResponse.json({ error: "No encontramos esa inscripción." }, { status: 404 });
  }
  if (inscripcion.plan !== "CUOTAS") {
    return NextResponse.json(
      { error: "Esta inscripción no tiene plan de cuotas." },
      { status: 409 },
    );
  }

  try {
    const resultado = await cobrarSiguienteCuota(inscripcion, parseo.data.numero);
    return NextResponse.json({
      ...resultado,
      estado: inscripcion.estado,
      pagado: inscripcion.pagado,
      saldo: saldoPendiente(inscripcion.cuotas),
      cuotas: inscripcion.cuotas,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falló el cobro." },
      { status: 502 },
    );
  }
}
