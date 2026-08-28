import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta } from "@/components/ui";
import { correoPorId } from "@/lib/almacen";

export const dynamic = "force-dynamic";

export default async function PaginaCorreo({ params }: PageProps<"/correos/[id]">) {
  const { id } = await params;
  const correo = await correoPorId(id);
  if (!correo) notFound();

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
          <Chip tono="turquesa">{correo.plantilla.replace(/-/g, " ")}</Chip>
          <Chip tono="rio">
            {correo.proveedor === "resend"
              ? "Enviado por Resend"
              : correo.proveedor === "sin-configurar"
                ? "NO SE ENVIÓ — faltaba la llave de Resend"
                : "Simulado"}
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
