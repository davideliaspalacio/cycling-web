"use client";

import { useEffect, useRef, useState } from "react";
import { Procesando } from "./procesando";

/**
 * Botón de tokenización de Wompi.
 *
 * El modo `tokenize` solo existe en la forma declarativa del widget: un
 * <form> que contiene el <script> de Wompi con `data-widget-operation`. Wompi
 * dibuja su propio botón, abre el modal, y al terminar **envía el formulario**
 * a la ruta del `action` con el token dentro. No hay callback en JavaScript.
 *
 * React no ejecuta un <script> puesto en el JSX, así que hay que insertarlo a
 * mano una sola vez.
 */
export function BotonTokenizarWompi({
  publicKey,
  referencia,
  destino = "/api/pagos/tokenizado",
}: {
  publicKey: string;
  referencia: string;
  destino?: string;
}) {
  const contenedor = useRef<HTMLFormElement>(null);
  const montado = useRef(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (montado.current || !contenedor.current) return;
    montado.current = true;

    const script = document.createElement("script");
    script.src = "https://checkout.wompi.co/widget.js";
    script.setAttribute("data-render", "button");
    script.setAttribute("data-widget-operation", "tokenize");
    script.setAttribute("data-public-key", publicKey);
    contenedor.current.appendChild(script);
  }, [publicKey]);

  // Wompi envía el formulario por su cuenta al cerrar el modal. La navegación
  // deja la página quieta varios segundos, así que tapamos con la cortina.
  useEffect(() => {
    const form = contenedor.current;
    if (!form) return;
    const alEnviar = () => setEnviando(true);
    form.addEventListener("submit", alEnviar);
    // Si el ciclista vuelve atrás, la página se restaura desde caché.
    const alVolver = () => setEnviando(false);
    window.addEventListener("pageshow", alVolver);
    return () => {
      form.removeEventListener("submit", alEnviar);
      window.removeEventListener("pageshow", alVolver);
    };
  }, []);

  return (
    <>
      <Procesando
        visible={enviando}
        titulo="Guardando tu tarjeta"
        detalle="Wompi está registrando el método de pago y cobrando la primera cuota. Enseguida te mostramos el ticket."
      />
      <form
      ref={contenedor}
      method="POST"
      action={destino}
      className="mt-4 flex flex-col items-start gap-2 [&_button]:cursor-pointer"
    >
      {/* Viajan con el formulario que envía Wompi al terminar. */}
      <input type="hidden" name="referencia" value={referencia} />
      <input type="hidden" name="autorizado" value="true" />
      </form>
    </>
  );
}
