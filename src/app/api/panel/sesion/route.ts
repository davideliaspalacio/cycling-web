import { NextResponse } from "next/server";
import { COOKIE_SESION, claveCorrecta, crearSesion } from "@/lib/sesion";

/** Entrar al panel. La clave nunca vuelve en la respuesta. */
export async function POST(peticion: Request) {
  const { clave, nombre } = (await peticion.json()) as {
    clave?: string;
    nombre?: string;
  };

  if (!nombre?.trim()) {
    return NextResponse.json({ error: "Escribe tu nombre." }, { status: 400 });
  }
  if (!clave || !claveCorrecta(clave)) {
    // Mismo mensaje para clave vacía o incorrecta: no confirmamos nada.
    return NextResponse.json({ error: "Clave incorrecta." }, { status: 401 });
  }

  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_SESION, crearSesion(nombre.trim()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
  return respuesta;
}

/** Salir. */
export async function DELETE() {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_SESION, "", { path: "/", maxAge: 0 });
  return respuesta;
}
