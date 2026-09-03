import {
  CUENTAS_RECAUDO,
  EVENTO,
  FECHA_LIMITE_ABONOS,
  NOMBRE_COMPLETO,
  PRENDAS,
  cuentaDeCanal,
  recorridoDe,
} from "../catalogo";
import {
  cuotasDelPlan,
  fechaLarga,
  pesos,
  planDeCuotas,
  proximaCuota,
  proximaCuotaDelPlan,
  saldoPendiente,
} from "../dinero";
import type { Abono, DatosCiclista, Inscripcion } from "../tipos";
import { categoriaPorCodigo } from "../catalogo";

/**
 * Plantillas HTML para correo. Tablas e inline styles a propósito:
 * Gmail y Outlook descartan <style> externo, flexbox y fuentes web.
 * El diseño imita la marca con lo que sí sobrevive: color, peso y bloques.
 */

const TINTA = "#08213a";
const BRUMA = "#dfeefc";
const NUBE = "#ffffff";
const MAREA = "#b8dcf7";
const RIO = "#0b4f8f";
const TURQUESA = "#2fd2ef";
const SOL = "#ffb02e";
const ALERTA = "#c81e3c";
/** El rojo de error como relleno, para que la tinta encima siga leyéndose. */
const ALERTA_SUAVE = "#ffdde2";
const GRIS = "#4f6578";
const VERDE = "#2f7d32";
const LINEA = "#d6e4f1";

const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

export type PlantillaCorreo = {
  asunto: string;
  html: string;
  texto: string;
};

function boton(texto: string, url: string, color = TURQUESA): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${color};border:3px solid ${TINTA};border-radius:14px">
    <a href="${url}" style="display:inline-block;padding:14px 26px;font-family:${FUENTE};font-size:16px;font-weight:800;color:${TINTA};text-decoration:none;letter-spacing:-0.01em">${texto}</a>
  </td></tr></table>`;
}

function barraProgreso(pagado: number, total: number): string {
  /*
   * Dos porcentajes distintos a propósito. El de la barra tiene un mínimo
   * visible para que no parezca rota; el del texto es el real. Antes se usaba
   * el mismo para los dos y un correo con cero pagado decía "2% abonado" —
   * afirmar de más sobre el dinero de alguien es la peor manera de ahorrarse
   * un píxel.
   */
  const real = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0;
  const ancho = pagado > 0 ? Math.max(2, real) : 0;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:3px solid ${TINTA};border-radius:99px;background:#dbe9f7;margin:6px 0 14px">
    <tr>
      <td width="${ancho}%" style="background:${TURQUESA};height:18px;border-radius:99px;font-size:0;line-height:0">&nbsp;</td>
      <td style="font-size:0;line-height:0">&nbsp;</td>
    </tr>
  </table>
  <p style="margin:0;font-family:${MONO};font-size:13px;color:${GRIS}">${real}% abonado · ${pesos(pagado)} de ${pesos(total)}</p>`;
}

