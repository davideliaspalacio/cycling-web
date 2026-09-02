"use client";

import { useState } from "react";
import { Boton, Chip, Tarjeta } from "@/components/ui";
import type { CuentaRecaudo } from "@/lib/catalogo";
import { DIAS_ENTRE_CUOTAS, MAX_CUOTAS, PRENDAS, recorridoDe } from "@/lib/catalogo";
import { fechaLarga, pesos } from "@/lib/dinero";
import type { Categoria, DatosCiclista, Tallas } from "@/lib/tipos";
import { CajaEvidencia, type AbonoRegistrado } from "./caja-evidencia";
import { CuentasRecaudo } from "./cuentas-recaudo";
import {
  OpcionesDePlan,
  TablaDelPlan,
  type PlanOfrecido,
} from "./planes-de-pago";

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

export function PasoPago({
  referencia,
  categoria,
  ciclista,
  tallas,
  cuentas,
  fechaLimite,
  planes,
  onCompletado,
}: {
  referencia: string;
  categoria: Categoria;
  ciclista: DatosCiclista;
  tallas: Tallas;
  cuentas: CuentaRecaudo[];
  /** Último día para subir un comprobante (ISO, YYYY-MM-DD). */
  fechaLimite: string;
  /**
   * Los planes que todavía caben antes del cierre, con todos sus montos y
   * todas sus fechas, calculados en el servidor. Los que no caben no llegan:
   * la segunda o la tercera cuota se acotarían contra esa fecha y quedarían
   * pegadas a la anterior, así que en vez de ofrecerlos y fallar al subir el
   * comprobante, se explica abajo por qué no están.
   */
  planes: PlanOfrecido[];
  onCompletado: () => void;
}) {
  // El plan de una cuota —el pago total— siempre está y es el que arranca
  // elegido: es el que no compromete a nada.
  const [cuotas, setCuotas] = useState(1);
  const [exito, setExito] = useState<AbonoRegistrado | null>(null);

  const elegido =
    planes.find((p) => p.cuotas === cuotas) ?? planes[0] ?? null;
  const plan = elegido?.cuotasDelPlan ?? [];
  const enCuotas = plan.length > 1;
  const ultima = plan[plan.length - 1];
  // Lo que el ciclista tiene que transferir ahora mismo. No es una sugerencia:
  // el servidor rechaza un comprobante por debajo de esta cifra.
  const aTransferir = enCuotas ? plan[0].monto : categoria.precio;
  // Cuántas cuotas admitiría el calendario si no hubiera cierre. Sirve para
  // decir qué falta y por qué.
  const faltanPlanes = planes.length < MAX_CUOTAS;

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

        {exito.montoDeclarado < categoria.precio && plan.length > 1 && (
          <p className="mt-6 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.9rem] font-semibold leading-snug text-tinta">
            {plan.length === 2 ? (
              <>
                Te queda la segunda y última cuota:{" "}
                {pesos(categoria.precio - exito.montoDeclarado)}, con plazo
                hasta el {fechaLarga(ultima.vence)}.
              </>
            ) : (
              <>
                Te quedan {plan.length - 1} cuotas por{" "}
                {pesos(categoria.precio - exito.montoDeclarado)} en total: la
                siguiente el {fechaLarga(plan[1].vence)} y la última el{" "}
                {fechaLarga(ultima.vence)}.
              </>
            )}{" "}
            Te lo recordamos por correo antes de cada fecha.
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

        <OpcionesDePlan
          opciones={planes}
          elegido={cuotas}
          onElegir={setCuotas}
          total={categoria.precio}
        />

        {/*
          Todas las fechas y todos los montos, antes de decidir. Es la
          información que convierte "en cuotas" en un compromiso concreto en
          vez de una promesa vaga.
        */}
        {enCuotas && (
          <div className="mt-3 animate-rise">
            <TablaDelPlan plan={plan} titulo="Tu plan de pago" />
            <p className="mt-3 text-[0.84rem] leading-snug text-tinta/75">
              Los montos son fijos y cada cuota se sube con su propio
              comprobante. Si el {fechaLarga(ultima.vence)} pasa con saldo, la
              inscripción queda vencida.
            </p>
          </div>
        )}

        {faltanPlanes && (
          <p className="mt-3 rounded-2xl border-[3px] border-tinta bg-marea px-4 py-3 text-[0.86rem] leading-snug text-tinta">
            <strong>
              {planes.length === 1
                ? "Los planes de cuotas ya no están disponibles."
                : `El plan de ${MAX_CUOTAS} cuotas ya no está disponible.`}
            </strong>{" "}
            Cada cuota va {DIAS_ENTRE_CUOTAS} días después de la anterior y la
            última tiene que estar pagada y verificada antes del{" "}
            {fechaLarga(fechaLimite)}. A estas alturas ya no cabe
            {planes.length === 1
              ? ": esta inscripción se paga de una."
              : `: solo quedan los planes de ${planes
                  .map((p) => p.cuotas)
                  .join(" y ")} cuotas.`}
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
            {enCuotas
              ? `${pesos(aTransferir)} · cuota 1 de ${plan.length}`
              : pesos(aTransferir)}
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
              ? `La primera de tus ${plan.length} cuotas son ${pesos(aTransferir)} exactos.`
              : `El pago total son ${pesos(aTransferir)} exactos.`
          }
          onRegistrado={setExito}
        />
      </Tarjeta>
    </div>
  );
}
