import { NextResponse, type NextRequest } from "next/server";
import { listarInscripciones } from "@/lib/almacen";
import { categoriaPorCodigo } from "@/lib/catalogo";
import {
  construirCsv,
  esEstadoInscripcion,
  esVista,
  type FiltrosExport,
} from "@/lib/exportacion";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";

/**
 * Descargar la lista de inscritos.
 *
 * Esto entrega, en un archivo, los datos personales de cientos de personas.
 * Por eso:
 *
 *  - Exige sesión del panel. `src/proxy.ts` cubre `/api/panel/:path+`, y aquí
 *    se vuelve a comprobar: si alguien toca el matcher, esta ruta no se queda
 *    abierta en silencio.
 *  - Queda escrito en el log del servidor quién la descargó, cuándo, qué vista
 *    y con qué filtros. El nombre sale de la sesión y nunca de la petición.
 *  - `no-store` y `noindex`: un CSV con cédulas no se queda en ninguna caché
 *    intermedia.
 *
 * El formato y el porqué de cada decisión están en `src/lib/exportacion.ts`.
 */

export const dynamic = "force-dynamic";

export async function GET(peticion: NextRequest) {
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }

  const parametros = peticion.nextUrl.searchParams;

  const vista = parametros.get("vista") ?? "completa";
  if (!esVista(vista)) {
    return NextResponse.json(
      { error: `No existe la vista «${vista}».` },
      { status: 400 },
    );
  }

  const categoria = parametros.get("categoria") ?? undefined;
  if (categoria && !categoriaPorCodigo(categoria)) {
    return NextResponse.json(
      { error: `No existe la categoría «${categoria}».` },
      { status: 400 },
    );
  }

  const estado = parametros.get("estado") ?? undefined;
  if (estado && !esEstadoInscripcion(estado)) {
    return NextResponse.json(
      { error: `No existe el estado «${estado}».` },
      { status: 400 },
    );
  }

  const filtros: FiltrosExport = {
    categoria,
    estado: esEstadoInscripcion(estado) ? estado : undefined,
  };

  const archivo = construirCsv(await listarInscripciones(), vista, filtros);

  // La constancia. No es auditoría formal —la sesión del panel es una clave
  // compartida, no un usuario por persona— pero deja dicho quién se llevó qué
  // y cuándo, que es lo que se pregunta cuando un archivo aparece donde no
  // debía.
  console.log(
    `[exportar] ${new Date().toISOString()} · ${sesion.nombre} descargó "${archivo.nombre}"` +
      ` · vista=${vista}` +
      ` · categoria=${filtros.categoria ?? "todas"}` +
      ` · estado=${filtros.estado ?? "todos"}` +
      ` · ${archivo.filas} fila${archivo.filas === 1 ? "" : "s"}`,
  );

  return new NextResponse(archivo.contenido, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${archivo.nombre}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
