import { NextResponse } from "next/server";
import { guardarInscripcion, inscripcionPorReferencia } from "@/lib/almacen";
import { eventoEsAutentico } from "@/lib/wompi";
import { saldoPendiente } from "@/lib/dinero";
import { enviarAlCiclista } from "@/lib/correos/enviar";
import {
  cuotaPagada,
  inscripcionConfirmada,
  inscripcionSaldada,
} from "@/lib/correos/plantillas";

/**
 * Webhook de Wompi. Es la fuente de verdad de los pagos: el checkout web
 * (PSE, Nequi, efectivo) no vuelve por nuestra API, solo por aquí.
 * La referencia viaja como TE27-XXXXXX-C2-1, de donde sacamos la
 * inscripción y el número de cuota.
 */
export async function POST(peticion: Request) {
  const evento = await peticion.json().catch(() => null);
  if (!evento?.signature?.checksum) {
    return NextResponse.json({ error: "Evento sin firma." }, { status: 400 });
  }
  if (!eventoEsAutentico(evento)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }
  if (evento.event !== "transaction.updated") {
    return NextResponse.json({ recibido: true });
  }

  const transaccion = evento.data?.transaction;
  const referencia: string = transaccion?.reference ?? "";
  const inscripcion = await inscripcionPorReferencia(referencia);
  if (!inscripcion) return NextResponse.json({ recibido: true });

  const numero = Number(referencia.match(/-C(\d+)/)?.[1] ?? 1);
  const cuota =
    inscripcion.cuotas.find((c) => c.numero === numero) ?? inscripcion.cuotas[0];
  if (!cuota) return NextResponse.json({ recibido: true });

  const yaEstaba = cuota.estado === "PAGADA";

  if (transaccion.status === "APPROVED") {
    cuota.estado = "PAGADA";
    cuota.pagadaEn = new Date().toISOString();
    cuota.transaccionId = transaccion.id;
  } else if (transaccion.status === "DECLINED" || transaccion.status === "ERROR") {
    cuota.estado = "FALLIDA";
    cuota.ultimoError = transaccion.status_message ?? "Rechazada por el banco.";
    cuota.transaccionId = transaccion.id;
  }

  inscripcion.pagado = inscripcion.cuotas
    .filter((c) => c.estado === "PAGADA")
    .reduce((s, c) => s + c.monto, 0);
  const saldo = saldoPendiente(inscripcion.cuotas);
  inscripcion.estado =
    saldo === 0 ? "COMPLETA" : inscripcion.pagado > 0 ? "AL_DIA" : "PENDIENTE_PAGO";
  inscripcion.eventos.unshift({
    en: new Date().toISOString(),
    tipo: "webhook",
    detalle: `${transaccion.status} · cuota ${numero} · ${transaccion.id}`,
  });
  await guardarInscripcion(inscripcion);

  // Idempotencia: no reenviamos correo si Wompi repite el evento.
  if (!yaEstaba && transaccion.status === "APPROVED") {
    if (saldo === 0 && inscripcion.plan === "CONTADO") {
      await enviarAlCiclista(
        inscripcion,
        "inscripcion-confirmada",
        inscripcionConfirmada(inscripcion),
      );
    } else if (saldo === 0) {
      await enviarAlCiclista(
        inscripcion,
        "inscripcion-saldada",
        inscripcionSaldada(inscripcion),
      );
    } else {
      await enviarAlCiclista(
        inscripcion,
        "cuota-pagada",
        cuotaPagada(inscripcion, numero),
      );
    }
  }

  return NextResponse.json({ recibido: true });
}
