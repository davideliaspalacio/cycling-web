import "server-only";
import { createHash, randomUUID } from "node:crypto";

/**
 * Cliente de Wompi (Bancolombia).
 *
 * Dos modos, controlados por WOMPI_MODO:
 *  - "sandbox" / "produccion": pega contra la API real.
 *  - "simulacion" (por defecto si no hay llaves): responde con datos
 *    coherentes y deterministas, para poder demostrar el flujo completo
 *    sin credenciales. La tarjeta 4242… aprueba y la 4111… rechaza,
 *    igual que en el sandbox real.
 */

export type ModoWompi = "simulacion" | "sandbox" | "produccion";

export const MODO: ModoWompi = (() => {
  const forzado = process.env.WOMPI_MODO?.trim() as ModoWompi | undefined;
  if (forzado) return forzado;
  return process.env.WOMPI_LLAVE_PRIVADA?.trim() ? "sandbox" : "simulacion";
})();

const BASES: Record<Exclude<ModoWompi, "simulacion">, string> = {
  sandbox: "https://sandbox.wompi.co/v1",
  produccion: "https://production.wompi.co/v1",
};

/** Wompi ha movido el host del sandbox más de una vez; se puede forzar. */
const BASE_FORZADA = process.env.WOMPI_URL_BASE?.trim();

/** Una variable declarada pero vacía cuenta como ausente. */
const env = (nombre: string, respaldo: string) =>
  process.env[nombre]?.trim() || respaldo;

export const LLAVE_PUBLICA = env(
  "NEXT_PUBLIC_WOMPI_LLAVE_PUBLICA",
  "pub_test_SIMULACION",
);
const LLAVE_PRIVADA = env("WOMPI_LLAVE_PRIVADA", "prv_test_SIMULACION");
const SECRETO_INTEGRIDAD = env(
  "WOMPI_SECRETO_INTEGRIDAD",
  "test_integrity_SIMULACION",
);
const SECRETO_EVENTOS = env("WOMPI_SECRETO_EVENTOS", "test_events_SIMULACION");

export const URL_CHECKOUT = "https://checkout.wompi.co/p/";

export function base(): string {
  if (BASE_FORZADA) return BASE_FORZADA;
  return MODO === "simulacion" ? BASES.sandbox : BASES[MODO];
}

