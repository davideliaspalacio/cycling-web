import {
  CUOTAS_DEL_PLAN,
  DIAS_ENTRE_CUOTAS,
  DIA_DE_COBRO,
  FECHA_LIMITE_ABONOS,
  MARGEN_MINIMO_CUOTAS,
  PLANES_DE_CUOTAS,
} from "./catalogo";
import type { Abono, Cuota, EstadoInscripcion, PlanPago } from "./tipos";

const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function pesos(valor: number): string {
  return formatoCOP.format(valor).replace(/ /g, " ");
}

/**
 * Reparte un total en N cuotas redondeadas al millar más cercano,
 * garantizando que la suma sea exactamente el total.
 *
 * Sobrevive al retiro de la pasarela porque es lo que parte el precio en las
 * cuotas del plan: 380.000 en 2 → 190.000 · 190.000, y en 3 → 127.000 ·
 * 127.000 · 126.000. (Con la pasarela era 380.000 en 4 → 95.000 × 4.)
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

/* --------------------------- Los planes de cuotas -------------------------- */

/**
 * Los montos de un plan de `cuotas` cuotas. 380.000 en 3 → [127.000, 127.000,
 * 126.000].
 *
 * Sale de `repartirEnCuotas` y no de una división a pelo para que un precio que
 * no parta en partes exactas siga sumando el total al peso.
 */
export function montosDelPlan(total: number, cuotas: number): number[] {
  return repartirEnCuotas(total, Math.max(1, cuotas));
}

/** La parte de fecha de un ISO, venga con hora (`creadaEn`) o sin ella. */
function soloFecha(iso: string): string {
  return iso.slice(0, 10);
}

/** Suma días a una fecha ISO en UTC. Sin husos: aquí un día es un día. */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = soloFecha(iso).split("-").map(Number);
  return isoFecha(new Date(Date.UTC(y, m - 1, d + dias)));
}

/**
 * Cuándo vence la cuota `numero` (1 es la primera) de una inscripción creada
 * en `inscritaEl`.
 *
 * Dos reglas y en este orden: 45 días por cada cuota anterior desde la **fecha
 * de inscripción** (no desde que verificamos la cuota previa), y nunca después
 * del cierre de recepción de comprobantes. Sin ese tope, quien se inscriba el
 * 20 de mayo de 2027 tendría la segunda cuota el 4 de julio: un día después de
 * la carrera.
 *
 * La cuota 1 vence el día mismo de la inscripción: se paga en el acto, es lo
 * que reserva el cupo.
 */
export function fechaDeCuota(inscritaEl: string, numero: number): string {
  const natural = sumarDias(inscritaEl, (numero - 1) * DIAS_ENTRE_CUOTAS);
  return natural > FECHA_LIMITE_ABONOS ? FECHA_LIMITE_ABONOS : natural;
}

/**
 * Si a esta fecha todavía cabe un plan de `cuotas` cuotas con sentido.
 *
 * La condición es que la **última** cuota, sin acotar, caiga al menos
 * `MARGEN_MINIMO_CUOTAS` días antes del cierre. Cuando no cabe, el tope contra
 * el cierre aplasta las fechas unas contra otras y el "plazo" deja de serlo;
 * antes que ofrecer un plan que no existe, se ofrecen solo los que caben y la
 * interfaz explica por qué (docs/decisiones-pago-manual.md §1).
 *
 * El pago total —una cuota— siempre cabe: se recibe hasta el cierre.
 */
export function cabePlanDeCuotas(
  cuotas: number,
  hoy: string | Date = new Date(),
): boolean {
  if (cuotas <= 1) return true;
  const desde = typeof hoy === "string" ? soloFecha(hoy) : isoFecha(hoy);
  const necesarios =
    (cuotas - 1) * DIAS_ENTRE_CUOTAS + MARGEN_MINIMO_CUOTAS;
  return (
    diasHasta(FECHA_LIMITE_ABONOS, new Date(`${desde}T00:00:00Z`)) >= necesarios
  );
}

/** Los planes que se le pueden ofrecer a quien se inscribe hoy. Siempre trae el de 1. */
export function planesViables(hoy: string | Date = new Date()): number[] {
  return PLANES_DE_CUOTAS.filter((n) => cabePlanDeCuotas(n, hoy));
}

/** El plan más largo que todavía cabe. Es el que fija el mínimo del primer comprobante. */
export function maxCuotasViables(hoy: string | Date = new Date()): number {
  const viables = planesViables(hoy);
  return viables[viables.length - 1] ?? 1;
}

export type CuotaDelPlan = {
  numero: number;
  monto: number;
  /** ISO (YYYY-MM-DD). */
  vence: string;
};

/**
 * El plan completo tal como se le enseña al ciclista: todos los montos y todas
 * las fechas, desde el minuto uno. La primera vence el día de la inscripción
 * —se paga en el acto—, cada siguiente 45 días después de la anterior, o en el
 * cierre, lo que llegue antes.
 */
