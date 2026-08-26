import { Encabezado } from "@/components/marco";
import { FormularioInscripcion } from "@/components/formulario/inscripcion";
import {
  CUENTAS_RECAUDO,
  FECHA_LIMITE_ABONOS,
  NOMBRE_COMPLETO,
  categoriaPorCodigo,
} from "@/lib/catalogo";

export const metadata = {
  title: `Inscripción — ${NOMBRE_COMPLETO}`,
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
        {/*
          `CUENTAS_RECAUDO` se lee AQUÍ, en el servidor: sus números vienen de
          variables de entorno sin `NEXT_PUBLIC_`. Si el formulario las
          importara por su cuenta, el navegador vería el respaldo escrito en el
          repositorio y no la cuenta que configuró la organización.
        */}
        <FormularioInscripcion
          categoriaInicial={valida}
          cuentas={CUENTAS_RECAUDO}
          fechaLimite={FECHA_LIMITE_ABONOS}
        />
      </main>
    </>
  );
}
