"use client";

import { useState } from "react";
import { Boton, Chip, Tarjeta } from "@/components/ui";
import type { CuentaRecaudo } from "@/lib/catalogo";
import { MAX_ABONOS, PRENDAS, recorridoDe } from "@/lib/catalogo";
import { fechaLarga, pesos } from "@/lib/dinero";
import type { Categoria, DatosCiclista, Tallas } from "@/lib/tipos";
import { CajaEvidencia, type AbonoRegistrado } from "./caja-evidencia";
import { CuentasRecaudo } from "./cuentas-recaudo";

/**
 * El paso de pago: transferencia manual con comprobante.
 *
 * Aquí no hay pasarela ni confirmación automática. Lo único que hace este paso
 * es decirle al ciclista a dónde transferir y recibirle la prueba de que lo
 * hizo; el dinero solo cuenta cuando una persona de la organización lo verifica
 * contra el extracto (docs/decisiones-pago-manual.md).
 *
 * `cuentas` llega por props desde el componente de servidor a propósito: sale
 * de variables de entorno sin `NEXT_PUBLIC_` y leerla desde el navegador daría
 * el respaldo del repositorio en vez de la cuenta real.
 */

/**
 * TOTAL o ABONOS es una guía para el ciclista, no un compromiso: el plan que
 * queda guardado lo decide el servidor según el monto que realmente entre.
 */
type Modo = "TOTAL" | "ABONOS";

