// Sin `server-only`: `proxy.ts` corre en su propio contexto y también lo usa.
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Sesión del panel: clave compartida + cookie firmada.
 *
 * No es identidad por persona — el revisor escribe su nombre al entrar y ese
 * nombre queda en `revisado_por`. Sirve para saber quién aprobó qué mientras
 * el equipo sea pequeño y de confianza; no sirve como auditoría formal.
 * Si van a revisar varias personas, hace falta un usuario por persona.
 */

export const COOKIE_SESION = "sx_panel";
const DURACION_HORAS = 12;

/** Sin secreto configurado no hay sesión posible: mejor fallar que fingir. */
function secreto(): string {
  const s = process.env.PANEL_SECRETO;
  if (!s || s.length < 16) {
    throw new Error(
      "Falta PANEL_SECRETO (mínimo 16 caracteres) para firmar la sesión del panel.",
    );
  }
  return s;
}

function firmar(datos: string): string {
  return createHmac("sha256", secreto()).update(datos).digest("base64url");
}

/** Comparación en tiempo constante: una comparación normal filtra la clave. */
function igualSinFiltrar(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function claveCorrecta(intento: string): boolean {
  const esperada = process.env.PANEL_CLAVE;
  if (!esperada) return false;
  return igualSinFiltrar(intento, esperada);
}

export type Sesion = { nombre: string; expira: number };

export function crearSesion(nombre: string): string {
  const cuerpo: Sesion = {
    nombre: nombre.slice(0, 60),
    expira: Date.now() + DURACION_HORAS * 3_600_000,
  };
  const datos = Buffer.from(JSON.stringify(cuerpo)).toString("base64url");
  return `${datos}.${firmar(datos)}`;
}

export function leerSesion(cookie: string | undefined): Sesion | null {
  if (!cookie) return null;
  const corte = cookie.lastIndexOf(".");
  if (corte < 1) return null;
  const datos = cookie.slice(0, corte);
  const firma = cookie.slice(corte + 1);
  if (!igualSinFiltrar(firma, firmar(datos))) return null;
  try {
    const s = JSON.parse(Buffer.from(datos, "base64url").toString()) as Sesion;
    return s.expira > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Para generar un PANEL_SECRETO al configurar el despliegue. */
export function secretoNuevo(): string {
  return randomBytes(32).toString("base64url");
}
