"use client";

import { useEffect, useRef, useState } from "react";
import type { CuentaRecaudo } from "@/lib/catalogo";

/**
 * Dónde transferir, con el número listo para copiar.
 *
 * Las cuentas SIEMPRE llegan por props desde un componente de servidor. Salen
 * de variables de entorno sin `NEXT_PUBLIC_`, así que si este archivo
 * importara `CUENTAS_RECAUDO` de `@/lib/catalogo` el navegador vería el
 * respaldo escrito a mano en vez de la cuenta configurada — y una cuenta
 * equivocada es plata que se va a la nada.
 */

/* -------------------------------- Copiar ---------------------------------- */

/**
 * Copiar tiene que ser trivial: un número de cuenta transcrito a mano es la
 * forma más común de perder una transferencia.
 */
export function BotonCopiar({
  valor,
  que,
  className = "",
}: {
  valor: string;
  /** Qué se copió, para el aviso al lector de pantalla. */
  que: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el componente se desmonta con el "¡Copiado!" en pantalla, el timeout
  // seguiría vivo intentando tocar un estado que ya no existe.
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  async function copiar() {
    let listo = false;
    try {
      await navigator.clipboard.writeText(valor);
      listo = true;
    } catch {
      // El portapapeles moderno pide contexto seguro y, en algunos WebView,
      // un permiso que nadie dio. El respaldo viejo funciona en todos.
      listo = copiarALaAntigua(valor);
    }
    if (!listo) return;
    setCopiado(true);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(false), 2200);
  }

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={`Copiar ${que}`}
      className={`pulsable inline-flex shrink-0 items-center gap-1.5 rounded-xl border-[3px] border-tinta px-3 py-2 font-display text-[0.78rem] font-extrabold shadow-[3px_3px_0_0_var(--color-tinta)] transition-colors ${
        copiado ? "bg-turquesa text-tinta" : "bg-nube text-tinta"
      } ${className}`}
    >
      {copiado ? <IconoCheck /> : <IconoCopiar />}
      {copiado ? "¡Copiado!" : "Copiar"}
    </button>
  );
}

function copiarALaAntigua(valor: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = valor;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const listo = document.execCommand("copy");
    document.body.removeChild(area);
    return listo;
  } catch {
    return false;
  }
}

function IconoCopiar() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M7 2h8a2 2 0 0 1 2 2v9h-2V4H7V2Z" />
      <path d="M3 6h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 2v9h9V8H3Z" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M7.6 14.6 3.4 10.4l1.6-1.6 2.6 2.6 6.8-6.8 1.6 1.6z" />
    </svg>
  );
}

/* ------------------------------- Las cuentas ------------------------------ */

export function CuentasRecaudo({
  cuentas,
  referencia,
  className = "",
}: {
  cuentas: CuentaRecaudo[];
  /** Se pide escribirla en la descripción para poder casar el pago. */
  referencia?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        {cuentas.map((cuenta) => (
          <div
            key={cuenta.canal}
            className="flex flex-col gap-2 rounded-2xl border-[3px] border-tinta bg-nube p-4 shadow-[4px_4px_0_0_var(--color-tinta)]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-base font-extrabold leading-none text-tinta">
                {cuenta.entidad}
              </p>
              <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] text-tinta/75">
                {cuenta.tipo}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="raya-mono min-w-0 break-all text-[1.15rem] font-bold leading-tight text-tinta">
                {cuenta.numero}
              </p>
              <BotonCopiar
                valor={cuenta.numero}
                que={`el número de ${cuenta.entidad}`}
              />
            </div>

            <p className="text-[0.76rem] leading-snug text-tinta/75">
              A nombre de {cuenta.titular}
            </p>
          </div>
        ))}
      </div>

      {referencia && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 shadow-[4px_4px_0_0_var(--color-tinta)]">
          <p className="min-w-0 flex-1 text-[0.86rem] font-semibold leading-snug text-tinta">
            Escribe{" "}
            <span className="raya-mono font-bold">{referencia}</span> en la
            descripción de la transferencia. Es lo que nos deja encontrar tu
            pago.
          </p>
          <BotonCopiar valor={referencia} que="tu referencia" />
        </div>
      )}
    </div>
  );
}
