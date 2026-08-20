import { Encabezado } from "@/components/marco";
import { FormularioInscripcion } from "@/components/formulario/inscripcion";
import { categoriaPorCodigo } from "@/lib/catalogo";
import { MODO } from "@/lib/wompi";

export const metadata = {
  title: "Inscripción — Tibet Epic XCM 2027",
};

export default async function PaginaInscripcion({
  searchParams,
}: PageProps<"/inscripcion">) {
  const { categoria } = await searchParams;
  const codigo = typeof categoria === "string" ? categoria : undefined;
  const valida = codigo && categoriaPorCodigo(codigo) ? codigo : undefined;

  return (
    <>
      <Encabezado compacto />
      <main className="flex-1">
        <FormularioInscripcion categoriaInicial={valida} modoWompi={MODO} />
      </main>
    </>
  );
}
