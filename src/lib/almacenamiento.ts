import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { del, get, issueSignedToken, presignUrl, put } from "@vercel/blob";

/**
 * Guarda las evidencias de pago, con modo simulación.
 *
 * Mismo trato que `src/lib/correos/enviar.ts`: si hay token usa el servicio
 * real (Vercel Blob), y si no, escribe en `.datos/evidencias/` para que la
 * demo corra sin configurar nada. Nadie fuera de este módulo sabe cuál está
 * activo.
 *
 * Una evidencia es un comprobante bancario: lleva nombre, número de cuenta y
 * montos de una persona identificable. Por eso el blob es `private` y la
 * lectura pasa siempre por una URL firmada de vida corta — nunca se publica
 * una URL estable ni se sirve el archivo desde una carpeta pública.
 */

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export const MODO_ALMACENAMIENTO: "blob" | "simulacion" = TOKEN
  ? "blob"
  : "simulacion";

const DIR = path.join(process.cwd(), ".datos", "evidencias");

/** Tamaño máximo aceptado, en bytes. Un comprobante de banco no pesa más. */
export const MAX_BYTES_EVIDENCIA = 8 * 1024 * 1024;

/** Cuánto vive la URL firmada. Lo justo para abrir el archivo y verlo. */
const MINUTOS_URL_FIRMADA = 10;

/* --------------------------- Tipos de archivo ----------------------------- */

export type TipoEvidencia =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "application/pdf";

const EXTENSIONES: Record<TipoEvidencia, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export const TIPOS_ACEPTADOS = Object.keys(EXTENSIONES) as TipoEvidencia[];

/** Para el atributo `accept` de la interfaz. */
export const ACEPTA_HTML = TIPOS_ACEPTADOS.join(",");

const empiezaCon = (bytes: Uint8Array, firma: number[], desde = 0): boolean =>
  firma.every((b, i) => bytes[desde + i] === b);

const textoEn = (bytes: Uint8Array, desde: number, largo: number): string =>
  Buffer.from(bytes.subarray(desde, desde + largo)).toString("ascii");

/**
 * Reconoce el tipo por los bytes mágicos del contenido, no por lo que dice el
 * navegador.
 *
 * `file.type` lo pone el cliente y se falsifica en una línea: un .exe
 * renombrado a .jpg llega con `image/jpeg`. Lo que decide es la cabecera del
 * archivo. Devuelve `null` si no es ninguno de los formatos de la lista
 * blanca.
 */
