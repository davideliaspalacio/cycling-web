import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { resumenCorreos, seguimientoCorreos } from "@/lib/almacen";
import { MODO_CORREO } from "@/lib/correos/enviar";
import {
  TEXTO_TIPO_REBOTE,
  estadoVisible,
  explicarRebote,
  inicioDelDiaEnColombia,
  nombreDePlantilla,
} from "@/lib/correos/seguimiento";
import { HAY_WEBHOOK } from "@/lib/correos/webhook";
import type { CorreoSeguido, EstadoEntrega } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: "¿Llegaron los correos?",
};

/**
 * Seguimiento de correos para quien atiende al ciclista.
 *
 * El caso de uso es literal: alguien escribe "no me llegó nada" y hay que
 * poder contestarle en diez segundos. Por eso lo primero es el buscador por
 * nombre, y por eso el estado se dice en español y no con el vocabulario del
 * proveedor.
 *
 * La regla que no se puede romper: **enviado no es entregado**. Que ZeptoMail
 * aceptara el correo no significa que llegara; eso lo cuenta después por
 * webhook. Mientras el webhook no esté configurado, aquí pone "sin confirmar"
 * y se explica qué falta. Nunca "entregado" sin un dato detrás.
 *
 * /correos sigue existiendo aparte y no se fusiona con esta pantalla: responde
 * otra pregunta ("¿qué decía el correo?"), la contesta pintando el HTML
 * completo en un iframe, y se usa para revisar textos. Esta responde "¿llegó?"
 * y tiene que poder listar cientos de filas sin traerse un HTML de 20 KB por
 * cada una. Cada fila enlaza a la otra pantalla, que es todo lo que hace falta.
 */

const ESTADOS: EstadoEntrega[] = [
  "REBOTADO",
  "QUEJA",
  "ENTREGADO",
  "SIN_CONFIRMAR",
];

const ETIQUETA_FILTRO: Record<EstadoEntrega, string> = {
  REBOTADO: "Rebotados",
  QUEJA: "Marcados como spam",
  ENTREGADO: "Entregados",
  ABIERTO: "Abiertos",
  SIN_CONFIRMAR: "Sin confirmar",
};

function esEstado(v: string | undefined): v is EstadoEntrega {
  return (
    !!v && ["SIN_CONFIRMAR", "ENTREGADO", "ABIERTO", "REBOTADO", "QUEJA"].includes(v)
  );
}

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ------------------------------ Una fila ---------------------------------- */

function Fila({ correo }: { correo: CorreoSeguido }) {
  const estado = estadoVisible(correo, HAY_WEBHOOK);
  const rebote =
    estado.clave === "REBOTADO"
      ? explicarRebote(
          correo.reboteTipo,
          correo.reboteMotivo,
          correo.reboteDiagnostico,
        )
      : undefined;

  return (
    <li>
      <Tarjeta tono="nube" className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <Chip tono={estado.tono} className="self-start sm:w-40 sm:shrink-0">
            {estado.etiqueta}
          </Chip>

          <div className="min-w-0 flex-1">
            <p className="font-display text-[0.98rem] font-extrabold leading-snug text-tinta">
              {correo.ciclista
                ? `${correo.ciclista.nombres} ${correo.ciclista.apellidos}`
                : correo.para}
            </p>
            <p className="raya-mono mt-0.5 break-words text-[0.72rem] text-tinta/75">
              {correo.para}
              {correo.referencia ? ` · ${correo.referencia}` : ""}
            </p>
            <p className="mt-1.5 text-[0.88rem] leading-snug text-tinta/85">
              {nombreDePlantilla(correo.plantilla)}
            </p>
            <p className="mt-1 text-[0.8rem] leading-snug text-tinta/75">
              {estado.detalle}
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-1 sm:items-end">
            <span className="raya-mono text-[0.7rem] text-tinta/75">
              {cuando(correo.enviadoEn)}
            </span>
            <Link
              href={`/correos/${correo.id}`}
              className="raya-mono text-[0.7rem] font-bold text-rio hover:underline"
            >
              Ver el correo →
            </Link>
          </div>
        </div>

        {rebote && (
          /* El rebote es lo único que obliga a hacer algo, así que se explica
             entero aquí y no detrás de un clic. */
          <div className="mt-3 rounded-2xl bg-alerta p-4">
            <p className="font-display text-[0.95rem] font-extrabold leading-snug text-nube">
              {rebote.titulo}
            </p>
            <p className="mt-1.5 text-[0.85rem] leading-relaxed text-nube/90">
              {rebote.queHacer}
            </p>
            <p className="raya-mono mt-2 break-words text-[0.66rem] text-nube/75">
              {correo.reboteTipo ? TEXTO_TIPO_REBOTE[correo.reboteTipo] : "Rebote"}
              {correo.rebotadoEn ? ` · ${cuando(correo.rebotadoEn)}` : ""}
              {" · el proveedor dijo: "}
              {[correo.reboteMotivo, correo.reboteDiagnostico]
                .filter(Boolean)
                .join(" / ") || "sin detalle"}
            </p>
          </div>
        )}
      </Tarjeta>
    </li>
  );
}

