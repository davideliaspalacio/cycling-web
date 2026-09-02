import {
  CUOTAS_DEL_PLAN,
  DIAS_ENTRE_CUOTAS,
  DIA_DE_COBRO,
  FECHA_LIMITE_ABONOS,
  MARGEN_MINIMO_DOS_CUOTAS,
  MAX_ABONOS,
} from "./catalogo";
import type { Abono, Cuota, EstadoInscripcion } from "./tipos";

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
 * dos cuotas del plan: 380.000 en 2 → 190.000 · 190.000.
 * (Con la pasarela era 380.000 en 4 → 95.000 × 4.)
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

/* ------------------------- El plan de dos cuotas --------------------------- */

/**
 * Los montos de las dos cuotas. 380.000 → [190.000, 190.000].
 *
 * Sale de `repartirEnCuotas` y no de una división a pelo para que un precio que
 * no parta en mitades exactas siga sumando el total al peso.
 */
export function montosDelPlan(total: number): number[] {
  return repartirEnCuotas(total, MAX_ABONOS);
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
 * Cuándo vence la segunda cuota.
 *
 * Dos reglas y en este orden: 45 días desde la **fecha de inscripción** (no
 * desde que verificamos la primera cuota), y nunca después del cierre de
 * recepción de comprobantes. Sin ese tope, quien se inscriba el 20 de mayo de
 * 2027 tendría la segunda cuota el 4 de julio: un día después de la carrera.
 */
export function fechaSegundaCuota(inscritaEl: string): string {
  const natural = sumarDias(inscritaEl, DIAS_ENTRE_CUOTAS);
  return natural > FECHA_LIMITE_ABONOS ? FECHA_LIMITE_ABONOS : natural;
}

/**
 * Si a esta fecha todavía cabe un plan de dos cuotas con sentido.
 *
 * Cuando falta poco para el cierre, el tope de `fechaSegundaCuota` aplasta las
 * dos fechas una contra otra. Antes que ofrecer un plazo que no existe, se
 * ofrece solo pago total (docs/decisiones-pago-manual.md §1).
 */
export function hayPlazoParaDosCuotas(hoy: string | Date = new Date()): boolean {
  const desde = typeof hoy === "string" ? soloFecha(hoy) : isoFecha(hoy);
  return diasHasta(FECHA_LIMITE_ABONOS, new Date(`${desde}T00:00:00Z`)) >=
    MARGEN_MINIMO_DOS_CUOTAS;
}

export type CuotaDelPlan = {
  numero: number;
  monto: number;
  /** ISO (YYYY-MM-DD). */
  vence: string;
};

/**
 * El plan completo tal como se le enseña al ciclista: los dos montos y las dos
 * fechas, desde el minuto uno. La primera vence el día de la inscripción —se
 * paga en el acto—, la segunda 45 días después o en el cierre, lo que llegue
 * antes.
 */
export function planDeDosCuotas(
  total: number,
  inscritaEl: string,
): CuotaDelPlan[] {
  const montos = montosDelPlan(total);
  return montos.map((monto, i) => ({
    numero: i + 1,
    monto,
    vence: i === 0 ? soloFecha(inscritaEl) : fechaSegundaCuota(inscritaEl),
  }));
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