function filaDato(etiqueta: string, valor: string, resaltar = false): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${LINEA};font-family:${FUENTE};font-size:14px;color:${GRIS}">${etiqueta}</td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid ${LINEA};font-family:${resaltar ? MONO : FUENTE};font-size:${resaltar ? "16px" : "14px"};font-weight:700;color:${TINTA}">${valor}</td>
  </tr>`;
}

function tablaCuotas(ins: Inscripcion): string {
  const filas = ins.cuotas
    .map((c) => {
      const color =
        c.estado === "PAGADA"
          ? VERDE
          : c.estado === "VENCIDA" || c.estado === "FALLIDA"
            ? ALERTA
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
        <td style="padding:11px 0;border-bottom:1px solid ${LINEA};font-family:${MONO};font-size:14px;font-weight:700;color:${TINTA}">Cuota ${c.numero}/${ins.cuotas.length}</td>
        <td style="padding:11px 0;border-bottom:1px solid ${LINEA};font-family:${FUENTE};font-size:13px;color:${GRIS}">${fechaLarga(c.vence)}</td>
        <td align="right" style="padding:11px 0;border-bottom:1px solid ${LINEA};font-family:${MONO};font-size:14px;font-weight:700;color:${TINTA}">${pesos(c.monto)}</td>
        <td align="right" style="padding:11px 0 11px 12px;border-bottom:1px solid ${LINEA};font-family:${FUENTE};font-size:12px;font-weight:700;color:${color}">${etiqueta}</td>
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
  const colorEyebrow = opciones.colorEyebrow ?? TURQUESA;
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title></head>
<body style="margin:0;padding:0;background:${BRUMA}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRUMA};padding:28px 14px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">

      <!-- Cabecera -->
      <tr><td style="padding:0 0 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-family:${FUENTE};font-size:19px;font-weight:800;color:${TINTA};letter-spacing:-0.03em">
              ${EVENTO.wordmark.inicio}&nbsp;<span style="color:${RIO}">${EVENTO.wordmark.acento}</span>
              <span style="font-family:${MONO};font-size:12px;color:${GRIS}"> ${EVENTO.wordmark.sufijo}</span>
            </td>
            <td align="right" style="font-family:${MONO};font-size:12px;color:${GRIS};letter-spacing:0.06em">
              ${EVENTO.fechaLegible.toUpperCase()}
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Tarjeta -->
      <tr><td style="background:${NUBE};border:3px solid ${TINTA};border-radius:22px;padding:32px 30px">
        <p style="margin:0 0 10px;font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${TINTA};background:${colorEyebrow};display:inline-block;padding:5px 11px;border-radius:99px;border:2px solid ${TINTA}">${eyebrow}</p>
        <h1 style="margin:8px 0 16px;font-family:${FUENTE};font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-0.035em;color:${TINTA}">${titulo}</h1>
        ${cuerpo}
      </td></tr>

      <!-- Pie -->
      <tr><td style="padding:22px 6px 0">
        <p style="margin:0 0 8px;font-family:${MONO};font-size:12px;color:${GRIS}">
          Referencia <span style="color:${RIO};font-weight:700">${ins.referencia}</span> · ${ins.ciclista.nombres} ${ins.ciclista.apellidos}
        </p>
        <p style="margin:0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${GRIS}">
          ${NOMBRE_COMPLETO} · ${EVENTO.lugar}<br>
          ¿Dudas con tu inscripción? Escríbenos a
          <a href="mailto:${EVENTO.correoContacto}" style="color:${RIO};text-decoration:none">${EVENTO.correoContacto}</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function parrafo(texto: string): string {
  return `<p style="margin:0 0 16px;font-family:${FUENTE};font-size:15px;line-height:1.62;color:#2b4257">${texto}</p>`;
}

function nombreCorto(ins: Inscripcion): string {
  return ins.ciclista.nombres.split(" ")[0];
}

/**
 * A dónde transfiere el ciclista.
 *
 * Va dentro del correo y no como enlace: quien está por transferir tiene la
 * app del banco abierta, no el navegador, y buscar la página otra vez es
 * justo donde se abandona el pago.
 */
function tablaCuentas(): string {
  const filas = CUENTAS_RECAUDO.map(
    (c) => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid ${LINEA};font-family:${FUENTE};font-size:14px;color:${GRIS}">${c.entidad}<span style="display:block;font-size:12px;color:${GRIS}">${c.tipo}</span></td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid ${LINEA};font-family:${MONO};font-size:16px;font-weight:700;color:${TINTA}">${c.numero}</td>
    </tr>`,
  ).join("");
  return `<div style="margin:22px 0 6px;padding:16px 18px;background:#eaf3fc;border-radius:14px">
    <p style="margin:0 0 4px;font-family:${MONO};font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GRIS}">Dónde transferir</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table>
    <p style="margin:10px 0 0;font-family:${FUENTE};font-size:12px;line-height:1.55;color:${GRIS}">
      Todas las cuentas están a nombre de <strong>${CUENTAS_RECAUDO[0].titular}</strong>.
      Guarda el comprobante: lo vas a necesitar para subirlo.
    </p>
  </div>`;
}

/** El plazo de recepción, dicho igual en todos los correos. */
function avisoDeCierre(): string {
  return parrafo(
    `Recibimos comprobantes hasta el <strong>${fechaLarga(FECHA_LIMITE_ABONOS)}</strong>. Después de esa fecha no podemos recibir ninguno más.`,
  );
}

/** Las cuotas del plan de esta inscripción, con sus montos y sus fechas. */
function cuotasDeLaInscripcion(ins: Inscripcion) {
  return planDeCuotas(ins.total, ins.creadaEn, cuotasDelPlan(ins.plan));
}

