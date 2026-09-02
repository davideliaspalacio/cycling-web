import Image from "next/image";
import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Cuenta } from "@/components/hero-altimetria";
import { BotonEnlace, Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import {
  CATEGORIAS,
  CUENTAS_RECAUDO,
  DIAS_ENTRE_CUOTAS,
  EVENTO,
  FECHA_LIMITE_ABONOS,
  GRUPOS,
  MAX_ABONOS,
  PRECIO_INSCRIPCION,
  categoriasDeGrupo,
  recorridoDe,
} from "@/lib/catalogo";
import { fechaLarga, montosDelPlan, pesos } from "@/lib/dinero";

/** Los dos montos del plan. Iguales por construcción: 380.000 → 190.000 × 2. */
const CUOTA = montosDelPlan(PRECIO_INSCRIPCION)[0];

const CINTA = [
  EVENTO.tipo.toUpperCase(),
  `${EVENTO.edicionOrdinal} EDICIÓN`,
  EVENTO.lema,
  EVENTO.lugar.toUpperCase(),
  `${CATEGORIAS.length} CATEGORÍAS`,
  `${MAX_ABONOS} CUOTAS SIN RECARGO`,
];


export default function Inicio() {
  // Los nombres de los destinos de recaudo salen del catálogo, que aquí corre
  // en el servidor. Solo se anuncian las entidades: los números se entregan
  // con la referencia de la inscripción, para que nadie transfiera sin ella.
  const destinos = CUENTAS_RECAUDO.map((c) => c.entidad).join(" · ");

  return (
    <>
      <Encabezado />

      <main className="flex-1">
        {/* ------------------------------ Héroe ------------------------------ */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Chip tono="turquesa">
                {EVENTO.edicionOrdinal} Edición · {EVENTO.lema}
              </Chip>
              <Chip tono="rio">
                {EVENTO.fechaLegible} · {EVENTO.lugar}
              </Chip>
              <span className="raya-mono text-[0.72rem] text-tinta/75">
                Faltan <Cuenta hasta={EVENTO.fecha} />
              </span>
            </div>

            <h1 className="mt-6 font-display text-[clamp(2.7rem,7.4vw,4.8rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-tinta">
              Nadie hereda
              <br />
              <span className="text-rio">un legado.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-tinta/75">
              {EVENTO.etapas} etapas de XCM entre los caminos reales, la piedra y el
              calor de {EVENTO.lugar}. Inscribirse debería costar mucho menos
              esfuerzo que eso: cinco pasos, y pagas de una o en dos cuotas.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <BotonEnlace href="/inscripcion" tamano="lg">
                Inscribirme
              </BotonEnlace>
              <BotonEnlace href="#categorias" tono="rio" tamano="lg">
                Ver categorías
              </BotonEnlace>
            </div>
          </div>

          <figure className="tinta animate-rise overflow-hidden rounded-[22px] bg-nube [--rise-rot:1deg]">
            <Image
              src="/fotos/ciclista-barichara.jpg"
              alt="Ciclista con el maillot de Barichara antes de salir a rodar"
              width={1200}
              height={1600}
              priority
              sizes="(max-width: 1024px) 100vw, 46vw"
              className="h-[clamp(20rem,52vw,32rem)] w-full object-cover object-[center_28%]"
            />
            <figcaption className="border-t-[3px] border-tinta bg-rio px-4 py-2.5">
              <p className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] text-nube">
                Barichara · el pueblo más lindo de Colombia
              </p>
            </figcaption>
          </figure>
        </section>

        {/* ------------------------------ Cinta ------------------------------ */}
        {/*
          Antes esto deslizaba en bucle. Se cambió a una fila fija: son los
          datos que alguien mira una vez para decidir si le interesa la
          carrera, y esperar a que pase el que te falta es trabajo que no
          debería costarle a nadie.
        */}
        <div className="border-y-[3px] border-tinta bg-turquesa">
          <ul className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-7 gap-y-2 px-4 py-3 sm:gap-x-10 sm:px-6">
            {/*
              Sin separadores entre elementos: al envolver en dos filas, el
              último de cada fila se quedaba con un rombo colgando. Los separa
              el espacio.
            */}
            {CINTA.map((t) => (
              <li
                key={t}
                className="raya-mono text-[0.7rem] font-bold uppercase tracking-[0.12em] text-tinta sm:text-[0.82rem]"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* ------------------------------ Cartel ----------------------------- */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <TituloSeccion
            eyebrow="El cartel"
            titulo="La convocatoria."
            bajada={`${pesos(PRECIO_INSCRIPCION)} por las ${EVENTO.etapas} etapas. Guarda el cartel o compártelo para invitar a tu grupo.`}
          />

          <div className="mt-10 grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
            <figure className="tinta animate-rise overflow-hidden rounded-[18px] bg-nube [--rise-rot:-0.8deg]">
              <Image
                src="/fotos/apertura.jpg"
                alt={`Cartel de apertura de inscripciones: ${pesos(PRECIO_INSCRIPCION)} y 150 cupos disponibles`}
                width={1080}
                height={1350}
                sizes="(max-width: 640px) 100vw, 50vw"
                className="h-auto w-full"
              />
              <figcaption className="border-t-[3px] border-tinta px-4 py-2.5">
                <p className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
                  Apertura de inscripciones
                </p>
              </figcaption>
            </figure>

            {/*
              La foto de carrera hace de contrapeso al cartel: uno dice cuánto
              cuesta, la otra por qué vale la pena.
            */}
            <figure
              className="tinta animate-rise overflow-hidden rounded-[18px] bg-nube [--rise-rot:0.8deg]"
              style={{ animationDelay: "0.09s" }}
            >
              <Image
                src="/fotos/pareja-canon.jpg"
                alt={`Dos ciclistas subiendo por la carretera del cañón en una edición anterior de ${EVENTO.nombre}`}
                width={1333}
                height={2000}
                sizes="(max-width: 640px) 100vw, 50vw"
                // El cartel no se puede recortar porque lleva texto hasta el
                // borde; la foto sí, así las dos quedan a la misma altura.
                className="aspect-[4/5] w-full object-cover object-[center_35%]"
              />
              <figcaption className="border-t-[3px] border-tinta bg-rio px-4 py-2.5">
                <p className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] text-nube">
                  El pueblo más lindo de Colombia
                </p>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* --------------------------- Categorías ---------------------------- */}
        <section
          id="categorias"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <TituloSeccion
            eyebrow="Elige dónde compites"
            titulo={`${CATEGORIAS.length} categorías, un solo precio.`}
            bajada={
              <>
                {pesos(PRECIO_INSCRIPCION)} para todas: de una, o en{" "}
                {MAX_ABONOS} cuotas de {pesos(CUOTA)}. La organización verifica
                que tu edad coincida con la categoría antes de confirmar el
                cupo.
              </>
            }
          />

          <div className="mt-10 flex flex-col gap-12">
            {GRUPOS.map((grupo) => (
              <div key={grupo.id}>
                <div className="mb-5 flex items-baseline gap-3 border-b-[3px] border-dashed border-tinta/15 pb-3">
                  <h3 className="font-display text-2xl font-extrabold tracking-tight text-tinta">
                    {grupo.titulo}
                  </h3>
                  <span className="raya-mono text-[0.7rem] text-tinta/75">
                    {grupo.nota}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoriasDeGrupo(grupo.id).map((cat, i) => (
                    <Link
                      key={cat.codigo}
                      href={`/inscripcion?categoria=${cat.codigo}`}
                      className="group animate-rise"
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <Tarjeta
                        tono="nube"
                        className="pulsable flex h-full flex-col gap-3 p-5"
                      >
                        <h4 className="font-display text-xl font-extrabold leading-tight tracking-tight">
                          {cat.nombre}
                        </h4>

                        <p className="flex-1 text-[0.86rem] leading-snug text-tinta/75">
                          {cat.requisito}
                        </p>

                        <div className="flex items-center gap-3 border-t-2 border-dashed border-tinta/20 pt-3">
                          {recorridoDe(cat) && (
                            <span className="raya-mono text-[0.72rem] font-bold uppercase text-tinta/75">
                              {recorridoDe(cat)}
                            </span>
                          )}
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
            titulo={`De una, o en ${MAX_ABONOS} cuotas.`}
            bajada={`Transferencia a ${destinos}. Subes el comprobante y la organización lo verifica contra el extracto. Sin tarjeta, sin recargo y sin cobros automáticos: nadie te toca la cuenta, cada cuota la transfieres tú.`}
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Tarjeta tono="nube" className="flex flex-col gap-4 p-7">
              <Chip tono="rio">Pago total</Chip>
              <p className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
                {pesos(PRECIO_INSCRIPCION)}
              </p>
              <p className="text-[0.95rem] leading-relaxed text-tinta/75">
                Una sola transferencia y listo. El cupo queda confirmado en
                cuanto verifiquemos tu comprobante.
              </p>
              <ul className="mt-1 flex flex-col gap-2 text-[0.88rem] text-tinta/75">
                {[
                  `Transfieres por ${destinos}`,
                  "Subes la foto o el PDF del comprobante",
                  "Sin reembolsos: la inscripción admite cambio de competidor",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-[0.35rem] h-2 w-2 shrink-0 rounded-full bg-turquesa ring-2 ring-tinta" />
                    {t}
                  </li>
                ))}
              </ul>
              <BotonEnlace href="/inscripcion" className="mt-auto self-start">
                Inscribirme y pagar
              </BotonEnlace>
            </Tarjeta>

            <Tarjeta tono="sol" className="flex flex-col gap-4 p-7">
              <Chip tono="nube">{MAX_ABONOS} cuotas</Chip>
              <p className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
                {pesos(CUOTA)} × {MAX_ABONOS}
              </p>
              <p className="text-[0.95rem] leading-relaxed text-tinta/75">
                Reservas el cupo con la primera cuota y tienes{" "}
                <strong className="text-tinta">
                  {DIAS_ENTRE_CUOTAS} días de plazo
                </strong>{" "}
                para la segunda. Suman {pesos(PRECIO_INSCRIPCION)} exactos — sin
                un peso de recargo.
              </p>

              <ol className="mt-1 flex flex-col gap-1.5">
                {[
                  `Cuota 1: ${pesos(CUOTA)} al inscribirte`,
                  `Cuota 2: ${pesos(CUOTA)} a los ${DIAS_ENTRE_CUOTAS} días`,
                  "Cada una con su comprobante, que verificamos a mano",
                ].map((paso, i) => (
                  <li
                    key={paso}
                    className="flex items-center gap-3 rounded-xl border-[2.5px] border-tinta bg-nube/80 px-3 py-2"
                  >
                    <span className="raya-mono text-[0.7rem] font-bold text-tinta/75">
                      0{i + 1}
                    </span>
                    <span className="text-[0.84rem] font-medium text-tinta/75">
                      {paso}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="text-[0.84rem] leading-snug text-tinta/75">
                Las dos fechas se te enseñan al inscribirte, antes de decidir. Si
                te inscribes tan cerca del cierre que los {DIAS_ENTRE_CUOTAS}{" "}
                días ya no caben, el plan no se ofrece y la inscripción se paga
                de una.
              </p>

              <p className="raya-mono text-[0.72rem] font-bold uppercase tracking-[0.1em] text-tinta/75">
                Último día para pagar: {fechaLarga(FECHA_LIMITE_ABONOS)}
              </p>

              <BotonEnlace
                href="/inscripcion"
                tono="nube"
                className="mt-auto self-start"
              >
                Reservar con la primera cuota
              </BotonEnlace>
            </Tarjeta>
          </div>

          <Tarjeta tono="marea" className="mt-5 flex flex-col gap-4 p-7 sm:flex-row sm:items-center">
            <div className="flex-1">
              <h3 className="font-display text-xl font-extrabold tracking-tight text-tinta">
                Siempre sabes cuánto te falta.
              </h3>
              <p className="mt-2 max-w-2xl text-[0.92rem] leading-relaxed text-tinta/75">
                Tu página de inscripción muestra las dos cuotas con sus dos
                fechas y el estado de cada comprobante —enviado, en revisión,
                verificado o rechazado—. Si rechazamos uno te decimos por qué y
                puedes volver a subirlo: no gasta cuota y el cupo no se pierde.
              </p>
            </div>
            <BotonEnlace href="/mi-inscripcion" tono="turquesa" className="shrink-0">
              Ver mi inscripción
            </BotonEnlace>
          </Tarjeta>
        </section>
      </main>

      <Pie />
    </>
  );
}
