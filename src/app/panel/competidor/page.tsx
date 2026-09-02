import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { listarInscripciones } from "@/lib/almacen";
import { NOMBRE_COMPLETO, categoriaPorCodigo } from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";
import type { Inscripcion } from "@/lib/tipos";
import { Cesion } from "./cesion";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: `Cambio de competidor — ${NOMBRE_COMPLETO}`,
};

/**
 * Buscar una inscripción y pasarla a otra persona.
 *
 * La búsqueda va por GET con `?q=` para que el resultado sea un enlace que se
 * pueda pegar en un chat: quien atiende al ciclista por WhatsApp llega aquí
 * desde el panel con la referencia ya puesta.
 */

function coincide(i: Inscripcion, q: string): boolean {
  const aguja = q.trim().toLowerCase();
  if (!aguja) return false;
  const nombre = `${i.ciclista.nombres} ${i.ciclista.apellidos}`.toLowerCase();
  return (
    i.referencia.toLowerCase().includes(aguja) ||
    i.ciclista.identificacion.includes(aguja) ||
    i.ciclista.correo.toLowerCase().includes(aguja) ||
    nombre.includes(aguja)
  );
}

export default async function CambioDeCompetidor({
  searchParams,
}: PageProps<"/panel/competidor">) {
  const { q } = await searchParams;
  const consulta = typeof q === "string" ? q : "";

  const encontradas = consulta
    ? (await listarInscripciones()).filter((i) => coincide(i, consulta))
    : [];
  const unica = encontradas.length === 1 ? encontradas[0] : undefined;

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
        <Link
          href="/panel"
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          ← Panel
        </Link>

        <TituloSeccion
          className="mt-5"
          eyebrow="Uso interno"
          titulo="Cambiar de competidor."
          bajada="La inscripción no se devuelve, pero sí se cede. Se reemplazan los datos de la persona y se conservan la referencia, la categoría y todo lo ya abonado. Queda constancia de quién lo hizo."
        />

        <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <label
              htmlFor="q"
              className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta/75"
            >
              Buscar la inscripción
            </label>
            <input
              id="q"
              name="q"
              defaultValue={consulta}
              placeholder="Referencia, documento, correo o nombre"
              className="campo"
            />
          </div>
          <button
            type="submit"
            className="pulsable rounded-2xl tinta-sm bg-turquesa px-5 py-3 font-display text-[0.95rem] font-extrabold text-tinta"
          >
            Buscar
          </button>
        </form>

        {consulta && encontradas.length === 0 && (
          <Tarjeta tono="marea" className="mt-8 p-6">
            <p className="text-tinta/75">
              No hay ninguna inscripción que coincida con «{consulta}».
            </p>
          </Tarjeta>
        )}

        {encontradas.length > 1 && (
          <div className="mt-8 flex flex-col gap-3">
            <p className="raya-mono text-[0.7rem] text-tinta/75">
              {encontradas.length} coincidencias. Elige una.
            </p>
            {encontradas.map((i) => (
              <Link key={i.id} href={`/panel/competidor?q=${i.referencia}`}>
                <Tarjeta
                  tono="nube"
                  className="pulsable flex flex-wrap items-center gap-3 p-4"
                >
                  <Chip tono="turquesa">{i.referencia}</Chip>
                  <span className="font-display text-[0.95rem] font-extrabold text-tinta">
                    {i.ciclista.nombres} {i.ciclista.apellidos}
                  </span>
                  <span className="raya-mono text-[0.72rem] text-tinta/75">
                    doc. {i.ciclista.identificacion} ·{" "}
                    {categoriaPorCodigo(i.categoriaCodigo)?.nombre} ·{" "}
                    {pesos(i.pagado)} abonados
                  </span>
                </Tarjeta>
              </Link>
            ))}
          </div>
        )}

        {unica && (
          <Cesion
            referencia={unica.referencia}
            actual={{
              nombres: unica.ciclista.nombres,
              apellidos: unica.ciclista.apellidos,
              identificacion: unica.ciclista.identificacion,
              correo: unica.ciclista.correo,
              telefono: unica.ciclista.telefono,
              ciudad: unica.ciclista.ciudad,
              departamento: unica.ciclista.departamento,
            }}
            categoria={
              categoriaPorCodigo(unica.categoriaCodigo)?.nombre ??
              unica.categoriaCodigo
            }
            total={unica.total}
            pagado={unica.pagado}
            saldo={Math.max(0, unica.total - unica.pagado)}
            tallas={unica.tallas}
          />
        )}

        {unica && unica.eventos.length > 0 && (
          <section className="mt-10">
            <h2 className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
              Bitácora de {unica.referencia}
            </h2>
            <ol className="mt-3 flex flex-col gap-2">
              {unica.eventos.map((e, idx) => (
                <li
                  key={`${e.en}-${idx}`}
                  className="flex flex-col gap-0.5 border-b border-tinta/10 pb-2 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="raya-mono shrink-0 text-[0.68rem] text-tinta/75">
                    {new Date(e.en).toLocaleString("es-CO")}
                  </span>
                  <span className="raya-mono shrink-0 text-[0.68rem] font-bold text-rio">
                    {e.tipo}
                  </span>
                  <span className="text-[0.85rem] leading-snug text-tinta/75">
                    {e.detalle}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
      <Pie />
    </>
  );
}
