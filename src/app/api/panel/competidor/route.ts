import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { huellaDe } from "@/lib/huella";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import { cambiarCompetidor } from "@/lib/servicio";
import { esquemaCiclista, esquemaTallas } from "@/lib/validacion";
import type { DatosCiclista } from "@/lib/tipos";

/**
 * Ceder una inscripción a otra persona.
 *
 * Control de acceso: el matcher de `src/proxy.ts` cubre `/api/panel/:path+`
 * (con `/api/panel/sesion` en su lista de rutas abiertas, que es por donde se
 * entra). Esta comprobación es la segunda barrera: si alguien toca el matcher,
 * la ruta no se queda abierta en silencio.
 *
 * Y como en la revisión de comprobantes, quién lo hizo sale de la sesión y
 * nunca del cuerpo: es lo que queda escrito en la bitácora del cupo.
 */

export const dynamic = "force-dynamic";

const esquema = z.object({
  referencia: z.string().trim().min(4).max(40),
  ciclista: esquemaCiclista,
  tallas: esquemaTallas,
  motivo: z.string().trim().max(300).optional(),
});

const ESTADO_POR_ERROR: Record<string, number> = {
  DOCUMENTO_OCUPADO: 409,
  SIN_CAMBIO: 422,
};

export async function POST(peticion: NextRequest) {
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }

  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json(
      {
        error: "Faltan datos o alguno quedó mal.",
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

  const resultado = await cambiarCompetidor({
    inscripcion,
    ciclista: parseo.data.ciclista as DatosCiclista,
    tallas: parseo.data.tallas,
    hechoPor: sesion.nombre,
    motivo: parseo.data.motivo,
    huella: huellaDe(peticion),
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.mensaje, codigo: resultado.error },
      { status: ESTADO_POR_ERROR[resultado.error] ?? 409 },
    );
  }

  return NextResponse.json({
    referencia: resultado.inscripcion.referencia,
    ciclista: `${resultado.inscripcion.ciclista.nombres} ${resultado.inscripcion.ciclista.apellidos}`,
    anterior: `${resultado.anterior.nombres} ${resultado.anterior.apellidos}`,
    pagado: resultado.inscripcion.pagado,
    saldo: resultado.saldo,
  });
}
