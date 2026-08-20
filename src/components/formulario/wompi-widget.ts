"use client";

/**
 * Envoltura del widget de Wompi.
 *
 * Wompi expone `WidgetCheckout` como global después de cargar su script. Aquí
 * lo cargamos una sola vez y le damos una cara de promesa, para que el
 * componente no tenga que lidiar con callbacks ni con el estado del <script>.
 */

const URL_WIDGET = "https://checkout.wompi.co/widget.js";

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
    phoneNumberPrefix?: string;
  };
};

export type TransaccionWidget = {
  id: string;
  status: "APPROVED" | "DECLINED" | "ERROR" | "PENDING" | "VOIDED";
  reference?: string;
  status_message?: string;
};

type ResultadoWidget = { transaction?: TransaccionWidget } & Record<string, unknown>;

declare global {
  interface Window {
    WidgetCheckout?: new (config: Record<string, unknown>) => {
      open: (callback: (resultado: ResultadoWidget) => void) => void;
    };
  }
}

let cargando: Promise<void> | null = null;

export function cargarWidget(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.WidgetCheckout) return Promise.resolve();
  cargando ??= new Promise<void>((listo, falla) => {
    const existente = document.querySelector<HTMLScriptElement>(
      `script[src="${URL_WIDGET}"]`,
    );
    const script = existente ?? document.createElement("script");
    script.src = URL_WIDGET;
    script.async = true;
    script.addEventListener("load", () => listo());
    script.addEventListener("error", () =>
      falla(new Error("No pudimos cargar el checkout de Wompi.")),
    );
    if (!existente) document.body.appendChild(script);
  });
  return cargando;
}

/**
 * Abre el modal para cobrar y resuelve con la transacción.
 *
 * Si el iframe de Wompi no llega a levantar —hay navegadores que bloquean
 * iframes de terceros, y algunas redes responden 403— nos vamos al checkout
 * alojado en vez de dejar al ciclista mirando un modal vacío. Es el mismo
 * pago, en página completa.
 */
export async function abrirCobro(
  config: ConfigWidget,
  opciones: { urlRespaldo?: string; esperaMs?: number } = {},
): Promise<TransaccionWidget | null> {
  await cargarWidget();
  if (!window.WidgetCheckout) throw new Error("El checkout de Wompi no cargó.");

  const checkout = new window.WidgetCheckout(config);
  const resultado = new Promise<TransaccionWidget | null>((listo) => {
    checkout.open((r) => listo(r?.transaction ?? null));
  });

  if (opciones.urlRespaldo) {
    vigilarQueElModalLevante(opciones.urlRespaldo, opciones.esperaMs ?? 6000);
  }
  return resultado;
}

/** Si a los N ms el iframe sigue sin alto, el modal no levantó. */
function vigilarQueElModalLevante(urlRespaldo: string, esperaMs: number) {
  const inicio = Date.now();
  const revisar = () => {
    const marco = document.querySelector<HTMLIFrameElement>(
      'iframe[src*="checkout.wompi.co"]',
    );
    if (marco && marco.getBoundingClientRect().height > 120) return; // levantó
    if (Date.now() - inicio >= esperaMs) {
      console.warn("[wompi] el modal no levantó; usando el checkout alojado");
      window.location.href = urlRespaldo;
      return;
    }
    setTimeout(revisar, 400);
  };
  setTimeout(revisar, 1200);
}

/**
 * La tokenización NO tiene API programática en Wompi: solo funciona con el
 * formulario declarativo. Ver `boton-tokenizar.tsx`.
 */
