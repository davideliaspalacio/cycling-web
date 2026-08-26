"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Cerrar la sesión del panel.
 *
 * La cookie dura 12 horas; sin una forma de salir, el portátil que alguien
 * deja abierto en la carpa de la organización queda con permiso de aprobar
 * dinero hasta la noche.
 */
export function Salir({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await fetch("/api/panel/sesion", { method: "DELETE" }).catch(() => undefined);
    router.replace("/panel/entrar");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="raya-mono text-[0.7rem] text-tinta/75">
        Sesión de <span className="font-bold text-rio">{nombre}</span>
      </span>
      <button
        onClick={salir}
        disabled={saliendo}
        className="rounded-full border-[2.5px] border-tinta/30 px-3 py-1 font-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] text-tinta/75 transition-colors hover:border-alerta hover:text-alerta disabled:opacity-45"
      >
        {saliendo ? "Saliendo…" : "Salir"}
      </button>
    </div>
  );
}
