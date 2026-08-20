import { NextResponse } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { proximaCuota } from "@/lib/dinero";
import { enviarAlCiclista } from "@/lib/correos/enviar";
import { recordatorioCuota } from "@/lib/correos/plantillas";
import { MODO } from "@/lib/wompi";

const esquema = z.object({
  referencia: z.string().trim().min(4),
  dias: z.number().int().min(0).max(30).default(3),
});

/**
 * Auxiliar de demostración: dispara el recordatorio que normalmente manda el
 * cron tres días antes del cobro. Solo existe en modo simulación.
 */
export async function POST(peticion: Request) {
  if (MODO !== "simulacion") {
    return NextResponse.json(
      { error: "Este atajo solo existe en modo simulación." },
      { status: 403 },
    );
  }

  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 422 });
  }

  const inscripcion = await inscripcionPorReferencia(parseo.data.referencia);
  if (!inscripcion) {
    return NextResponse.json({ error: "No encontramos esa inscripción." }, { status: 404 });
  }

  const cuota = proximaCuota(inscripcion.cuotas);
  if (!cuota) {
    return NextResponse.json({ error: "No queda ninguna cuota por cobrar." }, { status: 409 });
  }

  await enviarAlCiclista(
    inscripcion,
    "recordatorio-cuota",
    recordatorioCuota(inscripcion, cuota.numero, parseo.data.dias),
  );
  return NextResponse.json({ enviado: true, cuota: cuota.numero });
}
