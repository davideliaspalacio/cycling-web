import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { listarCodigos } from "@/lib/almacen";
import { ETAPAS, ETAPA_ACTIVA, normalizarCodigo } from "@/lib/catalogo";
import { descuentoEnPesos, pesos } from "@/lib/dinero";
import type { CodigoConUsos } from "@/lib/tipos";
import { AccionesDeCodigo, CrearCodigo } from "./acciones";

export const dynamic = "force-dynamic";
export const metadata = {
  // Nombres de inscritos: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: "Códigos de referido",
};

/**
 * Los códigos de los embajadores.
 *
 * La pantalla contesta tres preguntas y en este orden: qué códigos hay, cuánto
 * ha traído cada uno, y **quién usó cada código**. La tercera es la que no se
 * podía contestar antes sin entrar a la base a mano, y es la que se pregunta
 * cuando hay que liquidarle a un embajador.
 *
 * ── Desactivar no es borrar ────────────────────────────────────────────────
 * Es la decisión de fondo de esta pantalla y está escrita en ella, no solo en
 * el código: una inscripción guarda el **texto** del código, no una clave
 * ajena. Borrar uno que ya usaron veinte personas dejaría esas veinte
 * inscripciones con un descuento sin procedencia — se vería que pagaron menos
 * y no por qué. Por eso el botón de borrar solo existe donde no hay ningún
 * uso, y donde sí lo hay la única salida es desactivarlo: deja de aplicarse a
 * las nuevas y las viejas conservan el suyo.
 *
 * ── El descuento no vive aquí ──────────────────────────────────────────────
 * El porcentaje es de la etapa (`ETAPAS` en el catálogo), no del código. Esta
 * pantalla lo dice en voz alta arriba para que nadie busque el número en la
 * fila equivocada.
 */

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/* -------------------------------- Una fila -------------------------------- */

