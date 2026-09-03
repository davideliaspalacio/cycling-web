import type { CorreoSeguido, EstadoEntrega, TipoRebote } from "../tipos";

/**
 * Cómo se le cuenta a una persona no técnica si un correo llegó.
 *
 * Sin `server-only` y sin tocar la base: son traducciones puras. Aquí vive la
 * regla que importa — **enviado no es entregado**. El proveedor acepta el
 * correo en un milisegundo; que el servidor del ciclista lo reciba pasa
 * después y solo lo sabemos si nos lo cuenta por webhook. Mientras no lo
 * cuente, esto dice "sin confirmar" y no "entregado".
 */

/* ------------------------- Qué correo era, en cristiano ------------------- */

/**
 * Las claves son las de `PLANTILLAS` en `plantillas.ts`. Quien atiende al
 * ciclista no tiene por qué saber qué es `evidencia-verificada`.
 */
const NOMBRE_PLANTILLA: Record<string, string> = {
  "inscripcion-confirmada": "Inscripción confirmada",
  "plan-cuotas-activado": "Plan de cuotas activado",
  "cuota-pagada": "Cuota pagada",
  "recordatorio-cuota": "Recordatorio de cuota",
  "cuota-fallida": "Cobro rechazado",
  "inscripcion-saldada": "Inscripción saldada",
  "evidencia-recibida": "Comprobante recibido",
  "evidencia-verificada": "Comprobante aprobado",
  "evidencia-rechazada": "Comprobante rechazado",
  "inscripcion-completa": "Inscripción completa",
  "cambio-competidor": "Cambio de competidor",
};

