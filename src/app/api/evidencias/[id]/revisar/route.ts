import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import { rechazarAbono, verificarAbono } from "@/lib/servicio";

/**
 * Aprobar o rechazar un comprobante. Es la ruta que mueve dinero.
 *
 * Dos cosas que no son negociables aquí:
 *
 * 1. **El revisor sale de la sesión, no del cuerpo.** Si `revisadoPor` llegara
 *    del cliente, cualquiera podría firmar una aprobación con el nombre de
 *    otro — y ese nombre es toda la trazabilidad que tiene el proyecto
 *    (docs/decisiones-pago-manual.md §5). El cuerpo ni siquiera lo acepta.
 *
 * 2. **Se vuelve a comprobar la sesión aquí**, aunque `src/proxy.ts` ya cubra
 *    `/api/evidencias/:path+`. Defensa en profundidad: el matcher del proxy es
 *    una línea de configuración a un `git revert` de distancia, y si se toca,
 *    esto no puede quedar abierto en silencio. Verificado: sin cookie devuelve
 *    401 aunque el proxy no corriera.
 *
 * El reclamo atómico contra dos revisores simultáneos lo hace `verificarAbono`
 * /`rechazarAbono` con `reclamarAbono` (UPDATE condicional): si otro tomó el
 * comprobante primero, aquí sale un 409 con mensaje, no un pago contado dos
 * veces.
 */

export const dynamic = "force-dynamic";

const esquema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("VERIFICAR"),
    // Manda sobre lo declarado: el revisor está mirando el extracto y el
    // ciclista escribió de memoria. Cero es válido — un comprobante que
    // resultó ser de otra cosa se aprueba en cero en vez de rechazarse.
    montoAprobado: z
      .number()
      .int("El monto aprobado son pesos enteros, sin centavos.")
      .min(0, "El monto aprobado no puede ser negativo."),
  }),
  z.object({
    decision: z.literal("RECHAZAR"),
    // Obligatorio: es lo único que el ciclista va a leer para saber qué
    // corregir, y le llega tal cual por correo.
    motivo: z
      .string()
      .trim()
      .min(5, "Escribe por qué se rechaza: el ciclista lo lee en su correo.")
      .max(500),
  }),
]);

const ESTADO_POR_ERROR: Record<string, number> = {
  NO_EXISTE: 404,
  YA_RESUELTO: 409,
  MONTO_INVALIDO: 422,
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  peticion: NextRequest,
  contexto: RouteContext<"/api/evidencias/[id]/revisar">,
) {
  // Segunda barrera, antes de leer el cuerpo o tocar el almacén.
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }

  const { id } = await contexto.params;

  const parseo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json(
      {
        error:
          parseo.error.issues[0]?.message ?? "Faltan datos o alguno quedó mal.",
        detalles: parseo.error.flatten(),
      },
      { status: 422 },
    );
  }

  // Un id que no es UUID llegaría crudo a Postgres y reventaría con un 500.
  // Para el que pregunta, un abono inexistente y un id inventado son lo mismo.
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "No existe." }, { status: 404 });
  }

  const resultado =
    parseo.data.decision === "VERIFICAR"
      ? await verificarAbono({
          abonoId: id,
          montoAprobado: parseo.data.montoAprobado,
          revisadoPor: sesion.nombre,
        })
      : await rechazarAbono({
          abonoId: id,
          motivo: parseo.data.motivo,
          revisadoPor: sesion.nombre,
        });

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.mensaje, codigo: resultado.error },
      { status: ESTADO_POR_ERROR[resultado.error] ?? 409 },
    );
  }

  return NextResponse.json({
    abonoId: resultado.abono.id,
    estado: resultado.abono.estado,
    montoAprobado: resultado.abono.montoAprobado ?? null,
    motivoRechazo: resultado.abono.motivoRechazo ?? null,
    revisadoPor: resultado.abono.revisadoPor,
    referencia: resultado.inscripcion.referencia,
    pagado: resultado.inscripcion.pagado,
    saldo: resultado.saldo,
    excedente: resultado.excedente,
    completa: resultado.completa,
  });
}
