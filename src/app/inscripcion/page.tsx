import { Encabezado } from "@/components/marco";
import { FormularioInscripcion } from "@/components/formulario/inscripcion";
import {
  CUENTAS_RECAUDO,
  FECHA_LIMITE_ABONOS,
  NOMBRE_COMPLETO,
  PRECIO_INSCRIPCION,
  categoriaPorCodigo,
} from "@/lib/catalogo";
import { planDeCuotas, planesViables } from "@/lib/dinero";

export const metadata = {
  title: `Inscripción — ${NOMBRE_COMPLETO}`,
};

export default async function PaginaInscripcion({
  searchParams,
}: PageProps<"/inscripcion">) {
  const { categoria } = await searchParams;
  const codigo = typeof categoria === "string" ? categoria : undefined;
  const valida = codigo && categoriaPorCodigo(codigo) ? codigo : undefined;

  /*
    Los planes de cuotas se anclan a la fecha de inscripción, y la inscripción
    todavía no existe: nace cuando el ciclista envía el formulario, un rato
    después de esta petición. Se calculan con la fecha de hoy porque en la
    práctica es el mismo día; las fechas que mandan —y las que se muestran en
    `/mi-inscripcion`— son las que se derivan de `creadaEn` en el servidor.

    Solo viajan los planes que caben: si la última cuota no llega antes del
    cierre, el plan no se ofrece y el formulario explica por qué falta.
  */
  const hoy = new Date().toISOString();
  const planes = planesViables(hoy).map((cuotas) => ({
    cuotas,
    cuotasDelPlan: planDeCuotas(PRECIO_INSCRIPCION, hoy, cuotas),
  }));

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
          planes={planes}
        />
      </main>
    </>
  );
}
