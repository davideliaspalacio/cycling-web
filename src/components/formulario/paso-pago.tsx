"use client";

import { useState } from "react";
import { Boton, Chip, Tarjeta } from "@/components/ui";
import { calendarioDeCuotas, fechaLarga, pesos } from "@/lib/dinero";
import { textoDeAutorizacion } from "@/lib/autorizacion";
import type { Categoria, DatosCiclista, PlanPago, Tallas } from "@/lib/tipos";
import { abrirCobro } from "./wompi-widget";
import { BotonTokenizarWompi } from "./boton-tokenizar";
import { Procesando } from "./procesando";

export function PasoPago({
  referencia,
  categoria,
  ciclista,
  tallas,
  modoWompi,
  onCompletado,
}: {
  referencia: string;
  categoria: Categoria;
  ciclista: DatosCiclista;
  tallas: Tallas;
  /** "simulacion" mientras no haya llaves; con llaves, abre el modal real. */
  modoWompi: "simulacion" | "sandbox" | "produccion";
  onCompletado: () => void;
}) {
  const [plan, setPlan] = useState<PlanPago>("CONTADO");
  const [autorizado, setAutorizado] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{
    plan: PlanPago;
    pagado: number;
    saldo: number;
  } | null>(null);

  const simulado = modoWompi === "simulacion";
  const cuotas = calendarioDeCuotas(categoria.precio, referencia);
  const primerCobro = plan === "CUOTAS" ? cuotas[0].monto : categoria.precio;

  function aplicarRespuesta(datos: {
    aprobado: boolean;
    mensaje?: string;
    plan?: PlanPago;
    pagado: number;
    saldo: number;
  }) {
    if (!datos.aprobado) {
      setError(
        `${datos.mensaje ?? "El banco rechazó el pago."} Tu inscripción ${referencia} queda guardada; puedes intentar con otro medio.`,
      );
      return;
    }
    setExito({
      plan: datos.plan ?? plan,
      pagado: datos.pagado,
      saldo: datos.saldo,
    });
  }

  /* ------------------------- Camino real: el modal ------------------------- */

  async function pagarConWompi() {
    setError(null);
    setCobrando(true);
    try {
      const preparar = await fetch("/api/pagos/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencia, plan }),
      });
      const config = await preparar.json();
      if (!preparar.ok) {
        setError(config.error ?? "No pudimos preparar el pago.");
        return;
      }

      if (plan === "CONTADO") {
        const transaccion = await abrirCobro(config.widget, {
          urlRespaldo: config.urlCheckout,
        });
        if (!transaccion) {
          setError("Cerraste el checkout antes de terminar. Puedes reintentar.");
          return;
        }
        const res = await fetch("/api/pagos/confirmar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referencia, transaccionId: transaccion.id }),
        });
        const datos = await res.json();
        if (!res.ok) {
          setError(datos.error ?? "No pudimos confirmar el pago.");
          return;
        }
        aplicarRespuesta({ ...datos, plan: "CONTADO" });
        return;
      }

      // Las cuotas van por el formulario de tokenización de Wompi.
      return;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Se cayó la conexión con la pasarela.",
      );
    } finally {
      setCobrando(false);
    }
  }

  /* -------------------------------- Éxito --------------------------------- */

  if (exito) {
    return (
      <Tarjeta tono="lima" className="animate-rise p-7 sm:p-9">
        <Chip tono="hueso">Pago aprobado</Chip>
        <h1 className="mt-4 font-display text-[clamp(1.8rem,5vw,2.7rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-tinta">
          {exito.plan === "CONTADO"
            ? "Estás dentro."
            : "Cupo reservado. Vas 1 de 4."}
        </h1>
        <p className="mt-3 max-w-lg text-[0.98rem] leading-relaxed text-tinta/75">
          {exito.plan === "CONTADO" ? (
            <>
              Cobramos {pesos(exito.pagado)} y tu cupo en {categoria.nombre} quedó
              confirmado. Te acabamos de enviar el comprobante a{" "}
              <strong>{ciclista.correo}</strong>.
            </>
          ) : (
            <>
              Cobramos la primera cuota de {pesos(exito.pagado)}. Te faltan{" "}
              {pesos(exito.saldo)} en tres cobros automáticos, y te avisamos por
              correo tres días antes de cada uno.
            </>
          )}
        </p>

        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border-[3px] border-tinta bg-hueso px-4 py-3">
          <span className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-tinta/55">
            Referencia
          </span>
          <span className="raya-mono text-lg font-bold text-tinta">
            {referencia}
          </span>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href={`/ticket/${referencia}`}
            className="pulsable inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-tinta bg-selva px-8 py-4 font-display text-lg font-extrabold tracking-tight text-hueso shadow-[4px_4px_0_0_var(--color-tinta)]"
          >
            Ver mi ticket →
          </a>
          <Boton tono="hueso" tamano="lg" onClick={onCompletado}>
            Mi plan de pagos
          </Boton>
        </div>
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Procesando
        visible={cobrando}
        titulo="Confirmando tu pago"
        detalle="Le estamos preguntando a Wompi cómo quedó la transacción. Puede tardar unos segundos."
      />

      {/* ------------------------------ Resumen ------------------------------ */}
      <Tarjeta tono="selva" className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-lima">
              Resumen
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-hueso">
              {categoria.nombre}
            </h1>
            <p className="mt-1 text-[0.88rem] text-hueso/60">
              {ciclista.nombres} {ciclista.apellidos} · CC{" "}
              {ciclista.identificacion}
            </p>
          </div>
          <span className="raya-mono rounded-xl border-[3px] border-tinta bg-noche px-3 py-2 text-sm font-bold text-lima">
            {referencia}
          </span>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-2 border-t-2 border-dashed border-hueso/15 pt-4 text-[0.85rem] sm:grid-cols-2">
          {[
            [
              "Recorrido",
              `${categoria.km} km · ${categoria.desnivel.toLocaleString("es-CO")} m D+`,
            ],
            ["Ciudad", `${ciclista.ciudad}, ${ciclista.departamento}`],
            ["Jersey / camiseta", `${tallas.jersey} / ${tallas.running}`],
            ["Correo", ciclista.correo],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 sm:block">
              <dt className="text-hueso/45">{k}</dt>
              <dd className="font-medium text-hueso/85 sm:mt-0.5">{v}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>

      {/* -------------------------------- Plan ------------------------------- */}
      <fieldset className="border-0 p-0">
        <legend className="mb-3 font-display text-lg font-extrabold tracking-tight text-hueso">
          ¿Cómo quieres pagar?
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <OpcionPlan
            activa={plan === "CONTADO"}
            onElegir={() => setPlan("CONTADO")}
            titulo="Todo de una"
            monto={pesos(categoria.precio)}
            detalle="Tarjeta, PSE, Nequi o corresponsal. El cupo queda confirmado de inmediato."
            tono="lima"
          />
          <OpcionPlan
            activa={plan === "CUOTAS"}
            onElegir={() => setPlan("CUOTAS")}
            titulo="4 cuotas mensuales"
            monto={`${pesos(cuotas[0].monto)}/mes`}
            detalle={`Hoy pagas ${pesos(cuotas[0].monto)}. Las otras tres se cobran solas. Sin recargo.`}
            tono="naranja"
          />
        </div>

        {plan === "CUOTAS" && (
          <Tarjeta tono="hueso" className="mt-4 animate-rise p-5">
            <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-tinta/55">
              Calendario de cobro
            </p>
            <ol className="mt-3 flex flex-col gap-2">
              {cuotas.map((c) => (
                <li
                  key={c.numero}
                  className="flex items-center gap-3 border-b-2 border-dashed border-tinta/15 pb-2 last:border-0 last:pb-0"
                >
                  <span className="raya-mono grid h-7 w-7 shrink-0 place-items-center rounded-full border-[2.5px] border-tinta bg-lima text-[0.7rem] font-bold text-tinta">
                    {c.numero}
                  </span>
                  <span className="text-[0.88rem] text-tinta/75">
                    {c.numero === 1 ? "Hoy" : fechaLarga(c.vence)}
                  </span>
                  <span className="raya-mono ml-auto text-[0.92rem] font-bold text-tinta">
                    {pesos(c.monto)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[0.8rem] leading-snug text-tinta/55">
              La tarjeta la guarda Wompi, nunca nuestros servidores. Puedes
              adelantar cuotas o cambiar de tarjeta cuando quieras.
            </p>

            {/* Autorización de cobro recurrente. Sin esta constancia, un
                contracargo por "yo no autoricé eso" lo pierde el comercio. */}
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border-[3px] border-tinta bg-white px-4 py-3.5 shadow-[3px_3px_0_0_var(--color-tinta)]">
              <input
                type="checkbox"
                checked={autorizado}
                onChange={(e) => setAutorizado(e.target.checked)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-[3px] border-tinta ${
                  autorizado ? "bg-tinta" : "bg-white"
                }`}
              >
                {autorizado && (
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-lima">
                    <path d="M7.6 14.6 3.4 10.4l1.6-1.6 2.6 2.6 6.8-6.8 1.6 1.6z" />
                  </svg>
                )}
              </span>
              <span className="text-[0.86rem] leading-snug text-tinta">
                {textoDeAutorizacion(cuotas)}
              </span>
            </label>

            {/* El botón está siempre visible: esconderlo hasta marcar la
                casilla hacía creer que no había forma de pagar. Se muestra
                apagado y sin clic hasta que se autorice. */}
            <div className="mt-4">
              <p className="text-[0.85rem] leading-snug text-tinta/70">
                Wompi te va a pedir la tarjeta y la guarda de su lado. Al
                terminar cobramos {pesos(cuotas[0].monto)} y programamos las
                otras tres.
              </p>

              <div
                className={
                  autorizado
                    ? ""
                    : "pointer-events-none select-none opacity-40 grayscale"
                }
                aria-disabled={!autorizado}
              >
                <BotonTokenizarWompi
                  publicKey={process.env.NEXT_PUBLIC_WOMPI_LLAVE_PUBLICA ?? ""}
                  referencia={referencia}
                />
              </div>

              {!autorizado && (
                <p className="mt-2 text-[0.82rem] font-semibold text-[#b45309]">
                  ↑ Marca la autorización de arriba para habilitar el botón.
                </p>
              )}
            </div>
          </Tarjeta>
        )}
      </fieldset>

      {/* ------------------------------- Cobro ------------------------------- */}
      {plan === "CONTADO" && (
      <Tarjeta tono="hueso" className="p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-tinta">
            Paga con Wompi
          </h2>
          <span className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.12em] text-tinta/45">
            Bancolombia
          </span>
        </div>
        <p className="mt-3 text-[0.92rem] leading-relaxed text-tinta/70">
          Se abre el checkout de Wompi y ahí eliges cómo pagar: tarjeta, PSE,
          Nequi, botón Bancolombia o corresponsal bancario. Tus datos de pago no
          pasan por nosotros.
        </p>

        {simulado && (
          <p className="mt-4 rounded-2xl border-[3px] border-tinta bg-naranja px-4 py-3 text-[0.86rem] font-semibold leading-snug text-tinta">
            Faltan las llaves de Wompi, así que el checkout no puede abrirse.
            Pon <span className="raya-mono">WOMPI_MODO=sandbox</span> con sus
            llaves en el <span className="raya-mono">.env.local</span>.
          </p>
        )}
      </Tarjeta>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border-[3px] border-tinta bg-magenta px-4 py-3 font-display text-sm font-bold leading-snug text-tinta"
        >
          {error}
        </p>
      )}

      {plan === "CONTADO" && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[0.82rem] leading-snug text-hueso/50">
            Se cobra ahora{" "}
            <strong className="text-hueso">{pesos(primerCobro)}</strong>.
          </p>
          <Boton
            tamano="lg"
            onClick={pagarConWompi}
            disabled={cobrando || simulado}
          >
            {cobrando ? "Procesando…" : `Pagar ${pesos(primerCobro)} con Wompi`}
          </Boton>
        </div>
      )}
    </div>
  );
}

function OpcionPlan({
  activa,
  onElegir,
  titulo,
  monto,
  detalle,
  tono,
}: {
  activa: boolean;
  onElegir: () => void;
  titulo: string;
  monto: string;
  detalle: string;
  tono: "lima" | "naranja";
}) {
  return (
    <label
      className={`pulsable flex cursor-pointer flex-col gap-2 rounded-2xl border-[3px] border-tinta p-5 shadow-[5px_5px_0_0_var(--color-tinta)] transition-colors ${
        activa ? (tono === "lima" ? "bg-lima" : "bg-naranja") : "bg-hueso"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <input
          type="radio"
          name="plan"
          checked={activa}
          onChange={onElegir}
          className="sr-only"
        />
        <span
          aria-hidden
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-[3px] border-tinta ${activa ? "bg-tinta" : "bg-white"}`}
        >
          {activa && <span className="h-1.5 w-1.5 rounded-full bg-lima" />}
        </span>
        <span className="font-display text-base font-extrabold text-tinta">
          {titulo}
        </span>
      </span>
      <span className="font-display text-2xl font-extrabold leading-none tracking-tight text-tinta">
        {monto}
      </span>
      <span className="text-[0.84rem] leading-snug text-tinta/65">{detalle}</span>
    </label>
  );
}
