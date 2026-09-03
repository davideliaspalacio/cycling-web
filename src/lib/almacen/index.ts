import "server-only";
import { randomUUID } from "node:crypto";
import { HAY_BASE_DE_DATOS } from "../db";
import { EVENTO } from "../catalogo";
import * as json from "./json";
import * as postgres from "./postgres";

/**
 * Único punto por donde la app toca la persistencia.
 *
 * Con DATABASE_URL usa Postgres; sin ella, el archivo JSON. Eso permite clonar
 * el repo y ver la demo completa sin montar nada, y a la vez tener
 * transacciones de verdad en producción. Nadie más en el código sabe cuál de
 * las dos está activa.
 */

const impl = HAY_BASE_DE_DATOS ? postgres : json;

export const MOTOR: "postgres" | "json" = HAY_BASE_DE_DATOS ? "postgres" : "json";

// Que quede dicho en los logs cuál está activo: un despliegue al que se le
// olvidó DATABASE_URL arrancaría igual, escribiendo a un archivo que se pierde.
if (MOTOR === "json") {
  console.warn(
    "[almacen] Sin DATABASE_URL: usando el archivo .datos/. No apto para producción.",
  );
}

export function nuevaReferencia(): string {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${EVENTO.prefijoReferencia}-${sufijo}`;
}

export const listarInscripciones = impl.listarInscripciones;
export const guardarInscripcion = impl.guardarInscripcion;
export const reclamarCuota = impl.reclamarCuota;
export const inscripcionPorReferencia = impl.inscripcionPorReferencia;
export const inscripcionPorId = impl.inscripcionPorId;
export const buscarInscripcion = impl.buscarInscripcion;
export const inscripcionDuplicada = impl.inscripcionDuplicada;
// Abonos: cada uno tiene su propia función. Nunca pasan por
// `guardarInscripcion`, que reemplaza las cuotas en bloque y se llevaría por
// delante la evidencia y el historial de revisión.
export const crearAbono = impl.crearAbono;
export const abonosDe = impl.abonosDe;
export const abonoPorId = impl.abonoPorId;
export const abonosPorRevisar = impl.abonosPorRevisar;
export const abonosConMismaEvidencia = impl.abonosConMismaEvidencia;
export const reclamarAbono = impl.reclamarAbono;
export const resolverAbono = impl.resolverAbono;

export const registrarCorreo = impl.registrarCorreo;
export const listarCorreos = impl.listarCorreos;
export const correoPorId = impl.correoPorId;
// Seguimiento de entrega: lo que los webhooks del proveedor van anotando
// encima de un correo ya enviado, y lo que /panel/correos lee de ahí.
export const correoDelProveedor = impl.correoDelProveedor;
export const anotarEntrega = impl.anotarEntrega;
export const seguimientoCorreos = impl.seguimientoCorreos;
export const resumenCorreos = impl.resumenCorreos;