export function planDeCuotas(
  total: number,
  inscritaEl: string,
  cuotas: number,
): CuotaDelPlan[] {
  return montosDelPlan(total, cuotas).map((monto, i) => ({
    numero: i + 1,
    monto,
    vence: fechaDeCuota(inscritaEl, i + 1),
  }));
}

/**
 * La primera cuota del plan que el dinero verificado todavía no cubre.
 *
 * Es lo que ancla recordatorios, mora y el monto del próximo comprobante: la
 * fecha que le importa a una inscripción es la de su siguiente cuota
 * pendiente, no la del cierre general ni la de una cuota fija.
 */
export function proximaCuotaDelPlan(
  plan: CuotaDelPlan[],
  verificado: number,
): CuotaDelPlan | undefined {
  let acumulado = 0;
  for (const cuota of plan) {
    acumulado += cuota.monto;
    if (verificado < acumulado) return cuota;
  }
  return undefined;
}

/* ------------------- El plan comprometido de una inscripción --------------- */

/**
 * En cuántas cuotas quedó una inscripción.
 *
 * El número vive en `plan` porque la tabla no tiene una columna para él y
 * porque hay sitios —los correos, la constancia— que solo tienen la
 * inscripción a mano y no sus abonos. `ABONOS` a secas es el valor histórico
 * de cuando el único plan diferido eran dos cuotas, y sigue queriendo decir
 * eso; los planes nuevos se escriben con su número.
 */
export function cuotasDelPlan(plan: PlanPago): number {
  switch (plan) {
    case "ABONOS_3":
      return 3;
    case "ABONOS_2":
    case "ABONOS":
      return 2;
    default:
      return 1;
  }
}

/** El valor que se guarda en `plan` para un plan de `cuotas` cuotas. */
export function planPagoDeCuotas(cuotas: number): PlanPago {
  if (cuotas >= 3) return "ABONOS_3";
  if (cuotas === 2) return "ABONOS_2";
  return "TOTAL";
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

/* -------------------- Pago manual: la cuenta la hacen los abonos ------------ */

/**
 * Lo que realmente entró: la suma de los abonos verificados.
 *
 * Cuenta `montoAprobado` y no `montoDeclarado` a propósito. Lo declarado es lo
 * que el ciclista escribió en un formulario; lo aprobado es lo que alguien vio
 * en el extracto. Solo lo segundo es dinero.
 */
export function abonadoVerificado(abonos: Abono[]): number {
  return abonos
    .filter((a) => a.estado === "VERIFICADA")
    .reduce((s, a) => s + (a.montoAprobado ?? 0), 0);
}

/** Lo que está subido y todavía nadie ha revisado. No es dinero: es una promesa. */
export function abonadoEnRevision(abonos: Abono[]): number {
  return abonos
    .filter((a) => a.estado === "ENVIADA" || a.estado === "EN_REVISION")
    .reduce((s, a) => s + a.montoDeclarado, 0);
}

/**
 * Lo que falta por pagar.
 *
 * Nunca baja de cero: si alguien transfirió de más, el saldo es 0 y el
 * excedente se ve con `excedente()`. Un saldo negativo se colaría en correos y
 * tickets como "faltan −20.000".
 */
export function saldoDesdeAbonos(total: number, abonos: Abono[]): number {
  return Math.max(0, total - abonadoVerificado(abonos));
}

/**
 * Cuánto entró de más. DECISIÓN PENDIENTE DE CONFIRMAR — no se devuelve
 * automáticamente (docs/decisiones-pago-manual.md §6); esto solo lo hace
 * visible para que alguien lo resuelva hablando.
 */
export function excedente(total: number, abonos: Abono[]): number {
  return Math.max(0, abonadoVerificado(abonos) - total);
}

/**
 * El estado que le corresponde a una inscripción según sus abonos.
 *
 * El orden importa: primero el dinero que ya entró, después lo que espera
 * revisión, y de último el caso de no haber nada. Un comprobante rechazado no
 * cambia el estado — el cupo sigue reservado y el ciclista puede volver a
 * subir (docs/decisiones-pago-manual.md §7), así que EN_MORA no aparece aquí.
 */
export function estadoDesdeAbonos(
  total: number,
  abonos: Abono[],
): EstadoInscripcion {
  if (saldoDesdeAbonos(total, abonos) === 0 && total > 0) return "COMPLETA";
  if (abonadoVerificado(abonos) > 0) return "AL_DIA";
  if (abonos.some((a) => a.estado === "ENVIADA" || a.estado === "EN_REVISION")) {
    return "EN_VERIFICACION";
  }
  return "PENDIENTE_PAGO";
}

/** Cuántos abonos ocupan cupo: los rechazados no gastan intento. */
export function abonosQueCuentan(abonos: Abono[]): Abono[] {
  return abonos.filter((a) => a.estado !== "RECHAZADA");
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
