import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Abono, CorreoEnviado, Inscripcion } from "../tipos";

/**
 * Almacén en archivo JSON — el respaldo para cuando no hay DATABASE_URL.
 *
 * Sirve para levantar el proyecto y ver la demo completa sin base de datos.
 * No aguanta producción: no hay transacciones ni concurrencia real, y en un
 * contenedor sin volumen el archivo se pierde en cada despliegue. La versión
 * de verdad está en `postgres.ts`; `index.ts` escoge entre las dos.
 */

const DIR = path.join(process.cwd(), ".datos");
const ARCHIVO_INSCRIPCIONES = path.join(DIR, "inscripciones.json");
const ARCHIVO_CORREOS = path.join(DIR, "correos.json");
const ARCHIVO_ABONOS = path.join(DIR, "abonos.json");

type Tabla<T> = { registros: T[] };

let cola: Promise<unknown> = Promise.resolve();
/** Serializa las escrituras para que dos requests no se pisen el archivo. */
function enFila<T>(fn: () => Promise<T>): Promise<T> {
  const siguiente = cola.then(fn, fn);
  cola = siguiente.catch(() => undefined);
  return siguiente;
}

async function leer<T>(archivo: string): Promise<Tabla<T>> {
  try {
    const crudo = await fs.readFile(archivo, "utf8");
    return JSON.parse(crudo) as Tabla<T>;
  } catch {
    return { registros: [] };
  }
}

async function escribir<T>(archivo: string, tabla: Tabla<T>): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(archivo, JSON.stringify(tabla, null, 2), "utf8");
}

/* ---------------------------------- Inscripciones --------------------------------- */