export function tipoPorContenido(bytes: Uint8Array): TipoEvidencia | null {
  // JPEG: FF D8 FF
  if (empiezaCon(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // PDF: "%PDF-"
  if (textoEn(bytes, 0, 5) === "%PDF-") return "application/pdf";
  // Contenedores RIFF/ISO-BMFF: la marca real va más adentro.
  if (textoEn(bytes, 0, 4) === "RIFF" && textoEn(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (textoEn(bytes, 4, 4) === "ftyp") {
    // Las fotos de iPhone llegan así; la marca de HEIC/HEIF está en el brand.
    const marca = textoEn(bytes, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(marca)) {
      return "image/heic";
    }
  }
  return null;
}

/* ------------------------------- Guardar ---------------------------------- */

export type EvidenciaGuardada = {
  /** Ruta dentro del almacén. Nunca se muestra al ciclista. */
  clave: string;
  /** SHA-256 del contenido, en hexadecimal. */
  sha256: string;
  bytes: number;
  tipo: TipoEvidencia;
};

/**
 * Escribe el archivo y devuelve su constancia.
 *
 * El nombre lo inventa el servidor a partir de un UUID: el del cliente puede
 * traer `../`, caracteres de control o el nombre real de otra persona, y no
 * aporta nada que necesitemos.
 */
export async function guardarEvidencia(
  contenido: Uint8Array,
  tipo: TipoEvidencia,
): Promise<EvidenciaGuardada> {
  const sha256 = createHash("sha256").update(contenido).digest("hex");
  const hoy = new Date().toISOString().slice(0, 10);
  const clave = `evidencias/${hoy}/${randomUUID()}.${EXTENSIONES[tipo]}`;
  const cuerpo = Buffer.from(contenido);

  if (TOKEN) {
    await put(clave, cuerpo, {
      access: "private",
      contentType: tipo,
      token: TOKEN,
      // La clave ya es única; sin esto Blob le pega un sufijo aleatorio y
      // dejaría de coincidir con lo que guardamos en la base.
      addRandomSuffix: false,
    });
  } else {
    const destino = path.join(DIR, clave.replace(/^evidencias\//, ""));
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, cuerpo);
  }

  return { clave, sha256, bytes: contenido.byteLength, tipo };
}

/* -------------------------------- Leer ------------------------------------ */

/**
 * Traduce una clave a una ruta absoluta dentro de `.datos/evidencias/`,
 * negándose a salir de ahí. Una clave sale de nuestra base, pero si algún día
 * llega de otro lado, `../../.env.local` no puede convertirse en una lectura.
 */
function rutaLocal(clave: string): string {
  const relativa = clave.replace(/^evidencias\//, "");
  const destino = path.resolve(DIR, relativa);
  if (destino !== DIR && !destino.startsWith(DIR + path.sep)) {
    throw new Error("Clave de evidencia fuera de rango.");
  }
  return destino;
}

/** El tipo que corresponde a la extensión de una clave. */
function tipoPorClave(clave: string): string {
  const extension = path.extname(clave).slice(1).toLowerCase();
  return (
    TIPOS_ACEPTADOS.find((t) => EXTENSIONES[t] === extension) ??
    "application/octet-stream"
  );
}

/**
 * URL de vida corta, acotada a este único archivo y solo para lectura.
 *
 * Se pide una delegación por evidencia y no una llave general del almacén: si
 * la URL se filtra, lo que se filtró es un comprobante durante diez minutos, no
 * el acceso a todos.
 *
 * En modo simulación no hay nada que firmar: devuelve `null` y quien llame
 * sirve los bytes con `leerEvidencia`.
 */
export async function urlFirmada(clave: string): Promise<string | null> {
  if (!TOKEN) return null;
  const validUntil = Date.now() + MINUTOS_URL_FIRMADA * 60_000;
  const firma = await issueSignedToken({
    token: TOKEN,
    pathname: clave,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(firma, {
    access: "private",
    operation: "get",
    pathname: clave,
    validUntil,
  });
  return presignedUrl;
}

export type EvidenciaLeida = { contenido: Buffer; tipo: string; bytes: number };

/** Devuelve los bytes. Sirve en los dos modos. */
export async function leerEvidencia(clave: string): Promise<EvidenciaLeida | null> {
  if (TOKEN) {
    const resultado = await get(clave, { access: "private", token: TOKEN });
    if (!resultado || resultado.statusCode !== 200) return null;
    const contenido = Buffer.from(
      await new Response(resultado.stream).arrayBuffer(),
    );
    return {
      contenido,
      tipo: resultado.blob.contentType || tipoPorClave(clave),
      bytes: contenido.byteLength,
    };
  }

  try {
    const contenido = await fs.readFile(rutaLocal(clave));
    return { contenido, tipo: tipoPorClave(clave), bytes: contenido.byteLength };
  } catch {
    return null;
  }
}

/**
 * Borra el archivo. Solo para deshacer una subida que falló a mitad: una
 * evidencia ya registrada no se borra, es la prueba de un pago.
 */
export async function borrarEvidencia(clave: string): Promise<void> {
  if (TOKEN) {
    await del(clave, { token: TOKEN }).catch(() => undefined);
    return;
  }
  await fs.unlink(rutaLocal(clave)).catch(() => undefined);
}
