import "server-only";
import { randomUUID } from "node:crypto";
import { registrarCorreo } from "../almacen";
import { EVENTO } from "../catalogo";
import type { Inscripcion } from "../tipos";
import type { PlantillaCorreo } from "./plantillas";

/**
 * Envío transaccional por ZeptoMail (Zoho), con modo simulación.
 *
 * Se habla con la API por HTTP y no con un SDK: son quince líneas, una
 * dependencia menos que mantener y, sobre todo, cambiar de proveedor vuelve a
 * ser cambiar este archivo y nada más. Ya pasó dos veces — Resend, Brevo.
 *
 * Por qué ZeptoMail: el gratuito de Brevo mete su marca al pie de cada correo
 * y quitarla costaba unos 198 USD por los once meses hasta la carrera. Aquí
 * son 2,50 USD por cada 10.000 correos, sin marca ajena en una confirmación
 * de pago. Y es un servicio solo transaccional, que es todo lo que mandamos.
 *
 * Sin llave no falla: guarda el correo renderizado y lo deja visible en
 * /correos, así el flujo se demuestra completo sin credenciales. En
 * producción eso sí es un fallo, y se marca como tal.
 */

const API_KEY = process.env.ZEPTOMAIL_API_KEY;
/** Zoho separa centro de datos por región; la cuenta europea usa .eu */
const API = process.env.ZEPTOMAIL_API_BASE ?? "https://api.zeptomail.com/v1.1/email";
const RESPONDER_A = process.env.CORREO_RESPUESTA ?? EVENTO.correoContacto;

/** ZeptoMail quiere nombre y dirección separados, no "Nombre <correo>". */
function remitente(): { name: string; email: string } {
  const crudo = process.env.CORREO_REMITENTE;
  if (crudo) {
    const m = crudo.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1] || EVENTO.nombre, email: m[2] };
    return { name: EVENTO.nombre, email: crudo.trim() };
  }
  return { name: EVENTO.nombre, email: EVENTO.correoContacto };
}

const REMITENTE = remitente();
const EN_PRODUCCION = process.env.NODE_ENV === "production";

/**
 * Tres estados, no dos.
 *
 * En desarrollo, no tener llave es lo normal. En producción sería un fallo
 * grave y silencioso — 700 ciclistas transfiriendo y ni una sola confirmación
 * saliendo, mientras /correos se llena de correos que parecen enviados. Por
 * eso ahí se llama por su nombre: `sin-configurar`.
 */
export const MODO_CORREO: "zeptomail" | "simulacion" | "sin-configurar" = API_KEY
  ? "zeptomail"
  : EN_PRODUCCION
    ? "sin-configurar"
    : "simulacion";

if (MODO_CORREO === "sin-configurar") {
  console.error(
    "[correos] FALTA ZEPTOMAIL_API_KEY EN PRODUCCIÓN. Ningún correo va a salir: " +
      "se guardan en /correos marcados como no enviados. El ciclista que " +
      "transfiere no recibirá confirmación.",
  );
}

// Un remitente de Gmail no falla aquí: falla en el primer envío real, que es
// el peor momento para enterarse. El dominio hay que verificarlo en ZeptoMail.
if (API_KEY && /@(gmail|hotmail|outlook|yahoo)\./i.test(REMITENTE.email)) {
  console.error(
    `[correos] El remitente ${REMITENTE.email} es de un dominio que no se ` +
      "puede verificar. El proveedor va a rechazar los envíos: hace falta dominio propio.",
  );
}

export async function enviarCorreo(params: {
  para: string;
  plantilla: string;
  contenido: PlantillaCorreo;
  referencia?: string;
}): Promise<{ id: string; proveedor: typeof MODO_CORREO }> {
  const id = randomUUID();
  let proveedorId: string | undefined;

  if (API_KEY) {
    const respuesta = await fetch(API, {
      method: "POST",
      headers: {
        // Zoho no usa Bearer: el prefijo es suyo y la llave ya viene cifrada.
        Authorization: `Zoho-enczapikey ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: { address: REMITENTE.email, name: REMITENTE.name },
        to: [{ email_address: { address: params.para } }],
        reply_to: [{ address: RESPONDER_A }],
        subject: params.contenido.asunto,
        htmlbody: params.contenido.html,
        textbody: params.contenido.texto,
        // Vuelve en los informes y en los webhooks de rebote.
        client_reference: params.referencia ?? id,
      }),
    });

    if (!respuesta.ok) {
      // El cuerpo del error trae el motivo real (dominio sin verificar, tope
      // diario, llave mal). Sin él, depurar esto a ciegas es horrible.
      const detalle = await respuesta.text().catch(() => "");
      throw new Error(
        `ZeptoMail respondió ${respuesta.status}: ${detalle.slice(0, 300)}`,
      );
    }

    const cuerpo = (await respuesta.json().catch(() => ({}))) as {
      request_id?: string;
      data?: { message_id?: string }[];
    };
    proveedorId = cuerpo.data?.[0]?.message_id ?? cuerpo.request_id;
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