async function pedir<T>(
  ruta: string,
  opciones: { metodo?: "GET" | "POST"; llave: string; cuerpo?: unknown },
): Promise<T> {
  const res = await fetch(`${base()}${ruta}`, {
    method: opciones.metodo ?? "GET",
    headers: {
      Authorization: `Bearer ${opciones.llave}`,
      "Content-Type": "application/json",
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detalle = JSON.stringify(json?.error ?? json);
    throw new Error(`Wompi ${res.status} en ${ruta}: ${detalle}`);
  }
  return json as T;
}

/* ------------------------- Firma de integridad (checkout) ------------------------- */

export function firmaIntegridad(
  referencia: string,
  centavos: number,
  moneda = "COP",
): string {
  return createHash("sha256")
    .update(`${referencia}${centavos}${moneda}${SECRETO_INTEGRIDAD}`)
    .digest("hex");
}

/* ---------------------------- Firma de eventos (webhook) -------------------------- */

type EventoWompi = {
  event: string;
  data: { transaction?: Record<string, unknown> };
  sent_at: string;
  timestamp: number;
  signature: { checksum: string; properties: string[]; timestamp: number };
};

function valorAnidado(obj: unknown, ruta: string): string {
  return String(
    ruta.split(".").reduce<unknown>((acc, k) => {
      if (acc && typeof acc === "object") {
        return (acc as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj) ?? "",
  );
}

export function eventoEsAutentico(evento: EventoWompi): boolean {
  if (MODO === "simulacion") return true;
  const concatenado =
    evento.signature.properties
      .map((p) => valorAnidado(evento.data, p))
      .join("") +
    evento.signature.timestamp +
    SECRETO_EVENTOS;
  const esperado = createHash("sha256").update(concatenado).digest("hex");
  return esperado.toLowerCase() === evento.signature.checksum.toLowerCase();
}

/* ---------------------------------- Aceptaciones ---------------------------------- */

export type Aceptaciones = {
  terminos: string;
  datosPersonales: string;
  urlTerminos: string;
  urlDatos: string;
};

export async function obtenerAceptaciones(): Promise<Aceptaciones> {
  if (MODO === "simulacion") {
    return {
      terminos: "sim_acceptance_terminos",
      datosPersonales: "sim_acceptance_datos",
      urlTerminos: "https://wompi.com/assets/downloadble/reglamento-Usuarios-Colombia.pdf",
      urlDatos: "https://wompi.com/assets/downloadble/autorizacion-datos-personales.pdf",
    };
  }
  const r = await pedir<{
    data: {
      presigned_acceptance: { acceptance_token: string; permalink: string };
      presigned_personal_data_auth: { acceptance_token: string; permalink: string };
    };
  }>(`/merchants/${LLAVE_PUBLICA}`, { llave: LLAVE_PUBLICA });
  return {
    terminos: r.data.presigned_acceptance.acceptance_token,
    datosPersonales: r.data.presigned_personal_data_auth.acceptance_token,
    urlTerminos: r.data.presigned_acceptance.permalink,
    urlDatos: r.data.presigned_personal_data_auth.permalink,
  };
}

/* -------------------------------- Tokenizar tarjeta ------------------------------- */

export type DatosTarjeta = {
  numero: string;
  cvc: string;
  mesExp: string;
  anioExp: string;
  titular: string;
};

export type TarjetaTokenizada = {
  token: string;
  marca: string;
  ultimos4: string;
};

function marcaDeTarjeta(numero: string): string {
  const n = numero.replace(/\D/g, "");
  if (/^4/.test(n)) return "VISA";
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "MASTERCARD";
  if (/^3[47]/.test(n)) return "AMEX";
  return "CARD";
}

export async function tokenizarTarjeta(
  tarjeta: DatosTarjeta,
): Promise<TarjetaTokenizada> {
  const limpio = tarjeta.numero.replace(/\s|-/g, "");
  if (MODO === "simulacion") {
    return {
      token: `tok_sim_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      marca: marcaDeTarjeta(limpio),
      ultimos4: limpio.slice(-4),
    };
  }
  const r = await pedir<{
    data: { id: string; brand: string; last_four: string };
  }>("/tokens/cards", {
    metodo: "POST",
    llave: LLAVE_PUBLICA,
    cuerpo: {
      number: limpio,
      cvc: tarjeta.cvc,
      exp_month: tarjeta.mesExp,
      exp_year: tarjeta.anioExp,
      card_holder: tarjeta.titular,
    },
  });
  return {
    token: r.data.id,
    marca: r.data.brand ?? marcaDeTarjeta(limpio),
    ultimos4: r.data.last_four,
  };
}

/* --------------------------------- Fuente de pago --------------------------------- */

/**
 * La fuente de pago es la pieza clave del recaudo por cuotas: guarda la
 * tarjeta tokenizada del lado de Wompi y devuelve un id con el que podemos
 * cobrar cada mes sin volver a pedirle los datos al ciclista.
 */
export async function crearFuenteDePago(params: {
  token: string;
  correo: string;
  aceptaciones: Aceptaciones;
}): Promise<number> {
  if (MODO === "simulacion") {
    return Math.floor(100000 + Math.random() * 899999);
  }
  const r = await pedir<{ data: { id: number; status: string } }>(
    "/payment_sources",
    {
      metodo: "POST",
      llave: LLAVE_PRIVADA,
      cuerpo: {
        type: "CARD",
        token: params.token,
        customer_email: params.correo,
        acceptance_token: params.aceptaciones.terminos,
        accept_personal_auth: params.aceptaciones.datosPersonales,
      },
    },
  );
  return r.data.id;
}

/* ----------------------------------- Transacción ---------------------------------- */

export type ResultadoCobro = {
  id: string;
  estado: "APPROVED" | "DECLINED" | "ERROR" | "PENDING";
  mensaje?: string;
};

export async function cobrarConFuente(params: {
  fuentePagoId: number;
  centavos: number;
  referencia: string;
  correo: string;
  /** Pista de simulación: número de tarjeta usado al tokenizar. */
  tarjetaSimulada?: string;
  /**
   * Cuánto esperar a que Wompi liquide. En el flujo interactivo vale la pena
   * esperar unos segundos para darle respuesta al ciclista; en el barrido
   * nocturno se pone en 0 y deja que el webhook cierre el ciclo.
   */
  esperaMs?: number;
}): Promise<ResultadoCobro> {
  if (MODO === "simulacion") {
    // Basta con los últimos 4: así el reintento de una cuota se comporta
    // igual que el primer cobro aunque ya no tengamos el número completo.
    const rechaza = /1111$/.test((params.tarjetaSimulada ?? "").replace(/\D/g, ""));
    return {
      id: `sim-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      estado: rechaza ? "DECLINED" : "APPROVED",
      mensaje: rechaza ? "Fondos insuficientes (simulado)" : undefined,
    };
  }
  const r = await pedir<{
    data: { id: string; status: ResultadoCobro["estado"]; status_message?: string };
  }>("/transactions", {
    metodo: "POST",
    llave: LLAVE_PRIVADA,
    cuerpo: {
      amount_in_cents: params.centavos,
      currency: "COP",
      customer_email: params.correo,
      reference: params.referencia,
      payment_source_id: params.fuentePagoId,
      payment_method: { installments: 1 },
      // Wompi exige la firma también en los cobros por API, no solo en el
      // checkout: sin ella devuelve 422 y el cobro mensual nunca ocurre.
      signature: firmaIntegridad(params.referencia, params.centavos),
      recurrent: true,
    },
  });
  return esperarLiquidacion(
    { id: r.data.id, estado: r.data.status, mensaje: r.data.status_message },
    params.esperaMs ?? 10_000,
  );
}

/**
 * Wompi crea la transacción en PENDING y la liquida en diferido. Consultamos
 * unas cuantas veces antes de rendirnos; si sigue pendiente se devuelve como
 * tal y el webhook la cierra.
 */
async function esperarLiquidacion(
  inicial: ResultadoCobro,
  esperaMs: number,
): Promise<ResultadoCobro> {
  if (inicial.estado !== "PENDING" || esperaMs <= 0) return inicial;
  const limite = Date.now() + esperaMs;
  let actual = inicial;
  while (actual.estado === "PENDING" && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      actual = await consultarTransaccion(inicial.id);
    } catch {
      break; // si la consulta falla, que decida el webhook
    }
  }
  return actual;
}

export async function consultarTransaccion(id: string): Promise<ResultadoCobro> {
  if (MODO === "simulacion") {
    return { id, estado: "APPROVED" };
  }
  const r = await pedir<{
    data: { id: string; status: ResultadoCobro["estado"]; status_message?: string };
    // Consultar una transacción es público en Wompi: no gasta la llave privada.
  }>(`/transactions/${id}`, { llave: LLAVE_PUBLICA });
  return { id: r.data.id, estado: r.data.status, mensaje: r.data.status_message };
}

/* ------------------------------- Widget de Wompi ---------------------------------- */

/**
 * Configuración que el navegador le pasa a `new WidgetCheckout(...)`.
 *
 * La firma de integridad se calcula aquí, en el servidor: el secreto nunca
 * viaja al cliente. Lo único público es la llave `pub_`.
 */
export type ConfigWidget = {
  publicKey: string;
  currency: "COP";
  amountInCents: number;
  reference: string;
  signature: { integrity: string };
  redirectUrl?: string;
  expirationTime?: string;
  customerData?: {
    email: string;
    fullName?: string;
    phoneNumber?: string;
    /** Obligatorio en cuanto se manda phoneNumber, aunque no lo diga el manual. */
    phoneNumberPrefix?: string;
  };
};

export function configuracionDeWidget(params: {
  referencia: string;
  centavos: number;
  correo: string;
  nombre?: string;
  telefono?: string;
  urlRetorno?: string;
  /** Minutos que el usuario tiene para completar el pago. */
  minutosParaPagar?: number;
}): ConfigWidget {
  const expira = params.minutosParaPagar
    ? new Date(Date.now() + params.minutosParaPagar * 60_000).toISOString()
    : undefined;

  return {
    publicKey: LLAVE_PUBLICA,
    currency: "COP",
    amountInCents: params.centavos,
    reference: params.referencia,
    signature: { integrity: firmaIntegridad(params.referencia, params.centavos) },
    redirectUrl: params.urlRetorno,
    expirationTime: expira,
    customerData: {
      email: params.correo,
      fullName: params.nombre,
      ...(params.telefono
        ? { phoneNumber: params.telefono, phoneNumberPrefix: "+57" }
        : {}),
    },
  };
}

/** Mismo checkout pero como URL, para abrirlo en pestaña en vez de modal. */
export function urlDeCheckout(params: {
  referencia: string;
  centavos: number;
  correo: string;
  urlRetorno: string;
}): string {
  const qs = new URLSearchParams({
    "public-key": LLAVE_PUBLICA,
    currency: "COP",
    "amount-in-cents": String(params.centavos),
    reference: params.referencia,
    "signature:integrity": firmaIntegridad(params.referencia, params.centavos),
    "redirect-url": params.urlRetorno,
    "customer-data:email": params.correo,
  });
  return `${URL_CHECKOUT}?${qs.toString()}`;
}

/**
 * Crea la fuente de pago a partir del token que devuelve el widget en modo
 * `tokenize`. Es el puente entre el modal de Wompi y el cobro por cuotas:
 * el modal captura la tarjeta (nunca pasa por nuestro servidor) y nos entrega
 * un token; con él pedimos la fuente de pago reutilizable.
 */
export async function fuenteDesdeTokenDelWidget(params: {
  token: string;
  correo: string;
}): Promise<number> {
  const aceptaciones = await obtenerAceptaciones();
  return crearFuenteDePago({
    token: params.token,
    correo: params.correo,
    aceptaciones,
  });
}