/** Una plantilla nueva sin traducir se lee raro, pero se lee. */
export function nombreDePlantilla(plantilla: string): string {
  return (
    NOMBRE_PLANTILLA[plantilla] ??
    plantilla.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/* ------------------------------ Si llegó o no ----------------------------- */

export type Tono = "turquesa" | "alerta" | "sol" | "marea" | "nube" | "rio";

export type EstadoVisible = {
  clave: EstadoEntrega | "NO_SALIO" | "SIMULADO";
  etiqueta: string;
  tono: Tono;
  /** Una frase que explique qué significa, sin jerga. */
  detalle: string;
};

/**
 * El estado que se pinta, que no es solo el del webhook.
 *
 * Antes de preguntarse si llegó hay que saber si llegó a salir: un correo
 * guardado en producción sin llave del proveedor nunca se envió, y decir de él
 * "sin confirmar" sería mentir por omisión. Por eso se mira primero
 * `proveedor` y después `estadoEntrega`.
 */
export function estadoVisible(
  correo: Pick<CorreoSeguido, "proveedor" | "estadoEntrega">,
  hayWebhook: boolean,
): EstadoVisible {
  if (correo.proveedor === "sin-configurar") {
    return {
      clave: "NO_SALIO",
      etiqueta: "No salió",
      tono: "alerta",
      detalle:
        "Se guardó pero nunca se envió: faltaba la llave del proveedor. El ciclista no recibió nada.",
    };
  }
  if (correo.proveedor === "simulacion") {
    return {
      clave: "SIMULADO",
      etiqueta: "Simulado",
      tono: "nube",
      detalle:
        "Correo de prueba en modo desarrollo. No se envió a nadie de verdad.",
    };
  }

  switch (correo.estadoEntrega) {
    case "REBOTADO":
      return {
        clave: "REBOTADO",
        etiqueta: "Rebotó",
        tono: "alerta",
        detalle: "El servidor del ciclista lo devolvió. No lo tiene.",
      };
    case "QUEJA":
      return {
        clave: "QUEJA",
        etiqueta: "Marcado como spam",
        tono: "sol",
        detalle:
          "Llegó, pero el ciclista lo marcó como correo no deseado. Los siguientes pueden acabar en su carpeta de spam.",
      };
    case "ABIERTO":
      return {
        clave: "ABIERTO",
        etiqueta: "Abierto",
        tono: "turquesa",
        detalle: "Llegó y el ciclista lo abrió.",
      };
    case "ENTREGADO":
      return {
        clave: "ENTREGADO",
        etiqueta: "Entregado",
        tono: "turquesa",
        detalle: "El servidor del ciclista confirmó que lo recibió.",
      };
    default:
      return {
        clave: "SIN_CONFIRMAR",
        etiqueta: "Sin confirmar",
        tono: "marea",
        detalle: hayWebhook
          ? "Salió y el proveedor lo aceptó. Todavía no ha dicho si el servidor del ciclista lo recibió; suele tardar unos minutos."
          : "Salió y el proveedor lo aceptó. No podemos saber si llegó porque el aviso de entrega no está configurado.",
      };
  }
}

/* --------------------- Por qué rebotó, sin códigos SMTP -------------------- */

export type ReboteExplicado = {
  titulo: string;
  queHacer: string;
};

/**
 * Traduce el motivo del rebote a algo accionable.
 *
 * Lo más frecuente con diferencia es que el ciclista escribiera mal su correo
 * al inscribirse (gmial.com, un punto de más, un apellido pegado). Eso no se
 * arregla reenviando: hay que confirmarle la dirección y corregirla. Un
 * "bad-mailbox" no le dice eso a nadie; esta función sí.
 *
 * Se mira sobre todo `diagnostic_message`, que es donde ZeptoMail pone la
 * causa con su propio vocabulario ("bad-mailbox", "policy-related"…), y
 * también `reason`, que suele ser más genérico ("relaying-issues"). Las
 * comparaciones son por subcadena para que aguante tanto ese vocabulario como
 * un texto SMTP crudo si algún día llega en su lugar.
 *
 * El motivo original nunca se pierde — se guarda en la base y la pantalla lo
 * enseña debajo en letra pequeña, para quien sí sepa leerlo.
 */
export function explicarRebote(
  tipo: TipoRebote | undefined,
  motivo: string | undefined,
  diagnostico: string | undefined,
): ReboteExplicado {
  const texto = `${diagnostico ?? ""} ${motivo ?? ""}`.toLowerCase();
  const tiene = (...agujas: string[]) => agujas.some((a) => texto.includes(a));

  // Dominio inexistente: la parte de después de la arroba está mal.
  if (tiene("bad-domain", "nxdomain", "domain not found", "no mx", "dns")) {
    return {
      titulo: "La parte de después de la arroba no existe",
      queHacer:
        "Casi siempre es un error de tecleo al inscribirse (gmial.com por gmail.com). Confirma la dirección con el ciclista, corrígela y vuelve a mandárselo.",
    };
  }
  // Buzón inexistente. Es el caso más común de todos.
  if (
    tiene(
      "bad-mailbox",
      "user unknown",
      "no such user",
      "unknown user",
      "invalid recipient",
      "recipient not found",
      "mailbox not found",
      "does not exist",
      "5.1.1",
    )
  ) {
    return {
      titulo: "Esa dirección no existe",
      queHacer:
        "El dominio existe, pero el buzón no. Lo normal es que el ciclista se equivocara al escribir su correo. Confírmalo con él por teléfono o WhatsApp, corrígelo y vuelve a mandárselo.",
    };
  }
  if (tiene("mailbox-full", "full", "quota", "5.2.2")) {
    return {
      titulo: "El buzón del ciclista está lleno",
      queHacer:
        "La dirección es buena; no cabe nada más. Avísale por teléfono o WhatsApp para que libere espacio y vuelve a mandarlo.",
    };
  }
  if (tiene("inactive-mailbox", "disabled", "inactive", "suspended")) {
    return {
      titulo: "Esa cuenta está desactivada",
      queHacer:
        "El buzón existe pero ya no se usa (pasa con correos de empresas anteriores). Pídele al ciclista una dirección que sí consulte.",
    };
  }
  if (
    tiene(
      "policy-related",
      "spam-related",
      "content-related",
      "spam",
      "block",
      "blacklist",
      "reject",
      "reputation",
    )
  ) {
    return {
      titulo: "Su servidor lo tomó por correo no deseado",
      queHacer:
        "No es culpa de la dirección. Pídele que mire su carpeta de spam. Si pasa con varios ciclistas a la vez, hay que revisar el dominio remitente en ZeptoMail.",
    };
  }
  if (
    tiene(
      "no-answer-from-host",
      "routing-errors",
      "protocol-errors",
      "message-expired",
      "relaying",
      "timeout",
      "temporar",
      "try again",
      "deferred",
      "greylist",
      "connection",
    )
  ) {
    return {
      titulo: "Su servidor de correo no respondió bien",
      queHacer:
        "Suele ser pasajero y el proveedor reintenta solo. Si mañana sigue igual, confirma la dirección con el ciclista.",
    };
  }

  return tipo === "BLANDO"
    ? {
        titulo: "No se pudo entregar por ahora",
        queHacer:
          "El servidor del ciclista lo rechazó de forma temporal. Espera un rato y, si no cambia, confirma la dirección con él.",
      }
    : {
        titulo: "Su servidor lo rechazó de forma definitiva",
        queHacer:
          "Confirma la dirección con el ciclista por teléfono o WhatsApp. Si está bien escrita, pídele otra suya.",
      };
}

export const TEXTO_TIPO_REBOTE: Record<TipoRebote, string> = {
  DURO: "Rebote definitivo",
  BLANDO: "Rebote temporal",
};

/* -------------------------------- Fechas ---------------------------------- */

/**
 * El arranque del día en Colombia, en ISO.
 *
 * La carrera y quien atiende están en Colombia: "cuántos correos hoy" es el
 * día de allí, no el UTC del servidor. Sin esto, entre las 19:00 y la
 * medianoche de Bogotá el contador ya estaría en el día siguiente.
 */
export function inicioDelDiaEnColombia(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  // Colombia es UTC-5 todo el año: no hay horario de verano que ajustar.
  return `${partes}T00:00:00-05:00`;
}
