"use client";

import type { CuotaDelPlan } from "@/lib/dinero";
import { fechaLarga, pesos } from "@/lib/dinero";

/**
 * Cómo se elige y cómo se enseña un plan de cuotas.
 *
 * Vive aparte porque son las mismas dos piezas en dos sitios: el paso de pago
 * del formulario (donde el ciclista elige) y su página de inscripción (donde
 * vuelve si dejó el pago a medias). Duplicarlas era garantizar que un día
 * dijeran cosas distintas sobre el mismo dinero.
 *
 * La regla que gobierna las dos: **todos los montos y todas las fechas, antes
 * de decidir**. Un plan de cuotas es un compromiso con vencimientos; enseñar
 * solo el primer pago es esconder justo lo que puede costarle el cupo.
 */

export type PlanOfrecido = {
  /** Número de cuotas del plan. 1 es el pago total de siempre. */
  cuotas: number;
  /** Los montos con sus fechas, resueltos en el servidor. */
  cuotasDelPlan: CuotaDelPlan[];
};

/**
 * La etapa de inscripción, recortada a lo que necesita el navegador.
 *
 * Viaja por props desde un componente de servidor y no se importa del
 * catálogo: la etapa que manda es la de **esta** inscripción, y el cliente no
 * tiene por qué saber cuántas etapas hay ni cuál está abierta.
 */
export type EtapaVisible = {
  nombre: string;
  /** Precio de lista, antes de descuento. */
  precio: number;
  /** Porcentaje de descuento por código de referido. 0 = no hay. */
  descuento: number;
  /** El plan más largo de esta etapa: 3 en la primera, 4 en la segunda. */
  maxCuotas: number;
};

/** El color de cada plan. Fijo por número de cuotas, para que no baile. */
const TONO: Record<number, "turquesa" | "sol" | "marea" | "nube"> = {
  1: "turquesa",
  2: "sol",
  3: "marea",
  // La etapa 2 estrenó el cuarto plan y hacía falta un tono más. `nube` y no
  // un color nuevo: las clases de color del proyecto están fijadas.
  4: "nube",
};

function tituloDePlan(cuotas: number, primera: number): string {
  if (cuotas === 1) return "Pago total";
  return `${cuotas} cuotas de ${pesos(primera)}`;
}

/* ------------------------------ El selector ------------------------------- */

export function OpcionesDePlan({
  opciones,
  elegido,
  onElegir,
  total,
}: {
  opciones: PlanOfrecido[];
  /** Número de cuotas del plan activo. */
  elegido: number;
  onElegir: (cuotas: number) => void;
  total: number;
}) {
  return (
    <div
      className={`grid gap-4 sm:grid-cols-2 ${
        opciones.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
      }`}
    >
      {opciones.map(({ cuotas, cuotasDelPlan }) => {
        const primera = cuotasDelPlan[0];
        const ultima = cuotasDelPlan[cuotasDelPlan.length - 1];
        return (
          <OpcionPlan
            key={cuotas}
            activa={elegido === cuotas}
            onElegir={() => onElegir(cuotas)}
            titulo={tituloDePlan(cuotas, primera.monto)}
            monto={cuotas === 1 ? pesos(total) : `${pesos(primera.monto)} hoy`}
            detalle={
              cuotas === 1
                ? "Una sola transferencia y queda listo. El cupo se confirma cuando verifiquemos el comprobante."
                : `La última, de ${pesos(ultima.monto)}, vence el ${fechaLarga(ultima.vence)}. Sin recargo: suman ${pesos(total)} exactos.`
            }
            tono={TONO[cuotas] ?? "marea"}
          />
        );
      })}
    </div>
  );
}

/* Sirve tal cual venía del pago con pasarela: varias opciones, una elegida. */
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
  tono: "turquesa" | "sol" | "marea" | "nube";
}) {
  const fondo =
    tono === "turquesa"
      ? "bg-turquesa"
      : tono === "sol"
        ? "bg-sol"
        : tono === "nube"
          ? "bg-nube"
          : "bg-marea";
  return (
    <label
      className={`pulsable flex cursor-pointer flex-col gap-2 rounded-2xl border-[3px] border-tinta p-5 shadow-[5px_5px_0_0_var(--color-tinta)] transition-colors ${
        activa ? fondo : "bg-nube"
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

/* ------------------------------ La tabla ---------------------------------- */

/**
 * Todas las cuotas del plan con su monto y su fecha.
 *
 * `verificado` es opcional y solo lo pasa la página de inscripción: allí una
 * cuota ya puede estar cubierta y decirlo cambia lo que el ciclista tiene que
 * hacer. En el formulario todavía no hay dinero que marcar.
 */
export function TablaDelPlan({
  plan,
  titulo,
  verificado,
  tono = "nube",
}: {
  plan: CuotaDelPlan[];
  titulo: string;
  verificado?: number;
  tono?: "nube" | "marea";
}) {
  return (
    <div
      className={`rounded-2xl border-[3px] border-tinta px-4 py-4 ${tono === "marea" ? "bg-marea" : "bg-nube"}`}
    >
      <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
        {titulo}
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        {plan.map((cuota) => {
          // Una cuota se da por cubierta cuando lo verificado alcanza la suma
          // de esta cuota y las anteriores.
          const acumulado = plan
            .slice(0, cuota.numero)
            .reduce((s, c) => s + c.monto, 0);
          const cubierta = verificado !== undefined && verificado >= acumulado;
          return (
            <li
              key={cuota.numero}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-dashed border-tinta/15 pb-2 last:border-0 last:pb-0"
            >
              <span className="font-display text-[0.95rem] font-extrabold text-tinta">
                Cuota {cuota.numero} de {plan.length}
              </span>
              <span className="text-[0.86rem] text-tinta/75">
                {cubierta
                  ? "Pagada y verificada"
                  : cuota.numero === 1
                    ? verificado === undefined
                      ? "Hoy, para reservar el cupo"
                      : "Pendiente"
                    : `Vence el ${fechaLarga(cuota.vence)}`}
              </span>
              <span className="raya-mono ml-auto text-[1rem] font-bold text-tinta">
                {pesos(cuota.monto)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
