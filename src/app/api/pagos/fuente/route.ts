import { NextResponse } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { saldoPendiente } from "@/lib/dinero";
import { activarConTokenDelWidget } from "@/lib/servicio";
import { huellaDe } from "@/lib/huella";

const esquema = z.object({
  referencia: z.string().trim().min(4),
  plan: z.enum(["CONTADO", "CUOTAS"]).default("CUOTAS"),
  /** Token que devuelve el modal de Wompi en modo `tokenize`. */
  token: z.string().trim().min(8),
  marca: z.string().trim().default("CARD"),
  ultimos4: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .default("0000"),
  /** Marcó la casilla de autorización de cobro recurrente. */
  autorizado: z.boolean().default(false),
});

/**
 * Recibe el token del modal y arranca el plan de cuotas.
 *
 * El número de tarjeta nunca pasó por aquí: el modal lo mandó directo a Wompi
 * y nos devolvió un token. Con él creamos la fuente de pago reutilizable y
 * cobramos la primera cuota.
 */
export async function POST(peticion: Request) {
  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json(
      {
        error: "El modal no devolvió una tarjeta válida.",
        detalles: parseo.error.flatten(),
      },
      { status: 422 },
    );
  }

  const inscripcion = await inscripcionPorReferencia(parseo.data.referencia);
  if (!inscripcion) {
    return NextResponse.json(
      { error: "No encontramos esa inscripción." },
      { status: 404 },
    );
  }
  if (inscripcion.estado === "COMPLETA") {
    return NextResponse.json(
      { error: "Esta inscripción ya está paga." },
      { status: 409 },
    );
  }
  // Sin autorización explícita no se puede guardar una tarjeta para cobrarla
  // después: lo exigen las reglas de tarjeta archivada.
  if (parseo.data.plan === "CUOTAS" && !parseo.data.autorizado) {
    return NextResponse.json(
      { error: "Falta autorizar el cobro automático de las cuotas." },
      { status: 422 },
    );
  }

  try {
    const {
      inscripcion: actualizada,
      aprobado,
      mensaje,
    } = await activarConTokenDelWidget({
      inscripcion,
      plan: parseo.data.plan,
      token: parseo.data.token,
      resumenTarjeta: {
        marca: parseo.data.marca,
        ultimos4: parseo.data.ultimos4,
      },
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
