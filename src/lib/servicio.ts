import "server-only";
import { randomUUID } from "node:crypto";
import { guardarInscripcion, nuevaReferencia, reclamarCuota } from "./almacen";
import { categoriaPorCodigo } from "./catalogo";
import {
  aCentavos,
  calendarioDeCuotas,
  diasHasta,
  proximaCuota,
  saldoPendiente,
  totalPagado,
} from "./dinero";
import type { EntradaInscripcion } from "./validacion";
import type { Inscripcion, PlanPago } from "./tipos";
import * as wompi from "./wompi";
import { enviarAlCiclista } from "./correos/enviar";
import { textoDeAutorizacion } from "./autorizacion";
import {
  cuotaFallida,
  cuotaPagada,
  inscripcionConfirmada,
  inscripcionSaldada,
  planCuotasActivado,
  recordatorioCuota,
} from "./correos/plantillas";

function anota(ins: Inscripcion, tipo: string, detalle: string) {
  ins.eventos.unshift({ en: new Date().toISOString(), tipo, detalle });
}

/* ------------------------------ Crear inscripción ----------------------------- */

export async function crearInscripcion(
  entrada: EntradaInscripcion,
): Promise<Inscripcion> {
  const categoria = categoriaPorCodigo(entrada.categoriaCodigo);
  if (!categoria) throw new Error("La categoría no existe.");

  const referencia = nuevaReferencia();
  const inscripcion: Inscripcion = {
    id: randomUUID(),
    referencia,
    creadaEn: new Date().toISOString(),
    actualizadaEn: new Date().toISOString(),
    estado: "PENDIENTE_PAGO",
    categoriaCodigo: entrada.categoriaCodigo,
    ciclista: { ...entrada.ciclista, pais: "Colombia" },
    tallas: entrada.tallas,
    consentimientos: entrada.consentimientos,
    plan: "CONTADO",
    total: categoria.precio,
    pagado: 0,
    cuotas: [],
    eventos: [],
  };
  anota(
    inscripcion,
    "creada",
    `Formulario completo · ${categoria.nombre} · ${inscripcion.ciclista.ciudad}`,
  );
  return guardarInscripcion(inscripcion);
}

/* --------------------------------- Cobros ------------------------------------ */

function recalcular(ins: Inscripcion) {
  ins.pagado = totalPagado(ins.cuotas);
  const saldo = saldoPendiente(ins.cuotas);
  if (saldo === 0) ins.estado = "COMPLETA";
  else if (
    ins.cuotas.some((c) => c.estado === "VENCIDA" || c.estado === "FALLIDA")
  )
    ins.estado = "EN_MORA";
  else if (ins.pagado > 0) ins.estado = "AL_DIA";
  else ins.estado = "PENDIENTE_PAGO";
}

/**
 * Arma el plan de pago sobre una fuente de pago ya creada, cobra la primera
 * cuota y dispara el correo que corresponda.
 *
 * Es el tronco común: da igual si la tarjeta llegó por el modal de Wompi o por
 * el simulador, a partir de aquí el flujo es idéntico.
 */
