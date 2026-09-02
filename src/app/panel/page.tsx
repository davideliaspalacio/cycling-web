import Link from "next/link";
import { cookies } from "next/headers";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { abonosPorRevisar, listarInscripciones } from "@/lib/almacen";
import { NOMBRE_COMPLETO, categoriaPorCodigo } from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import type { EstadoInscripcion, PlanPago } from "@/lib/tipos";
import { Salir } from "./salir";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: `Panel de la organización — ${NOMBRE_COMPLETO}`,
};

const TONO: Record<EstadoInscripcion, "turquesa" | "sol" | "alerta" | "nube"> = {
  BORRADOR: "nube",
  PENDIENTE_PAGO: "alerta",
  EN_VERIFICACION: "sol",
  AL_DIA: "sol",
  EN_MORA: "alerta",
  COMPLETA: "turquesa",
};

const TEXTO: Record<EstadoInscripcion, string> = {
  BORRADOR: "Sin terminar",
  PENDIENTE_PAGO: "Sin pagar",
  EN_VERIFICACION: "Por verificar",
  AL_DIA: "Al día",
  EN_MORA: "En mora",
  COMPLETA: "Completa",
};

const PLAN: Record<PlanPago, string> = {
  CONTADO: "Contado (tarjeta · histórico)",
  CUOTAS: "Cuotas (tarjeta · histórico)",
  TOTAL: "Pago total",
  // `ABONOS` a secas es el valor histórico de cuando el único plan diferido
  // eran dos cuotas; sigue queriendo decir eso.
  ABONOS: "Dos cuotas",
  ABONOS_2: "Dos cuotas",
  ABONOS_3: "Tres cuotas",
};

export default async function Panel() {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value);
  const [inscripciones, porRevisar] = await Promise.all([
    listarInscripciones(),
    abonosPorRevisar(),
  ]);

  const recaudado = inscripciones.reduce((s, i) => s + i.pagado, 0);
  // El saldo sale de `total − pagado` y no de la tabla de cuotas: bajo pago
  // manual las cuotas son un plan sugerido, no el libro de dinero, y una
  // inscripción por transferencia ni siquiera tiene filas de cuota
  // (docs/decisiones-pago-manual.md §1).
  const porCobrar = inscripciones.reduce(
    (s, i) => s + Math.max(0, i.total - i.pagado),
    0,
  );
  const declaradoSinConfirmar = porRevisar.reduce(
    (s, a) => s + a.montoDeclarado,
    0,
  );

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <TituloSeccion
            eyebrow="Uso interno"
            titulo="Quién viene y quién debe."
            bajada="Nadie cobra automáticamente: el dinero entra cuando alguien de la organización verifica un comprobante. Esta pantalla muestra lo que ya entró, lo que falta y lo que está esperando una decisión humana."
          />
          {sesion && <Salir nombre={sesion.nombre} />}
        </div>

        {/* La métrica que dispara trabajo: va primero, sola y en grande. */}
        <Link href="/panel/evidencias" className="mt-9 block">
          <Tarjeta
            tono={porRevisar.length > 0 ? "alerta" : "nube"}
            className="pulsable flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              {/* Sobre el rojo de alerta el texto va en claro: la tinta encima
                  del rojo no llega ni a 3:1. */}
              <p
                className={`font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] ${porRevisar.length > 0 ? "text-nube/90" : "text-tinta/75"}`}
              >
                Evidencias por revisar
              </p>
              <p
                className={`mt-1 font-display text-[3rem] font-extrabold leading-none tracking-[-0.04em] ${porRevisar.length > 0 ? "text-nube" : "text-tinta"}`}
              >
                {porRevisar.length}
              </p>
              <p
                className={`mt-2 max-w-md text-[0.88rem] leading-snug ${porRevisar.length > 0 ? "text-nube/90" : "text-tinta/75"}`}
              >
                {porRevisar.length === 0
                  ? "La cola está vacía. Cuando llegue un comprobante, aparece aquí."
                  : `${pesos(declaradoSinConfirmar)} declarados que todavía no son dinero. Hasta que alguien los mire, el ciclista está esperando.`}
              </p>
            </div>
            <span
              className={`shrink-0 font-display text-[1.05rem] font-extrabold underline underline-offset-4 ${porRevisar.length > 0 ? "text-nube" : "text-tinta"}`}
            >
              Abrir la cola →
            </span>
          </Tarjeta>
        </Link>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { etiqueta: "Inscritos", valor: String(inscripciones.length), tono: "nube" as const },
            { etiqueta: "Recaudado", valor: pesos(recaudado), tono: "turquesa" as const },
            { etiqueta: "Por cobrar", valor: pesos(porCobrar), tono: "sol" as const },
          ].map((m) => (
            <Tarjeta key={m.etiqueta} tono={m.tono} className="p-5">
              <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
                {m.etiqueta}
              </p>
              <p className="mt-2 font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] text-tinta">
                {m.valor}
              </p>
            </Tarjeta>
          ))}
        </div>

        <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {[
            ["/panel/competidor", "Cambiar de competidor"],
            ["/correos", "Correos enviados"],
          ].map(([href, texto]) => (
            <Link
              key={href}
              href={href}
              className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
            >
              {texto} →
            </Link>
          ))}
        </nav>

        {inscripciones.length === 0 ? (
          <Tarjeta tono="marea" className="mt-8 p-8">
            <p className="text-tinta/75">
              Todavía no hay inscritos.{" "}
              <Link href="/inscripcion" className="text-rio underline underline-offset-4">
                Crea uno de prueba
              </Link>
              .
            </p>
          </Tarjeta>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b-[3px] border-tinta/20">
                  {[
                    "Referencia",
                    "Ciclista",
                    "Categoría",
                    "Plan",
                    "Pagado",
                    "Saldo",
                    "Estado",
                    "",
                  ].map((h, i) => (
                    <th
                      key={h || `col-${i}`}
                      scope="col"
                      className="py-3 pr-4 font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-tinta/75"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inscripciones.map((i) => {
                  const saldo = Math.max(0, i.total - i.pagado);
                  return (
                    <tr
                      key={i.id}
                      className="border-b border-tinta/10 transition-colors hover:bg-nube/[0.04]"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/mi-inscripcion?ref=${i.referencia}`}
                          className="raya-mono text-[0.8rem] font-bold text-rio hover:underline"
                        >
                          {i.referencia}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-[0.88rem] text-tinta/85">
                        {i.ciclista.nombres} {i.ciclista.apellidos}
                        <span className="block text-[0.75rem] text-tinta/75">
                          {i.ciclista.ciudad}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[0.85rem] text-tinta/75">
                        {categoriaPorCodigo(i.categoriaCodigo)?.nombre}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="raya-mono text-[0.72rem] text-tinta/75">
                          {PLAN[i.plan]}
                        </span>
                      </td>
                      <td className="raya-mono py-3 pr-4 text-[0.82rem] text-tinta/85">
                        {pesos(i.pagado)}
                      </td>
                      <td className="raya-mono py-3 pr-4 text-[0.82rem] text-tinta/85">
                        {pesos(saldo)}
                      </td>
                      <td className="py-3 pr-2">
                        <Chip tono={TONO[i.estado]}>{TEXTO[i.estado]}</Chip>
                      </td>
                      <td className="py-3 pr-2">
                        <Link
                          href={`/panel/competidor?q=${i.referencia}`}
                          className="raya-mono text-[0.7rem] text-tinta/75 hover:text-rio hover:underline"
                        >
                          Ceder
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <Pie />
    </>
  );
}
