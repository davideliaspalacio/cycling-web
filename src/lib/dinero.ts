import {
  CUOTAS_DEL_PLAN,
  DIAS_ENTRE_CUOTAS,
  DIA_DE_COBRO,
  FECHA_LIMITE_ABONOS,
  MARGEN_MINIMO_CUOTAS,
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
 *
 * Reparte en N exacto sea cual sea el precio, que es lo que hace que la etapa 2
 * no necesite nada nuevo: 470.000 en 4 → 118.000 · 118.000 · 117.000 ·
 * 117.000, y con el 10% de descuento 423.000 en 4 → 106.000 · 106.000 ·
 * 106.000 · 105.000. En los dos casos la suma es el total al peso.
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

/* ---------------------------- El descuento ---------------------------------- */

/**
 * Cuánto se rebaja un precio con un porcentaje de descuento, en pesos.
 *
 * Trunca al millar porque en este proyecto todo el dinero va en miles de
 * pesos: así el total rebajado se parte en cuotas de cifras redondas y nadie
 * ve una cuota de 105.750. Con los números reales no cambia nada —470.000 al
 * 10% son 47.000 exactos—, pero deja la regla escrita para el día que el
 * porcentaje no sea tan cómodo.
 *
 * Trunca hacia abajo y no al millar más cercano a propósito: redondear hacia
 * arriba regala hasta 999 pesos por inscripción, y con doscientas cincuenta
 * inscripciones eso es dinero de la organización. Un 7% de 470.000 son 32.900,
 * y aquí se descuentan 32.000, no 33.000. Donde hay que ser exacto es en el
 * reparto en cuotas, que sí suma el total al peso.
 *
 * El resultado es lo que se guarda en `ins.descuento`: **pesos, no
 * porcentaje**. Si mañana el 10% cambia, lo que ya se cobró no se mueve.
 */
export function descuentoEnPesos(precio: number, porcentaje: number): number {
  if (porcentaje <= 0 || precio <= 0) return 0;
  const bruto = (precio * porcentaje) / 100;
  return Math.min(precio, Math.floor(bruto / 1000) * 1000);
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

/**
 * De los planes de una etapa, los que todavía caben a esta fecha. Siempre trae
 * el de 1.
 *
 * `planes` es obligatorio y no tiene respaldo a propósito. Los planes son una
 * propiedad de la **etapa de la inscripción** (`etapaDeInscripcion(ins).planes`),
 * no del catálogo vigente: una inscripción de la etapa 1 sigue con 1–3 aunque
 * la etapa activa ya ofrezca 4. Un valor por defecto aquí era la forma fácil de
 * colarle un cuarto plan a quien se inscribió en la primera etapa.
 */
export function planesViables(
  hoy: string | Date,
  planes: readonly number[],
): number[] {
  return planes.filter((n) => cabePlanDeCuotas(n, hoy));
}

/** El plan más largo que todavía cabe. Es el que fija el mínimo del primer comprobante. */
export function maxCuotasViables(
  hoy: string | Date,
  planes: readonly number[],
): number {
  const viables = planesViables(hoy, planes);
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
    case "ABONOS_4":
      return 4;
    case "ABONOS_3":
      return 3;
    case "ABONOS_2":
    case "ABONOS":
      return 2;
    default:
      return 1;
  }
}

/**
 * Cómo se nombra un plan en pantalla.
 *
 * Estaba copiado en /panel y en la ficha del inscrito, y al estrenar el cuarto
 * plan las dos copias se quedaron cortas a la vez. Vive aquí, junto a
 * `cuotasDelPlan`, que es el otro sitio que conoce esta correspondencia.
 */
const TEXTO_PLAN: Record<PlanPago, string> = {
  CONTADO: "Contado (tarjeta · histórico)",
  CUOTAS: "Cuotas (tarjeta · histórico)",
  TOTAL: "Pago total",
  // `ABONOS` a secas es el valor histórico de cuando el único plan diferido
  // eran dos cuotas; sigue queriendo decir eso.
  ABONOS: "Dos cuotas",
  ABONOS_2: "Dos cuotas",
  ABONOS_3: "Tres cuotas",
  ABONOS_4: "Cuatro cuotas",
};

export function textoDePlan(plan: PlanPago): string {
  return TEXTO_PLAN[plan] ?? plan;
}

/** El valor que se guarda en `plan` para un plan de `cuotas` cuotas. */
export function planPagoDeCuotas(cuotas: number): PlanPago {
  if (cuotas >= 4) return "ABONOS_4";
  if (cuotas === 3) return "ABONOS_3";
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
