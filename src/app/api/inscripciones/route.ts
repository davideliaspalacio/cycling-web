import { NextResponse } from "next/server";
import { inscripcionDuplicada } from "@/lib/almacen";
import { crearInscripcion } from "@/lib/servicio";
import { esquemaInscripcion } from "@/lib/validacion";

export async function POST(peticion: Request) {
  const cuerpo = await peticion.json().catch(() => null);
  const parseo = esquemaInscripcion.safeParse(cuerpo);

  if (!parseo.success) {
    return NextResponse.json(
      {
        error: "Faltan datos o alguno quedó mal.",
        detalles: parseo.error.flatten(),
      },
      { status: 422 },
    );
  }

  const yaExiste = await inscripcionDuplicada(parseo.data.ciclista.identificacion);
  if (yaExiste) {
    return NextResponse.json(
      {
        error: `El documento ${parseo.data.ciclista.identificacion} ya tiene la inscripción ${yaExiste.referencia}.`,
        referencia: yaExiste.referencia,
      },
      { status: 409 },
    );
  }

  const inscripcion = await crearInscripcion(parseo.data);
  return NextResponse.json(
    {
      referencia: inscripcion.referencia,
      total: inscripcion.total,
    },
    { status: 201 },
  );
}