export async function activarPlanDePago(params: {
  inscripcion: Inscripcion;
  plan: PlanPago;
  fuentePagoId: number;
  resumenTarjeta: { marca: string; ultimos4: string };
  /** Huella de quien aceptó la autorización de cobro recurrente. */
  huella?: { ip?: string; navegador?: string };
  /** Solo para el modo simulación: decide si el banco aprueba o rechaza. */
  pistaDeSimulacion?: string;
}): Promise<{ inscripcion: Inscripcion; aprobado: boolean; mensaje?: string }> {
  const ins = params.inscripcion;

  ins.plan = params.plan;
  ins.fuentePagoId = params.fuentePagoId;
  ins.tarjetaResumen = params.resumenTarjeta;
  ins.cuotas =
    params.plan === "CUOTAS"
      ? calendarioDeCuotas(ins.total, ins.referencia)
      : [
          {
            numero: 1,
            vence: new Date().toISOString().slice(0, 10),
            monto: ins.total,
            estado: "PENDIENTE",
            referencia: `${ins.referencia}-C1`,
            intentos: 0,
          },
        ];
  // El texto se compone en el servidor a partir del mismo calendario con el
  // que vamos a cobrar: así la constancia no depende de lo que mande el
  // navegador y no se puede alterar desde el cliente.
  if (params.plan === "CUOTAS") {
    ins.autorizacionCobro = {
      aceptadaEn: new Date().toISOString(),
      texto: textoDeAutorizacion(ins.cuotas),
      cuotas: ins.cuotas
        .filter((c) => c.numero > 1)
        .map((c) => ({ numero: c.numero, vence: c.vence, monto: c.monto })),
      ip: params.huella?.ip,
      navegador: params.huella?.navegador,
    };
    anota(
      ins,
      "autorizacion-cobro",
      `Autorizó el cobro automático de ${ins.autorizacionCobro.cuotas.length} cuotas${params.huella?.ip ? ` desde ${params.huella.ip}` : ""}.`,
    );
  }

  anota(
    ins,
    "fuente-de-pago",
    `Tarjeta ${params.resumenTarjeta.marca} ····${params.resumenTarjeta.ultimos4} guardada en Wompi (fuente ${params.fuentePagoId}). Plan: ${params.plan}.`,
  );

  // Las cuotas tienen que existir en la base antes de cobrar: el reclamo
  // atómico trabaja sobre esas filas.
  await guardarInscripcion(ins);

  const resultado = await cobrarCuota(ins, 1, params.pistaDeSimulacion, 12_000);
  await guardarInscripcion(ins);

  if (resultado.aprobado) {
    if (params.plan === "CONTADO") {
      await enviarAlCiclista(ins, "inscripcion-confirmada", inscripcionConfirmada(ins));
    } else {
      await enviarAlCiclista(ins, "plan-cuotas-activado", planCuotasActivado(ins));
    }
  } else {
    await enviarAlCiclista(ins, "cuota-fallida", cuotaFallida(ins, 1));
  }

  return { inscripcion: ins, ...resultado };
}

/**
 * Camino del modal de Wompi: el widget en modo `tokenize` captura la tarjeta
 * (nunca toca nuestro servidor) y nos devuelve un token. Aquí lo cambiamos por
 * una fuente de pago reutilizable y arrancamos el plan.
 */
export async function activarConTokenDelWidget(params: {
  inscripcion: Inscripcion;
  plan: PlanPago;
  token: string;
  resumenTarjeta: { marca: string; ultimos4: string };
  huella?: { ip?: string; navegador?: string };
}): Promise<{ inscripcion: Inscripcion; aprobado: boolean; mensaje?: string }> {
  const fuentePagoId = await wompi.fuenteDesdeTokenDelWidget({
    token: params.token,
    correo: params.inscripcion.ciclista.correo,
  });
  return activarPlanDePago({
    inscripcion: params.inscripcion,
    plan: params.plan,
    fuentePagoId,
    resumenTarjeta: params.resumenTarjeta,
    huella: params.huella,
  });
}

/**
 * Camino de respaldo, solo en modo simulación: recibe los datos de la tarjeta
 * directamente. Con llaves reales nunca se usa — ahí manda el modal.
 */
export async function iniciarPago(params: {
  inscripcion: Inscripcion;
  plan: PlanPago;
  tarjeta: wompi.DatosTarjeta;
  huella?: { ip?: string; navegador?: string };
}): Promise<{ inscripcion: Inscripcion; aprobado: boolean; mensaje?: string }> {
  const aceptaciones = await wompi.obtenerAceptaciones();
  const tokenizada = await wompi.tokenizarTarjeta(params.tarjeta);
  const fuentePagoId = await wompi.crearFuenteDePago({
    token: tokenizada.token,
    correo: params.inscripcion.ciclista.correo,
    aceptaciones,
  });
  return activarPlanDePago({
    inscripcion: params.inscripcion,
    plan: params.plan,
    fuentePagoId,
    resumenTarjeta: { marca: tokenizada.marca, ultimos4: tokenizada.ultimos4 },
    huella: params.huella,
    pistaDeSimulacion: params.tarjeta.numero,
  });
}