export async function listarInscripciones(): Promise<Inscripcion[]> {
  const { registros } = await leer<Inscripcion>(ARCHIVO_INSCRIPCIONES);
  return registros.sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

export async function guardarInscripcion(
  inscripcion: Inscripcion,
): Promise<Inscripcion> {
  return enFila(async () => {
    const tabla = await leer<Inscripcion>(ARCHIVO_INSCRIPCIONES);
    const i = tabla.registros.findIndex((r) => r.id === inscripcion.id);
    const conFecha = { ...inscripcion, actualizadaEn: new Date().toISOString() };
    if (i >= 0) tabla.registros[i] = conFecha;
    else tabla.registros.push(conFecha);
    await escribir(ARCHIVO_INSCRIPCIONES, tabla);
    return conFecha;
  });
}

export async function inscripcionPorReferencia(
  referencia: string,
): Promise<Inscripcion | undefined> {
  const { registros } = await leer<Inscripcion>(ARCHIVO_INSCRIPCIONES);
  const base = referencia.split("-").slice(0, 2).join("-").toUpperCase();
  return registros.find((r) => r.referencia === base);
}

export async function inscripcionPorId(id: string): Promise<Inscripcion | undefined> {
  const { registros } = await leer<Inscripcion>(ARCHIVO_INSCRIPCIONES);
  return registros.find((r) => r.id === id);
}

/** Búsqueda del portal del ciclista: documento + correo. */
export async function buscarInscripcion(
  identificacion: string,
  correo: string,
): Promise<Inscripcion | undefined> {
  const { registros } = await leer<Inscripcion>(ARCHIVO_INSCRIPCIONES);
  return registros.find(
    (r) =>
      r.ciclista.identificacion.trim() === identificacion.trim() &&
      r.ciclista.correo.trim().toLowerCase() === correo.trim().toLowerCase(),
  );
}

export async function inscripcionDuplicada(
  identificacion: string,
): Promise<Inscripcion | undefined> {
  const { registros } = await leer<Inscripcion>(ARCHIVO_INSCRIPCIONES);
  return registros.find(
    (r) =>
      r.ciclista.identificacion.trim() === identificacion.trim() &&
      r.estado !== "BORRADOR",
  );
}

/**
 * Equivalente al reclamo atómico de Postgres, pero aquí no hay transacciones:
 * es best-effort. Otra razón para no usar este almacén en producción.
 */
export async function reclamarCuota(
  inscripcionId: string,
  numero: number,
  minutosAbandono = 15,
): Promise<{ intentos: number } | null> {
  return enFila(async () => {
    const tabla = await leer<Inscripcion>(ARCHIVO_INSCRIPCIONES);
    const ins = tabla.registros.find((r) => r.id === inscripcionId);
    const cuota = ins?.cuotas.find((c) => c.numero === numero);
    if (!ins || !cuota || cuota.estado === "PAGADA") return null;
    const viejo =
      !cuota.transaccionId &&
      (!cuota.ultimoIntentoEn ||
        Date.now() - new Date(cuota.ultimoIntentoEn).getTime() >
          minutosAbandono * 60_000);
    if (cuota.estado === "EN_PROCESO" && !viejo) return null;
    cuota.estado = "EN_PROCESO";
    cuota.intentos += 1;
    cuota.ultimoIntentoEn = new Date().toISOString();
    await escribir(ARCHIVO_INSCRIPCIONES, tabla);
    return { intentos: cuota.intentos };
  });
}

/* ------------------------------------- Abonos -------------------------------------- */

/**
 * Los abonos van en su propio archivo, no dentro de la inscripción.
 *
 * Es el mismo criterio que en Postgres: guardar una inscripción no puede
 * arrastrar ni pisar las evidencias y su historial de revisión. Aquí además
 * hay una razón práctica — `guardarInscripcion` reescribe el registro completo
 * desde un objeto en memoria, y un objeto que se leyó antes de la revisión la
 * borraría al volver a guardarse.
 */

export async function crearAbono(abono: Abono): Promise<Abono> {
  return enFila(async () => {
    const tabla = await leer<Abono>(ARCHIVO_ABONOS);
    tabla.registros.push(abono);
    await escribir(ARCHIVO_ABONOS, tabla);
    return abono;
  });
}

export async function abonosDe(inscripcionId: string): Promise<Abono[]> {
  const { registros } = await leer<Abono>(ARCHIVO_ABONOS);
  return registros
    .filter((a) => a.inscripcionId === inscripcionId)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export async function abonoPorId(id: string): Promise<Abono | undefined> {
  const { registros } = await leer<Abono>(ARCHIVO_ABONOS);
  return registros.find((a) => a.id === id);
}

export async function abonosPorRevisar(limite = 100): Promise<Abono[]> {
  const { registros } = await leer<Abono>(ARCHIVO_ABONOS);
  return registros
    .filter((a) => a.estado === "ENVIADA" || a.estado === "EN_REVISION")
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
    .slice(0, limite);
}

export async function abonosConMismaEvidencia(
  sha256: string,
  exceptoId?: string,
): Promise<Abono[]> {
  const { registros } = await leer<Abono>(ARCHIVO_ABONOS);
  return registros
    .filter((a) => a.evidenciaSha256 === sha256 && a.id !== exceptoId)
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

/**
 * Equivalente al reclamo atómico de Postgres, pero aquí no hay transacciones:
 * es best-effort, igual que `reclamarCuota`. Otra razón para no usar este
 * almacén en producción.
 */
export async function reclamarAbono(
  id: string,
  revisadoPor?: string,
  minutosAbandono = 15,
): Promise<Abono | null> {
  return enFila(async () => {
    const tabla = await leer<Abono>(ARCHIVO_ABONOS);
    const abono = tabla.registros.find((a) => a.id === id);
    if (!abono) return null;
    const abandonado =
      abono.estado === "EN_REVISION" &&
      (!abono.revisadoEn ||
        Date.now() - new Date(abono.revisadoEn).getTime() >
          minutosAbandono * 60_000);
    if (abono.estado !== "ENVIADA" && !abandonado) return null;
    abono.estado = "EN_REVISION";
    abono.revisadoEn = new Date().toISOString();
    if (revisadoPor) abono.revisadoPor = revisadoPor;
    await escribir(ARCHIVO_ABONOS, tabla);
    return abono;
  });
}

export async function resolverAbono(params: {
  id: string;
  estado: Extract<Abono["estado"], "VERIFICADA" | "RECHAZADA">;
  montoAprobado?: number;
  motivoRechazo?: string;
  revisadoPor: string;
}): Promise<Abono | null> {
  return enFila(async () => {
    const tabla = await leer<Abono>(ARCHIVO_ABONOS);
    const abono = tabla.registros.find((a) => a.id === params.id);
    if (!abono) return null;
    if (abono.estado !== "ENVIADA" && abono.estado !== "EN_REVISION") return null;
    abono.estado = params.estado;
    abono.montoAprobado =
      params.estado === "VERIFICADA" ? params.montoAprobado : undefined;
    abono.motivoRechazo =
      params.estado === "RECHAZADA" ? params.motivoRechazo : undefined;
    abono.revisadoPor = params.revisadoPor;
    abono.revisadoEn = new Date().toISOString();
    await escribir(ARCHIVO_ABONOS, tabla);
    return abono;
  });
}

/* ------------------------------------ Correos ------------------------------------- */

export async function registrarCorreo(correo: CorreoEnviado): Promise<void> {
  await enFila(async () => {
    const tabla = await leer<CorreoEnviado>(ARCHIVO_CORREOS);
    tabla.registros.unshift(correo);
    tabla.registros = tabla.registros.slice(0, 200);
    await escribir(ARCHIVO_CORREOS, tabla);
  });
}

export async function listarCorreos(): Promise<CorreoEnviado[]> {
  const { registros } = await leer<CorreoEnviado>(ARCHIVO_CORREOS);
  return registros;
}

export async function correoPorId(id: string): Promise<CorreoEnviado | undefined> {
  const { registros } = await leer<CorreoEnviado>(ARCHIVO_CORREOS);
  return registros.find((c) => c.id === id);
}
