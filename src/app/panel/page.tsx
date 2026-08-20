import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { listarInscripciones } from "@/lib/almacen";
import { categoriaPorCodigo } from "@/lib/catalogo";
import { fechaCorta, pesos, proximaCuota, saldoPendiente } from "@/lib/dinero";
import type { EstadoInscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panel de la organización — Tibet Epic XCM" };

const TONO: Record<EstadoInscripcion, "lima" | "naranja" | "magenta" | "hueso"> = {
  BORRADOR: "hueso",
  PENDIENTE_PAGO: "magenta",
  AL_DIA: "naranja",
  EN_MORA: "magenta",
  COMPLETA: "lima",
};

const TEXTO: Record<EstadoInscripcion, string> = {
  BORRADOR: "Sin terminar",
  PENDIENTE_PAGO: "Sin pagar",
  AL_DIA: "Al día",
  EN_MORA: "En mora",
  COMPLETA: "Completa",
};

export default async function Panel() {
  const inscripciones = await listarInscripciones();

  const recaudado = inscripciones.reduce((s, i) => s + i.pagado, 0);
  const porCobrar = inscripciones.reduce((s, i) => s + saldoPendiente(i.cuotas), 0);
  const enCuotas = inscripciones.filter((i) => i.plan === "CUOTAS").length;
  const enMora = inscripciones.filter((i) => i.estado === "EN_MORA").length;

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
        <TituloSeccion
          eyebrow="Uso interno"
          titulo="Quién viene y quién debe."
          bajada="El recaudo por cuotas cambia la caja del evento: esta pantalla muestra lo que ya entró, lo que está comprometido a futuro y a quién hay que perseguir."
        />

        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { etiqueta: "Inscritos", valor: String(inscripciones.length), tono: "hueso" as const },
            { etiqueta: "Recaudado", valor: pesos(recaudado), tono: "lima" as const },
            { etiqueta: "Por cobrar", valor: pesos(porCobrar), tono: "naranja" as const },
            {
              etiqueta: "En mora",
              valor: `${enMora} de ${enCuotas} en cuotas`,
              tono: enMora > 0 ? ("magenta" as const) : ("hueso" as const),
            },
          ].map((m) => (
            <Tarjeta key={m.etiqueta} tono={m.tono} className="p-5">
              <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/55">
                {m.etiqueta}
              </p>
              <p className="mt-2 font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] text-tinta">
                {m.valor}
              </p>
            </Tarjeta>
          ))}
        </div>

        {inscripciones.length === 0 ? (
          <Tarjeta tono="selva" className="mt-8 p-8">
            <p className="text-hueso/70">
              Todavía no hay inscritos.{" "}
              <Link href="/inscripcion" className="text-lima underline underline-offset-4">
                Crea uno de prueba
              </Link>
              .
            </p>
          </Tarjeta>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b-[3px] border-hueso/20">
                  {[
                    "Referencia",
                    "Ciclista",
                    "Categoría",
                    "Plan",
                    "Pagado",
                    "Saldo",
                    "Próximo cobro",
                    "Estado",
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="py-3 pr-4 font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-hueso/45"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inscripciones.map((i) => {
                  const siguiente = proximaCuota(i.cuotas);
                  return (
                    <tr
                      key={i.id}
                      className="border-b border-hueso/10 transition-colors hover:bg-hueso/[0.04]"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/mi-inscripcion?ref=${i.referencia}`}
                          className="raya-mono text-[0.8rem] font-bold text-lima hover:underline"
                        >
                          {i.referencia}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-[0.88rem] text-hueso/85">
                        {i.ciclista.nombres} {i.ciclista.apellidos}
                        <span className="block text-[0.75rem] text-hueso/40">
                          {i.ciclista.ciudad}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[0.85rem] text-hueso/70">
                        {categoriaPorCodigo(i.categoriaCodigo)?.nombre}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="raya-mono text-[0.72rem] text-hueso/60">
                          {i.plan === "CUOTAS" ? `${i.cuotas.length} cuotas` : "Contado"}
                        </span>
                      </td>
                      <td className="raya-mono py-3 pr-4 text-[0.82rem] text-hueso/85">
                        {pesos(i.pagado)}
                      </td>
                      <td className="raya-mono py-3 pr-4 text-[0.82rem] text-hueso/85">
                        {pesos(saldoPendiente(i.cuotas))}
                      </td>
                      <td className="raya-mono py-3 pr-4 text-[0.78rem] text-hueso/55">
                        {siguiente ? fechaCorta(siguiente.vence) : "—"}
                      </td>
                      <td className="py-3 pr-2">
                        <Chip tono={TONO[i.estado]}>{TEXTO[i.estado]}</Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 max-w-2xl text-[0.85rem] leading-relaxed text-hueso/40">
          Esta pantalla todavía no tiene control de acceso. Antes de producción hay
          que ponerle autenticación — es el siguiente paso pendiente.
        </p>
      </main>
      <Pie />
    </>
  );
}
