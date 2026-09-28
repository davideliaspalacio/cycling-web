import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { CATEGORIAS } from "@/lib/catalogo";
import { corregirInscripcion } from "@/lib/edicion";
import { huellaDe } from "@/lib/huella";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import { esquemaCiclista, esquemaTallas } from "@/lib/validacion";
import type { DatosCiclista, Tallas } from "@/lib/tipos";

/**
 * Corregir los datos de un inscrito.
 *
 * Control de acceso: el matcher de `src/proxy.ts` cubre `/api/panel/:path+`.
 * Esta comprobación es la segunda barrera, igual que en la cesión: si alguien
 * toca el matcher, la ruta no se queda abierta en silencio.
 *
 * Las reglas de los datos son las mismas del formulario público —`esquemaCiclista`
 * y `esquemaTallas`, importados tal cual— para que no haya dos verdades sobre
 * qué es un documento válido. Lo que NO entra por aquí: referencia, estado,
 * plan, total, pagado y abonos. No están en el esquema, así que mandarlos no
 * hace nada.
 *
 * Quién lo hizo sale de la sesión y nunca del cuerpo: es lo que queda escrito
 * en la bitácora.
 */

export const dynamic = "force-dynamic";

const esquema = z.object({
  referencia: z.string().trim().min(4).max(40),
  ciclista: esquemaCiclista,
  tallas: esquemaTallas,
  categoriaCodigo: z.enum(
    CATEGORIAS.map((c) => c.codigo) as [string, ...string[]],
  ),
  motivo: z.string().trim().max(300).optional(),
});

const ESTADO_POR_ERROR: Record<string, number> = {
  DOCUMENTO_OCUPADO: 409,
  SIN_CAMBIO: 422,
  CATEGORIA_DESCONOCIDA: 422,
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

  const resultado = await corregirInscripcion({
    inscripcion,
    ciclista: parseo.data.ciclista as DatosCiclista,
    tallas: parseo.data.tallas as Tallas,
    categoriaCodigo: parseo.data.categoriaCodigo,
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
    cambios: resultado.cambios,
    avisoCategoria: resultado.avisoCategoria,
    parecioCesion: resultado.parecioCesion,
  });
}
