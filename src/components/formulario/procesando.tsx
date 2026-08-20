"use client";

import { createPortal } from "react-dom";

/**
 * Cortina de "estamos procesando".
 *
 * Hace falta porque el cobro tarda: guardar la tarjeta en Wompi, cobrar la
 * primera cuota y esperar a que el banco liquide son varios segundos con la
 * página quieta. Sin esto el ciclista cree que el botón no hizo nada y vuelve
 * a darle — que es justo como se generan los cobros dobles.
 *
 * Va por portal al <body> a propósito: cualquier ancestro con `transform`
 * — por ejemplo la animación de entrada de una tarjeta — convierte un
 * `position: fixed` en relativo a ese ancestro, y la cortina queda recortada.
 */
export function Procesando({
  visible,
  titulo = "Estamos procesando tu pago",
  detalle = "Estamos hablando con tu banco. Puede tardar unos segundos.",
}: {
  visible: boolean;
  titulo?: string;
  detalle?: string;
}) {
  // En el servidor no hay document; y como `visible` siempre arranca en falso,
  // el primer render del cliente también devuelve null: no hay desajuste de
  // hidratación.
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[100] grid place-items-center bg-noche/92 px-6 backdrop-blur-sm"
    >
      <div className="flex max-w-sm flex-col items-center gap-5 rounded-3xl border-[3px] border-tinta bg-hueso px-8 py-9 text-center shadow-[10px_10px_0_0_var(--color-tinta)]">
        <RuedaGirando />

        <div className="flex flex-col gap-2">
          <p className="font-display text-xl font-extrabold leading-tight tracking-tight text-tinta">
            {titulo}
          </p>
          <p className="text-[0.9rem] leading-relaxed text-tinta/65">{detalle}</p>
        </div>

        <p className="raya-mono text-[0.68rem] font-bold uppercase tracking-[0.16em] text-tinta/40">
          No cierres esta ventana
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** Una rueda de bici girando: el mismo mundo visual del resto de la app. */
function RuedaGirando() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-14 w-14 motion-safe:animate-spin motion-safe:[animation-duration:1.4s]"
      aria-hidden
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="var(--color-tinta)"
        strokeWidth="3.5"
      />
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="var(--color-lima)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="34 92"
      />
      {[0, 60, 120].map((giro) => (
        <line
          key={giro}
          x1="24"
          y1="6"
          x2="24"
          y2="42"
          stroke="var(--color-tinta)"
          strokeOpacity="0.28"
          strokeWidth="2"
          transform={`rotate(${giro} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="4" fill="var(--color-tinta)" />
    </svg>
  );
}
