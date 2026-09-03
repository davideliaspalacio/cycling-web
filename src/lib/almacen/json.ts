import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Abono,
  CorreoEnviado,
  CorreoSeguido,
  EstadoEntrega,
  Inscripcion,
  ResumenCorreos,
} from "../tipos";

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

/* ------------------------ Seguimiento de la entrega ----------------------- */
//
// Misma semántica que en `postgres.ts`, resuelta en memoria. Aquí no hay
// concurrencia real que valga, pero las escrituras siguen pasando por `enFila`
// para no perder un evento contra otro que llegue a la vez.

/** Las filas viejas del archivo no tienen el campo: no confirmadas. */
const entregaDe = (c: CorreoEnviado): EstadoEntrega =>
  c.estadoEntrega ?? "SIN_CONFIRMAR";

const RANGO: Record<EstadoEntrega, number> = {
  SIN_CONFIRMAR: 0,
  ENTREGADO: 1,
  ABIERTO: 2,
  QUEJA: 3,
  REBOTADO: 4,
};

export async function correoDelProveedor(pistas: {
  ids: string[];
  destinatario?: string;
  referencia?: string;
}): Promise<{ id: string } | undefined> {
  const { registros } = await leer<CorreoEnviado>(ARCHIVO_CORREOS);
  const ids = new Set(pistas.ids.filter(Boolean));
  const porId = registros.find(
    (c) =>
      ids.has(c.id) ||
      (c.proveedorRequestId ? ids.has(c.proveedorRequestId) : false) ||
      (c.proveedorId ? ids.has(c.proveedorId) : false),
  );
  if (porId) return { id: porId.id };

  if (!pistas.destinatario) return undefined;
  const destino = pistas.destinatario.toLowerCase();
  const candidatos = registros
    .filter(
      (c) =>
        c.para.toLowerCase() === destino &&
        (!pistas.referencia || c.referencia === pistas.referencia),
    )
    .sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn));
  return candidatos[0] ? { id: candidatos[0].id } : undefined;
}

export async function anotarEntrega(
  id: string,
  evento: {
    estado: Exclude<EstadoEntrega, "SIN_CONFIRMAR">;
    ocurridoEn: string;
    reboteTipo?: "DURO" | "BLANDO";
    reboteMotivo?: string;
    reboteDiagnostico?: string;
  },
): Promise<boolean> {
  return enFila(async () => {
    const tabla = await leer<CorreoEnviado>(ARCHIVO_CORREOS);
    const c = tabla.registros.find((r) => r.id === id);
    if (!c) return false;

    if (evento.estado === "ENTREGADO") c.entregadoEn ??= evento.ocurridoEn;
    if (evento.estado === "ABIERTO") c.abiertoEn ??= evento.ocurridoEn;
    if (evento.estado === "QUEJA") c.quejaEn ??= evento.ocurridoEn;
    if (evento.estado === "REBOTADO") {
      c.rebotadoEn = evento.ocurridoEn;
      c.reboteTipo = evento.reboteTipo;
      c.reboteMotivo = evento.reboteMotivo;
      c.reboteDiagnostico = evento.reboteDiagnostico;
    }
    // Solo sube de rango: una entrega tardía no borra un rebote.
    if (RANGO[evento.estado] > RANGO[entregaDe(c)]) c.estadoEntrega = evento.estado;

    await escribir(ARCHIVO_CORREOS, tabla);
    return true;
  });
}

/** `html` fuera: el listado no lo pinta y aquí son cientos de KB en memoria. */
function sinHtml(c: CorreoEnviado): Omit<CorreoEnviado, "html"> {
  const copia: Record<string, unknown> = { ...c };
  delete copia.html;
  return copia as Omit<CorreoEnviado, "html">;
}

export async function seguimientoCorreos(params: {
  q?: string;
  estado?: EstadoEntrega;
  limite?: number;
} = {}): Promise<CorreoSeguido[]> {
  const [{ registros }, inscripciones] = await Promise.all([
    leer<CorreoEnviado>(ARCHIVO_CORREOS),
    listarInscripciones(),
  ]);
  const porReferencia = new Map(inscripciones.map((i) => [i.referencia, i]));
  const aguja = params.q?.trim().toLowerCase();

  return registros
    .map((c) => {
      const ins = c.referencia ? porReferencia.get(c.referencia) : undefined;
      return {
        ...sinHtml(c),
        estadoEntrega: entregaDe(c),
        ciclista: ins
          ? {
              nombres: ins.ciclista.nombres,
              apellidos: ins.ciclista.apellidos,
              identificacion: ins.ciclista.identificacion,
            }
          : undefined,
      } satisfies CorreoSeguido;
    })
    .filter((c) => {
      if (params.estado && c.estadoEntrega !== params.estado) return false;
      if (!aguja) return true;
      const nombre = c.ciclista
        ? `${c.ciclista.nombres} ${c.ciclista.apellidos}`.toLowerCase()
        : "";
      return (
        c.para.toLowerCase().includes(aguja) ||
        (c.referencia ?? "").toLowerCase().includes(aguja) ||
        c.asunto.toLowerCase().includes(aguja) ||
        nombre.includes(aguja) ||
        (c.ciclista?.identificacion ?? "").includes(aguja)
      );
    })
    .sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn))
    .slice(0, params.limite ?? 200);
}

export async function resumenCorreos(desde: string): Promise<ResumenCorreos> {
  const { registros } = await leer<CorreoEnviado>(ARCHIVO_CORREOS);
  const cuenta = (fn: (c: CorreoEnviado) => boolean) =>
    registros.filter(fn).length;
  return {
    total: registros.length,
    hoy: cuenta((c) => c.enviadoEn >= desde),
    // Abierto implica entregado: quien lo abrió, lo recibió.
    entregados: cuenta((c) => ["ENTREGADO", "ABIERTO"].includes(entregaDe(c))),
    rebotados: cuenta((c) => entregaDe(c) === "REBOTADO"),
    quejas: cuenta((c) => entregaDe(c) === "QUEJA"),
    // Un correo simulado o que nunca salió no está "sin confirmar": no hay
    // nada que confirmar. Se cuentan aparte.
    sinConfirmar: cuenta(
      (c) =>
        entregaDe(c) === "SIN_CONFIRMAR" &&
        c.proveedor !== "sin-configurar" &&
        c.proveedor !== "simulacion",
    ),
    noSalieron: cuenta((c) => c.proveedor === "sin-configurar"),
    simulados: cuenta((c) => c.proveedor === "simulacion"),
  };
}
