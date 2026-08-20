import { EVENTO } from "../catalogo";
import { fechaLarga, pesos, proximaCuota, saldoPendiente } from "../dinero";
import type { Inscripcion } from "../tipos";
import { categoriaPorCodigo } from "../catalogo";
import { textoDeAutorizacionConfirmado } from "../autorizacion";

/**
 * Plantillas HTML para correo. Tablas e inline styles a propósito:
 * Gmail y Outlook descartan <style> externo, flexbox y fuentes web.
 * El diseño imita la marca con lo que sí sobrevive: color, peso y bloques.
 */

const TINTA = "#04100c";
const NOCHE = "#06110e";
const LIMA = "#cbff47";
const HUESO = "#f3fbef";
const MAGENTA = "#ff4d91";
const NARANJA = "#ff9a2e";
const GRIS = "#5d6f63";

const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

export type PlantillaCorreo = {
  asunto: string;
  html: string;
  texto: string;
};

function boton(texto: string, url: string, color = LIMA): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${color};border:3px solid ${TINTA};border-radius:14px">
    <a href="${url}" style="display:inline-block;padding:14px 26px;font-family:${FUENTE};font-size:16px;font-weight:800;color:${TINTA};text-decoration:none;letter-spacing:-0.01em">${texto}</a>
  </td></tr></table>`;
}

function barraProgreso(pagado: number, total: number): string {
  const pct = Math.max(2, Math.min(100, Math.round((pagado / total) * 100)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:3px solid ${TINTA};border-radius:99px;background:#e4ecdf;margin:6px 0 14px">
    <tr>
      <td width="${pct}%" style="background:${LIMA};height:18px;border-radius:99px;font-size:0;line-height:0">&nbsp;</td>
      <td style="font-size:0;line-height:0">&nbsp;</td>
    </tr>
  </table>
  <p style="margin:0;font-family:${MONO};font-size:13px;color:${GRIS}">${pct}% abonado · ${pesos(pagado)} de ${pesos(total)}</p>`;
}

function filaDato(etiqueta: string, valor: string, resaltar = false): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #dfe7dc;font-family:${FUENTE};font-size:14px;color:${GRIS}">${etiqueta}</td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid #dfe7dc;font-family:${resaltar ? MONO : FUENTE};font-size:${resaltar ? "16px" : "14px"};font-weight:700;color:${TINTA}">${valor}</td>
  </tr>`;
}

function tablaCuotas(ins: Inscripcion): string {
  const filas = ins.cuotas
    .map((c) => {
      const color =
        c.estado === "PAGADA"
          ? "#2f7d32"
          : c.estado === "VENCIDA" || c.estado === "FALLIDA"
            ? MAGENTA
            : GRIS;
      const etiqueta =
        c.estado === "PAGADA"
          ? "Pagada"
          : c.estado === "EN_PROCESO"
            ? "En curso"
            : c.estado === "VENCIDA"
              ? "Vencida"
              : c.estado === "FALLIDA"
                ? "Rechazada"
                : "Programada";
      return `<tr>
        <td style="padding:11px 0;border-bottom:1px solid #dfe7dc;font-family:${MONO};font-size:14px;font-weight:700;color:${TINTA}">Cuota ${c.numero}/${ins.cuotas.length}</td>
        <td style="padding:11px 0;border-bottom:1px solid #dfe7dc;font-family:${FUENTE};font-size:13px;color:${GRIS}">${fechaLarga(c.vence)}</td>
        <td align="right" style="padding:11px 0;border-bottom:1px solid #dfe7dc;font-family:${MONO};font-size:14px;font-weight:700;color:${TINTA}">${pesos(c.monto)}</td>
        <td align="right" style="padding:11px 0 11px 12px;border-bottom:1px solid #dfe7dc;font-family:${FUENTE};font-size:12px;font-weight:700;color:${color}">${etiqueta}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">${filas}</table>`;
}

