import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarInscripcion, inscripcionPorReferencia } from "@/lib/almacen";
import { categoriaPorCodigo } from "@/lib/catalogo";
import { proximaCuota, saldoPendiente } from "@/lib/dinero";
import type { Inscripcion } from "@/lib/tipos";

const esquema = z.union([
  z.object({ referencia: z.string().trim().min(4) }),
  z.object({
    identificacion: z.string().trim().min(4),
    correo: z.string().trim().email(),
  }),
]);

/** Vista que ve el ciclista: sus datos, sin la bitácora interna. */
export function vistaPublica(ins: Inscripcion) {
  const categoria = categoriaPorCodigo(ins.categoriaCodigo);
  return {
    referencia: ins.referencia,
    estado: ins.estado,
    plan: ins.plan,
    creadaEn: ins.creadaEn,
    categoria: categoria
      ? {
          nombre: categoria.nombre,
          km: categoria.km,
          desnivel: categoria.desnivel,
          requisito: categoria.requisito,
        }
      : null,
    ciclista: {
      nombres: ins.ciclista.nombres,
      apellidos: ins.ciclista.apellidos,
      correo: ins.ciclista.correo,
      ciudad: ins.ciclista.ciudad,
      departamento: ins.ciclista.departamento,
    },
    tallas: ins.tallas,
    total: ins.total,
    pagado: ins.pagado,
    saldo: saldoPendiente(ins.cuotas),
    cuotas: ins.cuotas,
    proxima: proximaCuota(ins.cuotas) ?? null,
    tarjeta: ins.tarjetaResumen ?? null,
    autorizacion: ins.autorizacionCobro ?? null,
  };
}

export async function POST(peticion: Request) {
  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json(
      { error: "Escribe tu documento y el correo con el que te inscribiste." },
      { status: 422 },
    );
  }

  const inscripcion =
    "referencia" in parseo.data
      ? await inscripcionPorReferencia(parseo.data.referencia)
      : await buscarInscripcion(parseo.data.identificacion, parseo.data.correo);

  if (!inscripcion) {
    return NextResponse.json(
      {
        error:
          "No encontramos ninguna inscripción con esos datos. Revisa que el correo sea el mismo que usaste al inscribirte.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(vistaPublica(inscripcion));
}
