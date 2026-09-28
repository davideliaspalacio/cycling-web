import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { inscripcionPorReferencia } from "@/lib/almacen";
import { categoriaPorCodigo } from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import { Correccion } from "./correccion";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: "Corregir los datos del inscrito",
};

/**
 * Corregir los datos de un inscrito.
 *
 * **Por qué es una página aparte y no la ficha en modo edición.** La ficha
 * `/panel/inscrito/[referencia]` ya es larga —identidad, contacto, salud,
 * carrera, pago, comprobantes, correos, legales, bitácora— y casi todo lo que
 * enseña no se puede editar desde aquí: el plan, el total, lo pagado y los
 * abonos los mueve el flujo de pago. Meterle un modo edición obligaría a
 * pintar cada bloque dos veces y a explicar en cada uno por qué ese sí y ese
 * no. Separarlo además deja la ficha como lo que es —la pantalla que alguien
 * abre con prisa para leer un RH— y le da a la corrección una URL propia que
 * se puede pegar en el chat, igual que `/panel/competidor`. Es el mismo reparto
 * que ya tenía el proyecto: la ficha se lee, la acción vive en su página.
 *
 * La sesión se comprueba aquí además de en `src/proxy.ts`. La primera barrera
 * es el matcher; esta es la que queda si alguien lo toca.
 */

export default async function CorregirInscrito({
  params,
}: PageProps<"/panel/inscrito/[referencia]/editar">) {
  const { referencia } = await params;
  const ref = decodeURIComponent(referencia);

  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value);
  if (!sesion) {
    redirect(
      `/panel/entrar?volver=${encodeURIComponent(`/panel/inscrito/${ref}/editar`)}`,
    );
  }

  const ins = await inscripcionPorReferencia(ref);
  if (!ins) notFound();

  const categoria = categoriaPorCodigo(ins.categoriaCodigo);

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/panel/inscrito/${encodeURIComponent(ins.referencia)}`}
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          ← Ficha de {ins.referencia}
        </Link>

        <TituloSeccion
          className="mt-5"
          eyebrow={`Uso interno · corrige ${sesion.nombre}`}
          titulo="Corregir los datos."
          bajada="Para una cédula mal escrita, una talla equivocada o un correo con un dedazo. El titular del cupo sigue siendo el mismo: si va a ser otra persona, eso es una cesión. Queda en la bitácora quién cambió qué y qué decía antes."
        />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Chip tono="turquesa">{ins.referencia}</Chip>
          <Chip tono="nube">{categoria?.nombre ?? ins.categoriaCodigo}</Chip>
          <span className="raya-mono text-[0.7rem] text-tinta/75">
            {pesos(ins.pagado)} abonados de {pesos(ins.total)}
          </span>
        </div>

        <Tarjeta tono="marea" className="mt-6 p-5">
          <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-rio">
            Lo que no se toca desde aquí
          </p>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-tinta/80">
            La referencia, el estado, el plan, el total, lo pagado y los
            comprobantes. Eso lo mueve el flujo de pago, no una corrección a
            mano. Cambiar la categoría tampoco recalcula el precio.
          </p>
        </Tarjeta>

        <Correccion
          referencia={ins.referencia}
          ciclista={ins.ciclista}
          tallas={ins.tallas}
          categoriaCodigo={ins.categoriaCodigo}
        />

        <p className="mt-8">
          <Link
            href={`/panel/inscrito/${encodeURIComponent(ins.referencia)}`}
            className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
          >
            ← Volver a la ficha
          </Link>
        </p>
      </main>
      <Pie />
    </>
  );
}