export function PasoPago({
  referencia,
  categoria,
  ciclista,
  tallas,
  cuentas,
  fechaLimite,
  onCompletado,
}: {
  referencia: string;
  categoria: Categoria;
  ciclista: DatosCiclista;
  tallas: Tallas;
  cuentas: CuentaRecaudo[];
  /** Último día para subir un comprobante (ISO, YYYY-MM-DD). */
  fechaLimite: string;
  onCompletado: () => void;
}) {
  const [modo, setModo] = useState<Modo>("TOTAL");
  const [exito, setExito] = useState<AbonoRegistrado | null>(null);

  const recorrido = recorridoDe(categoria);
  const resumen: [string, string][] = [
    ...(recorrido ? ([["Recorrido", recorrido]] as [string, string][]) : []),
    ["Ciudad", `${ciclista.ciudad}, ${ciclista.departamento}`],
    ...PRENDAS.map((p) => [p.nombre, tallas[p.campo]] as [string, string]),
    ["Correo", ciclista.correo],
  ];

  /* -------------------------------- Éxito --------------------------------- */

  if (exito) {
    return (
      <Tarjeta tono="turquesa" className="animate-rise p-7 sm:p-9">
        <Chip tono="nube">Comprobante recibido</Chip>
        <h1 className="mt-4 font-display text-[clamp(1.8rem,5vw,2.7rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-tinta">
          Tu cupo está reservado.
        </h1>
        <p className="mt-3 max-w-lg text-[0.98rem] leading-relaxed text-tinta/75">
          Recibimos tu comprobante por {pesos(exito.montoDeclarado)}. Ahora una
          persona de la organización lo compara con el extracto del banco; en
          cuanto quede verificado te avisamos a{" "}
          <strong>{ciclista.correo}</strong>. Mientras tanto tu saldo sigue
          marcando <strong>{pesos(exito.saldo)}</strong>: un comprobante sin
          revisar todavía no es dinero confirmado.
        </p>

        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border-[3px] border-tinta bg-nube px-4 py-3">
          <span className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
            Referencia
          </span>
          <span className="raya-mono text-lg font-bold text-tinta">
            {referencia}
          </span>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Boton tono="rio" tamano="lg" onClick={onCompletado}>
            Ver mi inscripción →
          </Boton>
          <a
            href={`/ticket/${referencia}`}
            className="pulsable inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-tinta bg-nube px-8 py-4 font-display text-lg font-extrabold tracking-tight text-tinta shadow-[4px_4px_0_0_var(--color-tinta)]"
          >
            Mi constancia
          </a>
        </div>

        <p className="mt-5 text-[0.82rem] leading-relaxed text-tinta/75">
          El dorsal y el ticket de carrera se emiten cuando el saldo llega a
          cero.
        </p>
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------ Resumen ------------------------------ */}
      <Tarjeta tono="marea" className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-rio">
              Resumen
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-tinta">
              {categoria.nombre}
            </h1>
            <p className="mt-1 text-[0.88rem] text-tinta/75">
              {ciclista.nombres} {ciclista.apellidos} · CC{" "}
              {ciclista.identificacion}
            </p>
          </div>
          <span className="raya-mono rounded-xl border-[3px] border-tinta bg-tinta px-3 py-2 text-sm font-bold text-turquesa">
            {referencia}
          </span>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-2 border-t-2 border-dashed border-tinta/15 pt-4 text-[0.85rem] sm:grid-cols-2">
          {resumen.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 sm:block">
              <dt className="text-tinta/75">{k}</dt>
              <dd className="font-medium text-tinta/85 sm:mt-0.5">{v}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>

      {/* -------------------------------- Plan ------------------------------- */}
      <fieldset className="border-0 p-0">
        <legend className="mb-3 font-display text-lg font-extrabold tracking-tight text-tinta">
          ¿Cómo quieres pagar?
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <OpcionPlan
            activa={modo === "TOTAL"}
            onElegir={() => setModo("TOTAL")}
            titulo="Pago total"
            monto={pesos(categoria.precio)}
            detalle="Una sola transferencia y queda listo. El cupo se confirma cuando verifiquemos el comprobante."
            tono="turquesa"
          />
          <OpcionPlan
            activa={modo === "ABONOS"}
            onElegir={() => setModo("ABONOS")}
            titulo={`Hasta ${MAX_ABONOS} abonos`}
            monto="Monto libre"
            detalle={`Abona lo que puedas, cuando puedas, en máximo ${MAX_ABONOS} transferencias. Sin recargo.`}
            tono="sol"
          />
        </div>

        {modo === "ABONOS" && (
          <p className="mt-3 animate-rise rounded-2xl border-[3px] border-tinta bg-nube px-4 py-3 text-[0.86rem] leading-snug text-tinta/75">
            Cada abono se sube con su propio comprobante desde tu página de
            inscripción. El último día para subir comprobantes es el{" "}
            <strong className="text-tinta">{fechaLarga(fechaLimite)}</strong>.
          </p>
        )}
      </fieldset>

      {/* ------------------------------ Cuentas ------------------------------ */}
      <Tarjeta tono="nube" className="p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-tinta">
            1. Transfiere a una de estas cuentas
          </h2>
          <span className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.12em] text-tinta/75">
            {modo === "TOTAL" ? pesos(categoria.precio) : "El monto que decidas"}
          </span>
        </div>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-tinta/75">
          Toca <strong>Copiar</strong> y pega el número en tu app del banco. No
          lo transcribas a mano: un dígito cambiado manda el dinero a otra
          parte.
        </p>

        <CuentasRecaudo
          cuentas={cuentas}
          referencia={referencia}
          className="mt-5"
        />
      </Tarjeta>

      {/* ----------------------------- Comprobante --------------------------- */}
      <Tarjeta tono="nube" className="p-6 sm:p-7">
        <h2 className="font-display text-lg font-extrabold tracking-tight text-tinta">
          2. Sube el comprobante
        </h2>
        <p className="mb-5 mt-2 text-[0.92rem] leading-relaxed text-tinta/75">
          La captura de pantalla, la foto o el PDF que te da el banco. Es la
          única prueba de tu pago: sin ella no podemos confirmarte el cupo.
        </p>

        <CajaEvidencia
          referencia={referencia}
          cuentas={cuentas}
          montoSugerido={modo === "TOTAL" ? categoria.precio : undefined}
          onRegistrado={setExito}
        />
      </Tarjeta>
    </div>
  );
}

/* Sirve tal cual venía del pago con pasarela: dos opciones, una elegida. */
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
  tono: "turquesa" | "sol";
}) {
  return (
    <label
      className={`pulsable flex cursor-pointer flex-col gap-2 rounded-2xl border-[3px] border-tinta p-5 shadow-[5px_5px_0_0_var(--color-tinta)] transition-colors ${
        activa ? (tono === "turquesa" ? "bg-turquesa" : "bg-sol") : "bg-nube"
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
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-[3px] border-tinta ${activa ? "bg-tinta" : "bg-nube"}`}
        >
          {activa && <span className="h-1.5 w-1.5 rounded-full bg-turquesa" />}
        </span>
        <span className="font-display text-base font-extrabold text-tinta">
          {titulo}
        </span>
      </span>
      <span className="font-display text-2xl font-extrabold leading-none tracking-tight text-tinta">
        {monto}
      </span>
      <span className="text-[0.84rem] leading-snug text-tinta/75">{detalle}</span>
    </label>
  );
}