/* -------------------------------- Pantalla -------------------------------- */

export default async function SeguimientoDeCorreos({
  searchParams,
}: PageProps<"/panel/correos">) {
  const { q, estado } = await searchParams;
  const consulta = typeof q === "string" ? q.trim() : "";
  const filtro = esEstado(typeof estado === "string" ? estado : undefined)
    ? (estado as EstadoEntrega)
    : undefined;

  const [correos, resumen] = await Promise.all([
    seguimientoCorreos({ q: consulta || undefined, estado: filtro }),
    resumenCorreos(inicioDelDiaEnColombia()),
  ]);

  const enlaceFiltro = (e?: EstadoEntrega) => {
    const p = new URLSearchParams();
    if (consulta) p.set("q", consulta);
    if (e) p.set("estado", e);
    const s = p.toString();
    return `/panel/correos${s ? `?${s}` : ""}`;
  };

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
          titulo="¿Le llegó el correo?"
          bajada="Busca al ciclista por su nombre, su correo o su referencia y mira qué pasó con cada mensaje que le mandamos. Enviado y entregado no son lo mismo: aquí solo dice «entregado» cuando el servidor del ciclista lo confirmó."
        />

        {/* ------------------------- Avisos honestos ------------------------ */}

        {MODO_CORREO === "sin-configurar" && (
          <Tarjeta tono="alerta" className="mt-8 p-6">
            <p className="font-display text-lg font-extrabold text-nube">
              Ahora mismo no sale ningún correo.
            </p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-nube/90">
              Falta <code>ZEPTOMAIL_API_KEY</code>. Los correos se guardan pero
              no se envían: los ciclistas que transfieren no reciben
              confirmación. Esto se arregla antes que nada.
            </p>
          </Tarjeta>
        )}

        {!HAY_WEBHOOK && (
          <Tarjeta tono="sol" className="mt-4 p-6">
            <p className="font-display text-lg font-extrabold text-tinta">
              El estado de entrega todavía no está disponible.
            </p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-tinta/85">
              Sabemos que ZeptoMail aceptó cada correo, y nada más. Para saber
              si llegó o si rebotó hace falta que ZeptoMail nos avise, y ese
              aviso aún no está conectado. Mientras tanto todo aparece como{" "}
              <strong>sin confirmar</strong>, que es la verdad: no lo sabemos.
            </p>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-tinta/85">
              Falta hacer dos cosas, una en cada sitio:
            </p>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[0.92rem] leading-relaxed text-tinta/85">
              <li>
                Poner la variable <code>ZEPTOMAIL_WEBHOOK_SECRETO</code> en el
                despliegue, con un valor largo inventado.
              </li>
              <li>
                En ZeptoMail, dentro del Mail Agent, pestaña{" "}
                <strong>Webhooks</strong>: apuntar a{" "}
                <code>/api/correos/webhook</code>, marcar los cuatro avisos
                (entregado, devoluciones temporales, devoluciones permanentes y
                bucle de retroalimentación) y añadir el encabezado de
                autorización <code>X-Webhook-Clave</code> con ese mismo valor.
              </li>
            </ol>
          </Tarjeta>
        )}

        {/* ---------------------------- Resumen ----------------------------- */}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              etiqueta: "Enviados hoy",
              valor: resumen.hoy,
              tono: "nube" as const,
              a: enlaceFiltro(),
            },
            {
              etiqueta: "Rebotados",
              valor: resumen.rebotados,
              tono: resumen.rebotados > 0 ? ("alerta" as const) : ("nube" as const),
              a: enlaceFiltro("REBOTADO"),
            },
            {
              etiqueta: "Entregados",
              valor: resumen.entregados,
              tono: "turquesa" as const,
              a: enlaceFiltro("ENTREGADO"),
            },
            {
              etiqueta: "Sin confirmar",
              valor: resumen.sinConfirmar,
              tono: "marea" as const,
              a: enlaceFiltro("SIN_CONFIRMAR"),
            },
          ].map((m) => (
            <Link key={m.etiqueta} href={m.a} className="block">
              <Tarjeta tono={m.tono} className="pulsable h-full p-4">
                <p
                  className={`font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em] ${m.tono === "alerta" ? "text-nube/90" : "text-tinta/75"}`}
                >
                  {m.etiqueta}
                </p>
                <p
                  className={`mt-1.5 font-display text-[1.9rem] font-extrabold leading-none tracking-[-0.03em] ${m.tono === "alerta" ? "text-nube" : "text-tinta"}`}
                >
                  {m.valor}
                </p>
              </Tarjeta>
            </Link>
          ))}
        </div>

        {resumen.noSalieron > 0 && (
          <p className="mt-3 text-[0.88rem] leading-relaxed text-tinta/75">
            Además hay <strong>{resumen.noSalieron}</strong> correos que nunca
            salieron porque faltaba la llave del proveedor. Esos ciclistas no
            recibieron nada.
          </p>
        )}

        {resumen.simulados > 0 && (
          <p className="mt-2 text-[0.88rem] leading-relaxed text-tinta/75">
            Y <strong>{resumen.simulados}</strong> son correos de prueba, de
            cuando se estaba armando la página. No se enviaron a nadie y no
            cuentan en las cifras de arriba.
          </p>
        )}

        {/* --------------------------- Buscador ----------------------------- */}

        <form method="get" className="mt-7 flex flex-wrap items-end gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label
              htmlFor="q"
              className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta/75"
            >
              Buscar al ciclista
            </label>
            <input
              id="q"
              name="q"
              defaultValue={consulta}
              placeholder="Nombre, correo, documento o referencia"
              className="campo"
            />
          </div>
          {filtro && <input type="hidden" name="estado" value={filtro} />}
          <button
            type="submit"
            className="pulsable rounded-2xl tinta-sm bg-turquesa px-5 py-3 font-display text-[0.95rem] font-extrabold text-tinta"
          >
            Buscar
          </button>
        </form>

        <nav className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={enlaceFiltro()}>
            <Chip tono={filtro ? "nube" : "rio"}>Todos</Chip>
          </Link>
          {ESTADOS.map((e) => (
            <Link key={e} href={enlaceFiltro(e)}>
              <Chip tono={filtro === e ? "rio" : "nube"}>{ETIQUETA_FILTRO[e]}</Chip>
            </Link>
          ))}
          <Link
            href="/correos"
            className="ml-auto font-mono text-[0.7rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
          >
            Ver los correos enviados →
          </Link>
        </nav>

        {/* ---------------------------- Listado ----------------------------- */}

        {correos.length === 0 ? (
          <Tarjeta tono="marea" className="mt-7 p-7">
            <p className="text-[0.98rem] leading-relaxed text-tinta/85">
              {consulta
                ? `No hay ningún correo que coincida con «${consulta}»${filtro ? ` entre los ${ETIQUETA_FILTRO[filtro].toLowerCase()}` : ""}. Prueba solo con el apellido, o con la referencia.`
                : filtro
                  ? `No hay correos ${ETIQUETA_FILTRO[filtro].toLowerCase()}. Es una buena noticia.`
                  : "Todavía no se ha enviado ningún correo."}
            </p>
          </Tarjeta>
        ) : (
          <>
            <p className="raya-mono mt-6 text-[0.7rem] text-tinta/75">
              {correos.length} correo{correos.length === 1 ? "" : "s"}
              {consulta ? ` para «${consulta}»` : ""}
              {correos.length === 200 ? " (los 200 más recientes)" : ""}
            </p>
            <ol className="mt-3 flex flex-col gap-3">
              {correos.map((c) => (
                <Fila key={c.id} correo={c} />
              ))}
            </ol>
          </>
        )}
      </main>
      <Pie />
    </>
  );
}
