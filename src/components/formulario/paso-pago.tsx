"use client";

import { useState } from "react";
import { Boton, Campo, Chip, Tarjeta } from "@/components/ui";
import { calendarioDeCuotas, fechaLarga, pesos } from "@/lib/dinero";
import type { Categoria, DatosCiclista, PlanPago, Tallas } from "@/lib/tipos";

const TARJETAS_PRUEBA = [
  { numero: "4242 4242 4242 4242", que: "aprueba" },
  { numero: "4111 1111 1111 1111", que: "rechaza" },
];

export function PasoPago({
  referencia,
  categoria,
  ciclista,
  tallas,
  onCompletado,
}: {
  referencia: string;
  categoria: Categoria;
  ciclista: DatosCiclista;
  tallas: Tallas;
  onCompletado: () => void;
}) {
  const [plan, setPlan] = useState<PlanPago>("CONTADO");
  const [tarjeta, setTarjeta] = useState({
    numero: "",
    titular: "",
    mesExp: "",
    anioExp: "",
    cvc: "",
  });
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<{
    plan: PlanPago;
    pagado: number;
    saldo: number;
  } | null>(null);

  const cuotas = calendarioDeCuotas(categoria.precio, referencia);
  const primerCobro = plan === "CUOTAS" ? cuotas[0].monto : categoria.precio;

  async function pagar() {
    setError(null);
    setCobrando(true);
    try {
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencia, plan, tarjeta }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? "No pudimos procesar el pago.");
        return;
      }
      if (!datos.aprobado) {
        setError(
          `${datos.mensaje ?? "El banco rechazó el cobro."} Prueba con otra tarjeta — tu inscripción ${referencia} queda guardada.`,
        );
        return;
      }
      setExito({ plan: datos.plan, pagado: datos.pagado, saldo: datos.saldo });
    } catch {
      setError("Se cayó la conexión antes de confirmar. Revisa tu correo antes de reintentar.");
    } finally {
      setCobrando(false);
    }
  }

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
          <span className="raya-mono text-lg font-bold text-tinta">{referencia}</span>
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
              {ciclista.nombres} {ciclista.apellidos} · CC {ciclista.identificacion}
            </p>
          </div>
          <span className="raya-mono rounded-xl border-[3px] border-tinta bg-noche px-3 py-2 text-sm font-bold text-lima">
            {referencia}
          </span>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-2 border-t-2 border-dashed border-hueso/15 pt-4 text-[0.85rem] sm:grid-cols-2">
          {[
            ["Recorrido", `${categoria.km} km · ${categoria.desnivel.toLocaleString("es-CO")} m D+`],
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
            detalle="Un solo cobro hoy. El cupo queda confirmado de inmediato."
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
              Guardamos tu tarjeta con Wompi, no en nuestros servidores. Puedes
              adelantar cuotas o cambiar de tarjeta cuando quieras.
            </p>
          </Tarjeta>
        )}
      </fieldset>

      {/* ------------------------------ Tarjeta ------------------------------ */}
      <Tarjeta tono="hueso" className="p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-tinta">
            Datos de la tarjeta
          </h2>
          <span className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.12em] text-tinta/45">
            Wompi · Bancolombia
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo id="numero" etiqueta="Número" obligatorio>
              <input
                id="numero"
                className="campo raya-mono"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                value={tarjeta.numero}
                onChange={(e) =>
                  setTarjeta({
                    ...tarjeta,
                    numero: e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 19)
                      .replace(/(.{4})/g, "$1 ")
                      .trim(),
                  })
                }
              />
            </Campo>
          </div>

          <div className="sm:col-span-2">
            <Campo id="titular" etiqueta="Titular" obligatorio>
              <input
                id="titular"
                className="campo"
                autoComplete="cc-name"
                placeholder="Como aparece en la tarjeta"
                value={tarjeta.titular}
                onChange={(e) => setTarjeta({ ...tarjeta, titular: e.target.value })}
              />
            </Campo>
          </div>

          <Campo id="mesExp" etiqueta="Vence" obligatorio ayuda="Mes y año, MM / AA.">
            <div className="flex gap-2">
              <input
                id="mesExp"
                className="campo raya-mono"
                inputMode="numeric"
                placeholder="MM"
                maxLength={2}
                autoComplete="cc-exp-month"
                value={tarjeta.mesExp}
                onChange={(e) =>
                  setTarjeta({ ...tarjeta, mesExp: e.target.value.replace(/\D/g, "") })
                }
              />
              <input
                aria-label="Año de vencimiento"
                className="campo raya-mono"
                inputMode="numeric"
                placeholder="AA"
                maxLength={2}
                autoComplete="cc-exp-year"
                value={tarjeta.anioExp}
                onChange={(e) =>
                  setTarjeta({ ...tarjeta, anioExp: e.target.value.replace(/\D/g, "") })
                }
              />
            </div>
          </Campo>

          <Campo id="cvc" etiqueta="Código de seguridad" obligatorio ayuda="Los 3 dígitos del reverso.">
            <input
              id="cvc"
              className="campo raya-mono"
              inputMode="numeric"
              maxLength={4}
              autoComplete="cc-csc"
              placeholder="123"
              value={tarjeta.cvc}
              onChange={(e) =>
                setTarjeta({ ...tarjeta, cvc: e.target.value.replace(/\D/g, "") })
              }
            />
          </Campo>
        </div>

        <div className="mt-5 rounded-2xl border-[2.5px] border-dashed border-tinta/25 p-4">
          <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-tinta/45">
            Tarjetas de prueba
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TARJETAS_PRUEBA.map((t) => (
              <button
                key={t.numero}
                type="button"
                onClick={() =>
                  setTarjeta({
                    numero: t.numero,
                    titular: `${ciclista.nombres} ${ciclista.apellidos}`.trim() || "CICLISTA PRUEBA",
                    mesExp: "12",
                    anioExp: "29",
                    cvc: "123",
                  })
                }
                className="raya-mono rounded-lg border-[2.5px] border-tinta bg-white px-3 py-1.5 text-[0.72rem] font-bold text-tinta transition-colors hover:bg-lima"
              >
                {t.numero} · {t.que}
              </button>
            ))}
          </div>
        </div>
      </Tarjeta>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border-[3px] border-tinta bg-magenta px-4 py-3 font-display text-sm font-bold leading-snug text-tinta"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[0.82rem] leading-snug text-hueso/50">
          Se cobra ahora <strong className="text-hueso">{pesos(primerCobro)}</strong>
          {plan === "CUOTAS" && " (cuota 1 de 4)"}.
        </p>
        <Boton tamano="lg" onClick={pagar} disabled={cobrando}>
          {cobrando ? "Cobrando…" : `Pagar ${pesos(primerCobro)}`}
        </Boton>
      </div>
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
