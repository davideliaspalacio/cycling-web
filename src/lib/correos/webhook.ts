import type { EstadoEntrega, TipoRebote } from "../tipos";

/**
 * Lectura de los eventos que manda ZeptoMail por webhook.
 *
 * Aquí no se toca la base ni se decide nada: se traduce un cuerpo JSON ajeno a
 * algo que el almacén entienda. Separado de la ruta a propósito, porque es la
 * parte que hay que poder probar con un cuerpo de ejemplo sin levantar nada.
 *
 * El formato está tomado de la vista previa del propio panel de Zoho (Mail
 * Agent → Webhooks → Agregar webhook), no de la documentación pública, que es
 * bastante más vaga. Dos trampas que costaría caro descubrir en producción:
 *
 *  1. `event_name` es un **array**, no una cadena.
 *  2. Para el evento "delivered", `event_data[].object` vale "email_delivery",
 *     que NO es lo mismo que el `event_name`. Emparejar por el `object`
 *     esperando "delivered" no marcaría jamás una entrega. Por eso manda
 *     `event_name[0]` y el `object` es solo el respaldo.
 *
 * Todo se lee a la defensiva: campos que faltan, arrays vacíos y formas
 * inesperadas devuelven "no lo entiendo" en vez de reventar. Un webhook que
 * revienta acaba desactivado por Zoho.
 */

export const CABECERA_WEBHOOK = "x-webhook-clave";

const SECRETO = process.env.ZEPTOMAIL_WEBHOOK_SECRETO?.trim();

/** Sin secreto no hay receptor: la ruta rechaza todo y la pantalla lo avisa. */
export const HAY_WEBHOOK = Boolean(SECRETO);

export function secretoEsperado(): string | undefined {
  return SECRETO;
}

/**
 * El Mail Agent del que aceptamos eventos.
 *
 * Comprobación opcional y barata encima de la cabecera secreta: si está
 * configurada, un evento de otro agente (otra cuenta, otro entorno apuntando
 * por error a esta URL) se descarta. Sin configurar no se comprueba, para no
 * bloquear el primer "Verificar" del panel de Zoho.
 */
const MAILAGENT = process.env.ZEPTOMAIL_MAILAGENT_KEY?.trim();

export type EventoEntrega = {
  estado: Exclude<EstadoEntrega, "SIN_CONFIRMAR">;
  ocurridoEn: string;
  reboteTipo?: TipoRebote;
  reboteMotivo?: string;
  reboteDiagnostico?: string;
  /** Por dónde buscar el correo al que se refiere, de más fiable a menos. */
  pistas: { ids: string[]; destinatario?: string; referencia?: string };
};

export type LecturaWebhook = {
  eventos: EventoEntrega[];
  /** Motivos por los que se ignoró algo. Van al log; nunca a un 4xx. */
  descartes: string[];
};

/* --------------------------------- Utilería -------------------------------- */

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Zoho manda arrays donde a veces cabría un objeto. Da igual: se normaliza. */
const comoLista = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];

