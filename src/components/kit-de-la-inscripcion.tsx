import Image from "next/image";
import { EVENTO } from "@/lib/catalogo";
import { BotonEnlace, Tarjeta, TituloSeccion } from "@/components/ui";

/**
 * Lo que incluye la inscripción, transcrito de la pieza `kit.jpg` que manda la
 * organización.
 *
 * Va en texto y no solo en la imagen a propósito: son veintidós renglones, y
 * una foto de veintidós renglones no se lee en un teléfono de 375 px con mala
 * señal — que es justo donde se decide la inscripción. La imagen queda al lado
 * como complemento y para compartir, no como el contenido.
 *
 * El orden es el de la pieza (su columna izquierda y luego la derecha), para
 * que quien tenga las dos delante encuentre lo mismo en el mismo sitio.
 *
 * La edición y los días de competencia salen del catálogo: si cambian, el kit
 * no se queda diciendo "10ª" por su cuenta.
 */
const KIT = [
  "Tula oficial",
  `Jersey oficial ${EVENTO.edicionOrdinal}`,
  `Camiseta rider ${EVENTO.edicionOrdinal}`,
  "Medias de ciclismo",
  "Caramañola",
  "Chip de medición de tiempos",
  "Número delantero",
  "Medalla finisher",
  "Seguro contra accidentes",
  "Hidratación en meta (Electrolife)",
  "Almuerzo el día 2",
  "Señalización y marcación",
  "Fotografía con reconocimiento facial",
  "Gel energético",
  "Lubricante",
  "Atención médica",
  `Puntos de hidratación y alimentación los ${EVENTO.etapas} días`,
  "Asistencia mecánica",
  "Calcomanías de altimetrías",
  "Carro escoba",
  "Certificado digital de tiempo general",
  "Premiación en efectivo",
];

export function KitDeLaInscripcion() {
  return (
    <section
      id="kit"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
    >
      <TituloSeccion
        eyebrow="Qué recibes"
        titulo={`Kit ${EVENTO.anio}: las ${KIT.length} cosas que van incluidas.`}
        bajada={`Todo esto entra en la inscripción, sin pagar nada aparte. Está escrito renglón por renglón —no solo en la pieza— para que se pueda leer en el teléfono, de camino a decidir.`}
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_minmax(0,21rem)] lg:items-start">
        <Tarjeta tono="nube" className="flex flex-col gap-6 p-6 sm:p-8">
          {/*
            Dos columnas de periódico y no una rejilla: `columns` llena primero
            la izquierda entera y luego la derecha, que es como están repartidos
            los renglones en la pieza. Con `grid` el orden salía en zigzag y
            quien tuviera la imagen al lado no encontraba nada donde esperaba.
            En el teléfono es una sola columna y la cuestión no se plantea.
          */}
          <ul className="sm:columns-2 sm:gap-x-8">
            {KIT.map((cosa) => (
              <li key={cosa} className="mb-3.5 flex break-inside-avoid gap-2.5">
                <span
                  aria-hidden
                  className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full bg-turquesa ring-2 ring-tinta"
                />
                <span className="text-[0.95rem] leading-snug text-tinta/75">
                  {cosa}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-4 border-t-[3px] border-dashed border-tinta/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.88rem] leading-snug text-tinta/75">
              Las tallas del jersey y de la camiseta las eliges tú al
              inscribirte.
            </p>
            <BotonEnlace href="/inscripcion" className="shrink-0 self-start">
              Inscribirme
            </BotonEnlace>
          </div>
        </Tarjeta>

        {/*
          La pieza oficial, para guardar o compartir. Debajo de la lista en el
          teléfono y al lado en pantalla ancha: el texto manda, la imagen
          acompaña.
        */}
        <figure
          className="tinta animate-rise mx-auto w-full max-w-sm overflow-hidden rounded-[18px] bg-nube [--rise-rot:0.8deg] lg:max-w-none"
          style={{ animationDelay: "0.09s" }}
        >
          <Image
            src="/fotos/etapa2/kit.jpg"
            alt={`Pieza oficial del Kit ${EVENTO.anio} de ${EVENTO.nombre}`}
            width={1200}
            height={1200}
            sizes="(max-width: 1024px) 24rem, 21rem"
            className="h-auto w-full"
          />
          <figcaption className="border-t-[3px] border-tinta bg-rio px-4 py-2.5">
            <p className="raya-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] text-nube">
              La pieza del kit, para compartir
            </p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
