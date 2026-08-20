import { EVENTO } from "./catalogo";
import { fechaLarga, pesos } from "./dinero";
import type { Cuota } from "./tipos";

/**
 * Texto de autorización de cobro recurrente.
 *
 * Las reglas de tarjeta archivada de Visa y Mastercard exigen que el
 * tarjetahabiente autorice los cobros futuros conociendo montos y fechas, y
 * que el comercio conserve constancia de esa autorización. Es lo primero que
 * pide el banco cuando alguien desconoce un cobro: sin constancia, el
 * contracargo lo pierde el comercio.
 *
 * Se genera en un solo lugar para que el texto que firma el ciclista, el que
 * guardamos como evidencia y el que va en el correo sean literalmente el
 * mismo.
 */

/** Las cuotas que se cobrarán solas: todas menos la primera, que paga ahora. */
export function cuotasAutomaticas(cuotas: Cuota[]): Cuota[] {
  return cuotas.filter((c) => c.numero > 1);
}

function listaDeCobros(cuotas: Cuota[]): string {
  const partes = cuotasAutomaticas(cuotas).map(
    (c) => `${pesos(c.monto)} el ${fechaLarga(c.vence)}`,
  );
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Antes de cobrar todavía no sabemos la tarjeta: el modal de Wompi la captura
 * después. Por eso el texto la nombra como "la tarjeta que registre".
 */
export function textoDeAutorizacion(cuotas: Cuota[]): string {
  return (
    `Autorizo a ${EVENTO.nombre} ${EVENTO.edicion} a cobrar automáticamente ` +
    `a la tarjeta que registre a continuación las cuotas de ${listaDeCobros(cuotas)}. ` +
    `Puedo cancelar escribiendo a ${EVENTO.correoContacto}.`
  );
}

/** El mismo texto, ya con la tarjeta, para el comprobante por correo. */
export function textoDeAutorizacionConfirmado(
  cuotas: Cuota[],
  tarjeta: { marca: string; ultimos4: string } | undefined,
): string {
  const medio = tarjeta
    ? `tu ${tarjeta.marca} ····${tarjeta.ultimos4}`
    : "tu tarjeta";
  return (
    `Autorizaste a ${EVENTO.nombre} ${EVENTO.edicion} a cobrar automáticamente ` +
    `a ${medio} las cuotas de ${listaDeCobros(cuotas)}. ` +
    `Puedes cancelar escribiendo a ${EVENTO.correoContacto}.`
  );
}
