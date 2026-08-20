"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Boton, Campo, Chip, Tarjeta } from "@/components/ui";
import { fechaLarga, pesos } from "@/lib/dinero";
import type { Cuota, EstadoInscripcion, PlanPago } from "@/lib/tipos";

type Vista = {
  referencia: string;
  estado: EstadoInscripcion;
  plan: PlanPago;
  categoria: { nombre: string; km: number; desnivel: number } | null;
  ciclista: { nombres: string; apellidos: string; correo: string; ciudad: string };
  tallas: { jersey: string; running: string };
  total: number;
  pagado: number;
  saldo: number;
  cuotas: Cuota[];
  proxima: Cuota | null;
  tarjeta: { marca: string; ultimos4: string } | null;
  autorizacion: {
    aceptadaEn: string;
    texto: string;
    ip?: string;
  } | null;
};

const ETIQUETA_ESTADO: Record<EstadoInscripcion, { texto: string; tono: "lima" | "naranja" | "magenta" | "hueso" }> = {
  BORRADOR: { texto: "Sin terminar", tono: "hueso" },
  PENDIENTE_PAGO: { texto: "Falta el pago", tono: "magenta" },
  AL_DIA: { texto: "Al día", tono: "lima" },
  EN_MORA: { texto: "Cobro pendiente", tono: "magenta" },
  COMPLETA: { texto: "Pago completo", tono: "lima" },
};