function envoltura(opciones: {
  eyebrow: string;
  titulo: string;
  colorEyebrow?: string;
  cuerpo: string;
  ins: Inscripcion;
}): string {
  const { eyebrow, titulo, cuerpo, ins } = opciones;
  const colorEyebrow = opciones.colorEyebrow ?? LIMA;
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title></head>
<body style="margin:0;padding:0;background:${NOCHE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NOCHE};padding:28px 14px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">

      <!-- Cabecera -->
      <tr><td style="padding:0 0 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-family:${FUENTE};font-size:19px;font-weight:800;color:${HUESO};letter-spacing:-0.03em">
              TIBET&nbsp;EPIC<span style="color:${LIMA}"> XCM</span>
            </td>
            <td align="right" style="font-family:${MONO};font-size:12px;color:#7f9184;letter-spacing:0.06em">
              ${EVENTO.fechaLegible.toUpperCase()}
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Tarjeta -->
      <tr><td style="background:${HUESO};border:3px solid ${TINTA};border-radius:22px;padding:32px 30px">
        <p style="margin:0 0 10px;font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${TINTA};background:${colorEyebrow};display:inline-block;padding:5px 11px;border-radius:99px;border:2px solid ${TINTA}">${eyebrow}</p>
        <h1 style="margin:8px 0 16px;font-family:${FUENTE};font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-0.035em;color:${TINTA}">${titulo}</h1>
        ${cuerpo}
      </td></tr>

      <!-- Pie -->
      <tr><td style="padding:22px 6px 0">
        <p style="margin:0 0 8px;font-family:${MONO};font-size:12px;color:#7f9184">
          Referencia <span style="color:${LIMA};font-weight:700">${ins.referencia}</span> · ${ins.ciclista.nombres} ${ins.ciclista.apellidos}
        </p>
        <p style="margin:0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:#67796c">
          ${EVENTO.nombre} ${EVENTO.edicion} · ${EVENTO.lugar}<br>
          ¿Dudas con tu inscripción? Escríbenos a
          <a href="mailto:${EVENTO.correoContacto}" style="color:${LIMA};text-decoration:none">${EVENTO.correoContacto}</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function parrafo(texto: string): string {
  return `<p style="margin:0 0 16px;font-family:${FUENTE};font-size:15px;line-height:1.62;color:#33453a">${texto}</p>`;
}

function nombreCorto(ins: Inscripcion): string {
  return ins.ciclista.nombres.split(" ")[0];
}

function urlPortal(ins: Inscripcion): string {
  const base = process.env.URL_PUBLICA ?? "http://localhost:3000";
  return `${base}/mi-inscripcion?ref=${ins.referencia}`;
}

/* ================================ Plantillas ================================ */

export function inscripcionConfirmada(ins: Inscripcion): PlantillaCorreo {
  const cat = categoriaPorCodigo(ins.categoriaCodigo);
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, tu cupo está asegurado. Recibimos el pago completo y ya apareces en la lista de largada de <strong>${cat?.nombre}</strong>.`,
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px">
      ${filaDato("Categoría", cat?.nombre ?? ins.categoriaCodigo)}
      ${filaDato("Recorrido", `${cat?.km ?? 0} km · ${cat?.desnivel ?? 0} m D+`)}
      ${filaDato("Fecha de carrera", EVENTO.fechaLegible)}
      ${filaDato("Jersey / camiseta", `${ins.tallas.jersey} / ${ins.tallas.running}`)}
      ${filaDato("Total pagado", pesos(ins.total), true)}
    </table>` +
    boton("Ver mi inscripción", urlPortal(ins)) +
    parrafo(
      `Guarda esta referencia: la vas a necesitar para retirar tu kit el día previo a la carrera.`,
    );
  return {
    asunto: `Estás dentro — ${cat?.nombre} · Tibet Epic XCM 2027`,
    html: envoltura({
      eyebrow: "Inscripción confirmada",
      titulo: "Tu cupo quedó asegurado.",
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, tu inscripción al Tibet Epic XCM 2027 quedó confirmada. Categoría ${cat?.nombre}. Total pagado ${pesos(ins.total)}. Referencia ${ins.referencia}.`,
  };
}

export function planCuotasActivado(ins: Inscripcion): PlantillaCorreo {
  const cat = categoriaPorCodigo(ins.categoriaCodigo);
  const siguiente = proximaCuota(ins.cuotas);
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, tu cupo en <strong>${cat?.nombre}</strong> ya está reservado. Cobramos la primera de ${ins.cuotas.length} cuotas y las demás salen solas de tu tarjeta ${ins.tarjetaResumen?.marca ?? ""} •••• ${ins.tarjetaResumen?.ultimos4 ?? ""}.`,
    ) +
    barraProgreso(ins.pagado, ins.total) +
    tablaCuotas(ins) +
    (siguiente
      ? parrafo(
          `<strong>La próxima cuota, ${pesos(siguiente.monto)}, se cobra el ${fechaLarga(siguiente.vence)}.</strong> Te avisamos tres días antes.`,
        )
      : "") +
    boton("Ver mi plan de pagos", urlPortal(ins)) +
    parrafo(
      `Puedes adelantar cuotas cuando quieras desde tu inscripción, sin costo adicional.`,
    ) +
    // Constancia escrita de la autorización: es lo que pide el banco si algún
    // día se desconoce un cobro.
    `<div style="margin:24px 0 0;padding:14px 16px;background:#eef4ea;border-radius:12px">
      <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GRIS}">Autorización de cobro</p>
      <p style="margin:0;font-family:${FUENTE};font-size:13px;line-height:1.55;color:#33453a">
        ${textoDeAutorizacionConfirmado(ins.cuotas, ins.tarjetaResumen)}
      </p>
      ${
        ins.autorizacionCobro
          ? `<p style="margin:8px 0 0;font-family:${MONO};font-size:11px;color:${GRIS}">Aceptada el ${new Date(ins.autorizacionCobro.aceptadaEn).toLocaleString("es-CO")}</p>`
          : ""
      }
    </div>`;
  return {
    asunto: `Plan de 4 cuotas activo — cupo reservado en ${cat?.nombre}`,
    html: envoltura({
      eyebrow: "Plan de cuotas activo",
      titulo: "Cupo reservado. Vas 1 de 4.",
      colorEyebrow: NARANJA,
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, activaste el plan de ${ins.cuotas.length} cuotas. Llevas ${pesos(ins.pagado)} de ${pesos(ins.total)}. Próxima cuota: ${siguiente ? `${pesos(siguiente.monto)} el ${fechaLarga(siguiente.vence)}` : "—"}.`,
  };
}

export function cuotaPagada(ins: Inscripcion, numero: number): PlantillaCorreo {
  const cuota = ins.cuotas.find((c) => c.numero === numero)!;
  const siguiente = proximaCuota(ins.cuotas);
  const saldo = saldoPendiente(ins.cuotas);
  const cuerpo =
    parrafo(
      `Cobramos ${pesos(cuota.monto)} a tu tarjeta •••• ${ins.tarjetaResumen?.ultimos4 ?? ""}. Van ${numero} de ${ins.cuotas.length}.`,
    ) +
    barraProgreso(ins.pagado, ins.total) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">
      ${filaDato("Cuota cobrada", `#${numero} de ${ins.cuotas.length}`)}
      ${filaDato("Comprobante Wompi", cuota.transaccionId ?? "—")}
      ${filaDato("Te falta", pesos(saldo), true)}
    </table>` +
    (siguiente
      ? parrafo(
          `Siguiente cobro: <strong>${pesos(siguiente.monto)} el ${fechaLarga(siguiente.vence)}</strong>.`,
        )
      : "") +
    boton("Ver el detalle", urlPortal(ins));
  return {
    asunto: `Cuota ${numero} de ${ins.cuotas.length} pagada — te faltan ${pesos(saldo)}`,
    html: envoltura({
      eyebrow: `Cuota ${numero}/${ins.cuotas.length}`,
      titulo: `Recibimos ${pesos(cuota.monto)}.`,
      cuerpo,
      ins,
    }),
    texto: `Cuota ${numero} de ${ins.cuotas.length} pagada (${pesos(cuota.monto)}). Saldo pendiente: ${pesos(saldo)}.`,
  };
}

export function recordatorioCuota(
  ins: Inscripcion,
  numero: number,
  dias: number,
): PlantillaCorreo {
  const cuota = ins.cuotas.find((c) => c.numero === numero)!;
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, ${cuando} cobramos la cuota ${numero} de ${ins.cuotas.length} — <strong>${pesos(cuota.monto)}</strong> — a tu tarjeta ${ins.tarjetaResumen?.marca ?? ""} •••• ${ins.tarjetaResumen?.ultimos4 ?? ""}. No tienes que hacer nada; esto es solo para que no te tome por sorpresa.`,
    ) +
    barraProgreso(ins.pagado, ins.total) +
    parrafo(
      `Si cambiaste de tarjeta o prefieres pagar el saldo completo, hazlo desde tu inscripción antes del ${fechaLarga(cuota.vence)}.`,
    ) +
    boton("Actualizar o pagar ahora", urlPortal(ins), "#ffffff");
  return {
    asunto: `Cobramos ${pesos(cuota.monto)} ${cuando} — cuota ${numero}/${ins.cuotas.length}`,
    html: envoltura({
      eyebrow: `Cobro ${cuando}`,
      titulo: `Cuota ${numero} de ${ins.cuotas.length}: ${pesos(cuota.monto)}.`,
      colorEyebrow: "#63e6ff",
      cuerpo,
      ins,
    }),
    texto: `Recordatorio: cobramos ${pesos(cuota.monto)} ${cuando} (cuota ${numero}/${ins.cuotas.length}).`,
  };
}

export function cuotaFallida(ins: Inscripcion, numero: number): PlantillaCorreo {
  const cuota = ins.cuotas.find((c) => c.numero === numero)!;
  const cuerpo =
    parrafo(
      `El banco rechazó el cobro de <strong>${pesos(cuota.monto)}</strong> a tu tarjeta •••• ${ins.tarjetaResumen?.ultimos4 ?? ""}. Tu cupo sigue reservado y lo reintentamos automáticamente en 48 horas.`,
    ) +
    (cuota.ultimoError
      ? `<p style="margin:0 0 16px;padding:12px 14px;background:#ffe9f1;border:2px solid ${MAGENTA};border-radius:12px;font-family:${FUENTE};font-size:14px;color:${TINTA}"><strong>Motivo del banco:</strong> ${cuota.ultimoError}</p>`
      : "") +
    parrafo(
      `Para resolverlo ahora: paga esta cuota con otra tarjeta o con PSE desde tu inscripción.`,
    ) +
    boton("Pagar con otro medio", urlPortal(ins), MAGENTA) +
    parrafo(
      `Después de tres intentos fallidos liberamos el cupo, así que mejor no lo dejes para el final.`,
    );
  return {
    asunto: `No pudimos cobrar la cuota ${numero} — tu cupo sigue reservado`,
    html: envoltura({
      eyebrow: "Cobro rechazado",
      titulo: "El banco rechazó el cobro.",
      colorEyebrow: MAGENTA,
      cuerpo,
      ins,
    }),
    texto: `No pudimos cobrar la cuota ${numero} (${pesos(cuota.monto)}). Reintentamos en 48 horas o puedes pagar con otro medio.`,
  };
}

export function inscripcionSaldada(ins: Inscripcion): PlantillaCorreo {
  const cat = categoriaPorCodigo(ins.categoriaCodigo);
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, pagaste la última cuota. Tu inscripción a <strong>${cat?.nombre}</strong> queda saldada: ${pesos(ins.total)} en ${ins.cuotas.length} cuotas, sin un peso de recargo.`,
    ) +
    barraProgreso(ins.total, ins.total) +
    tablaCuotas(ins) +
    parrafo(
      `Nos vemos en la línea de largada el ${EVENTO.fechaLegible} en ${EVENTO.lugar}. Te escribiremos en marzo con la entrega de kits y la charla técnica.`,
    ) +
    boton("Ver mi inscripción", urlPortal(ins));
  return {
    asunto: `Inscripción saldada — nos vemos en ${EVENTO.lugar}`,
    html: envoltura({
      eyebrow: "Pago completo",
      titulo: "Saldaste tu inscripción.",
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, tu inscripción quedó saldada: ${pesos(ins.total)} en ${ins.cuotas.length} cuotas.`,
  };
}

export const PLANTILLAS = {
  "inscripcion-confirmada": inscripcionConfirmada,
  "plan-cuotas-activado": planCuotasActivado,
  "inscripcion-saldada": inscripcionSaldada,
} as const;
