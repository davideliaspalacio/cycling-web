import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Chip } from "@/components/ui";
import { Encabezado } from "@/components/marco";
import { BotonImprimir } from "@/components/boton-imprimir";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { EVENTO, categoriaPorCodigo } from "@/lib/catalogo";
import { fechaLarga, pesos, proximaCuota, saldoPendiente } from "@/lib/dinero";

export const dynamic = "force-dynamic";

/**
 * Dorsal estable derivado de la referencia: el mismo ciclista ve siempre el
 * mismo número, sin necesidad de un contador en base de datos.
 */
function dorsal(referencia: string): string {
  let h = 0;
  for (const c of referencia) h = (h * 31 + c.charCodeAt(0)) % 899;
  return String(h + 1).padStart(3, "0");
}

export default async function PaginaTicket({
  params,
}: PageProps<"/ticket/[referencia]">) {
  const { referencia } = await params;
  const ins = await inscripcionPorReferencia(referencia);
  if (!ins) notFound();

  const categoria = categoriaPorCodigo(ins.categoriaCodigo);
  const saldo = saldoPendiente(ins.cuotas);
  const siguiente = proximaCuota(ins.cuotas);
  const pagadas = ins.cuotas.filter((c) => c.estado === "PAGADA").length;
  const base = process.env.URL_PUBLICA ?? "http://localhost:3000";

  const qr = await QRCode.toString(`${base}/ticket/${ins.referencia}`, {
    type: "svg",
    margin: 0,
    color: { dark: "#04100c", light: "#0000" },
    errorCorrectionLevel: "M",
  });

  return (
    <>
      <div className="print:hidden">
        <Encabezado compacto />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/mi-inscripcion?ref=${ins.referencia}`}
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-lima hover:underline"
        >
          ← Mi inscripción
        </Link>
        <BotonImprimir />
      </div>

      {/* ------------------------------ El ticket ------------------------------ */}
      <article className="mt-6 overflow-hidden rounded-[28px] border-[3px] border-tinta bg-hueso shadow-[10px_10px_0_0_var(--color-tinta)]">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-tinta bg-noche px-6 py-4">
          <p className="font-display text-lg font-extrabold tracking-[-0.04em] text-hueso">
            TIBET <span className="text-lima">EPIC</span>{" "}
            <span className="raya-mono text-[0.62rem] text-hueso/45">XCM</span>
          </p>
          <p className="raya-mono text-[0.7rem] uppercase tracking-[0.16em] text-hueso/55">
            {EVENTO.fechaLegible} · {EVENTO.lugar}
          </p>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto]">
          {/* Cuerpo */}
          <div className="p-6 sm:p-8">
            <Chip tono={saldo === 0 ? "lima" : "naranja"}>
              {saldo === 0 ? "Inscripción pagada" : `Cuota ${pagadas} de ${ins.cuotas.length}`}
            </Chip>

            <p className="mt-5 font-mono text-[0.64rem] font-bold uppercase tracking-[0.18em] text-tinta/45">
              Dorsal
            </p>
            <p className="font-display text-[clamp(3.4rem,14vw,5.4rem)] font-extrabold leading-[0.82] tracking-[-0.05em] text-tinta">
              {dorsal(ins.referencia)}
            </p>

            <p className="mt-4 font-display text-xl font-extrabold leading-tight tracking-tight text-tinta">
              {ins.ciclista.nombres} {ins.ciclista.apellidos}
            </p>
            <p className="text-[0.88rem] text-tinta/60">
              {ins.ciclista.equipo || "Independiente"} · {ins.ciclista.ciudad}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t-[3px] border-dashed border-tinta/20 pt-5 sm:grid-cols-3">
              {[
                ["Categoría", categoria?.nombre ?? ins.categoriaCodigo],
                ["Recorrido", `${categoria?.km} km`],
                ["Desnivel", `${categoria?.desnivel.toLocaleString("es-CO")} m D+`],
                ["Sangre", ins.ciclista.rh],
                ["Jersey", ins.tallas.jersey],
                ["Camiseta", ins.tallas.running],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="raya-mono text-[0.6rem] uppercase tracking-[0.14em] text-tinta/40">
                    {k}
                  </dt>
                  <dd className="mt-0.5 font-display text-[0.98rem] font-extrabold text-tinta">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Talón troquelado */}
          <aside className="flex flex-col items-center justify-between gap-4 border-t-[3px] border-dashed border-tinta/35 bg-white/60 p-6 sm:w-56 sm:border-l-[3px] sm:border-t-0">
            <div className="w-full">
              <p className="raya-mono text-center text-[0.6rem] uppercase tracking-[0.16em] text-tinta/40">
                Referencia
              </p>
              <p className="raya-mono mt-1 text-center text-[0.95rem] font-bold text-tinta">
                {ins.referencia}
              </p>
            </div>

            <div
              className="w-32 [&>svg]:h-full [&>svg]:w-full"
              aria-label="Código QR para verificar la inscripción"
              dangerouslySetInnerHTML={{ __html: qr }}
            />

            <p className="text-center text-[0.68rem] leading-snug text-tinta/50">
              Preséntalo en la entrega de kits para reclamar tu dorsal.
            </p>
          </aside>
        </div>

        {/* Estado de pago */}
        <div className="border-t-[3px] border-tinta bg-noche px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            {/* Las casillas solo dicen algo cuando hay varias cuotas. */}
            <div className="flex items-center gap-1.5">
              {(ins.cuotas.length > 1 ? ins.cuotas : []).map((c) => (
                <span
                  key={c.numero}
                  className={`h-3 w-9 rounded-sm border-2 border-hueso/25 ${
                    c.estado === "PAGADA"
                      ? "bg-lima"
                      : c.estado === "FALLIDA" || c.estado === "VENCIDA"
                        ? "bg-magenta"
                        : "bg-transparent"
                  }`}
                />
              ))}
            </div>
            <p className="raya-mono text-[0.74rem] text-hueso/70">
              {saldo === 0 ? (
                <>PAGADO {pesos(ins.total)}</>
              ) : (
                <>
                  ABONADO {pesos(ins.pagado)} · FALTAN{" "}
                  <span className="text-naranja">{pesos(saldo)}</span>
                </>
              )}
            </p>
          </div>
          {siguiente && (
            <p className="mt-2 text-[0.8rem] text-hueso/45">
              Próximo cobro: {pesos(siguiente.monto)} el {fechaLarga(siguiente.vence)}.
            </p>
          )}
        </div>
      </article>

      <p className="mt-5 text-[0.82rem] leading-relaxed text-hueso/45 print:hidden">
        El dorsal definitivo se entrega el día previo a la carrera. Este ticket
        vale como comprobante de inscripción y de pago.
      </p>
      </main>
    </>
  );
}