const texto = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** ISO válido o nada: una fecha inventada es peor que ninguna. */
function fecha(v: unknown): string | undefined {
  const s = texto(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * `email_reference` es el `request_id` con "@dominio" pegado al final. Si se
 * guarda uno y se compara con el otro no coinciden nunca, así que se corta.
 */
const sinDominio = (v: string): string => v.split("@")[0];

/* -------------------------- De evento a estado nuestro --------------------- */

const POR_NOMBRE: Record<string, Exclude<EstadoEntrega, "SIN_CONFIRMAR">> = {
  softbounce: "REBOTADO",
  hardbounce: "REBOTADO",
  fbl_compliant: "QUEJA",
  delivered: "ENTREGADO",
  // No están entre los cuatro que ofrece el formulario del agente, pero si
  // algún día se activan queremos anotarlos y no descartarlos.
  email_open: "ABIERTO",
  open: "ABIERTO",
};

/** Respaldo por `event_data[].object`, con su "email_delivery" y todo. */
const POR_OBJETO: Record<string, Exclude<EstadoEntrega, "SIN_CONFIRMAR">> = {
  ...POR_NOMBRE,
  email_delivery: "ENTREGADO",
};

const clave = (v: unknown): string =>
  (texto(v) ?? "").toLowerCase().replace(/[\s-]+/g, "_");

/* --------------------------------- Lectura --------------------------------- */

/**
 * Convierte el cuerpo del webhook en cero o más eventos.
 *
 * Cero eventos no es un error: puede ser la prueba de "Verificar" del panel de
 * Zoho, o un tipo de evento que no seguimos. La ruta contesta 200 igual.
 */
export function interpretarWebhook(cuerpo: unknown): LecturaWebhook {
  const descartes: string[] = [];
  const eventos: EventoEntrega[] = [];

  if (!esObjeto(cuerpo)) {
    return { eventos, descartes: ["el cuerpo no es un objeto JSON"] };
  }

  if (MAILAGENT) {
    const suyo = texto(cuerpo.mailagent_key);
    if (suyo && suyo !== MAILAGENT) {
      return {
        eventos,
        descartes: [`mailagent_key ajeno (${suyo.slice(0, 12)}…)`],
      };
    }
  }

  const nombre = clave(comoLista(cuerpo.event_name)[0]);

  for (const mensaje of comoLista(cuerpo.event_message)) {
    if (!esObjeto(mensaje)) continue;

    const info = esObjeto(mensaje.email_info) ? mensaje.email_info : {};
    const referenciaCliente = texto(info.client_reference);
    const requestId =
      texto(mensaje.request_id) ?? texto((info as Record<string, unknown>).request_id);
    const emailReference = texto(info.email_reference);

    // De más fiable a menos: lo que ponemos nosotros primero.
    const ids = [
      referenciaCliente?.match(UUID)?.[0],
      referenciaCliente,
      requestId,
      emailReference,
      emailReference ? sinDominio(emailReference) : undefined,
    ].filter((v): v is string => Boolean(v));

    /*
     * Los correos enviados antes de que `client_reference` llevara el id del
     * correo traen ahí la referencia de la inscripción (SX27-XXXXXX). Se
     * conserva como pista de respaldo: junto al destinatario alcanza para
     * señalar el envío más reciente a esa persona.
     */
    const referencia = referenciaCliente?.match(/SX27-[A-Z0-9]+/i)?.[0];

    // `to` es un array y en un rebote puede haber varios destinatarios; el que
    // rebotó lo dice `bounced_recipient`, así que ese manda sobre la lista.
    const primerDestinatario = comoLista(info.to)
      .map((t) =>
        esObjeto(t) && esObjeto(t.email_address)
          ? texto(t.email_address.address)
          : undefined,
      )
      .find(Boolean);

    const trozos = comoLista(mensaje.event_data);
    if (trozos.length === 0) descartes.push("event_message sin event_data");

    for (const trozo of trozos) {
      if (!esObjeto(trozo)) continue;
      const objeto = clave(trozo.object);
      const estado = POR_NOMBRE[nombre] ?? POR_OBJETO[objeto];
      if (!estado) {
        descartes.push(`evento no seguido (event_name=${nombre || "?"}, object=${objeto || "?"})`);
        continue;
      }

      const detalles = comoLista(trozo.details).filter(esObjeto);
      // "delivered" y "fbl_compliant" no traen `details` con la misma forma
      // que un rebote —ni reason ni diagnostic_message—, así que se recorre lo
      // que haya y, si no hay nada, se emite el evento igual con la hora del
      // envoltorio. Un entregado sin detalle sigue siendo un entregado.
      const filas = detalles.length > 0 ? detalles : [{} as Record<string, unknown>];

      for (const d of filas) {
        const destinatario =
          texto(d.bounced_recipient) ??
          texto(d.recipient) ??
          comoLista(d.to).map(texto).find(Boolean) ??
          primerDestinatario;

        eventos.push({
          estado,
          ocurridoEn:
            fecha(d.time) ?? fecha(info.processed_time) ?? new Date().toISOString(),
          reboteTipo:
            estado === "REBOTADO"
              ? nombre === "hardbounce" || objeto === "hardbounce"
                ? "DURO"
                : "BLANDO"
              : undefined,
          reboteMotivo: estado === "REBOTADO" ? texto(d.reason) : undefined,
          reboteDiagnostico:
            estado === "REBOTADO" ? texto(d.diagnostic_message) : undefined,
          pistas: { ids, destinatario, referencia },
        });
      }
    }
  }

  if (eventos.length === 0 && descartes.length === 0) {
    descartes.push("cuerpo sin event_message reconocible");
  }
  return { eventos, descartes };
}