function FilaCodigo({ codigo }: { codigo: CodigoConUsos }) {
  const usos = codigo.inscripciones.length;
  const descontado = codigo.inscripciones.reduce((s, i) => s + i.descuento, 0);
  /*
   * El contador del registro contra los usos de verdad. Normalmente coinciden;
   * si no, es porque un incremento se perdió por un fallo de red al
   * inscribirse. Se dice en vez de esconderse, y manda el número de
   * inscripciones, que es el que se puede auditar fila por fila.
   */
  const descuadre = codigo.usos !== usos;

  return (
    <li>
      <Tarjeta tono={codigo.activo ? "nube" : "marea"} className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="raya-mono text-[1.05rem] font-bold text-tinta">
                {codigo.codigo}
              </span>
              <Chip tono={codigo.activo ? "turquesa" : "nube"}>
                {codigo.activo ? "Activo" : "Desactivado"}
              </Chip>
              <Chip tono={usos > 0 ? "sol" : "nube"}>
                {usos} uso{usos === 1 ? "" : "s"}
              </Chip>
            </div>

            <p className="mt-2 font-display text-[1.05rem] font-extrabold leading-snug text-tinta">
              {codigo.propietario}
            </p>
            <p className="raya-mono mt-1 text-[0.7rem] text-tinta/75">
              Creado el {cuando(codigo.creadoEn)} por {codigo.creadoPor}
              {descontado > 0 ? ` · ${pesos(descontado)} descontados en total` : ""}
            </p>

            {!codigo.activo && usos > 0 && (
              <p className="mt-2 text-[0.84rem] leading-snug text-tinta/75">
                Está desactivado: ya no aplica descuento a quien se inscriba
                ahora.{" "}
                {usos === 1
                  ? "La inscripción de abajo conserva el que se le aplicó"
                  : `Las ${usos} inscripciones de abajo conservan el que se les aplicó`}
                , porque lo que ya se cobró no se recalcula.
              </p>
            )}
          </div>

          <AccionesDeCodigo
            codigo={codigo.codigo}
            activo={codigo.activo}
            usos={usos}
          />
        </div>

        {/* -------------------------- Quién lo usó ------------------------- */}
        {usos > 0 && (
          <div className="mt-4 border-t-2 border-dashed border-tinta/20 pt-4">
            <h4 className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
              Quién lo usó
            </h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {codigo.inscripciones.map((i) => (
                <li
                  key={i.referencia}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-tinta/10 pb-1.5 last:border-0 last:pb-0"
                >
                  {/* Enlace a la ficha: desde aquí se llega a la persona. */}
                  <Link
                    href={`/panel/inscrito/${encodeURIComponent(i.referencia)}`}
                    className="font-display text-[0.92rem] font-extrabold text-rio hover:underline"
                  >
                    {i.nombres} {i.apellidos}
                  </Link>
                  <span className="raya-mono text-[0.7rem] text-tinta/75">
                    {i.referencia} · {cuando(i.creadaEn)}
                  </span>
                  <span className="raya-mono ml-auto text-[0.78rem] font-bold text-tinta">
                    −{pesos(i.descuento)}{" "}
                    <span className="font-normal text-tinta/75">
                      · paga {pesos(i.total)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {descuadre && (
              <p className="mt-3 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-2.5 text-[0.82rem] leading-snug text-tinta">
                El registro del código lleva {codigo.usos} uso
                {codigo.usos === 1 ? "" : "s"} y aquí hay {usos}{" "}
                inscripci{usos === 1 ? "ón" : "ones"}. Manda esta lista: son
                filas que se pueden abrir una por una. El contador se queda
                corto si un incremento se perdió al inscribirse.
              </p>
            )}
          </div>
        )}
      </Tarjeta>
    </li>
  );
}

/* -------------------------------- Pantalla -------------------------------- */

export default async function PanelDeCodigos({
  searchParams,
}: PageProps<"/panel/codigos">) {
  const { q } = await searchParams;
  // El buscador normaliza igual que el resto: así el enlace que viene de la
  // ficha de un inscrito encuentra el código aunque llegue en minúsculas.
  const consulta = typeof q === "string" ? normalizarCodigo(q) : "";

  const todos = await listarCodigos();
  const codigos = consulta
    ? todos.filter(
        (c) =>
          c.codigo.includes(consulta) ||
          normalizarCodigo(c.propietario).includes(consulta),
      )
    : todos;

  const activos = todos.filter((c) => c.activo).length;
  const usosTotales = todos.reduce((s, c) => s + c.inscripciones.length, 0);
  const descontadoTotal = todos.reduce(
    (s, c) => s + c.inscripciones.reduce((t, i) => t + i.descuento, 0),
    0,
  );

  /** Las etapas que dan descuento, para decir cuánto vale un código y dónde. */
  const conDescuento = ETAPAS.filter((e) => e.descuento > 0);

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/panel"
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          ← Panel
        </Link>

        <TituloSeccion
          className="mt-5"
          eyebrow="Uso interno"
          titulo="Códigos de referido."
          bajada="Los códigos que dan descuento, a quién pertenece cada uno y quién lo usó para inscribirse. Un código se desactiva cuando deja de servir; borrarlo solo se puede si nadie lo usó todavía."
        />

        {/* --------------------- De dónde sale el descuento ---------------- */}
        <Tarjeta tono="marea" className="mt-8 p-5 sm:p-6">
          <h3 className="font-display text-[1.05rem] font-extrabold text-tinta">
            El porcentaje no está en el código: está en la etapa
          </h3>
          {conDescuento.length === 0 ? (
            <p className="mt-2 text-[0.92rem] leading-relaxed text-tinta/85">
              Ninguna etapa da descuento ahora mismo, así que un código válido
              no rebaja nada. Los códigos se pueden seguir creando para tener
              el registro listo.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[0.92rem] leading-relaxed text-tinta/85">
                Un código válido descuenta lo que diga su etapa, no lo que diga
                el código. Hoy:
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-[0.92rem] leading-relaxed text-tinta/85">
                {conDescuento.map((e) => (
                  <li key={e.codigo}>
                    <strong>Etapa {e.nombre}</strong>: {e.descuento}% de{" "}
                    {pesos(e.precio)} ={" "}
                    <strong className="raya-mono">
                      −{pesos(descuentoEnPesos(e.precio, e.descuento))}
                    </strong>{" "}
                    → paga{" "}
                    {pesos(e.precio - descuentoEnPesos(e.precio, e.descuento))}
                    {e.codigo === ETAPA_ACTIVA.codigo ? " (la abierta ahora)" : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.88rem] leading-relaxed text-tinta/75">
                Cambiar ese porcentaje solo afecta a quien se inscriba después:
                cada inscripción guarda su descuento en pesos, así que lo que ya
                se cobró no se mueve nunca.
              </p>
            </>
          )}
        </Tarjeta>

        {/* ---------------------------- Resumen --------------------------- */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { etiqueta: "Códigos", valor: String(todos.length), tono: "nube" as const },
            { etiqueta: "Activos", valor: String(activos), tono: "turquesa" as const },
            { etiqueta: "Inscritos con código", valor: String(usosTotales), tono: "sol" as const },
            { etiqueta: "Descontado", valor: pesos(descontadoTotal), tono: "marea" as const },
          ].map((m) => (
            <Tarjeta key={m.etiqueta} tono={m.tono} className="p-4">
              <p className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
                {m.etiqueta}
              </p>
              <p className="mt-1.5 font-display text-[1.6rem] font-extrabold leading-none tracking-[-0.03em] text-tinta">
                {m.valor}
              </p>
            </Tarjeta>
          ))}
        </div>

        {/* ----------------------------- Crear ---------------------------- */}
        <Tarjeta tono="nube" className="mt-6 p-5 sm:p-6">
          <h3 className="font-display text-[1.2rem] font-extrabold tracking-[-0.02em] text-tinta">
            Crear un código
          </h3>
          <p className="mb-5 mt-1.5 text-[0.9rem] leading-relaxed text-tinta/75">
            Nace activo. El ciclista lo escribe al inscribirse y ve el precio
            rebajado antes de transferir.
          </p>
          <CrearCodigo />
        </Tarjeta>

        {/* ---------------------------- Buscador -------------------------- */}
        <form method="get" className="mt-7 flex flex-wrap items-end gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label
              htmlFor="q"
              className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta/75"
            >
              Buscar un código
            </label>
            <input
              id="q"
              name="q"
              defaultValue={consulta}
              placeholder="Código o nombre del embajador"
              className="campo"
            />
          </div>
          <button
            type="submit"
            className="pulsable rounded-2xl tinta-sm bg-turquesa px-5 py-3 font-display text-[0.95rem] font-extrabold text-tinta"
          >
            Buscar
          </button>
          {consulta && (
            <Link
              href="/panel/codigos"
              className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.13em] text-rio hover:underline"
            >
              Ver todos
            </Link>
          )}
        </form>

        {/* ---------------------------- Listado --------------------------- */}
        {codigos.length === 0 ? (
          <Tarjeta tono="marea" className="mt-7 p-7">
            <p className="text-[0.98rem] leading-relaxed text-tinta/85">
              {consulta
                ? `No hay ningún código que coincida con «${consulta}».`
                : "Todavía no hay ningún código. Crea el primero arriba."}
            </p>
          </Tarjeta>
        ) : (
          <>
            <p className="raya-mono mt-6 text-[0.7rem] text-tinta/75">
              {codigos.length} código{codigos.length === 1 ? "" : "s"}
              {consulta ? ` para «${consulta}»` : " · los activos primero"}
            </p>
            <ol className="mt-3 flex flex-col gap-3">
              {codigos.map((c) => (
                <FilaCodigo key={c.codigo} codigo={c} />
              ))}
            </ol>
          </>
        )}
      </main>
      <Pie />
    </>
  );
}
