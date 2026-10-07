import Link from "next/link";
import { cookies } from "next/headers";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { abonosPorRevisar, listarInscripciones } from "@/lib/almacen";
import {
  CODIGO_ETAPA_ACTIVA,
  ETAPAS,
  categoriaPorCodigo,
  etapaDeInscripcion,
  etapaPorCodigo,
} from "@/lib/catalogo";
import { pesos, textoDePlan } from "@/lib/dinero";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import type { EstadoInscripcion, Inscripcion } from "@/lib/tipos";
import { Salir } from "./salir";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: "Panel de la organización",
};

const TONO: Record<EstadoInscripcion, "turquesa" | "sol" | "alerta" | "nube"> = {
  BORRADOR: "nube",
  PENDIENTE_PAGO: "alerta",
  EN_VERIFICACION: "sol",
  AL_DIA: "sol",
  EN_MORA: "alerta",
  COMPLETA: "turquesa",
};

const TEXTO: Record<EstadoInscripcion, string> = {
  BORRADOR: "Sin terminar",
  PENDIENTE_PAGO: "Sin pagar",
  EN_VERIFICACION: "Por verificar",
  AL_DIA: "Al día",
  EN_MORA: "En mora",
  COMPLETA: "Completa",
};

export default async function Panel({
  searchParams,
}: PageProps<"/panel">) {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value);
  const { etapa: etapaParam } = await searchParams;

  const [todas, porRevisar] = await Promise.all([
    listarInscripciones(),
    abonosPorRevisar(),
  ]);

  /*
   * Los cupos se cuentan por etapa, sobre TODAS las inscripciones, antes de
   * filtrar: la pregunta "¿cuántos cupos quedan?" no cambia porque alguien
   * esté mirando una etapa concreta en la tabla de abajo.
   *
   * Las inscripciones anteriores a la columna `etapa` cuentan como de la
   * primera, que es lo que son (`etapaDeInscripcion`).
   */
  const porEtapa = ETAPAS.map((e) => {
    const suyas = todas.filter((i) => etapaDeInscripcion(i).codigo === e.codigo);
    return {
      etapa: e,
      inscritos: suyas.length,
      quedan: Math.max(0, e.cupos - suyas.length),
      recaudado: suyas.reduce((s, i) => s + i.pagado, 0),
      activa: e.codigo === CODIGO_ETAPA_ACTIVA,
    };
  });

  const filtroEtapa =
    typeof etapaParam === "string" && etapaPorCodigo(etapaParam)
      ? etapaParam
      : undefined;

  const inscripciones: Inscripcion[] = filtroEtapa
    ? todas.filter((i) => etapaDeInscripcion(i).codigo === filtroEtapa)
    : todas;

  const recaudado = inscripciones.reduce((s, i) => s + i.pagado, 0);
  // El saldo sale de `total − pagado` y no de la tabla de cuotas: bajo pago
  // manual las cuotas son un plan sugerido, no el libro de dinero, y una
  // inscripción por transferencia ni siquiera tiene filas de cuota
  // (docs/decisiones-pago-manual.md §1).
  const porCobrar = inscripciones.reduce(
    (s, i) => s + Math.max(0, i.total - i.pagado),
    0,
  );
  const declaradoSinConfirmar = porRevisar.reduce(
    (s, a) => s + a.montoDeclarado,
    0,
  );

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <TituloSeccion
            eyebrow="Uso interno"
            titulo="Quién viene y quién debe."
            bajada="Nadie cobra automáticamente: el dinero entra cuando alguien de la organización verifica un comprobante. Esta pantalla muestra lo que ya entró, lo que falta y lo que está esperando una decisión humana."
          />
          {sesion && <Salir nombre={sesion.nombre} />}
        </div>

        {/* La métrica que dispara trabajo: va primero, sola y en grande. */}
        <Link href="/panel/evidencias" className="mt-9 block">
          <Tarjeta
            tono={porRevisar.length > 0 ? "alerta" : "nube"}
            className="pulsable flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              {/* Sobre el rojo de alerta el texto va en claro: la tinta encima
                  del rojo no llega ni a 3:1. */}
              <p
                className={`font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] ${porRevisar.length > 0 ? "text-nube/90" : "text-tinta/75"}`}
              >
                Evidencias por revisar
              </p>
              <p
                className={`mt-1 font-display text-[3rem] font-extrabold leading-none tracking-[-0.04em] ${porRevisar.length > 0 ? "text-nube" : "text-tinta"}`}
              >
                {porRevisar.length}
              </p>
              <p
                className={`mt-2 max-w-md text-[0.88rem] leading-snug ${porRevisar.length > 0 ? "text-nube/90" : "text-tinta/75"}`}
              >
                {porRevisar.length === 0
                  ? "La cola está vacía. Cuando llegue un comprobante, aparece aquí."
                  : `${pesos(declaradoSinConfirmar)} declarados que todavía no son dinero. Hasta que alguien los mire, el ciclista está esperando.`}
              </p>
            </div>
            <span
              className={`shrink-0 font-display text-[1.05rem] font-extrabold underline underline-offset-4 ${porRevisar.length > 0 ? "text-nube" : "text-tinta"}`}
            >
              Abrir la cola →
            </span>
          </Tarjeta>
        </Link>

        {/* ------------------------- Cupos por etapa ----------------------- */}
        {/*
          Las dos etapas son tarifas distintas y cupos distintos, así que
          sumarlas en una sola cifra no contesta nada: lo que la organización
          pregunta es cuántos cupos quedan de la que está abierta.
        */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {porEtapa.map((e) => {
            const pct = Math.min(
              100,
              Math.round((e.inscritos / e.etapa.cupos) * 100),
            );
            return (
              <Tarjeta
                key={e.etapa.codigo}
                tono={e.activa ? "turquesa" : "nube"}
                className="p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
                    Etapa {e.etapa.nombre}
                  </p>
                  {e.activa ? (
                    <Chip tono="rio">Abierta</Chip>
                  ) : (
                    <Chip tono="nube">Cerrada</Chip>
                  )}
                </div>
                <p className="mt-2 font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] text-tinta">
                  {e.inscritos}{" "}
                  <span className="text-[1.1rem] font-bold text-tinta/75">
                    de {e.etapa.cupos} cupos
                  </span>
                </p>
                <div
                  className="mt-3 h-3 w-full overflow-hidden rounded-md border-[2.5px] border-tinta bg-nube"
                  role="img"
                  aria-label={`${pct}% de los cupos de la etapa ${e.etapa.nombre}`}
                >
                  <div className="h-full bg-rio" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2.5 text-[0.84rem] leading-snug text-tinta/75">
                  Quedan <strong>{e.quedan}</strong> ·{" "}
                  {pesos(e.etapa.precio)} por inscripción · hasta{" "}
                  {Math.max(...e.etapa.planes)} cuota
                  {Math.max(...e.etapa.planes) === 1 ? "" : "s"}
                  {e.etapa.descuento > 0
                    ? ` · ${e.etapa.descuento}% con código`
                    : ""}
                </p>
                <p className="raya-mono mt-1 text-[0.72rem] text-tinta/75">
                  {pesos(e.recaudado)} recaudados en esta etapa
                </p>
                <p className="mt-2">
                  <Link
                    href={
                      filtroEtapa === e.etapa.codigo
                        ? "/panel"
                        : `/panel?etapa=${e.etapa.codigo}`
                    }
                    className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.13em] text-rio hover:underline"
                  >
                    {filtroEtapa === e.etapa.codigo
                      ? "Quitar el filtro"
                      : "Ver solo esta etapa"}{" "}
                    →
                  </Link>
                </p>
              </Tarjeta>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              etiqueta: filtroEtapa ? "Inscritos (etapa filtrada)" : "Inscritos",
              valor: String(inscripciones.length),
              tono: "nube" as const,
            },
            { etiqueta: "Recaudado", valor: pesos(recaudado), tono: "turquesa" as const },
            { etiqueta: "Por cobrar", valor: pesos(porCobrar), tono: "sol" as const },
          ].map((m) => (
            <Tarjeta key={m.etiqueta} tono={m.tono} className="p-5">
              <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
                {m.etiqueta}
              </p>
              <p className="mt-2 font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] text-tinta">
                {m.valor}
              </p>
            </Tarjeta>
          ))}
        </div>

        <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {[
            [
              filtroEtapa
                ? `/panel/exportar?etapa=${filtroEtapa}`
                : "/panel/exportar",
              "Bajar la lista de inscritos",
            ],
            ["/panel/codigos", "Códigos de referido"],
            ["/panel/competidor", "Cambiar de competidor"],
            // "¿Le llegó?" es la pregunta que llega por WhatsApp; el visor de
            // HTML de /correos responde otra ("¿qué decía?") y va detrás.
            ["/panel/correos", "¿Llegaron los correos?"],
            ["/correos", "Ver el HTML enviado"],
          ].map(([href, texto]) => (
            <Link
              key={href}
              href={href}
              className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
            >
              {texto} →
            </Link>
          ))}
        </nav>

        {inscripciones.length === 0 ? (
          <Tarjeta tono="marea" className="mt-8 p-8">
            <p className="text-tinta/75">
              Todavía no hay inscritos.{" "}
              <Link href="/inscripcion" className="text-rio underline underline-offset-4">
                Crea uno de prueba
              </Link>
              .
            </p>
          </Tarjeta>
        ) : (
          <div className="mt-8">
            <p className="mb-3 text-[0.88rem] leading-snug text-tinta/75">
              Toca cualquier fila para ver la ficha completa del inscrito: sus
              datos, su RH y su contacto de emergencia, sus tallas, sus
              comprobantes y todo lo que le ha pasado a su cupo.
            </p>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b-[3px] border-tinta/20">
                  {[
                    "Referencia",
                    "Ciclista",
                    "Categoría",
                    "Etapa",
                    "Plan",
                    "Pagado",
                    "Saldo",
                    "Estado",
                    "",
                  ].map((h, i) => (
                    <th
                      key={h || `col-${i}`}
                      scope="col"
                      className="py-3 pr-4 font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-tinta/75"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inscripciones.map((i) => {
                  const saldo = Math.max(0, i.total - i.pagado);
                  return (
                    <tr
                      key={i.id}
                      className="relative cursor-pointer border-b border-tinta/10 transition-colors hover:bg-nube/[0.04]"
                    >
                      <td className="py-3 pr-4">
                        {/*
                          El enlace es uno solo y cubre la fila entera con su
                          `::after`: así se puede hacer clic en cualquier
                          celda sin repetir el enlace ocho veces ni meter
                          JavaScript de cliente en una tabla que se pinta en
                          el servidor. La referencia sigue siendo el enlace de
                          verdad, que es lo que leen el teclado y el lector de
                          pantalla.
                        */}
                        <Link
                          href={`/panel/inscrito/${i.referencia}`}
                          className="raya-mono text-[0.8rem] font-bold text-rio after:absolute after:inset-0 after:content-[''] hover:underline"
                        >
                          {i.referencia}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-[0.88rem] text-tinta/85">
                        {i.ciclista.nombres} {i.ciclista.apellidos}
                        <span className="block text-[0.75rem] text-tinta/75">
                          {i.ciclista.ciudad}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[0.85rem] text-tinta/75">
                        {categoriaPorCodigo(i.categoriaCodigo)?.nombre}
                      </td>
                      {/*
                        La etapa con el precio al que entró: es el dato que
                        explica por qué dos filas con el mismo saldo deben
                        cifras distintas.
                      */}
                      <td className="py-3 pr-4">
                        <span className="raya-mono text-[0.72rem] text-tinta/75">
                          {etapaDeInscripcion(i).nombre}
                          <span className="block text-[0.68rem] text-tinta/75">
                            {pesos(i.total)}
                            {i.descuento > 0 ? ` · −${pesos(i.descuento)}` : ""}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="raya-mono text-[0.72rem] text-tinta/75">
                          {textoDePlan(i.plan)}
                        </span>
                      </td>
                      <td className="raya-mono py-3 pr-4 text-[0.82rem] text-tinta/85">
                        {pesos(i.pagado)}
                      </td>
                      <td className="raya-mono py-3 pr-4 text-[0.82rem] text-tinta/85">
                        {pesos(saldo)}
                      </td>
                      <td className="py-3 pr-2">
                        <Chip tono={TONO[i.estado]}>{TEXTO[i.estado]}</Chip>
                      </td>
                      <td className="py-3 pr-2">
                        {/* Por encima del enlace que cubre la fila, o no se
                            podría llegar a la cesión desde la tabla. */}
                        <Link
                          href={`/panel/competidor?q=${i.referencia}`}
                          className="raya-mono relative z-10 text-[0.7rem] text-tinta/75 hover:text-rio hover:underline"
                        >
                          Ceder
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </main>
      <Pie />
    </>
  );
}
