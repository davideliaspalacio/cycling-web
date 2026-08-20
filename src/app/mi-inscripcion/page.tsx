import { Encabezado, Pie } from "@/components/marco";
import { PortalCiclista } from "@/components/portal-ciclista";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { vistaPublica } from "@/app/api/mi-inscripcion/route";
import { MODO } from "@/lib/wompi";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mi inscripción — Tibet Epic XCM 2027",
};

export default async function PaginaPortal({
  searchParams,
}: PageProps<"/mi-inscripcion">) {
  const { ref } = await searchParams;

  // El enlace de los correos trae ?ref=; lo resolvemos aquí para que la
  // página llegue ya pintada, sin un parpadeo de carga.
  const inscripcion =
    typeof ref === "string" ? await inscripcionPorReferencia(ref) : undefined;

  return (
    <>
      <Encabezado compacto />
      <main className="flex-1">
        <PortalCiclista
          vistaInicial={inscripcion ? vistaPublica(inscripcion) : null}
          modoDemo={MODO === "simulacion"}
        />
      </main>
      <Pie />
    </>
  );
}