/**
 * Un cobro marcado en curso pero sin transacción y con más de 15 minutos es
 * un proceso que se murió a mitad; se puede reintentar sin riesgo.
 */
function cobroAbandonado(cuota: Inscripcion["cuotas"][number]): boolean {
  if (cuota.transaccionId) return false;
  if (!cuota.ultimoIntentoEn) return true;
  return Date.now() - new Date(cuota.ultimoIntentoEn).getTime() > 15 * 60_000;
}

/** Cobra una cuota concreta contra la fuente de pago guardada. */
export async function cobrarCuota(
  ins: Inscripcion,
  numero: number,
  tarjetaSimulada?: string,
  esperaMs?: number,
): Promise<{ aprobado: boolean; enProceso?: boolean; mensaje?: string }> {
  const cuota = ins.cuotas.find((c) => c.numero === numero);
  if (!cuota) return { aprobado: false, mensaje: "Esa cuota no existe." };
  if (cuota.estado === "PAGADA") return { aprobado: true };
  // Nunca relanzar un cobro cuyo resultado todavía no conocemos: es la vía
  // directa a cobrarle dos veces al ciclista.
  if (!ins.fuentePagoId)
    return { aprobado: false, mensaje: "No hay una tarjeta guardada." };

  // La base decide quién cobra: si otra petición ya tomó esta cuota, aquí
  // llega null y nos retiramos sin tocar a Wompi.
  const reclamo = await reclamarCuota(ins.id, numero);
  if (!reclamo) {
    return {
      aprobado: false,
      enProceso: true,
      mensaje: "Ya hay un cobro en curso para esta cuota.",
    };
  }
  cuota.intentos = reclamo.intentos;
  cuota.estado = "EN_PROCESO";

  cuota.ultimoIntentoEn = new Date().toISOString();

  const res = await wompi.cobrarConFuente({
    fuentePagoId: ins.fuentePagoId,
    centavos: aCentavos(cuota.monto),
    referencia: `${cuota.referencia}-${cuota.intentos}`,
    correo: ins.ciclista.correo,
    tarjetaSimulada: tarjetaSimulada ?? ins.tarjetaResumen?.ultimos4,
    esperaMs,
  });

  cuota.transaccionId = res.id;
  if (res.estado === "APPROVED") {
    cuota.estado = "PAGADA";
    cuota.pagadaEn = new Date().toISOString();
    cuota.ultimoError = undefined;
    anota(ins, "cobro-aprobado", `Cuota ${numero} · ${res.id}`);
  } else if (res.estado === "PENDING") {
    cuota.estado = "EN_PROCESO";
    cuota.ultimoError = undefined;
    anota(ins, "cobro-en-proceso", `Cuota ${numero} · ${res.id} · sin liquidar`);
  } else {
    cuota.estado = "FALLIDA";
    cuota.ultimoError = res.mensaje ?? "El banco rechazó el cobro.";
    anota(ins, "cobro-rechazado", `Cuota ${numero} · ${res.id} · ${cuota.ultimoError}`);
  }
  recalcular(ins);
  return {
    aprobado: cuota.estado === "PAGADA",
    enProceso: cuota.estado === "EN_PROCESO",
    mensaje: cuota.ultimoError,
  };
}

/** Cobro de una cuota posterior, con los correos que correspondan. */
export async function cobrarSiguienteCuota(
  ins: Inscripcion,
  numero?: number,
  esperaMs?: number,
): Promise<{
  aprobado: boolean;
  enProceso?: boolean;
  numero?: number;
  mensaje?: string;
}> {
  const objetivo = numero
    ? ins.cuotas.find((c) => c.numero === numero)
    : proximaCuota(ins.cuotas);
  if (!objetivo) return { aprobado: true, mensaje: "No queda nada por pagar." };

  const resultado = await cobrarCuota(ins, objetivo.numero, undefined, esperaMs);
  await guardarInscripcion(ins);

  // Un cobro sin liquidar no avisa nada: el webhook manda el correo que
  // corresponda cuando Wompi confirme.
  if (resultado.enProceso) return { ...resultado, numero: objetivo.numero };

  if (resultado.aprobado) {
    if (saldoPendiente(ins.cuotas) === 0) {
      await enviarAlCiclista(ins, "inscripcion-saldada", inscripcionSaldada(ins));
    } else {
      await enviarAlCiclista(
        ins,
        "cuota-pagada",
        cuotaPagada(ins, objetivo.numero),
      );
    }
  } else {
    await enviarAlCiclista(ins, "cuota-fallida", cuotaFallida(ins, objetivo.numero));
  }
  return { ...resultado, numero: objetivo.numero };
}

