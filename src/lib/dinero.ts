import { CUOTAS_DEL_PLAN, DIA_DE_COBRO } from "./catalogo";
import type { Cuota } from "./tipos";

const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function pesos(valor: number): string {
  return formatoCOP.format(valor).replace(/ /g, " ");
}

/** Wompi trabaja siempre en centavos. */
export function aCentavos(valorEnPesos: number): number {
  return Math.round(valorEnPesos * 100);
}

/**
 * Reparte un total en N cuotas redondeadas al millar más cercano,
 * garantizando que la suma sea exactamente el total.
 * 750.000 en 4 → 188.000 · 188.000 · 187.000 · 187.000
 */
export function repartirEnCuotas(total: number, n = CUOTAS_DEL_PLAN): number[] {
  const base = Math.floor(total / n / 1000) * 1000;
  const montos = Array<number>(n).fill(base);
  let resto = total - base * n;
  let i = 0;
  while (resto > 0) {
    const paso = Math.min(1000, resto);
    montos[i % n] += paso;
    resto -= paso;
    i += 1;
  }
  return montos;
}

function isoFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Calendario de cobro: la primera cuota se paga hoy (al inscribirse) y las
 * siguientes el día 5 de cada mes.
 */
export function calendarioDeCuotas(
  total: number,
  referenciaBase: string,
  desde = new Date(),
): Cuota[] {
  const montos = repartirEnCuotas(total);
  return montos.map((monto, idx) => {
    let vence: Date;
    if (idx === 0) {
      vence = new Date(desde);
    } else {
      vence = new Date(
        Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + idx, DIA_DE_COBRO),
      );
      // Si el día 5 del mes siguiente ya pasó respecto a hoy, empuja un mes.
      if (vence.getTime() <= desde.getTime()) {
        vence = new Date(
          Date.UTC(
            desde.getUTCFullYear(),
            desde.getUTCMonth() + idx + 1,
            DIA_DE_COBRO,
          ),
        );
      }
    }
    return {
      numero: idx + 1,
      vence: isoFecha(vence),
      monto,
      estado: "PENDIENTE",
      referencia: `${referenciaBase}-C${idx + 1}`,
      intentos: 0,
    } satisfies Cuota;
  });
}

export function saldoPendiente(cuotas: Cuota[]): number {
  return cuotas
    .filter((c) => c.estado !== "PAGADA")
    .reduce((s, c) => s + c.monto, 0);
}

export function totalPagado(cuotas: Cuota[]): number {
  return cuotas
    .filter((c) => c.estado === "PAGADA")
    .reduce((s, c) => s + c.monto, 0);
}

export function proximaCuota(cuotas: Cuota[]): Cuota | undefined {
  return cuotas
    .filter((c) => c.estado !== "PAGADA")
    .sort((a, b) => a.vence.localeCompare(b.vence))[0];
}

export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function diasHasta(iso: string, hoy = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const objetivo = Date.UTC(y, m - 1, d);
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.round((objetivo - base) / 86_400_000);
}
