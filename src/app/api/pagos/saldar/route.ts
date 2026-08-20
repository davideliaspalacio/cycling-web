import { NextResponse } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { saldoPendiente } from "@/lib/dinero";
import { saldarInscripcion } from "@/lib/servicio";

const esquema = z.object({ referencia: z.string().trim().min(4) });

/** Paga todo lo que queda en un solo cobro, contra la tarjeta ya guardada. */
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
    const resultado = await saldarInscripcion(inscripcion);
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
