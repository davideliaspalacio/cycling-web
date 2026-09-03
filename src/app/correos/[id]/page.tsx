import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta } from "@/components/ui";
import { correoPorId } from "@/lib/almacen";
import {
  estadoVisible,
  explicarRebote,
  nombreDePlantilla,
} from "@/lib/correos/seguimiento";
import { HAY_WEBHOOK } from "@/lib/correos/webhook";

export const dynamic = "force-dynamic";

export default async function PaginaCorreo({ params }: PageProps<"/correos/[id]">) {
  const { id } = await params;
  const correo = await correoPorId(id);
  if (!correo) notFound();

  const entrega = estadoVisible(correo, HAY_WEBHOOK);
  const rebote =
    entrega.clave === "REBOTADO"
      ? explicarRebote(correo.reboteTipo, correo.reboteMotivo, correo.reboteDiagnostico)
      : undefined;

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Link
          href="/correos"
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          ← Todos los correos
        </Link>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Chip tono="turquesa">{nombreDePlantilla(correo.plantilla)}</Chip>
          {/* Aceptado por el proveedor no es entregado: el chip dice cuál de
              las dos cosas sabemos. */}
          <Chip tono={entrega.tono}>{entrega.etiqueta}</Chip>
          <Chip tono="rio">
            {correo.proveedor === "simulacion"
              ? "Simulado"
              : correo.proveedor === "sin-configurar"
                ? "NO SE ENVIÓ — faltaba la llave del proveedor"
                : `Enviado por ${ {resend:"Resend", brevo:"Brevo", zeptomail:"ZeptoMail"}[correo.proveedor] ?? correo.proveedor }`}
          </Chip>
        </div>

        <h1 className="mt-4 font-display text-[clamp(1.5rem,4.2vw,2.2rem)] font-extrabold leading-tight tracking-[-0.03em] text-tinta">
          {correo.asunto}
        </h1>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-[0.85rem]">
          {[
            ["Para", correo.para],
            ["Enviado", new Date(correo.enviadoEn).toLocaleString("es-CO")],
            ["Referencia", correo.referencia ?? "—"],
            ["ID del proveedor", correo.proveedorId ?? "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="raya-mono text-[0.66rem] uppercase tracking-widest text-tinta/75">
                {k}
              </dt>
              <dd className="text-tinta/80">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 max-w-2xl text-[0.88rem] leading-relaxed text-tinta/75">
          {entrega.detalle}
        </p>

        {rebote && (
          <Tarjeta tono="alerta" className="mt-4 p-5">
            <p className="font-display text-[1.05rem] font-extrabold text-nube">
              {rebote.titulo}
            </p>
            <p className="mt-1.5 text-[0.9rem] leading-relaxed text-nube/90">
              {rebote.queHacer}
            </p>
            <p className="raya-mono mt-2 break-words text-[0.68rem] text-nube/75">
              El proveedor dijo:{" "}
              {[correo.reboteMotivo, correo.reboteDiagnostico]
                .filter(Boolean)
                .join(" / ") || "sin detalle"}
            </p>
          </Tarjeta>
        )}

        <Tarjeta tono="nube" className="mt-7 overflow-hidden p-0">
          <iframe
            title={`Vista previa: ${correo.asunto}`}
            srcDoc={correo.html}
            sandbox=""
            className="h-[820px] w-full border-0 bg-nube"
          />
        </Tarjeta>
      </main>
      <Pie />
    </>
  );
}