/**
 * Confirma un pago de contado hecho en el modal de Wompi.
 *
 * El webhook sigue siendo la fuente de verdad, pero el modal nos devuelve el
 * id de la transacción al cerrarse y con eso podemos darle respuesta inmediata
 * al ciclista en vez de dejarlo mirando un "procesando". Es idempotente: si el
 * webhook llegó primero, esto no reenvía el correo.
 */
export async function confirmarPagoDelWidget(params: {
  inscripcion: Inscripcion;
  transaccionId: string;
}): Promise<{ aprobado: boolean; estado: string; mensaje?: string }> {
  const ins = params.inscripcion;
  const res = await wompi.consultarTransaccion(params.transaccionId);

  if (res.estado === "PENDING") {
    anota(ins, "widget-pendiente", `Transacción ${res.id} en proceso.`);
    await guardarInscripcion(ins);
    return { aprobado: false, estado: res.estado };
  }

  if (ins.cuotas.length === 0) {
    ins.plan = "CONTADO";
    ins.cuotas = [
      {
        numero: 1,
        vence: new Date().toISOString().slice(0, 10),
        monto: ins.total,
        estado: "PENDIENTE",
        referencia: `${ins.referencia}-C1`,
        intentos: 0,
      },
    ];
  }

  const cuota = ins.cuotas[0];
  const yaEstabaPagada = cuota.estado === "PAGADA";
  cuota.transaccionId = res.id;
  cuota.intentos += 1;
  cuota.ultimoIntentoEn = new Date().toISOString();

  if (res.estado === "APPROVED") {
    cuota.estado = "PAGADA";
    cuota.pagadaEn ??= new Date().toISOString();
    cuota.ultimoError = undefined;
    anota(ins, "widget-aprobado", `Contado · ${res.id}`);
  } else {
    cuota.estado = "FALLIDA";
    cuota.ultimoError = res.mensaje ?? "El banco rechazó el pago.";
    anota(ins, "widget-rechazado", `${res.estado} · ${cuota.ultimoError}`);
  }

  recalcular(ins);
  await guardarInscripcion(ins);

  if (res.estado === "APPROVED" && !yaEstabaPagada) {
    await enviarAlCiclista(ins, "inscripcion-confirmada", inscripcionConfirmada(ins));
  }
  return {
    aprobado: res.estado === "APPROVED",
    estado: res.estado,
    mensaje: cuota.ultimoError,
  };
}

/**
 * Paga de una vez todo lo que queda, en una sola transacción.
 *
 * Se hace en un solo cobro y no en tres seguidos: es una sola comisión, un
 * solo comprobante y una sola oportunidad de que el banco rechace. Las cuotas
 * quedan marcadas con la misma transacción, que es lo que realmente pasó.
 */
