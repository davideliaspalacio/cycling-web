import "server-only";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { registrarCorreo } from "../almacen";
import { EVENTO } from "../catalogo";
import type { Inscripcion } from "../tipos";
import type { PlantillaCorreo } from "./plantillas";

/**
 * Envío por Resend, con modo simulación.
 *
 * Sin RESEND_API_KEY no falla: guarda el correo renderizado y lo deja
 * visible en /correos. Así el flujo se puede demostrar completo y, cuando
 * llegan las llaves, no hay que tocar ni una línea de las plantillas.
 */

const API_KEY = process.env.RESEND_API_KEY;
const REMITENTE =
  process.env.CORREO_REMITENTE ??
  `${EVENTO.nombre} <${EVENTO.correoContacto}>`;
const RESPONDER_A = process.env.CORREO_RESPUESTA ?? EVENTO.correoContacto;

const EN_PRODUCCION = process.env.NODE_ENV === "production";

/**
 * Tres estados, no dos.
 *
 * En desarrollo, no tener llave es lo normal: el correo se renderiza y se
 * guarda para poder ver el flujo completo sin credenciales. En producción es
 * un fallo grave y silencioso — 700 ciclistas transfiriendo y ni una sola
 * confirmación saliendo, mientras /correos se llena de correos que parecen
 * enviados. Por eso ahí se llama por su nombre: `sin-configurar`.
 */
export const MODO_CORREO: "resend" | "simulacion" | "sin-configurar" = API_KEY
  ? "resend"
  : EN_PRODUCCION
    ? "sin-configurar"
    : "simulacion";

if (MODO_CORREO === "sin-configurar") {
  console.error(
    "[correos] FALTA RESEND_API_KEY EN PRODUCCIÓN. Ningún correo va a salir: " +
      "se guardan en /correos marcados como no enviados. El ciclista que " +
      "transfiere no recibirá confirmación.",
  );
}

// Resend exige dominio verificado. Un remitente de Gmail o Hotmail no falla
// aquí, falla en el primer envío, que es el peor momento para enterarse.
if (API_KEY && /@(gmail|hotmail|outlook|yahoo)\./i.test(REMITENTE)) {
  console.error(
    `[correos] El remitente ${REMITENTE} es de un dominio que no se puede ` +
      "verificar. Resend va a rechazar los envíos: hace falta un dominio propio.",
  );
}

const resend = API_KEY ? new Resend(API_KEY) : null;

export async function enviarCorreo(params: {
  para: string;
  plantilla: string;
  contenido: PlantillaCorreo;
  referencia?: string;
}): Promise<{ id: string; proveedor: typeof MODO_CORREO }> {
  const id = randomUUID();
  let proveedorId: string | undefined;

  if (resend) {
    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: params.para,
      replyTo: RESPONDER_A,
      subject: params.contenido.asunto,
      html: params.contenido.html,
      text: params.contenido.texto,
      headers: {
        // Ayuda a que los recordatorios no se agrupen ni se marquen como spam.
        "X-Entity-Ref-ID": params.referencia ?? id,
      },
      tags: [{ name: "plantilla", value: params.plantilla }],
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    proveedorId = data?.id;
  }

  await registrarCorreo({
    id,
    para: params.para,
    asunto: params.contenido.asunto,
    plantilla: params.plantilla,
    html: params.contenido.html,
    enviadoEn: new Date().toISOString(),
    proveedor: MODO_CORREO,
    proveedorId,
    referencia: params.referencia,
  });

  return { id, proveedor: MODO_CORREO };
}

export async function enviarAlCiclista(
  inscripcion: Inscripcion,
  plantilla: string,
  contenido: PlantillaCorreo,
) {
  return enviarCorreo({
    para: inscripcion.ciclista.correo,
    plantilla,
    contenido,
    referencia: inscripcion.referencia,
  });
}