export function PortalCiclista({
  vistaInicial,
  modoDemo,
  avisoInicial,
}: {
  /** Ya resuelta en el servidor cuando el enlace del correo trae ?ref=. */
  vistaInicial: Vista | null;
  modoDemo: boolean;
  /** Mensaje que trae la redirección del checkout de Wompi. */
  avisoInicial?: string;
}) {
  const [vista, setVista] = useState<Vista | null>(vistaInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(avisoInicial ?? null);
  const [cobrando, setCobrando] = useState(false);
  const [busqueda, setBusqueda] = useState({ identificacion: "", correo: "" });

  const consultar = useCallback(async (cuerpo: object) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/mi-inscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error);
        setVista(null);
        return;
      }
      setVista(datos);
    } catch {
      setError("No pudimos conectarnos. Inténtalo otra vez.");
    } finally {
      setCargando(false);
    }
  }, []);

  async function cobrar(ruta: "/api/pagos/cuota" | "/api/pagos/saldar", cuerpo: object) {
    setCobrando(true);
    setAviso(null);
    try {
      const res = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = await res.json();
      if (!res.ok) {
        setAviso(datos.error ?? "No pudimos hacer el cobro.");
        return;
      }
      setAviso(
        datos.enProceso
          ? "El cobro está en curso. Te confirmamos por correo apenas el banco responda."
          : datos.aprobado
            ? "Cobro aprobado. Te llegó el comprobante por correo."
            : `El banco rechazó el cobro: ${datos.mensaje ?? ""}`,
      );
      await consultar({ referencia: vista!.referencia });
    } finally {
      setCobrando(false);
    }
  }

  /* ------------------------------ Buscador ------------------------------ */

  if (!vista) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <h1 className="font-display text-[clamp(1.9rem,5.5vw,2.8rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-hueso">
          ¿Cómo va tu pago?
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-hueso/60">
          Consulta con el documento y el correo que usaste al inscribirte.
        </p>

        <Tarjeta tono="hueso" className="mt-7 flex flex-col gap-5 p-6">
          <Campo id="doc" etiqueta="Documento" obligatorio>
            <input
              id="doc"
              className="campo raya-mono"
              inputMode="numeric"
              value={busqueda.identificacion}
              onChange={(e) =>
                setBusqueda({ ...busqueda, identificacion: e.target.value })
              }
            />
          </Campo>
          <Campo id="mail" etiqueta="Correo" obligatorio>
            <input
              id="mail"
              className="campo"
              type="email"
              value={busqueda.correo}
              onChange={(e) => setBusqueda({ ...busqueda, correo: e.target.value })}
            />
          </Campo>
          <Boton
            onClick={() => consultar(busqueda)}
            disabled={cargando}
            tamano="lg"
            className="self-start"
          >
            {cargando ? "Buscando…" : "Consultar"}
          </Boton>
          {error && (
            <p role="alert" className="text-[0.85rem] font-semibold leading-snug text-[#c2185b]">
              {error}
            </p>
          )}
        </Tarjeta>

        <p className="mt-6 text-[0.85rem] text-hueso/45">
          ¿Todavía no te inscribes?{" "}
          <Link href="/inscripcion" className="text-lima underline underline-offset-4">
            Empieza aquí
          </Link>
          .
        </p>
      </div>
    );
  }

  /* -------------------------------- Vista ------------------------------- */

  const pct = Math.round((vista.pagado / vista.total) * 100);
  const estado = ETIQUETA_ESTADO[vista.estado];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-lima">
            Inscripción {vista.referencia}
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.7rem,4.6vw,2.5rem)] font-extrabold leading-none tracking-[-0.035em] text-hueso">
            {vista.ciclista.nombres} {vista.ciclista.apellidos}
          </h1>
          <p className="mt-2 text-[0.9rem] text-hueso/55">
            {vista.categoria?.nombre} · {vista.categoria?.km} km ·{" "}
            {vista.categoria?.desnivel.toLocaleString("es-CO")} m D+
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Chip tono={estado.tono}>{estado.texto}</Chip>
          <Link
            href={`/ticket/${vista.referencia}`}
            className="pulsable rounded-2xl border-[3px] border-tinta bg-lima px-4 py-2 font-display text-[0.9rem] font-extrabold text-tinta shadow-[4px_4px_0_0_var(--color-tinta)]"
          >
            Ver mi ticket
          </Link>
        </div>
      </div>

      {/* Saldo */}
      <Tarjeta tono="hueso" className="mt-7 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-tinta/50">
              {vista.saldo > 0 ? "Te falta" : "Pagaste"}
            </p>
            <p className="mt-1 font-display text-[clamp(2.4rem,7vw,3.6rem)] font-extrabold leading-none tracking-[-0.04em] text-tinta">
              {pesos(vista.saldo > 0 ? vista.saldo : vista.total)}
            </p>
          </div>
          <p className="raya-mono text-[0.8rem] font-bold text-tinta/55">
            {pesos(vista.pagado)} de {pesos(vista.total)} · {pct}%
          </p>
        </div>

        {/* Barra segmentada: un bloque por cuota */}
        <div className="mt-5 flex gap-1.5">
          {vista.cuotas.map((c) => (
            <div
              key={c.numero}
              className={`h-5 flex-1 rounded-md border-[3px] border-tinta transition-colors duration-500 ${
                c.estado === "PAGADA"
                  ? "bg-lima"
                  : c.estado === "EN_PROCESO"
                    ? "bg-cielo"
                    : c.estado === "FALLIDA" || c.estado === "VENCIDA"
                      ? "bg-magenta"
                      : "bg-white"
              }`}
              title={`Cuota ${c.numero}: ${c.estado.toLowerCase()}`}
            />
          ))}
        </div>

        {vista.proxima && (
          <p className="mt-4 text-[0.92rem] leading-relaxed text-tinta/70">
            Siguiente cobro:{" "}
            <strong className="text-tinta">{pesos(vista.proxima.monto)}</strong> el{" "}
            {fechaLarga(vista.proxima.vence)}
            {vista.tarjeta && (
              <>
                {" "}
                a tu {vista.tarjeta.marca} ····{vista.tarjeta.ultimos4}
              </>
            )}
            .
          </p>
        )}

        {vista.saldo > 0 && vista.proxima && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Boton
              onClick={() =>
                cobrar("/api/pagos/cuota", {
                  referencia: vista.referencia,
                  numero: vista.proxima!.numero,
                })
              }
              disabled={cobrando}
            >
              {cobrando
                ? "Cobrando…"
                : `Adelantar la cuota ${vista.proxima.numero} · ${pesos(vista.proxima.monto)}`}
            </Boton>

            {vista.saldo > vista.proxima.monto && (
              <Boton
                tono="naranja"
                onClick={() =>
                  cobrar("/api/pagos/saldar", { referencia: vista.referencia })
                }
                disabled={cobrando}
              >
                Pagar todo el saldo · {pesos(vista.saldo)}
              </Boton>
            )}

            {modoDemo && (
              <span className="raya-mono text-[0.68rem] uppercase tracking-widest text-tinta/40">
                En la demo, este botón simula el cobro del mes
              </span>
            )}
          </div>
        )}

        {aviso && (
          <p
            role="status"
            className="mt-4 rounded-2xl border-[3px] border-tinta bg-cielo px-4 py-3 text-[0.88rem] font-semibold text-tinta"
          >
            {aviso}
          </p>
        )}
      </Tarjeta>

      {/* Cuotas */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight text-hueso">
          {vista.plan === "CUOTAS" ? "Tus cuotas" : "Tu pago"}
        </h2>
        <ol className="flex flex-col gap-2">
          {vista.cuotas.map((c) => (
            <li key={c.numero}>
              <Tarjeta
                tono={c.estado === "PAGADA" ? "lima" : "hueso"}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4"
              >
                <span className="raya-mono grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-tinta bg-white text-[0.75rem] font-bold text-tinta">
                  {c.numero}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[0.95rem] font-extrabold text-tinta">
                    {c.estado === "PAGADA"
                      ? `Pagada el ${fechaLarga((c.pagadaEn ?? c.vence).slice(0, 10))}`
                      : c.estado === "EN_PROCESO"
                        ? "Cobro en curso, confirmando con el banco"
                        : `Se cobra el ${fechaLarga(c.vence)}`}
                  </span>
                  <span className="raya-mono block text-[0.7rem] text-tinta/50">
                    {c.transaccionId ?? c.referencia}
                  </span>
                </span>
                <span className="raya-mono text-[1rem] font-bold text-tinta">
                  {pesos(c.monto)}
                </span>
              </Tarjeta>
            </li>
          ))}
        </ol>
      </section>

      {vista.autorizacion && (
        <section className="mt-6">
          <Tarjeta tono="selva" className="p-5">
            <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-hueso/45">
              Autorización de cobro
            </p>
            <p className="mt-2 text-[0.88rem] leading-relaxed text-hueso/75">
              {vista.autorizacion.texto}
            </p>
            <p className="raya-mono mt-2 text-[0.7rem] text-hueso/35">
              Aceptada el{" "}
              {new Date(vista.autorizacion.aceptadaEn).toLocaleString("es-CO")}
              {vista.autorizacion.ip ? ` · ${vista.autorizacion.ip}` : ""}
            </p>
          </Tarjeta>
        </section>
      )}

      <p className="mt-8 text-[0.85rem] leading-relaxed text-hueso/45">
        Todos los movimientos te llegan a {vista.ciclista.correo}.{" "}
        <Link href="/correos" className="text-lima underline underline-offset-4">
          Ver los correos enviados
        </Link>
        .
      </p>
    </div>
  );
}
