import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CorreoEnviado, Inscripcion } from "./tipos";

/**
 * Almacén en archivo JSON.
 *
 * Es a propósito la pieza más reemplazable del sistema: todo el resto de la
 * app habla con este módulo y nunca con el disco. Para pasar a Postgres
 * (Neon/Supabase) se reimplementan estas seis funciones y nada más cambia.
 */

const DIR = path.join(process.cwd(), ".datos");
const ARCHIVO_INSCRIPCIONES = path.join(DIR, "inscripciones.json");
const ARCHIVO_CORREOS = path.join(DIR, "correos.json");

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

export function nuevaReferencia(): string {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `TE27-${sufijo}`;
}

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