/**
 * Todas las cuotas del plan con todas sus fechas.
 *
 * Va en el correo entero y no como enlace porque es lo único que el ciclista
 * necesita para no pasarse de fecha: cuánto y cuándo, todas las veces.
 */
function tablaDelPlan(ins: Inscripcion): string {
  const cuotas = cuotasDeLaInscripcion(ins);
  const filas = cuotas
    .map(
      (c) => `<tr>
        <td style="padding:11px 0;border-bottom:1px solid ${LINEA};font-family:${MONO};font-size:14px;font-weight:700;color:${TINTA}">Cuota ${c.numero} de ${cuotas.length}</td>
        <td style="padding:11px 0;border-bottom:1px solid ${LINEA};font-family:${FUENTE};font-size:13px;color:${GRIS}">${c.numero === 1 ? "Al inscribirte" : `Hasta el ${fechaLarga(c.vence)}`}</td>
        <td align="right" style="padding:11px 0;border-bottom:1px solid ${LINEA};font-family:${MONO};font-size:15px;font-weight:700;color:${TINTA}">${pesos(c.monto)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">${filas}</table>`;
}

/** Cuadro de motivo, para lo que el ciclista tiene que leer sí o sí. */
function recuadroMotivo(titulo: string, texto: string): string {
  return `<p style="margin:0 0 16px;padding:12px 14px;background:${ALERTA_SUAVE};border:2px solid ${ALERTA};border-radius:12px;font-family:${FUENTE};font-size:14px;line-height:1.55;color:${TINTA}"><strong>${titulo}:</strong> ${texto}</p>`;
}

function nombreDeCanal(abono: Abono): string {
  return cuentaDeCanal(abono.canal)?.entidad ?? abono.canal;
}

function urlPortal(ins: Inscripcion): string {
  /*
   * El respaldo es el dominio real, no localhost: `URL_PUBLICA` no está puesta
   * en producción y todos los enlaces de los correos apuntaban a la máquina de
   * quien los generó. En un correo que ya salió, eso no se puede arreglar.
   */
  const base = process.env.URL_PUBLICA ?? "https://www.santanderxtreme.com";
  return `${base}/mi-inscripcion?ref=${ins.referencia}`;
}

/* ================================ Plantillas ================================ */

export function inscripcionConfirmada(ins: Inscripcion): PlantillaCorreo {
  const cat = categoriaPorCodigo(ins.categoriaCodigo);
  const recorrido = recorridoDe(cat);
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, tu cupo está asegurado. Recibimos el pago completo y ya apareces en la lista de largada de <strong>${cat?.nombre}</strong>.`,
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px">
      ${filaDato("Categoría", cat?.nombre ?? ins.categoriaCodigo)}
      ${recorrido ? filaDato("Recorrido", recorrido) : ""}
      ${filaDato("Fecha de carrera", EVENTO.fechaLegible)}
      ${PRENDAS.map((p) => filaDato(p.nombre, ins.tallas[p.campo])).join("")}
      ${filaDato("Total pagado", pesos(ins.total), true)}
    </table>` +
    boton("Ver mi inscripción", urlPortal(ins)) +
    parrafo(
      `Guarda esta referencia: la vas a necesitar para retirar tu kit el día previo a la carrera.`,
    );
  return {
    asunto: `Estás dentro — ${cat?.nombre} · ${NOMBRE_COMPLETO}`,
    html: envoltura({
      eyebrow: "Inscripción confirmada",
      titulo: "Tu cupo quedó asegurado.",
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, tu inscripción al ${NOMBRE_COMPLETO} quedó confirmada. Categoría ${cat?.nombre}. Total pagado ${pesos(ins.total)}. Referencia ${ins.referencia}.`,
  };
}

export function planCuotasActivado(ins: Inscripcion): PlantillaCorreo {
  const cat = categoriaPorCodigo(ins.categoriaCodigo);
  const plan = cuotasDeLaInscripcion(ins);
  const siguiente = proximaCuotaDelPlan(plan, ins.pagado) ?? plan[plan.length - 1];
  const faltan = plan.length - siguiente.numero + 1;
  const vence = siguiente.vence;
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, tu cupo en <strong>${cat?.nombre}</strong> ya está reservado con la primera cuota. ${
        faltan === 1
          ? `Queda una sola cuota más, de <strong>${pesos(siguiente.monto)}</strong>, con plazo hasta el <strong>${fechaLarga(vence)}</strong>.`
          : `Quedan ${faltan} cuotas: la próxima es de <strong>${pesos(siguiente.monto)}</strong>, con plazo hasta el <strong>${fechaLarga(vence)}</strong>.`
      }`,
    ) +
    barraProgreso(ins.pagado, ins.total) +
    tablaDelPlan(ins) +
    parrafo(
      `Los montos y las fechas son fijos: no es "abona lo que puedas". Si el ${fechaLarga(vence)} pasa con esa cuota sin pagar, la inscripción queda vencida y hay que hablarlo con la organización.`,
    ) +
    tablaCuentas() +
    boton(`Subir el comprobante de la cuota ${siguiente.numero}`, urlPortal(ins)) +
    parrafo(
      `Una cuota cuenta cuando la verificamos, no cuando la transfieres: revisamos cada comprobante a mano y te avisamos por correo.`,
    ) +
    avisoDeCierre();
  return {
    asunto: `Cupo reservado — falta la cuota ${siguiente.numero} de ${pesos(siguiente.monto)} · ${cat?.nombre}`,
    html: envoltura({
      eyebrow: `Pago en ${plan.length} cuotas`,
      titulo: `Cupo reservado. Vas por ${pesos(ins.pagado)} de ${pesos(ins.total)}.`,
      colorEyebrow: SOL,
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, tu cupo quedó reservado. Falta la cuota ${siguiente.numero} de ${plan.length}, de ${pesos(siguiente.monto)}, con plazo hasta el ${fechaLarga(vence)}. Transfiere y sube el comprobante desde ${urlPortal(ins)}.`,
  };
}

export function cuotaPagada(ins: Inscripcion, numero: number): PlantillaCorreo {
  const cuota = ins.cuotas.find((c) => c.numero === numero)!;
  const siguiente = proximaCuota(ins.cuotas);
  const saldo = saldoPendiente(ins.cuotas);
  const cuerpo =
    parrafo(
      `Confirmamos ${pesos(cuota.monto)} de tu inscripción. Van ${numero} de ${ins.cuotas.length} pagos del plan.`,
    ) +
    barraProgreso(ins.pagado, ins.total) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">
      ${filaDato("Pago confirmado", `#${numero} de ${ins.cuotas.length}`)}
      ${filaDato("Te falta", pesos(saldo), true)}
    </table>` +
    (siguiente
      ? parrafo(
          `Siguiente pago sugerido: <strong>${pesos(siguiente.monto)} hacia el ${fechaLarga(siguiente.vence)}</strong>. Transfieres tú y subes el comprobante.`,
        ) + tablaCuentas()
      : "") +
    boton("Ver el detalle", urlPortal(ins));
  return {
    asunto: `Pago ${numero} de ${ins.cuotas.length} confirmado — te faltan ${pesos(saldo)}`,
    html: envoltura({
      eyebrow: `Pago ${numero}/${ins.cuotas.length}`,
      titulo: `Recibimos ${pesos(cuota.monto)}.`,
      cuerpo,
      ins,
    }),
    texto: `Pago ${numero} de ${ins.cuotas.length} confirmado (${pesos(cuota.monto)}). Saldo pendiente: ${pesos(saldo)}.`,
  };
}

/**
 * El correo que más cambia con el pago manual.
 *
 * Con tarjeta decía "no tienes que hacer nada". Ahora es exactamente al revés:
 * nadie cobra solo, así que si el ciclista no transfiere, no pasa nada — y se
 * queda sin cupo. El texto tiene que pedir la acción sin ambigüedad.
 */
export function recordatorioCuota(
  ins: Inscripcion,
  numero: number,
  dias: number,
): PlantillaCorreo {
  // Las inscripciones por transferencia tienen la tabla `cuotas` vacía —bajo
  // pago manual el libro de dinero son los abonos—, así que el monto y la
  // fecha se derivan del saldo y del plan. La rama de `ins.cuotas` es solo
  // para las inscripciones viejas de la pasarela.
  const plan = cuotasDeLaInscripcion(ins);
  const delPlan = plan.find((c) => c.numero === numero);
  const deLaPasarela = ins.cuotas.find((c) => c.numero === numero);
  const enCuotas = !deLaPasarela && plan.length > 1 && !!delPlan;
  // El monto de una cuota intermedia es el suyo; el de la última, el saldo
  // entero —si una anterior se aprobó por menos, ese hueco se cobra ahora—.
  const esLaUltima = !delPlan || delPlan.numero === plan.length;
  const saldo = Math.max(0, ins.total - ins.pagado);
  const monto =
    deLaPasarela?.monto ?? (esLaUltima ? saldo : Math.min(delPlan!.monto, saldo));
  const vence = deLaPasarela?.vence ?? delPlan?.vence ?? FECHA_LIMITE_ABONOS;
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;
  const queEs = enCuotas
    ? `la <strong>cuota ${numero} de ${plan.length}</strong> de tu inscripción${esLaUltima ? " —la última—" : ""}`
    : `lo que falta de tu inscripción`;
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, vence ${cuando} ${queEs}: <strong>${pesos(monto)}</strong>, el ${fechaLarga(vence)}. <strong>Este pago no sale solo:</strong> tienes que transferir a una de nuestras cuentas y subir el comprobante para que cuente.`,
    ) +
    barraProgreso(ins.pagado, ins.total) +
    (enCuotas ? tablaDelPlan(ins) : "") +
    tablaCuentas() +
    boton("Subir mi comprobante", urlPortal(ins), TURQUESA) +
    parrafo(
      `El monto es fijo: este comprobante tiene que cubrir ${pesos(monto)}. Si ya transferiste y lo subiste, ignora este correo — puede que aún lo estemos revisando.`,
    ) +
    avisoDeCierre();
  return {
    asunto: `Vence ${cuando}: ${pesos(monto)} de tu inscripción — hay que transferir`,
    html: envoltura({
      eyebrow: `Vence ${cuando}`,
      titulo: `Te toca transferir ${pesos(monto)}.`,
      colorEyebrow: MAREA,
      cuerpo,
      ins,
    }),
    texto: `Recordatorio: vence ${cuando} (${fechaLarga(vence)}) el pago de ${pesos(monto)}. Nadie cobra automáticamente: transfiere y sube el comprobante en ${urlPortal(ins)}.`,
  };
}

/**
 * Rechazo de un comprobante. Reemplaza al viejo "cobro rechazado" de tarjeta.
 *
 * Lo único que le importa al ciclista es qué salió mal y qué hacer ahora, así
 * que el motivo va en un recuadro y no diluido en un párrafo. El rechazo no
 * gasta ninguno de sus abonos y no le quita el cupo
 * (docs/decisiones-pago-manual.md §7): decirlo evita el correo de pánico.
 */
export function evidenciaRechazada(
  ins: Inscripcion,
  datos: { motivo: string; monto: number; saldo: number },
): PlantillaCorreo {
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, revisamos el comprobante que subiste por <strong>${pesos(datos.monto)}</strong> y no lo pudimos dar por bueno. <strong>Tu cupo sigue reservado</strong> y este intento no gasta ninguno de los ${cuotasDelPlan(ins.plan)} comprobantes de tu plan.`,
    ) +
    recuadroMotivo("Por qué lo rechazamos", datos.motivo) +
    parrafo(
      `<strong>Cómo lo arreglas:</strong> corrige lo que dice el motivo y vuelve a subir el comprobante desde tu inscripción. Si el problema es que la imagen no se lee, sirve la captura del detalle de la transferencia en la app del banco, o el PDF que te llega por correo.`,
    ) +
    boton("Volver a subir el comprobante", urlPortal(ins), ALERTA_SUAVE) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 6px">
      ${filaDato("Total de tu inscripción", pesos(ins.total))}
      ${filaDato("Te falta", pesos(datos.saldo), true)}
    </table>` +
    avisoDeCierre();
  return {
    asunto: `No pudimos verificar tu comprobante — tu cupo sigue reservado`,
    html: envoltura({
      eyebrow: "Comprobante rechazado",
      titulo: "No pudimos verificar tu pago.",
      colorEyebrow: ALERTA_SUAVE,
      cuerpo,
      ins,
    }),
    texto: `Rechazamos el comprobante de ${pesos(datos.monto)}. Motivo: ${datos.motivo}. Tu cupo sigue reservado; vuelve a subirlo en ${urlPortal(ins)}.`,
  };
}

/**
 * Camino Wompi, en retirada. Se mantiene solo para que las llamadas de la
 * pasarela sigan compilando mientras se desmonta; el motivo que muestra es el
 * que devolvió el banco. Bajo pago manual el que se usa es
 * `evidenciaRechazada` directamente.
 */
export function cuotaFallida(ins: Inscripcion, numero: number): PlantillaCorreo {
  const cuota = ins.cuotas.find((c) => c.numero === numero);
  return evidenciaRechazada(ins, {
    motivo: cuota?.ultimoError ?? "No pudimos confirmar el pago.",
    monto: cuota?.monto ?? ins.total,
    saldo: saldoPendiente(ins.cuotas),
  });
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
      `Nos vemos en la línea de largada el ${EVENTO.fechaLegible} en ${EVENTO.lugar}. Te escribiremos con la entrega de kits y la charla técnica.`,
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

/* --------------------------- Pago manual por transferencia ----------------- */

/**
 * Acuse de recibo del comprobante.
 *
 * Su único trabajo es dejar clarísima una cosa: recibido no es verificado. Sin
 * este correo el ciclista asume que ya pagó, y si después se rechaza, el
 * rechazo llega como una sorpresa desagradable.
 */
export function evidenciaRecibida(
  ins: Inscripcion,
  abono: Abono,
  datos: { verificado: number; saldo: number },
): PlantillaCorreo {
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, recibimos tu comprobante de <strong>${pesos(abono.montoDeclarado)}</strong> por ${nombreDeCanal(abono)}. Lo revisa una persona del equipo contra el extracto, así que <strong>todavía no cuenta como pagado</strong>: te escribimos apenas quede verificado.`,
    ) +
    barraProgreso(datos.verificado, ins.total) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">
      ${filaDato("Cuota", `${abono.numero} de ${cuotasDelPlan(ins.plan)}`)}
      ${filaDato("Declaraste", pesos(abono.montoDeclarado), true)}
      ${filaDato("Canal", nombreDeCanal(abono))}
      ${abono.transferidoEl ? filaDato("Fecha de la transferencia", fechaLarga(abono.transferidoEl)) : ""}
      ${abono.referenciaExterna ? filaDato("Número de comprobante", abono.referenciaExterna) : ""}
      ${filaDato("Verificado hasta ahora", pesos(datos.verificado))}
      ${filaDato("Saldo (sin contar este)", pesos(datos.saldo))}
    </table>` +
    boton("Ver el estado de mi pago", urlPortal(ins)) +
    parrafo(
      `Si te equivocaste en algún dato, escríbenos a <a href="mailto:${EVENTO.correoContacto}" style="color:${RIO}">${EVENTO.correoContacto}</a> antes de que lo revisemos.`,
    );
  return {
    asunto: `Recibimos tu comprobante de ${pesos(abono.montoDeclarado)} — falta verificarlo`,
    html: envoltura({
      eyebrow: "Comprobante recibido",
      titulo: "Lo tenemos. Ahora lo verificamos.",
      colorEyebrow: MAREA,
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, recibimos tu comprobante de ${pesos(abono.montoDeclarado)} vía ${nombreDeCanal(abono)}. Todavía no cuenta como pagado: te avisamos cuando lo verifiquemos.`,
  };
}

/**
 * El abono quedó confirmado. Lo que el ciclista busca aquí es una sola cifra:
 * cuánto le falta.
 *
 * Si aprobamos por un monto distinto al que declaró, se dice — descubrirlo
 * después cuadrando cuentas es lo que produce el reclamo.
 */
export function evidenciaVerificada(
  ins: Inscripcion,
  abono: Abono,
  datos: { verificado: number; saldo: number },
): PlantillaCorreo {
  const aprobado = abono.montoAprobado ?? abono.montoDeclarado;
  const difiere = aprobado !== abono.montoDeclarado;
  // Lo que sigue es la próxima cuota que el dinero verificado no cubre, no "la
  // segunda": con tres cuotas puede quedar más de una por delante.
  const plan = cuotasDeLaInscripcion(ins);
  const siguiente = proximaCuotaDelPlan(plan, datos.verificado);
  const esLaUltima = !siguiente || siguiente.numero === plan.length;
  const aPagar = esLaUltima
    ? datos.saldo
    : Math.min(siguiente!.monto, datos.saldo);
  const queSigue = siguiente
    ? esLaUltima
      ? `Falta la <strong>última cuota: ${pesos(datos.saldo)}</strong>, con plazo hasta el <strong>${fechaLarga(siguiente.vence)}</strong>. Es un solo comprobante más y tiene que cubrir ese monto completo.`
      : `Sigue la <strong>cuota ${siguiente.numero} de ${plan.length}: ${pesos(aPagar)}</strong>, con plazo hasta el <strong>${fechaLarga(siguiente.vence)}</strong>. Un comprobante por cuota, y cada uno tiene que cubrir su monto completo.`
    : `Falta cubrir <strong>${pesos(datos.saldo)}</strong>, con plazo hasta el <strong>${fechaLarga(FECHA_LIMITE_ABONOS)}</strong>.`;
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, verificamos tu comprobante: <strong>${pesos(aprobado)}</strong> entraron a tu inscripción.`,
    ) +
    (difiere
      ? recuadroMotivo(
          "Ojo con el monto",
          `Tú declaraste ${pesos(abono.montoDeclarado)} y lo que confirmamos en la cuenta fueron ${pesos(aprobado)}. Es esta última cifra la que cuenta. Si no te cuadra, escríbenos a ${EVENTO.correoContacto}.`,
        )
      : "") +
    barraProgreso(datos.verificado, ins.total) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">
      ${filaDato("Cuota verificada", pesos(aprobado))}
      ${filaDato("Llevas pagado", pesos(datos.verificado))}
      ${filaDato("Te falta", pesos(datos.saldo), true)}
    </table>` +
    parrafo(queSigue) +
    tablaDelPlan(ins) +
    tablaCuentas() +
    boton(
      siguiente
        ? `Subir el comprobante de la cuota ${siguiente.numero}`
        : "Subir el siguiente comprobante",
      urlPortal(ins),
    ) +
    avisoDeCierre();
  return {
    asunto: `Cuota verificada: ${pesos(aprobado)} — te faltan ${pesos(datos.saldo)}`,
    html: envoltura({
      eyebrow: "Cuota verificada",
      titulo: `Confirmamos ${pesos(aprobado)}.`,
      cuerpo,
      ins,
    }),
    texto: `Verificamos tu cuota de ${pesos(aprobado)}. Llevas ${pesos(datos.verificado)} de ${pesos(ins.total)} y te faltan ${pesos(datos.saldo)}.`,
  };
}

/**
 * Saldo en cero por abonos. Es el correo que habilita el dorsal
 * (docs/decisiones-pago-manual.md §3), así que lo dice explícitamente.
 */
export function inscripcionCompleta(
  ins: Inscripcion,
  datos?: { excedente?: number },
): PlantillaCorreo {
  const cat = categoriaPorCodigo(ins.categoriaCodigo);
  const recorrido = recorridoDe(cat);
  const sobra = datos?.excedente ?? 0;
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, cubriste el total. Tu inscripción a <strong>${cat?.nombre}</strong> queda pagada por completo: ${pesos(ins.total)}, sin un peso de recargo.`,
    ) +
    barraProgreso(ins.total, ins.total) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">
      ${filaDato("Categoría", cat?.nombre ?? ins.categoriaCodigo)}
      ${recorrido ? filaDato("Recorrido", recorrido) : ""}
      ${filaDato("Fecha de carrera", EVENTO.fechaLegible)}
      ${PRENDAS.map((p) => filaDato(p.nombre, ins.tallas[p.campo])).join("")}
      ${filaDato("Total pagado", pesos(ins.total), true)}
    </table>` +
    (sobra > 0
      ? recuadroMotivo(
          "Transferiste de más",
          `Nos entraron ${pesos(sobra)} por encima del total. No lo devolvemos automáticamente: escríbenos a ${EVENTO.correoContacto} y lo resolvemos contigo.`,
        )
      : "") +
    parrafo(
      `Ya puedes ver e imprimir tu constancia de inscripción con el número de dorsal. Nos vemos en la línea de largada el ${EVENTO.fechaLegible} en ${EVENTO.lugar}.`,
    ) +
    boton("Ver mi inscripción", urlPortal(ins)) +
    parrafo(
      `Guarda la referencia <strong>${ins.referencia}</strong>: la vas a necesitar para retirar tu kit el día previo a la carrera.`,
    );
  return {
    asunto: `Inscripción pagada — nos vemos en ${EVENTO.lugar}`,
    html: envoltura({
      eyebrow: "Pago completo",
      titulo: "Tu inscripción quedó pagada.",
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, tu inscripción quedó pagada por completo: ${pesos(ins.total)}. Referencia ${ins.referencia}.`,
  };
}

/**
 * Cesión del cupo a otra persona.
 *
 * La política del cliente es no devolver el dinero pero sí permitir ceder la
 * inscripción. Este correo va a la persona NUEVA, que muy probablemente nunca
 * ha tratado con nosotros: tiene que explicarle qué acaba de recibir, y dejar
 * claro qué se conserva (referencia, categoría, lo pagado) y qué falta.
 */
export function cambioDeCompetidor(
  ins: Inscripcion,
  datos: {
    anterior: Pick<DatosCiclista, "nombres" | "apellidos">;
    hechoPor: string;
    saldo: number;
  },
): PlantillaCorreo {
  const cat = categoriaPorCodigo(ins.categoriaCodigo);
  const cuerpo =
    parrafo(
      `${nombreCorto(ins)}, la inscripción que estaba a nombre de <strong>${datos.anterior.nombres} ${datos.anterior.apellidos}</strong> quedó a tu nombre. Conserva la misma referencia, la misma categoría y todo lo que ya se había abonado.`,
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px">
      ${filaDato("Referencia", ins.referencia, true)}
      ${filaDato("Categoría", cat?.nombre ?? ins.categoriaCodigo)}
      ${filaDato("Fecha de carrera", EVENTO.fechaLegible)}
      ${PRENDAS.map((p) => filaDato(p.nombre, ins.tallas[p.campo])).join("")}
      ${filaDato("Total", pesos(ins.total))}
      ${filaDato("Ya abonado", pesos(ins.pagado))}
      ${filaDato("Te falta", pesos(datos.saldo), true)}
    </table>` +
    (datos.saldo > 0
      ? parrafo(
          `Faltan <strong>${pesos(datos.saldo)}</strong> por abonar. Transfieres a una de estas cuentas y subes el comprobante desde tu inscripción.`,
        ) +
        tablaCuentas() +
        boton("Ver mi inscripción", urlPortal(ins)) +
        avisoDeCierre()
      : parrafo(`No queda saldo pendiente: la inscripción está pagada al día.`) +
        boton("Ver mi inscripción", urlPortal(ins))) +
    parrafo(
      `El cambio lo hizo ${datos.hechoPor} de la organización el ${new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}. Si algún dato tuyo quedó mal, escríbenos a <a href="mailto:${EVENTO.correoContacto}" style="color:${RIO}">${EVENTO.correoContacto}</a>.`,
    );
  return {
    asunto: `La inscripción ${ins.referencia} quedó a tu nombre`,
    html: envoltura({
      eyebrow: "Cambio de competidor",
      titulo: "El cupo ahora es tuyo.",
      colorEyebrow: SOL,
      cuerpo,
      ins,
    }),
    texto: `${nombreCorto(ins)}, la inscripción ${ins.referencia} (${cat?.nombre}) pasó a tu nombre. Total ${pesos(ins.total)}, ya abonado ${pesos(ins.pagado)}, te falta ${pesos(datos.saldo)}.`,
  };
}

/**
 * Índice de plantillas por el nombre con el que se registran en `correos`.
 *
 * Las firmas no son homogéneas a propósito: cada correo necesita datos
 * distintos y forzar un parámetro común obligaría a recalcular saldos dentro
 * de la plantilla, que es justo donde no debe vivir esa cuenta.
 */
export const PLANTILLAS = {
  "inscripcion-confirmada": inscripcionConfirmada,
  "plan-cuotas-activado": planCuotasActivado,
  "cuota-pagada": cuotaPagada,
  "recordatorio-cuota": recordatorioCuota,
  "cuota-fallida": cuotaFallida,
  "inscripcion-saldada": inscripcionSaldada,
  "evidencia-recibida": evidenciaRecibida,
  "evidencia-verificada": evidenciaVerificada,
  "evidencia-rechazada": evidenciaRechazada,
  "inscripcion-completa": inscripcionCompleta,
  "cambio-competidor": cambioDeCompetidor,
} as const;

export type NombrePlantilla = keyof typeof PLANTILLAS;
