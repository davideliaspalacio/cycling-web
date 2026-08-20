import "server-only";
import { randomUUID } from "node:crypto";
import { guardarInscripcion, nuevaReferencia } from "./almacen";
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
  else if (ins.cuotas.some((c) => c.estado === "VENCIDA" || c.estado === "FALLIDA"))
    ins.estado = "EN_MORA";
  else if (ins.pagado > 0) ins.estado = "AL_DIA";
  else ins.estado = "PENDIENTE_PAGO";
}

/**
 * Guarda la tarjeta como fuente de pago y cobra la primera cuota (o el total).
 * Es el corazón del recaudo: a partir de la fuente de pago podemos cobrar
 * los meses siguientes sin volver a pedir datos.
 */
export async function iniciarPago(params: {
  inscripcion: Inscripcion;
  plan: PlanPago;
  tarjeta: wompi.DatosTarjeta;
}): Promise<{ inscripcion: Inscripcion; aprobado: boolean; mensaje?: string }> {
  const ins = params.inscripcion;

  const aceptaciones = await wompi.obtenerAceptaciones();
  const tokenizada = await wompi.tokenizarTarjeta(params.tarjeta);
  const fuentePagoId = await wompi.crearFuenteDePago({
    token: tokenizada.token,
    correo: ins.ciclista.correo,
    aceptaciones,
  });

  ins.plan = params.plan;
  ins.fuentePagoId = fuentePagoId;
  ins.tarjetaResumen = { marca: tokenizada.marca, ultimos4: tokenizada.ultimos4 };
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
  anota(
    ins,
    "fuente-de-pago",
    `Tarjeta ${tokenizada.marca} ····${tokenizada.ultimos4} guardada en Wompi (fuente ${fuentePagoId}). Plan: ${params.plan}.`,
  );

  const resultado = await cobrarCuota(ins, 1, params.tarjeta.numero);
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

/** Cobra una cuota concreta contra la fuente de pago guardada. */
export async function cobrarCuota(
  ins: Inscripcion,
  numero: number,
  tarjetaSimulada?: string,
): Promise<{ aprobado: boolean; mensaje?: string }> {
  const cuota = ins.cuotas.find((c) => c.numero === numero);
  if (!cuota) return { aprobado: false, mensaje: "Esa cuota no existe." };
  if (cuota.estado === "PAGADA") return { aprobado: true };
  if (!ins.fuentePagoId)
    return { aprobado: false, mensaje: "No hay una tarjeta guardada." };

  cuota.intentos += 1;
  cuota.ultimoIntentoEn = new Date().toISOString();
  const res = await wompi.cobrarConFuente({
    fuentePagoId: ins.fuentePagoId,
    centavos: aCentavos(cuota.monto),
    referencia: `${cuota.referencia}-${cuota.intentos}`,
    correo: ins.ciclista.correo,
    tarjetaSimulada: tarjetaSimulada ?? ins.tarjetaResumen?.ultimos4,
  });

  cuota.transaccionId = res.id;
  if (res.estado === "APPROVED") {
    cuota.estado = "PAGADA";
    cuota.pagadaEn = new Date().toISOString();
    cuota.ultimoError = undefined;
    anota(ins, "cobro-aprobado", `Cuota ${numero} · ${res.id}`);
  } else {
    cuota.estado = "FALLIDA";
    cuota.ultimoError = res.mensaje ?? "El banco rechazó el cobro.";
    anota(ins, "cobro-rechazado", `Cuota ${numero} · ${cuota.ultimoError}`);
  }
  recalcular(ins);
  return { aprobado: cuota.estado === "PAGADA", mensaje: cuota.ultimoError };
}

/** Cobro de una cuota posterior, con los correos que correspondan. */
export async function cobrarSiguienteCuota(
  ins: Inscripcion,
  numero?: number,
): Promise<{ aprobado: boolean; numero?: number; mensaje?: string }> {
  const objetivo = numero
    ? ins.cuotas.find((c) => c.numero === numero)
    : proximaCuota(ins.cuotas);
  if (!objetivo) return { aprobado: true, mensaje: "No queda nada por pagar." };

  const resultado = await cobrarCuota(ins, objetivo.numero);
  await guardarInscripcion(ins);

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
      const dias = diasHasta(cuota.vence, hoy);

      const horasDesdeElIntento = cuota.ultimoIntentoEn
        ? (hoy.getTime() - new Date(cuota.ultimoIntentoEn).getTime()) / 3_600_000
        : Infinity;

      // Un cobro rechazado se reintenta a las 48 horas, no al día siguiente.
      if (dias <= 0 && cuota.intentos < 3 && horasDesdeElIntento >= 48) {
        const r = await cobrarSiguienteCuota(ins, cuota.numero);
        if (r.aprobado) cobradas += 1;
        else fallidas += 1;
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
