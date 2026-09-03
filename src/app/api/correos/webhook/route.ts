import { NextResponse } from "next/server";
import { anotarEntrega, correoDelProveedor } from "@/lib/almacen";
import {
  CABECERA_WEBHOOK,
  interpretarWebhook,
  secretoEsperado,
} from "@/lib/correos/webhook";
import { igualSinFiltrar } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Receptor de los webhooks de ZeptoMail.
 *
 * Es lo que convierte "el proveedor aceptó el correo" en "el ciclista lo
 * recibió" o "rebotó". Sin esto, /panel/correos no puede decir más que
 * "sin confirmar", y lo dice.
 *
 * Quién llama: Zoho, no una persona. Por eso no vale la sesión del panel — no
 * hay navegador ni cookie — y por eso `src/proxy.ts` deja esta ruta fuera de
 * su matcher a propósito. El propio formulario de Zoho lo exige: "la llamada
 * de API no debe estar autenticada", o sea, nada de redirecciones a un login.
 *
 * Cómo se protege: con el par cabecera/valor que ofrece el mismo formulario
 * ("Encabezados de autorización"). Zoho manda `X-Webhook-Clave` en cada
 * petición y aquí se compara contra ZEPTOMAIL_WEBHOOK_SECRETO en tiempo
 * constante. Sin esa variable la ruta no acepta nada: un secreto vacío que
 * coincidiera con una cabecera ausente dejaría la base abierta a cualquiera.
 *
 * Códigos de respuesta, que aquí no son un detalle:
 *   401 → solo si la credencial falta o no cuadra. Es la única puerta cerrada.
 *   200 → todo lo demás, incluido el evento que no seguimos, el correo que no
 *         encontramos y el cuerpo que no entendemos. Zoho reintenta lo que no
 *         sea 200 y acaba **desactivando el webhook**; perder un evento suelto
 *         es mucho más barato que quedarnos ciegos. Lo descartado va al log.
 */

/** Lo que se anota sobre un correo; el resto del evento no nos hace falta. */
export async function POST(peticion: Request) {
  const esperado = secretoEsperado();
  if (!esperado) {
    console.error(
      "[correos] Llegó un webhook de ZeptoMail y no hay ZEPTOMAIL_WEBHOOK_SECRETO. " +
        "Se rechaza. Configura la variable y el encabezado de autorización en el Mail Agent.",
    );
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const recibido = peticion.headers.get(CABECERA_WEBHOOK) ?? "";
  if (!igualSinFiltrar(recibido, esperado)) {
    console.warn("[correos] Webhook rechazado: credencial ausente o incorrecta.");
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // A partir de aquí ya no se devuelve un error nunca más.
  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    console.warn("[correos] Webhook con cuerpo que no es JSON. Ignorado.");
    return NextResponse.json({ ok: true, anotados: 0 });
  }

  const { eventos, descartes } = interpretarWebhook(cuerpo);
  for (const d of descartes) console.warn(`[correos] Webhook ignorado: ${d}`);

  let anotados = 0;
  let sinCorreo = 0;
  for (const evento of eventos) {
    try {
      const correo = await correoDelProveedor(evento.pistas);
      if (!correo) {
        sinCorreo += 1;
        // Pasa con los correos anteriores a que `client_reference` llevara el
        // id de la fila, y con cualquier envío hecho desde otro entorno.
        console.warn(
          `[correos] Webhook ${evento.estado} sin correo que le corresponda ` +
            `(destinatario ${evento.pistas.destinatario ?? "?"}, ` +
            `pistas ${evento.pistas.ids.slice(0, 2).join(", ") || "ninguna"}).`,
        );
        continue;
      }
      if (await anotarEntrega(correo.id, evento)) anotados += 1;
    } catch (error) {
      // Que se caiga la base no puede convertirse en un 500: Zoho lo tomaría
      // como webhook roto. Se pierde este evento y se deja dicho en el log.
      console.error(
        "[correos] No se pudo anotar un evento de entrega:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return NextResponse.json({ ok: true, anotados, sinCorreo });
}

/**
 * Zoho solo manda POST, pero su botón "Verificar" y cualquier humano curioso
 * llegan por GET. Responder algo legible ahorra media hora de dudas sobre si
 * la URL está bien escrita. No dice si el secreto es correcto ni cuál es.
 */
export async function GET() {
  return NextResponse.json({
    servicio: "Webhook de entrega de correos (ZeptoMail)",
    metodo: "Este receptor solo acepta POST.",
    configurado: Boolean(secretoEsperado()),
    cabecera: "X-Webhook-Clave",
  });
}
