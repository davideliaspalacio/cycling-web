"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boton, Campo, Tarjeta } from "@/components/ui";
import { EVENTO } from "@/lib/catalogo";

/**
 * Entrada al panel de la organización.
 *
 * El nombre no autentica nada: solo queda registrado junto a cada revisión
 * para saber quién aprobó qué. Lo que da acceso es la clave compartida.
 */
export function EntrarAlPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const volver = params.get("volver") ?? "/panel";

  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/panel/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, clave }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "No se pudo entrar.");
        return;
      }
      router.replace(volver);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisa tu internet.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tarjeta className="p-7">
      <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.2em] text-tinta/75">
        {EVENTO.wordmark.inicio} {EVENTO.wordmark.acento}
      </p>
      <h1 className="mt-1 font-display text-2xl font-extrabold text-tinta">
        Panel de la organización
      </h1>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-tinta/75">
        Aquí se revisan los comprobantes de pago. Tu nombre queda registrado
        junto a cada aprobación.
      </p>

      <form onSubmit={entrar} className="mt-6 flex flex-col gap-4">
        <Campo etiqueta="Tu nombre" id="nombre" obligatorio>
          <input
            id="nombre"
            className="campo"
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </Campo>

        <Campo etiqueta="Clave del panel" id="clave" obligatorio>
          <input
            id="clave"
            type="password"
            className="campo"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />
        </Campo>

        {error && (
          <p
            role="alert"
            className="font-mono text-[0.75rem] font-bold text-alerta"
          >
            {error}
          </p>
        )}

        <Boton type="submit" tono="turquesa" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Boton>
      </form>
    </Tarjeta>
  );
}
