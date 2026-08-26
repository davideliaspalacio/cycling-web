"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { pesos } from "@/lib/dinero";

/**
 * Las dos decisiones sobre un comprobante.
 *
 * El monto viene relleno con lo declarado pero es editable, y no por comodidad:
 * el ciclista escribe de memoria y transfiere otra cifra constantemente. Si el
 * revisor no pudiera corregirlo, tendría que rechazar un pago que sí entró.
 *
 * Rechazar pide el motivo en dos pasos a propósito. Es la acción que le llega
 * al ciclista como un correo malo, así que no puede dispararse de un clic
 * accidental, y el texto no puede quedar vacío porque es lo único que le dice
 * qué corregir.
 */

type Props = {
  abonoId: string;
  montoDeclarado: number;
  total: number;
  /** Lo ya verificado en esta inscripción, sin contar este abono. */
  verificado: number;
};

const soloDigitos = (v: string) => v.replace(/[^\d]/g, "");
const conSeparadores = (v: string) =>
  v === "" ? "" : Number(v).toLocaleString("es-CO");

export function Revisar({ abonoId, montoDeclarado, total, verificado }: Props) {
  const router = useRouter();
  const [monto, setMonto] = useState(String(montoDeclarado));
  const [motivo, setMotivo] = useState("");
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [enviando, setEnviando] = useState<"VERIFICAR" | "RECHAZAR" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const valor = monto === "" ? 0 : Number(monto);
  const quedaria = verificado + valor;
  const sobrepago = quedaria > total;
  const distinto = valor !== montoDeclarado;

  async function decidir(cuerpo: object, cual: "VERIFICAR" | "RECHAZAR") {
    setEnviando(cual);
    setError(null);
    try {
      const r = await fetch(`/api/evidencias/${abonoId}/revisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = (await r.json().catch(() => ({}))) as {
        error?: string;
        saldo?: number;
        completa?: boolean;
      };
      if (!r.ok) {
        setError(datos.error ?? "No se pudo registrar la decisión.");
        return;
      }
      setListo(
        cual === "VERIFICAR"
          ? datos.completa
            ? `Verificado. La inscripción quedó completa.`
            : `Verificado. Queda un saldo de ${pesos(datos.saldo ?? 0)}.`
          : "Rechazado. Le llega el motivo por correo.",
      );
      router.refresh();
    } catch {
      setError("No se pudo conectar. Inténtalo otra vez.");
    } finally {
      setEnviando(null);
    }
  }

  if (listo) {
    return (
      <p className="rounded-2xl border-[3px] border-tinta bg-turquesa px-4 py-3 font-display text-[0.9rem] font-extrabold text-tinta">
        {listo}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`monto-${abonoId}`}
          className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta"
        >
          Monto que entró
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold text-tinta">$</span>
          <input
            id={`monto-${abonoId}`}
            className="campo flex-1 font-mono !text-lg"
            inputMode="numeric"
            autoComplete="off"
            value={conSeparadores(monto)}
            onChange={(e) => setMonto(soloDigitos(e.target.value))}
          />
        </div>
        {distinto && (
          <p className="font-mono text-[0.72rem] font-bold text-[#b45309]">
            Distinto de lo declarado ({pesos(montoDeclarado)}). Manda esta cifra.
          </p>
        )}
        {sobrepago && (
          <p
            role="alert"
            className="rounded-xl border-[3px] border-tinta bg-alerta px-3 py-2 font-mono text-[0.72rem] font-bold text-nube"
          >
            Con esto se pasa del total: {pesos(quedaria)} de {pesos(total)} ·
            sobran {pesos(quedaria - total)}. No se devuelve nada
            automáticamente.
          </p>
        )}
      </div>

      {pidiendoMotivo && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`motivo-${abonoId}`}
            className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta"
          >
            Por qué se rechaza <span className="text-alerta">*</span>
          </label>
          <textarea
            id={`motivo-${abonoId}`}
            className="campo min-h-24 resize-y"
            placeholder="El comprobante no se lee / la transferencia no aparece en la cuenta / el monto no coincide…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
          <p className="text-[0.75rem] leading-snug text-tinta/75">
            Esto le llega tal cual al ciclista por correo. Su cupo sigue
            reservado y puede volver a subir el comprobante.
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="font-mono text-[0.75rem] font-bold text-alerta"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!pidiendoMotivo ? (
          <>
            <Boton
              tono="turquesa"
              disabled={enviando !== null || monto === ""}
              onClick={() =>
                decidir({ decision: "VERIFICAR", montoAprobado: valor }, "VERIFICAR")
              }
            >
              {enviando === "VERIFICAR"
                ? "Verificando…"
                : `Verificar ${pesos(valor)}`}
            </Boton>
            <Boton
              tono="nube"
              className="!border-alerta"
              onClick={() => setPidiendoMotivo(true)}
            >
              Rechazar…
            </Boton>
          </>
        ) : (
          <>
            <Boton
              tono="alerta"
              disabled={enviando !== null || motivo.trim().length < 5}
              onClick={() =>
                decidir({ decision: "RECHAZAR", motivo: motivo.trim() }, "RECHAZAR")
              }
            >
              {enviando === "RECHAZAR" ? "Rechazando…" : "Confirmar rechazo"}
            </Boton>
            <Boton
              tono="nube"
              onClick={() => {
                setPidiendoMotivo(false);
                setError(null);
              }}
            >
              Volver
            </Boton>
          </>
        )}
      </div>
    </div>
  );
}
