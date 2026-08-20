import "server-only";
import { randomUUID } from "node:crypto";
import { HAY_BASE_DE_DATOS } from "../db";
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
  return `TE27-${sufijo}`;
}

export const listarInscripciones = impl.listarInscripciones;
export const guardarInscripcion = impl.guardarInscripcion;
export const reclamarCuota = impl.reclamarCuota;
export const inscripcionPorReferencia = impl.inscripcionPorReferencia;
export const inscripcionPorId = impl.inscripcionPorId;
export const buscarInscripcion = impl.buscarInscripcion;
export const inscripcionDuplicada = impl.inscripcionDuplicada;
export const registrarCorreo = impl.registrarCorreo;
export const listarCorreos = impl.listarCorreos;
export const correoPorId = impl.correoPorId;
