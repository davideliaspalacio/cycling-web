import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Cuenta, HeroAltimetria } from "@/components/hero-altimetria";
import { BotonEnlace, Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { CATEGORIAS, EVENTO, GRUPOS } from "@/lib/catalogo";
import { pesos, repartirEnCuotas } from "@/lib/dinero";

const CINTA = [
  "92 KM",
  "2.850 M D+",
  "3.420 MSNM",
  "900 CUPOS",
  "15 CATEGORÍAS",
  "4 CUOTAS SIN RECARGO",
];

export default function Inicio() {
  const cuotas = repartirEnCuotas(750000);

  return (
    <>
      <Encabezado />

      <main className="flex-1">
        {/* ------------------------------ Héroe ------------------------------ */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pt-16">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tono="lima">{EVENTO.lema}</Chip>
            <Chip tono="selva">
              {EVENTO.fechaLegible} · {EVENTO.lugar}
            </Chip>
            <span className="raya-mono text-[0.72rem] text-hueso/45">
              Faltan <Cuenta hasta={EVENTO.fecha} />
            </span>
          </div>

          <h1 className="mt-6 max-w-4xl font-display text-[clamp(2.7rem,8.2vw,5.6rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-hueso">
            Nadie llega arriba
            <br />
            <span className="text-lima">por accidente.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-hueso/70">
            El Tibet Epic sube 2.850 metros en 92 kilómetros de páramo. Inscribirse
            debería costar mucho menos esfuerzo que eso: cinco pasos, y pagas de
            una o en cuatro cuotas.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BotonEnlace href="/inscripcion" tamano="lg">
              Inscribirme
            </BotonEnlace>
            <BotonEnlace href="#categorias" tono="selva" tamano="lg">
              Ver categorías
            </BotonEnlace>
          </div>

          <div className="mt-14">
            <HeroAltimetria />
          </div>
        </section>

        {/* ------------------------------ Cinta ------------------------------ */}
        <div className="overflow-hidden border-y-[3px] border-tinta bg-lima py-3">
          <div className="flex w-max animate-ticker gap-10 pr-10">
            {[...CINTA, ...CINTA, ...CINTA, ...CINTA].map((t, i) => (
              <span
                key={i}
                className="raya-mono whitespace-nowrap text-[0.82rem] font-bold uppercase tracking-[0.14em] text-tinta"
              >
                {t} <span className="text-tinta/40">◆</span>
              </span>
            ))}
          </div>
        </div>

        {/* --------------------------- Categorías ---------------------------- */}
        <section
          id="categorias"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <TituloSeccion
            eyebrow="Elige dónde compites"
            titulo="Quince categorías, un solo precio."
            bajada={
              <>
                {pesos(750000)} para todas, de contado o en cuatro cuotas. La
                organización verifica que tu edad coincida con la categoría antes
                de confirmar el cupo.
              </>
            }
          />

          <div className="mt-10 flex flex-col gap-12">
            {GRUPOS.map((grupo) => (
              <div key={grupo.id}>
                <div className="mb-5 flex items-baseline gap-3 border-b-[3px] border-dashed border-hueso/15 pb-3">
                  <h3 className="font-display text-2xl font-extrabold tracking-tight text-hueso">
                    {grupo.titulo}
                  </h3>
                  <span className="raya-mono text-[0.7rem] text-hueso/40">
                    {grupo.nota}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {CATEGORIAS.filter((c) => c.grupo === grupo.id).map((cat, i) => (
                    <Link
                      key={cat.codigo}
                      href={`/inscripcion?categoria=${cat.codigo}`}
                      className="group animate-rise"
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <Tarjeta
                        tono={cat.destacada ? "lima" : "hueso"}
                        className="pulsable flex h-full flex-col gap-3 p-5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-display text-xl font-extrabold leading-tight tracking-tight">
                            {cat.nombre}
                          </h4>
                          {cat.destacada && (
                            <span className="raya-mono shrink-0 rounded-full border-2 border-tinta bg-tinta px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-lima">
                              Élite
                            </span>
                          )}
                        </div>

                        <p className="flex-1 text-[0.86rem] leading-snug text-tinta/65">
                          {cat.requisito}
                        </p>

                        <div className="flex items-center gap-3 border-t-2 border-dashed border-tinta/20 pt-3">
                          <span className="raya-mono text-[0.72rem] font-bold text-tinta/70">
                            {cat.km} KM
                          </span>
                          <span className="raya-mono text-[0.72rem] font-bold text-tinta/70">
                            {cat.desnivel.toLocaleString("es-CO")} M D+
                          </span>
                          <span className="ml-auto font-display text-base font-extrabold">
                            {pesos(cat.precio)}
                          </span>
                        </div>
                      </Tarjeta>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------ Pagos ------------------------------ */}
        <section
          id="pagos"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <TituloSeccion
            eyebrow="Cómo se paga"
            titulo="De una, o en cuatro cuotas."
            bajada="El plan de cuotas guarda tu tarjeta con Wompi y cobra solo el día 5 de cada mes. No hay intereses, no hay papeleo, y puedes adelantar cuando quieras."
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Tarjeta tono="hueso" className="flex flex-col gap-4 p-7">
              <Chip tono="selva">Pago de contado</Chip>
              <p className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
                {pesos(750000)}
              </p>
              <p className="text-[0.95rem] leading-relaxed text-tinta/70">
                Un solo pago con tarjeta, PSE, Nequi o corresponsal bancario. El
                cupo queda confirmado apenas Wompi aprueba la transacción.
              </p>
              <ul className="mt-1 flex flex-col gap-2 text-[0.88rem] text-tinta/75">
                {[
                  "Confirmación por correo en menos de un minuto",
                  "Reembolso del 70 % hasta el 1 de abril de 2027",
                  "Todos los medios de pago de Wompi",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-[0.35rem] h-2 w-2 shrink-0 rounded-full bg-lima ring-2 ring-tinta" />
                    {t}
                  </li>
                ))}
              </ul>
              <BotonEnlace href="/inscripcion" className="mt-auto self-start">
                Inscribirme y pagar
              </BotonEnlace>
            </Tarjeta>

            <Tarjeta tono="naranja" className="flex flex-col gap-4 p-7">
              <Chip tono="hueso">Plan de 4 cuotas</Chip>
              <p className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
                {pesos(cuotas[0])}
                <span className="ml-1 align-middle font-sans text-base font-bold tracking-normal">
                  /mes
                </span>
              </p>
              <p className="text-[0.95rem] leading-relaxed text-tinta/75">
                Reservas el cupo con la primera cuota hoy. Las tres siguientes se
                cobran solas el día 5 de cada mes. Suman {pesos(750000)} exactos —
                sin un peso de recargo.
              </p>

              <ol className="mt-1 flex flex-col gap-1.5">
                {cuotas.map((monto, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border-[2.5px] border-tinta bg-hueso/80 px-3 py-2"
                  >
                    <span className="raya-mono text-[0.7rem] font-bold text-tinta/55">
                      C{i + 1}
                    </span>
                    <span className="text-[0.84rem] font-medium text-tinta/75">
                      {i === 0 ? "Hoy, al inscribirte" : `Día 5, mes ${i + 1}`}
                    </span>
                    <span className="raya-mono ml-auto text-[0.88rem] font-bold">
                      {pesos(monto)}
                    </span>
                  </li>
                ))}
              </ol>

              <BotonEnlace
                href="/inscripcion"
                tono="hueso"
                className="mt-auto self-start"
              >
                Reservar con la primera cuota
              </BotonEnlace>
            </Tarjeta>
          </div>

          <Tarjeta tono="selva" className="mt-5 flex flex-col gap-4 p-7 sm:flex-row sm:items-center">
            <div className="flex-1">
              <h3 className="font-display text-xl font-extrabold tracking-tight text-hueso">
                Siempre sabes cuánto te falta.
              </h3>
              <p className="mt-2 max-w-2xl text-[0.92rem] leading-relaxed text-hueso/65">
                Cada cobro te llega por correo con el comprobante, el saldo
                restante y la fecha del siguiente. Tres días antes de cada cuota
                te avisamos, y si el banco rechaza el cobro te lo decimos con el
                motivo y un enlace para pagar con otro medio.
              </p>
            </div>
            <BotonEnlace href="/correos" tono="lima" className="shrink-0">
              Ver los correos
            </BotonEnlace>
          </Tarjeta>
        </section>
      </main>

      <Pie />
    </>
  );
}
