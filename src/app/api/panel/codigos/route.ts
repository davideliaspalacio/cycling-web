import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  borrarCodigo,
  cambiarActivoCodigo,
  codigoPorTexto,
  crearCodigo,
} from "@/lib/almacen";
import { LARGO_MAX_CODIGO, normalizarCodigo } from "@/lib/catalogo";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";

/**
 * Gestión de los códigos de referido.
 *
 * Control de acceso: el matcher de `src/proxy.ts` cubre `/api/panel/:path+`, y
 * aquí se vuelve a comprobar la sesión. Si alguien toca el matcher, esta ruta
 * no se queda abierta en silencio. Y como en el resto del panel, **quién lo
 * hizo sale de la sesión y nunca del cuerpo**: es lo que queda escrito en
 * `creado_por`.
 *
 * Tres verbos y una regla de fondo:
 *
 *  - POST crea. Si el código ya existe no se pisa: podría ser de otro
 *    embajador y tener usos encima.
 *  - PATCH activa o desactiva. **Es la operación normal para retirar un
 *    código**, no el DELETE.
 *  - DELETE solo borra lo que nadie usó. Un código usado se queda: una
 *    inscripción guarda su texto, así que borrarlo dejaría veinte descuentos
 *    sin procedencia y nadie podría reconstruir de dónde salieron. La
 *    comprobación va dentro del propio DELETE (`borrarCodigo`), no en un
 *    SELECT previo, porque entre las dos sentencias cabe una inscripción
 *    nueva con ese código.
 */

export const dynamic = "force-dynamic";

const esquemaCrear = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, "Escribe el código.")
    .max(LARGO_MAX_CODIGO * 3)
    .transform(normalizarCodigo)
    .refine(
      (v) => v.length >= 3,
      "El código son al menos 3 caracteres: letras, números, guion o guion bajo.",
    ),
  propietario: z
    .string()
    .trim()
    .min(2, "Di a quién pertenece el código.")
    .max(80, "Ese nombre es demasiado largo."),
});

const esquemaActivo = z.object({
  codigo: z.string().trim().min(1).transform(normalizarCodigo),
  activo: z.boolean(),
});

const esquemaBorrar = z.object({
  codigo: z.string().trim().min(1).transform(normalizarCodigo),
});

function sinSesion() {
  return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
}

function malaEntrada(parseo: { error: z.ZodError }) {
  return NextResponse.json(
    {
      error:
        parseo.error.issues[0]?.message ?? "Faltan datos o alguno quedó mal.",
    },
    { status: 422 },
  );
}

export async function POST(peticion: NextRequest) {
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) return sinSesion();

  const parseo = esquemaCrear.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) return malaEntrada(parseo);

  const creado = await crearCodigo({
    codigo: parseo.data.codigo,
    propietario: parseo.data.propietario,
    creadoPor: sesion.nombre,
  });

  if (!creado) {
    const existente = await codigoPorTexto(parseo.data.codigo);
    return NextResponse.json(
      {
        error:
          `El código ${parseo.data.codigo} ya existe` +
          (existente ? ` y es de ${existente.propietario}.` : ".") +
          " Usa otro, o actívalo si estaba desactivado.",
        codigo: parseo.data.codigo,
      },
      { status: 409 },
    );
  }

  console.log(
    `[codigos] ${new Date().toISOString()} · ${sesion.nombre} creó ${creado.codigo} para ${creado.propietario}`,
  );

  return NextResponse.json({ codigo: creado }, { status: 201 });
}

export async function PATCH(peticion: NextRequest) {
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) return sinSesion();

  const parseo = esquemaActivo.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) return malaEntrada(parseo);

  const cambiado = await cambiarActivoCodigo(
    parseo.data.codigo,
    parseo.data.activo,
  );
  if (!cambiado) {
    return NextResponse.json(
      { error: `No existe el código ${parseo.data.codigo}.` },
      { status: 404 },
    );
  }

  console.log(
    `[codigos] ${new Date().toISOString()} · ${sesion.nombre} ` +
      `${parseo.data.activo ? "activó" : "desactivó"} ${cambiado.codigo}`,
  );

  return NextResponse.json({ codigo: cambiado });
}

export async function DELETE(peticion: NextRequest) {
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) return sinSesion();

  const parseo = esquemaBorrar.safeParse(await peticion.json().catch(() => null));
  if (!parseo.success) return malaEntrada(parseo);

  const resultado = await borrarCodigo(parseo.data.codigo);

  if (resultado === "NO_EXISTE") {
    return NextResponse.json(
      { error: `No existe el código ${parseo.data.codigo}.` },
      { status: 404 },
    );
  }
  if (resultado === "CON_USOS") {
    return NextResponse.json(
      {
        error:
          `El código ${parseo.data.codigo} ya lo usaron para inscribirse, así que no se borra. ` +
          "Si no quieres que siga dando descuento, desactívalo: las inscripciones que ya lo usaron conservan el suyo " +
          "y se puede seguir viendo de dónde salió.",
        codigo: parseo.data.codigo,
      },
      { status: 409 },
    );
  }

  console.log(
    `[codigos] ${new Date().toISOString()} · ${sesion.nombre} borró ${parseo.data.codigo} (sin usos)`,
  );

  return NextResponse.json({ borrado: parseo.data.codigo });
}
