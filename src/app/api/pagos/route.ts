import { NextResponse } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { iniciarPago } from "@/lib/servicio";
import { esquemaTarjeta } from "@/lib/validacion";
import { saldoPendiente } from "@/lib/dinero";
import { huellaDe } from "@/lib/huella";

const esquema = z.object({
  referencia: z.string().trim().min(4),
  plan: z.enum(["CONTADO", "CUOTAS"]),
  tarjeta: esquemaTarjeta,
  autorizado: z.boolean().default(false),
});

export async function POST(peticion: Request) {
  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la tarjeta.", detalles: parseo.error.flatten() },
      { status: 422 },
    );
  }

  const inscripcion = await inscripcionPorReferencia(parseo.data.referencia);
  if (!inscripcion) {
    return NextResponse.json({ error: "No encontramos esa inscripción." }, { status: 404 });
  }
  if (inscripcion.estado === "COMPLETA") {
    return NextResponse.json({ error: "Esta inscripción ya está paga." }, { status: 409 });
  }
  if (parseo.data.plan === "CUOTAS" && !parseo.data.autorizado) {
    return NextResponse.json(
      { error: "Falta autorizar el cobro automático de las cuotas." },
      { status: 422 },
    );
  }

  try {
    const { inscripcion: actualizada, aprobado, mensaje } = await iniciarPago({
      inscripcion,
      plan: parseo.data.plan,
      tarjeta: parseo.data.tarjeta,
      huella: huellaDe(peticion),
    });

    return NextResponse.json({
      aprobado,
      mensaje,
      referencia: actualizada.referencia,
      estado: actualizada.estado,
      plan: actualizada.plan,
      pagado: actualizada.pagado,
      saldo: saldoPendiente(actualizada.cuotas),
      cuotas: actualizada.cuotas,
      tarjeta: actualizada.tarjetaResumen,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falló el cobro." },
      { status: 502 },
    );
  }
}
