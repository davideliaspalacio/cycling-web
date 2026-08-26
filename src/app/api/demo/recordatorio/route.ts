import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { proximaCuota } from "@/lib/dinero";
import { enviarAlCiclista } from "@/lib/correos/enviar";
import { recordatorioCuota } from "@/lib/correos/plantillas";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";

const esquema = z.object({
  referencia: z.string().trim().min(4),
  dias: z.number().int().min(0).max(30).default(3),
});

/**
 * Auxiliar de demostración: dispara el recordatorio que normalmente manda el
 * cron, para poder enseñar el correo sin esperar a la fecha.
 *
 * Exige sesión del panel. Antes su único freno era que la pasarela estuviera
 * en modo simulación; sin ese freno sería un endpoint abierto que manda correo
 * a cualquier inscripción, es decir, un repartidor de spam gratis.
 */
export async function POST(peticion: NextRequest) {
  if (!leerSesion(peticion.cookies.get(COOKIE_SESION)?.value)) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
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
