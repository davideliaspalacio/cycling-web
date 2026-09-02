"use client";

import { useState } from "react";
import { Boton, Chip, Tarjeta } from "@/components/ui";
import type { CuentaRecaudo } from "@/lib/catalogo";
import { MAX_ABONOS, PRENDAS, recorridoDe } from "@/lib/catalogo";
import type { CuotaDelPlan } from "@/lib/dinero";
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
 * Los dos únicos caminos: todo de una, o las dos cuotas del plan. Lo que queda
 * guardado lo decide el servidor según el monto que realmente entre, pero aquí
 * ya no es una guía: los montos son fijos y el servidor rechaza un comprobante
 * por debajo de la cuota.
 */
type Modo = "TOTAL" | "CUOTAS";

export function PasoPago({
  referencia,
  categoria,
  ciclista,
  tallas,
  cuentas,
  fechaLimite,
  plan,
  dosCuotas,
  onCompletado,
}: {
  referencia: string;
  categoria: Categoria;
  ciclista: DatosCiclista;
  tallas: Tallas;
  cuentas: CuentaRecaudo[];
  /** Último día para subir un comprobante (ISO, YYYY-MM-DD). */
  fechaLimite: string;
  /** Las dos cuotas con sus dos fechas, calculadas en el servidor. */
  plan: CuotaDelPlan[];
  /**
   * Si al día de hoy todavía cabe el plan de dos cuotas. Cuando falta poco
   * para el cierre no se ofrece: la segunda cuota se acota contra esa fecha y
   * quedaría pegada a la primera.
   */
  dosCuotas: boolean;
  onCompletado: () => void;
}) {
  const [modo, setModo] = useState<Modo>("TOTAL");
  const [exito, setExito] = useState<AbonoRegistrado | null>(null);

  const segunda = plan[plan.length - 1];
  const enCuotas = dosCuotas && modo === "CUOTAS";
  // Lo que el ciclista tiene que transferir ahora mismo. No es una sugerencia:
  // el servidor rechaza un comprobante por debajo de esta cifra.
  const aTransferir = enCuotas ? plan[0].monto : categoria.precio;

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

        {exito.montoDeclarado < categoria.precio && (
          <p className="mt-6 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.9rem] font-semibold leading-snug text-tinta">
            Te queda la segunda y última cuota:{" "}
            {pesos(categoria.precio - exito.montoDeclarado)}, con plazo hasta el{" "}
            {fechaLarga(segunda.vence)}. Te lo recordamos por correo antes de
            esa fecha.
          </p>
        )}

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
          {dosCuotas && (
            <OpcionPlan
              activa={modo === "CUOTAS"}
              onElegir={() => setModo("CUOTAS")}
              titulo={`${MAX_ABONOS} cuotas de ${pesos(plan[0].monto)}`}
              monto={`${pesos(plan[0].monto)} hoy`}
              detalle={`La segunda, otros ${pesos(segunda.monto)}, vence el ${fechaLarga(segunda.vence)}. Sin recargo: suman ${pesos(categoria.precio)} exactos.`}
              tono="sol"
            />
          )}
        </div>

        {/*
          Las dos fechas y los dos montos, antes de decidir. Es la información
          que convierte "dos cuotas" en un compromiso concreto en vez de una
          promesa vaga.
        */}
        {enCuotas && (
          <div className="mt-3 animate-rise rounded-2xl border-[3px] border-tinta bg-nube px-4 py-4">
            <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
              Tu plan de pago
            </p>
            <ol className="mt-3 flex flex-col gap-2">
              {plan.map((cuota) => (
                <li
                  key={cuota.numero}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-dashed border-tinta/15 pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-display text-[0.95rem] font-extrabold text-tinta">
                    Cuota {cuota.numero} de {MAX_ABONOS}
                  </span>
                  <span className="text-[0.86rem] text-tinta/75">
                    {cuota.numero === 1
                      ? "Hoy, para reservar el cupo"
                      : `Vence el ${fechaLarga(cuota.vence)}`}
                  </span>
                  <span className="raya-mono ml-auto text-[1rem] font-bold text-tinta">
                    {pesos(cuota.monto)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[0.84rem] leading-snug text-tinta/75">
              Los montos son fijos y cada cuota se sube con su propio
              comprobante. Si el {fechaLarga(segunda.vence)} pasa con saldo, la
              inscripción queda vencida.
            </p>
          </div>
        )}

        {!dosCuotas && (
          <p className="mt-3 rounded-2xl border-[3px] border-tinta bg-marea px-4 py-3 text-[0.86rem] leading-snug text-tinta">
            <strong>El plan de dos cuotas ya no está disponible.</strong> La
            segunda cuota tendría que estar pagada y verificada antes del{" "}
            {fechaLarga(fechaLimite)}, y a estas alturas no queda plazo para
            repartir el pago. Esta inscripción se paga de una.
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
            {enCuotas ? `${pesos(aTransferir)} · cuota 1` : pesos(aTransferir)}
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
          montoSugerido={aTransferir}
          notaMonto={
            enCuotas
              ? `La primera cuota son ${pesos(aTransferir)} exactos.`
              : `El pago total son ${pesos(aTransferir)} exactos.`
          }
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
