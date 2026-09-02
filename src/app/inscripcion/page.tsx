import { Encabezado } from "@/components/marco";
import { FormularioInscripcion } from "@/components/formulario/inscripcion";
import {
  CUENTAS_RECAUDO,
  FECHA_LIMITE_ABONOS,
  NOMBRE_COMPLETO,
  PRECIO_INSCRIPCION,
  categoriaPorCodigo,
} from "@/lib/catalogo";
import { hayPlazoParaDosCuotas, planDeDosCuotas } from "@/lib/dinero";

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
    El plan de dos cuotas se ancla a la fecha de inscripción, y la inscripción
    todavía no existe: nace cuando el ciclista envía el formulario, un rato
    después de esta petición. Se calcula con la fecha de hoy porque en la
    práctica es el mismo día; la fecha que manda —y la que se muestra en
    `/mi-inscripcion`— es la que se deriva de `creadaEn` en el servidor.
  */
  const hoy = new Date().toISOString();
  const plan = planDeDosCuotas(PRECIO_INSCRIPCION, hoy);

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
          plan={plan}
          dosCuotas={hayPlazoParaDosCuotas(hoy)}
        />
      </main>
    </>
  );
}
