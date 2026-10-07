import { NextResponse } from "next/server";
import { inscripcionDuplicada } from "@/lib/almacen";
import { etapaDeInscripcion } from "@/lib/catalogo";
import { planDeCuotas, planesViables } from "@/lib/dinero";
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

  const { inscripcion, codigo } = await crearInscripcion(parseo.data);

  /*
   * Los planes se devuelven desde aquí y no se calculan en el navegador.
   *
   * Hacen falta dos cosas que solo existen una vez creada la inscripción: su
   * **total de verdad** (ya rebajado, si el código aplicó) y su `creadaEn`,
   * que es lo que ancla los vencimientos. Con descuento, 423.000 en cuatro
   * cuotas no son 470.000 entre cuatro, y enseñarle al ciclista el reparto sin
   * rebajar sería prometerle un plan que el servidor va a rechazar al subir el
   * primer comprobante.
   *
   * Los planes salen de SU etapa, que es la que acaba de quedar escrita en la
   * fila, no de la constante del catálogo.
   */
  const etapa = etapaDeInscripcion(inscripcion);
  const planes = planesViables(inscripcion.creadaEn, etapa.planes).map(
    (cuotas) => ({
      cuotas,
      cuotasDelPlan: planDeCuotas(inscripcion.total, inscripcion.creadaEn, cuotas),
    }),
  );

  return NextResponse.json(
    {
      referencia: inscripcion.referencia,
      total: inscripcion.total,
      precioBase: inscripcion.precioBase,
      descuento: inscripcion.descuento,
      codigoReferido: inscripcion.codigoReferido ?? null,
      etapa: { codigo: etapa.codigo, nombre: etapa.nombre },
      planes,
      /*
       * El aviso de un código que no aplicó. No es un error —la inscripción
       * está creada y el cupo reservado—, así que viaja en un 201 y la
       * interfaz lo enseña en el paso de pago, donde el ciclista todavía puede
       * decidir qué hace antes de transferir.
       */
      avisoCodigo: codigo.aviso,
    },
    { status: 201 },
  );
}
