import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Chip } from "@/components/ui";
import { Encabezado } from "@/components/marco";
import { BotonImprimir } from "@/components/boton-imprimir";
import { CuentasRecaudo } from "@/components/formulario/cuentas-recaudo";
import { inscripcionPorReferencia } from "@/lib/almacen";
import {
  CUENTAS_RECAUDO,
  EVENTO,
  FECHA_LIMITE_ABONOS,
  PRENDAS,
  categoriaPorCodigo,
  recorridoDe,
} from "@/lib/catalogo";
import {
  cuotasDelPlan,
  fechaLarga,
  pesos,
  planDeCuotas,
  proximaCuotaDelPlan,
  saldoPendiente,
} from "@/lib/dinero";
import { resumenDePago } from "@/lib/servicio";
import type { Inscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Dorsal estable derivado de la referencia: el mismo ciclista ve siempre el
 * mismo número, sin necesidad de un contador en base de datos.
 *
 * Solo se calcula cuando el saldo llega a cero. Un dorsal es el bien que se
 * entrega el día de la carrera; enseñárselo a quien todavía debe es prometer
 * algo que no está pago (docs/decisiones-pago-manual.md §3).
 */
function dorsal(referencia: string): string {
  let h = 0;
  for (const c of referencia) {
    h = (h * 31 + c.charCodeAt(0)) % (EVENTO.cupos - 1);
  }
  return String(h + 1).padStart(3, "0");
}

/**
 * Cuánto falta, según cómo se paga esta inscripción.
 *
 * Transitorio: las inscripciones viejas se cobraron con la pasarela y su
 * verdad son las cuotas; las nuevas se pagan por transferencia y su verdad son
 * los abonos verificados. Una inscripción por transferencia tiene la tabla de
 * cuotas vacía, así que preguntarle a `saldoPendiente` daría cero y le
 * entregaría el dorsal a quien no ha pagado un peso. Esta rama se va con el
 * resto de Wompi.
 */
async function saldoDe(ins: Inscripcion): Promise<number> {
  if (ins.medioPago === "WOMPI") return saldoPendiente(ins.cuotas);
  const resumen = await resumenDePago(ins);
  return resumen.saldo;
}

/**
 * Un ticket lleva el nombre, la ciudad y el dorsal de una persona. Nunca
 * debe aparecer en una búsqueda, aunque su referencia sea difícil de adivinar.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaTicket({
  params,
}: PageProps<"/ticket/[referencia]">) {
  const { referencia } = await params;
  const ins = await inscripcionPorReferencia(referencia);
  if (!ins) notFound();

  const categoria = categoriaPorCodigo(ins.categoriaCodigo);
  const saldo = await saldoDe(ins);
  const recorrido = recorridoDe(categoria);

  if (saldo > 0) {
    return (
      <Constancia
        ins={ins}
        saldo={saldo}
        categoria={categoria?.nombre ?? ins.categoriaCodigo}
        recorrido={recorrido}
      />
    );
  }

  /*
   * El respaldo es el dominio real y no localhost: de aquí sale el código QR
   * del ticket, que alguien escanea en la entrega de kits. Un QR impreso
   * apuntando a localhost no se arregla después.
   */
  const base = process.env.URL_PUBLICA ?? "https://www.santanderxtreme.com";
  const qr = await QRCode.toString(`${base}/ticket/${ins.referencia}`, {
    type: "svg",
    margin: 0,
    color: { dark: "#08213a", light: "#0000" },
    errorCorrectionLevel: "M",
  });

  const datosDelDorsal: [string, string][] = [
    ["Categoría", categoria?.nombre ?? ins.categoriaCodigo],
    ...(recorrido ? ([["Recorrido", recorrido]] as [string, string][]) : []),
    ["Sangre", ins.ciclista.rh],
    ...PRENDAS.map((p) => [p.nombre, ins.tallas[p.campo]] as [string, string]),
  ];

  return (
    <>
      <div className="print:hidden">
        <Encabezado compacto />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            href={`/mi-inscripcion?ref=${ins.referencia}`}
            className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
          >
            ← Mi inscripción
          </Link>
          <BotonImprimir />
        </div>

        {/* ----------------------------- El ticket ---------------------------- */}
        <article className="mt-6 overflow-hidden rounded-[28px] border-[3px] border-tinta bg-nube shadow-[10px_10px_0_0_var(--color-tinta)]">
          {/* Cabecera */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-tinta bg-rio px-6 py-4 print:bg-nube">
            <p className="font-display text-lg font-extrabold tracking-[-0.04em] text-nube print:text-tinta">
              {EVENTO.wordmark.inicio}{" "}
              <span className="text-turquesa print:text-rio">{EVENTO.wordmark.acento}</span>{" "}
              <span className="raya-mono text-[0.62rem] text-nube/75 print:text-tinta/75">
                {EVENTO.wordmark.sufijo}
              </span>
            </p>
            <p className="raya-mono text-[0.7rem] uppercase tracking-[0.16em] text-nube/85 print:text-tinta/85">
              {EVENTO.fechaLegible} · {EVENTO.lugar}
            </p>
          </div>

          <div className="grid sm:grid-cols-[1fr_auto]">
            {/* Cuerpo */}
            <div className="p-6 sm:p-8">
              <Chip tono="turquesa">Inscripción pagada</Chip>

              <p className="mt-5 font-mono text-[0.64rem] font-bold uppercase tracking-[0.18em] text-tinta/75">
                Dorsal
              </p>
              <p className="font-display text-[clamp(3.4rem,14vw,5.4rem)] font-extrabold leading-[0.82] tracking-[-0.05em] text-tinta">
                {dorsal(ins.referencia)}
              </p>

              <p className="mt-4 font-display text-xl font-extrabold leading-tight tracking-tight text-tinta">
                {ins.ciclista.nombres} {ins.ciclista.apellidos}
              </p>
              <p className="text-[0.88rem] text-tinta/75">
                {ins.ciclista.ciudad}, {ins.ciclista.departamento}
              </p>

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t-[3px] border-dashed border-tinta/20 pt-5 sm:grid-cols-3">
                {datosDelDorsal.map(([k, v]) => (
                  <div key={k}>
                    <dt className="raya-mono text-[0.6rem] uppercase tracking-[0.14em] text-tinta/75">
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
            <aside className="flex flex-col items-center justify-between gap-4 border-t-[3px] border-dashed border-tinta/35 bg-nube/60 p-6 sm:w-56 sm:border-l-[3px] sm:border-t-0">
              <div className="w-full">
                <p className="raya-mono text-center text-[0.6rem] uppercase tracking-[0.16em] text-tinta/75">
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

              <p className="text-center text-[0.68rem] leading-snug text-tinta/75">
                Preséntalo en la entrega de kits para reclamar tu dorsal.
              </p>
            </aside>
          </div>

          {/* Estado de pago */}
          <div className="border-t-[3px] border-tinta bg-rio px-6 py-4 print:bg-nube">
            <p className="raya-mono text-[0.74rem] font-bold text-nube print:text-tinta">
              PAGADO {pesos(ins.total)} · SALDO EN CERO
            </p>
          </div>
        </article>

        <p className="mt-5 text-[0.82rem] leading-relaxed text-tinta/75 print:hidden">
          El dorsal definitivo se entrega el día previo a la carrera. Este ticket
          vale como comprobante de inscripción y de pago.
        </p>
      </main>
    </>
  );
}

/* ------------------------------- Constancia -------------------------------- */

/**
 * Lo que ve quien todavía debe.
 *
 * No es un ticket recortado: es otro documento. Dice que el cupo existe, qué
 * falta y cómo abonarlo. Deliberadamente sin dorsal y sin QR — los dos son la
 * marca visual de "estás dentro", y quien debe todavía no lo está del todo.
 */
function Constancia({
  ins,
  saldo,
  categoria,
  recorrido,
}: {
  ins: Inscripcion;
  saldo: number;
  categoria: string;
  recorrido: string | null;
}) {
  const abonado = ins.total - saldo;
  const pct = Math.min(100, Math.round((abonado / ins.total) * 100));
  // La constancia también lleva la fecha comprometida: es el papel que el
  // ciclista imprime o guarda, y si solo dijera el cierre general se le pasaría
  // el vencimiento de su próxima cuota.
  const cuotas = cuotasDelPlan(ins.plan);
  const plan =
    ins.medioPago === "TRANSFERENCIA" && cuotas > 1
      ? planDeCuotas(ins.total, ins.creadaEn, cuotas)
      : [];
  const siguiente = proximaCuotaDelPlan(plan, abonado);
  const venceProxima =
    siguiente && siguiente.numero > 1 ? siguiente : null;

  const datos: [string, string][] = [
    ["Categoría", categoria],
    ...(recorrido ? ([["Recorrido", recorrido]] as [string, string][]) : []),
    ...(venceProxima
      ? ([
          [
            `Cuota ${venceProxima.numero} de ${cuotas}`,
            fechaLarga(venceProxima.vence),
          ],
        ] as [string, string][])
      : []),
    ["Sangre", ins.ciclista.rh],
    ...PRENDAS.map((p) => [p.nombre, ins.tallas[p.campo]] as [string, string]),
  ];

  return (
    <>
      <div className="print:hidden">
        <Encabezado compacto />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            href={`/mi-inscripcion?ref=${ins.referencia}`}
            className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
          >
            ← Mi inscripción
          </Link>
          <BotonImprimir />
        </div>

        <article className="mt-6 overflow-hidden rounded-[28px] border-[3px] border-tinta bg-nube shadow-[10px_10px_0_0_var(--color-tinta)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-tinta bg-rio px-6 py-4 print:bg-nube">
            <p className="font-display text-lg font-extrabold tracking-[-0.04em] text-nube print:text-tinta">
              {EVENTO.wordmark.inicio}{" "}
              <span className="text-turquesa print:text-rio">{EVENTO.wordmark.acento}</span>{" "}
              <span className="raya-mono text-[0.62rem] text-nube/75 print:text-tinta/75">
                {EVENTO.wordmark.sufijo}
              </span>
            </p>
            <p className="raya-mono text-[0.7rem] uppercase tracking-[0.16em] text-nube/85 print:text-tinta/85">
              {EVENTO.fechaLegible} · {EVENTO.lugar}
            </p>
          </div>

          <div className="p-6 sm:p-8">
            <Chip tono="sol">Constancia de inscripción</Chip>

            <h1 className="mt-5 font-display text-[clamp(1.7rem,4.6vw,2.4rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-tinta">
              {ins.ciclista.nombres} {ins.ciclista.apellidos}
            </h1>
            <p className="text-[0.88rem] text-tinta/75">
              {ins.ciclista.ciudad}, {ins.ciclista.departamento} ·{" "}
              <span className="raya-mono">{ins.referencia}</span>
            </p>

            <p className="mt-5 max-w-xl text-[0.95rem] leading-relaxed text-tinta/75">
              Tu cupo en {categoria} está reservado. El dorsal y el ticket de
              carrera se emiten cuando el saldo llegue a cero: mientras tanto,
              esta constancia es la prueba de tu inscripción.
            </p>

            {/* Lo que falta */}
            <div className="mt-6 rounded-2xl border-[3px] border-tinta bg-nube p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
                    Te falta
                  </p>
                  <p className="mt-1 font-display text-[clamp(2.2rem,6.5vw,3.2rem)] font-extrabold leading-none tracking-[-0.04em] text-tinta">
                    {pesos(saldo)}
                  </p>
                </div>
                <p className="raya-mono text-[0.8rem] font-bold text-tinta/75">
                  {pesos(abonado)} de {pesos(ins.total)} · {pct}%
                </p>
              </div>

              <div
                className="mt-4 h-5 w-full overflow-hidden rounded-md border-[3px] border-tinta bg-nube"
                role="img"
                aria-label={`Llevas ${pct}% de la inscripción pagada`}
              >
                <div className="h-full bg-turquesa" style={{ width: `${pct}%` }} />
              </div>

              <p className="mt-3 text-[0.82rem] leading-snug text-tinta/75">
                Solo cuenta lo que la organización ya verificó contra el
                extracto. Un comprobante subido y sin revisar todavía no baja el
                saldo.
              </p>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t-[3px] border-dashed border-tinta/20 pt-5 sm:grid-cols-3">
              {datos.map(([k, v]) => (
                <div key={k}>
                  <dt className="raya-mono text-[0.6rem] uppercase tracking-[0.14em] text-tinta/75">
                    {k}
                  </dt>
                  <dd className="mt-0.5 font-display text-[0.98rem] font-extrabold text-tinta">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Cómo abonar */}
          <div className="border-t-[3px] border-tinta bg-nube/60 px-6 py-6 sm:px-8">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-tinta">
              Cómo terminar de pagar
            </h2>
            <p className="mt-2 text-[0.9rem] leading-relaxed text-tinta/75">
              {venceProxima ? (
                <>
                  Te falta la cuota {venceProxima.numero} de {cuotas}:{" "}
                  <strong className="text-tinta">
                    {pesos(
                      venceProxima.numero === cuotas
                        ? saldo
                        : Math.min(venceProxima.monto, saldo),
                    )}
                  </strong>
                  , con plazo hasta el{" "}
                  <strong className="text-tinta">
                    {fechaLarga(venceProxima.vence)}
                  </strong>
                  . Transfiere a una de estas cuentas y sube el comprobante desde
                  tu página de inscripción.
                </>
              ) : (
                <>
                  Transfiere <strong className="text-tinta">{pesos(saldo)}</strong>{" "}
                  a una de estas cuentas y sube el comprobante desde tu página de
                  inscripción. El último día para subir comprobantes es el{" "}
                  {fechaLarga(FECHA_LIMITE_ABONOS)}.
                </>
              )}
            </p>

            <CuentasRecaudo
              cuentas={CUENTAS_RECAUDO}
              referencia={ins.referencia}
              className="mt-5"
            />

            <Link
              href={`/mi-inscripcion?ref=${ins.referencia}`}
              className="pulsable mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-tinta bg-turquesa px-6 py-3 font-display text-base font-extrabold tracking-tight text-tinta shadow-[4px_4px_0_0_var(--color-tinta)] print:hidden"
            >
              Subir un comprobante →
            </Link>
          </div>
        </article>

        <p className="mt-5 text-[0.82rem] leading-relaxed text-tinta/75 print:hidden">
          Esta constancia acredita tu cupo, no tu pago completo. El ticket con
          dorsal aparece aquí mismo apenas verifiquemos la cuota que salda la
          inscripción.
        </p>
      </main>
    </>
  );
}