export async function saldarInscripcion(
  ins: Inscripcion,
): Promise<{ aprobado: boolean; enProceso?: boolean; monto: number; mensaje?: string }> {
  const pendientes = ins.cuotas.filter((c) => c.estado !== "PAGADA");
  const monto = pendientes.reduce((s, c) => s + c.monto, 0);
  if (monto === 0) return { aprobado: true, monto: 0, mensaje: "No queda nada por pagar." };
  if (!ins.fuentePagoId)
    return { aprobado: false, monto, mensaje: "No hay una tarjeta guardada." };
  if (pendientes.some((c) => c.estado === "EN_PROCESO" && !cobroAbandonado(c)))
    return { aprobado: false, enProceso: true, monto, mensaje: "Ya hay un cobro en curso." };

  const intento = Math.max(...pendientes.map((c) => c.intentos)) + 1;
  const referencia = `${ins.referencia}-SALDO-${intento}`;

  for (const c of pendientes) {
    c.intentos += 1;
    c.ultimoIntentoEn = new Date().toISOString();
    c.estado = "EN_PROCESO";
  }
  await guardarInscripcion(ins);

  const res = await wompi.cobrarConFuente({
    fuentePagoId: ins.fuentePagoId,
    centavos: aCentavos(monto),
    referencia,
    correo: ins.ciclista.correo,
    tarjetaSimulada: ins.tarjetaResumen?.ultimos4,
    esperaMs: 15_000,
  });

  for (const c of pendientes) {
    c.transaccionId = res.id;
    if (res.estado === "APPROVED") {
      c.estado = "PAGADA";
      c.pagadaEn = new Date().toISOString();
      c.ultimoError = undefined;
    } else if (res.estado === "PENDING") {
      c.estado = "EN_PROCESO";
    } else {
      c.estado = "FALLIDA";
      c.ultimoError = res.mensaje ?? "El banco rechazó el cobro.";
    }
  }
  anota(
    ins,
    res.estado === "APPROVED" ? "saldo-pagado" : "saldo-fallido",
    `${pesosSimple(monto)} en una sola transacción · ${res.id} · ${res.estado}`,
  );
  recalcular(ins);
  await guardarInscripcion(ins);

  if (res.estado === "APPROVED") {
    await enviarAlCiclista(ins, "inscripcion-saldada", inscripcionSaldada(ins));
  } else if (res.estado !== "PENDING") {
    await enviarAlCiclista(ins, "cuota-fallida", cuotaFallida(ins, pendientes[0].numero));
  }

  return {
    aprobado: res.estado === "APPROVED",
    enProceso: res.estado === "PENDING",
    monto,
    mensaje: res.mensaje,
  };
}

const pesosSimple = (v: number) => `$${v.toLocaleString("es-CO")}`;

/* ------------------------------ Barrido diario ------------------------------- */

/**
 * Lo que corre el cron: cobra lo que ya venció y avisa lo que está por vencer.
 */
export async function barrerCobros(
  inscripciones: Inscripcion[],
  hoy = new Date(),
): Promise<{ cobradas: number; recordadas: number; fallidas: number }> {
  let cobradas = 0;
  let recordadas = 0;
  let fallidas = 0;

  for (const ins of inscripciones) {
    if (ins.plan !== "CUOTAS" || ins.estado === "COMPLETA") continue;

    for (const cuota of ins.cuotas) {
      if (cuota.estado === "PAGADA") continue;
      // Un cobro en curso lo cierra el webhook, no el barrido.
      if (cuota.estado === "EN_PROCESO") break;
      const dias = diasHasta(cuota.vence, hoy);

      const horasDesdeElIntento = cuota.ultimoIntentoEn
        ? (hoy.getTime() - new Date(cuota.ultimoIntentoEn).getTime()) / 3_600_000
        : Infinity;

      // Un cobro rechazado se reintenta a las 48 horas, no al día siguiente.
      if (dias <= 0 && cuota.intentos < 3 && horasDesdeElIntento >= 48) {
        // Sin espera: con cientos de cuotas el mismo día, quedarse esperando
        // la liquidación de cada una haría eterno el barrido.
        const r = await cobrarSiguienteCuota(ins, cuota.numero, 0);
        if (r.aprobado) cobradas += 1;
        else if (!r.enProceso) fallidas += 1;
      } else if (dias === 3) {
        await enviarAlCiclista(
          ins,
          "recordatorio-cuota",
          recordatorioCuota(ins, cuota.numero, dias),
        );
        recordadas += 1;
      }
      break; // una cuota por inscripción y por corrida
    }
  }
  return { cobradas, recordadas, fallidas };
}

/* ------------------------------ Checkout Wompi ------------------------------- */

export function enlaceDeCheckout(ins: Inscripcion, urlBase: string): string {
  return wompi.urlDeCheckout({
    referencia: `${ins.referencia}-CONTADO`,
    centavos: aCentavos(ins.total),
    correo: ins.ciclista.correo,
    urlRetorno: `${urlBase}/inscripcion/${ins.referencia}/gracias`,
  });
}
