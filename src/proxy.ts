import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";

/**
 * Puerta del panel.
 *
 * En Next 16 `middleware.ts` se llama `proxy.ts` y corre siempre en Node,
 * así que aquí sí se puede verificar la firma HMAC de la cookie.
 *
 * Esto es la primera barrera, no la única: las rutas que devuelven
 * comprobantes vuelven a comprobar la sesión por su cuenta.
 */

/** La entrada tiene que quedar fuera o el redirect se muerde la cola. */
const ABIERTAS = ["/panel/entrar", "/api/panel/sesion"];

export function proxy(peticion: NextRequest) {
  const ruta = peticion.nextUrl.pathname;
  if (ABIERTAS.some((a) => ruta === a || ruta.startsWith(`${a}/`))) {
    return NextResponse.next();
  }

  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (sesion) return NextResponse.next();

  if (ruta.startsWith("/api/")) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }

  const destino = new URL("/panel/entrar", peticion.url);
  destino.searchParams.set("volver", ruta);
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: [
    "/panel/:path*",
    "/correos/:path*",
    /*
     * `:path+` exige al menos un segmento: protege /api/evidencias/<id>
     * (ver un comprobante) pero deja abierto POST /api/evidencias, que es
     * por donde el ciclista sube el suyo sin estar autenticado.
     */
    "/api/evidencias/:path+",
    /*
     * Deliberadamente FUERA: /api/correos/webhook. Lo llama Zoho, no una
     * persona, así que no hay cookie que comprobar y un redirect al login lo
     * rompería — su propio formulario exige que la llamada no esté
     * autenticada. Esa ruta se protege sola, con el par cabecera/valor que
     * ofrece ZeptoMail (X-Webhook-Clave contra ZEPTOMAIL_WEBHOOK_SECRETO).
     * No la metas aquí "por seguridad": la dejarías inservible.
     */
  ],
};
