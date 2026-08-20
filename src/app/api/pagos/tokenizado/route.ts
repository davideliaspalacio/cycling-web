import { inscripcionPorReferencia } from "@/lib/almacen";
import { activarConTokenDelWidget } from "@/lib/servicio";
import { huellaDe } from "@/lib/huella";

/**
 * Recibe el formulario que envía el widget de Wompi al terminar la
 * tokenización. No es una API JSON: es un POST de formulario que provoca una
 * navegación, así que responde con redirecciones.
 *
 * La documentación no fija el nombre del campo del token, así que lo buscamos
 * por forma (`tok_…`) entre todos los campos y dejamos el cuerpo completo en
 * los logs si no aparece.
 */
function urlBase(peticion: Request): string {
  const origen = new URL(peticion.url).origin;
  return process.env.NODE_ENV === "production"
    ? (process.env.URL_PUBLICA ?? origen)
    : origen;
}

function volverConError(peticion: Request, referencia: string, motivo: string) {
  const url = new URL(`${urlBase(peticion)}/mi-inscripcion`);
  url.searchParams.set("ref", referencia);
  url.searchParams.set("error", motivo);
  return Response.redirect(url.toString(), 303);
}

export async function POST(peticion: Request) {
  const formulario = await peticion.formData();
  const campos = Object.fromEntries(
    [...formulario.entries()].map(([k, v]) => [k, String(v)]),
  );
  const referencia = campos.referencia ?? "";

  // Buscamos el token por su prefijo, no por un nombre de campo adivinado.
  const token = Object.values(campos).find((v) => v.startsWith("tok_"));
  const ultimos4 = Object.values(campos).find((v) => /^\d{4}$/.test(v));
  const marca = Object.values(campos).find((v) =>
    /^(VISA|MASTERCARD|AMEX|DINERS)$/i.test(v),
  );

  if (!token) {
    console.error(
      "[wompi] tokenización sin token reconocible. Campos recibidos:",
      JSON.stringify(campos),
    );
    return volverConError(
      peticion,
      referencia,
      "El checkout no devolvió la tarjeta. Inténtalo otra vez.",
    );
  }

  const inscripcion = await inscripcionPorReferencia(referencia);
  if (!inscripcion) {
    return Response.redirect(`${urlBase(peticion)}/mi-inscripcion`, 303);
  }
  if (campos.autorizado !== "true") {
    return volverConError(peticion, referencia, "Falta autorizar el cobro automático.");
  }

  try {
    const { aprobado, mensaje } = await activarConTokenDelWidget({
      inscripcion,
      plan: "CUOTAS",
      token,
      resumenTarjeta: {
        marca: (marca ?? "CARD").toUpperCase(),
        ultimos4: ultimos4 ?? "0000",
      },
      huella: huellaDe(peticion),
    });

    if (!aprobado) {
      return volverConError(
        peticion,
        referencia,
        mensaje ?? "El banco rechazó el primer cobro.",
      );
    }
    return Response.redirect(`${urlBase(peticion)}/ticket/${referencia}`, 303);
  } catch (error) {
    console.error("[wompi] fallo al activar el plan de cuotas:", error);
    return volverConError(
      peticion,
      referencia,
      error instanceof Error ? error.message : "No pudimos activar el plan.",
    );
  }
}
