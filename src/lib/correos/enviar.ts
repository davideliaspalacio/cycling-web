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

export const MODO_CORREO: "resend" | "simulacion" = API_KEY ? "resend" : "simulacion";

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
