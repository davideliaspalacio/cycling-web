import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { listarInscripciones } from "@/lib/almacen";
import { CATEGORIAS, categoriaPorCodigo } from "@/lib/catalogo";
import {
  ESTADOS_INSCRIPCION,
  VISTAS,
  esEstadoInscripcion,
  filtrar,
  textoDeEstado,
} from "@/lib/exportacion";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: "Bajar la lista de inscritos",
};

/**
 * De dónde se baja la lista.
 *
 * Los filtros van por GET, como en el resto del panel, para que la elección se
 * vea en la barra de direcciones y el enlace se pueda pegar en un chat. La
 * descarga no es un formulario que envíe nada: son enlaces a
 * `/api/panel/exportar` con los mismos parámetros, así que un archivo se pide
 * con un clic y no hay estado que sincronizar.
 *
 * Cada tarjeta dice a quién va dirigido el archivo y qué lleva dentro. Eso no
 * es decoración: la razón de que haya cuatro archivos y no uno es que a un
 * proveedor no se le manda la base entera, y si la pantalla no lo dice, la
 * primera persona con prisa baja «la completa» y la reenvía.
 */

export default async function Exportar({
  searchParams,
}: PageProps<"/panel/exportar">) {
  const { categoria, estado } = await searchParams;

  const catElegida =
    typeof categoria === "string" && categoriaPorCodigo(categoria)
      ? categoria
      : undefined;
  const estadoElegido =
    typeof estado === "string" && esEstadoInscripcion(estado)
      ? estado
      : undefined;

  const todas = await listarInscripciones();
  const seleccion = filtrar(todas, {
    categoria: catElegida,
    estado: estadoElegido,
  });

  const enlace = (vista: string) => {
    const p = new URLSearchParams({ vista });
    if (catElegida) p.set("categoria", catElegida);
    if (estadoElegido) p.set("estado", estadoElegido);
    return `/api/panel/exportar?${p.toString()}`;
  };

  const hayFiltro = Boolean(catElegida || estadoElegido);

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/panel"
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          ← Panel
        </Link>

        <TituloSeccion
          className="mt-5"
          eyebrow="Uso interno"
          titulo="Bajar la lista de inscritos."
          bajada="Archivos para abrir en Excel y mandárselos a quien tiene que hacer algo con ellos. Hay uno por conversación: el del cronometraje, el del kit y el de la brigada médica llevan solo lo suyo, y la lista completa es para la organización."
        />

        {/* ---------------------------- Aviso ---------------------------- */}
        <Tarjeta tono="alerta" className="mt-8 p-5 sm:p-6">
          <p className="font-display text-[1.05rem] font-extrabold leading-snug text-nube">
            Esto son datos personales de {todas.length} persona
            {todas.length === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-nube/90">
            Cada descarga queda anotada en el registro del servidor con tu
            nombre y la hora. Manda a cada proveedor su archivo, no la lista
            completa: el que imprime las camisetas no necesita el RH ni la
            dirección de nadie.
          </p>
        </Tarjeta>

        {/* --------------------------- Filtros --------------------------- */}
        <form method="get" className="mt-7 flex flex-wrap items-end gap-3">
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <label
              htmlFor="categoria"
              className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta/75"
            >
              Categoría
            </label>
            <select
              id="categoria"
              name="categoria"
              defaultValue={catElegida ?? ""}
              className="campo"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <label
              htmlFor="estado"
              className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta/75"
            >
              Estado de pago
            </label>
            <select
              id="estado"
              name="estado"
              defaultValue={estadoElegido ?? ""}
              className="campo"
            >
              <option value="">Cualquier estado</option>
              {ESTADOS_INSCRIPCION.map((e) => (
                <option key={e} value={e}>
                  {textoDeEstado(e)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="pulsable rounded-2xl tinta-sm bg-turquesa px-5 py-3 font-display text-[0.95rem] font-extrabold text-tinta"
          >
            Aplicar
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tono={seleccion.length > 0 ? "turquesa" : "alerta"}>
            {seleccion.length} inscrito{seleccion.length === 1 ? "" : "s"}
          </Chip>
          {catElegida && (
            <Chip tono="nube">{categoriaPorCodigo(catElegida)?.nombre}</Chip>
          )}
          {estadoElegido && <Chip tono="nube">{textoDeEstado(estadoElegido)}</Chip>}
          {hayFiltro && (
            <Link
              href="/panel/exportar"
              className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.13em] text-rio hover:underline"
            >
              Quitar los filtros
            </Link>
          )}
        </div>

        {seleccion.length === 0 && (
          <p className="mt-3 text-[0.9rem] leading-relaxed text-tinta/75">
            Con estos filtros no queda nadie. Los archivos se bajarían con el
            encabezado y ninguna fila.
          </p>
        )}

        {/* -------------------------- Descargas -------------------------- */}
        <div className="mt-7 flex flex-col gap-4">
          {VISTAS.map((v) => (
            <Tarjeta key={v.clave} tono="nube" className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.15em] text-rio">
                    {v.paraQuien}
                  </p>
                  <h3 className="mt-1 font-display text-[1.3rem] font-extrabold leading-tight tracking-[-0.02em] text-tinta">
                    {v.titulo}
                  </h3>
                  <p className="mt-1.5 text-[0.9rem] leading-relaxed text-tinta/75">
                    {v.queLleva}
                  </p>
                </div>
                {/*
                  Un enlace normal con `download`: la descarga la sirve la ruta
                  con su cabecera Content-Disposition, así que no hace falta ni
                  un byte de JavaScript de cliente.
                */}
                <a
                  href={enlace(v.clave)}
                  download
                  className="pulsable inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl tinta-sm bg-turquesa px-5 py-3 font-display text-[0.95rem] font-extrabold tracking-tight text-tinta"
                >
                  Bajar CSV ↓
                </a>
              </div>
            </Tarjeta>
          ))}
        </div>

        {/* ------------------------ Cómo se abre ------------------------- */}
        <Tarjeta tono="marea" className="mt-6 p-5 sm:p-6">
          <h3 className="font-display text-[1.05rem] font-extrabold text-tinta">
            Si Excel te lo abre raro
          </h3>
          <p className="mt-2 text-[0.9rem] leading-relaxed text-tinta/85">
            Los archivos van en UTF-8 con marca al principio y separados por
            punto y coma, que es lo que espera el Excel en español: los acentos
            se ven y los documentos salen como texto, no como 1,08E+09. Si tu
            Excel está configurado en inglés y te apila todo en la columna A,
            ábrelo con <strong>Datos → Obtener datos → Desde un archivo de
            texto</strong> y elige punto y coma como separador.
          </p>
        </Tarjeta>
      </main>
      <Pie />
    </>
  );
}
