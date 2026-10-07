import Image from "next/image";
import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Cuenta } from "@/components/hero-altimetria";
import { KitDeLaInscripcion } from "@/components/kit-de-la-inscripcion";
import { BotonEnlace, Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import {
  CATEGORIAS,
  CUENTAS_RECAUDO,
  DIAS_ENTRE_CUOTAS,
  ETAPA_ACTIVA,
  EVENTO,
  FECHA_LIMITE_ABONOS,
  GRUPOS,
  MAX_CUOTAS,
  PLANES_DE_CUOTAS,
  PRECIO_INSCRIPCION,
  categoriasDeGrupo,
  recorridoDe,
} from "@/lib/catalogo";
import { fechaLarga, montosDelPlan, pesos } from "@/lib/dinero";

/**
 * Los planes diferidos con su primera cuota, para el cartel de precios. El de
 * una cuota es el pago total y va aparte, en su propia tarjeta.
 */
const PLANES = PLANES_DE_CUOTAS.filter((n) => n > 1).map((cuotas) => ({
  cuotas,
  montos: montosDelPlan(PRECIO_INSCRIPCION, cuotas),
}));

const CINTA = [
  EVENTO.tipo.toUpperCase(),
  `${EVENTO.edicionOrdinal} EDICIÓN`,
  EVENTO.lema,
  EVENTO.lugar.toUpperCase(),
  `${CATEGORIAS.length} CATEGORÍAS`,
  `HASTA ${MAX_CUOTAS} CUOTAS SIN RECARGO`,
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
              esfuerzo que eso: cinco pasos, y pagas de una o hasta en{" "}
              {MAX_CUOTAS} cuotas.
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
        {/*
          Las dos piezas de la etapa 2. Sustituyen al cartel de la etapa 1,
          que anunciaba un precio y unos cupos que ya no son ciertos.

          Aquí no se escribe ningún valor en texto: el precio vive en «Cómo se
          paga», derivado del catálogo, para que haya una sola cifra en toda la
          página y salga siempre del mismo sitio.
        */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <TituloSeccion
            eyebrow={`${ETAPA_ACTIVA.nombre} · Inscripciones abiertas`}
            titulo="La convocatoria."
            bajada={`${ETAPA_ACTIVA.cupos} cupos para los ${EVENTO.fechaLegible} en ${EVENTO.lugar}. Guarda las piezas o compártelas para invitar a tu grupo.`}
          />

          {/*
            Cupos, cuotas y descuento salen de `ETAPA_ACTIVA`: abrir la etapa 3
            tiene que cambiar esta fila sola, sin que nadie se acuerde de venir
            a editarla. Así se quedó la portada anunciando 150 cupos.
          */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Chip tono="rio">{EVENTO.fechaLegible}</Chip>
            <Chip tono="sol">{ETAPA_ACTIVA.cupos} cupos</Chip>
            {ETAPA_ACTIVA.descuento > 0 && (
              <Chip tono="turquesa">
                −{ETAPA_ACTIVA.descuento}% con código de referido
              </Chip>
            )}
            <a
              href="#pagos"
              className="raya-mono text-[0.72rem] font-bold uppercase tracking-[0.1em] text-rio underline underline-offset-4"
            >
              Ver el valor y las cuotas
            </a>
          </div>

          <div className="mt-10 grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
            <figure className="tinta animate-rise overflow-hidden rounded-[18px] bg-nube [--rise-rot:-0.8deg]">
              <Image
                src="/fotos/etapa2/cupos.jpg"
                alt={`Pieza de apertura de inscripciones de ${EVENTO.nombre}: ${ETAPA_ACTIVA.nombre}, con los cupos y la fecha de la carrera`}
                width={1200}
                height={1200}
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
              El alt no repite la cifra de la pieza: la cifra que vale es la
              del catálogo y se anuncia en «Cómo se paga». Describirla aquí a
              mano sería escribir el precio dos veces y en dos sitios que
              pueden dejar de coincidir.
            */}
            <figure
              className="tinta animate-rise overflow-hidden rounded-[18px] bg-nube [--rise-rot:0.8deg]"
              style={{ animationDelay: "0.09s" }}
            >
              <Image
                src="/fotos/etapa2/valor.jpg"
                alt={`Pieza del valor de la inscripción de ${ETAPA_ACTIVA.nombre}: pago a cuotas y descuento por inscripción referenciada`}
                width={1200}
                height={1200}
                sizes="(max-width: 640px) 100vw, 50vw"
                className="h-auto w-full"
              />
              <figcaption className="border-t-[3px] border-tinta bg-rio px-4 py-2.5">
                <p className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] text-nube">
                  Valor de la inscripción
                </p>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ------------------------------- Kit ------------------------------- */}
        <KitDeLaInscripcion />

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
                {pesos(PRECIO_INSCRIPCION)} para todas: de una, o repartidos
                hasta en {MAX_CUOTAS} cuotas desde{" "}
                {pesos(PLANES[PLANES.length - 1].montos[0])}. La organización
                verifica que tu edad coincida con la categoría antes de
                confirmar el cupo.
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

          {/*
            La pieza oficial de categorías, debajo de las tarjetas y no encima:
            las tarjetas son las que llevan el requisito de cada categoría y
            las que se pueden pulsar para inscribirse. Esta es para guardar y
            compartir.
          */}
          <figure className="tinta animate-rise mx-auto mt-14 w-full max-w-md overflow-hidden rounded-[18px] bg-nube [--rise-rot:-0.6deg]">
            <Image
              src="/fotos/etapa2/categorias.jpg"
              alt={`Pieza oficial con las ${CATEGORIAS.length} categorías de ${EVENTO.nombre} ${EVENTO.anio}`}
              width={1200}
              height={1200}
              sizes="(max-width: 768px) 100vw, 28rem"
              className="h-auto w-full"
            />
            <figcaption className="border-t-[3px] border-tinta px-4 py-2.5">
              <p className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
                Las {CATEGORIAS.length} categorías, para compartir
              </p>
            </figcaption>
          </figure>
        </section>

        {/* ------------------------------ Pagos ------------------------------ */}
        <section
          id="pagos"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <TituloSeccion
            eyebrow="Cómo se paga"
            titulo={`De una, o hasta en ${MAX_CUOTAS} cuotas.`}
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
              <Chip tono="nube">Hasta {MAX_CUOTAS} cuotas</Chip>
              <p className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight">
                Desde {pesos(PLANES[PLANES.length - 1].montos[0])}
              </p>
              <p className="text-[0.95rem] leading-relaxed text-tinta/75">
                Reservas el cupo con la primera cuota y tienes{" "}
                <strong className="text-tinta">
                  {DIAS_ENTRE_CUOTAS} días de plazo
                </strong>{" "}
                entre una cuota y la siguiente. Sumen las que sumen, son{" "}
                {pesos(PRECIO_INSCRIPCION)} exactos — sin un peso de recargo.
              </p>

              <ol className="mt-1 flex flex-col gap-1.5">
                {PLANES.map(({ cuotas, montos }) => (
                  <li
                    key={cuotas}
                    className="flex items-center gap-3 rounded-xl border-[2.5px] border-tinta bg-nube/80 px-3 py-2"
                  >
                    <span className="raya-mono text-[0.7rem] font-bold text-tinta/75">
                      0{cuotas}
                    </span>
                    <span className="text-[0.84rem] font-medium text-tinta/75">
                      {cuotas} cuotas de {montos.map((m) => pesos(m)).join(" · ")}
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-3 rounded-xl border-[2.5px] border-tinta bg-nube/80 px-3 py-2">
                  <span className="raya-mono text-[0.7rem] font-bold text-tinta/75">
                    ✓
                  </span>
                  <span className="text-[0.84rem] font-medium text-tinta/75">
                    Cada una con su comprobante, que verificamos a mano
                  </span>
                </li>
              </ol>

              <p className="text-[0.84rem] leading-snug text-tinta/75">
                Todas las fechas se te enseñan al inscribirte, antes de decidir.
                Si te inscribes tan cerca del cierre que los{" "}
                {DIAS_ENTRE_CUOTAS} días de la última ya no caben, ese plan no se
                ofrece: te decimos por qué y quedan los que sí quepan.
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
                Tu página de inscripción muestra todas tus cuotas con sus
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
