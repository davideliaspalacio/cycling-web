import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { listarCorreos } from "@/lib/almacen";
import { MODO_CORREO } from "@/lib/correos/enviar";
import { NOMBRE_COMPLETO } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

export const metadata = { title: `Correos enviados — ${NOMBRE_COMPLETO}` };

/**
 * El color dice qué clase de correo es de un vistazo: turquesa lo que confirma
 * dinero, alerta lo que pide arreglar algo, marea lo que solo informa.
 * Las claves son las mismas de `PLANTILLAS` en `src/lib/correos/plantillas.ts`.
 */
const COLOR_PLANTILLA: Record<string, "turquesa" | "sol" | "alerta" | "marea" | "nube"> = {
  "inscripcion-confirmada": "turquesa",
  "plan-cuotas-activado": "sol",
  "cuota-pagada": "turquesa",
  "recordatorio-cuota": "marea",
  "cuota-fallida": "alerta",
  "inscripcion-saldada": "turquesa",
  // Pago manual por transferencia.
  "evidencia-recibida": "marea",
  "evidencia-verificada": "turquesa",
  "evidencia-rechazada": "alerta",
  "inscripcion-completa": "turquesa",
  "cambio-competidor": "sol",
};

export default async function PaginaCorreos() {
  const correos = await listarCorreos();

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
        <TituloSeccion
          eyebrow={
            MODO_CORREO === "resend"
              ? "Enviados con Resend"
              : "Modo simulación · sin llave de Resend"
          }
          titulo="Lo que le llega al ciclista."
          bajada="Cada movimiento de pago dispara un correo. Aquí queda el registro completo, con el HTML tal como lo ve en su bandeja."
        />

        {correos.length === 0 ? (
          <Tarjeta tono="marea" className="mt-10 p-8">
            <p className="text-[0.98rem] leading-relaxed text-tinta/75">
              Todavía no hay correos. Completa una inscripción y vuelve: aquí
              aparecerán la confirmación, los comprobantes de cada cuota y los
              recordatorios.
            </p>
            <Link
              href="/inscripcion"
              className="mt-4 inline-block font-display font-extrabold text-rio underline underline-offset-4"
            >
              Ir al formulario →
            </Link>
          </Tarjeta>
        ) : (
          <ol className="mt-10 flex flex-col gap-3">
            {correos.map((c) => (
              <li key={c.id}>
                <Link href={`/correos/${c.id}`} className="block">
                  <Tarjeta
                    tono="nube"
                    className="pulsable flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <Chip
                      tono={COLOR_PLANTILLA[c.plantilla] ?? "nube"}
                      className="self-start sm:shrink-0"
                    >
                      {c.plantilla.replace(/-/g, " ")}
                    </Chip>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[0.95rem] font-extrabold leading-snug text-tinta sm:truncate">
                        {c.asunto}
                      </span>
                      <span className="raya-mono block truncate text-[0.7rem] text-tinta/75">
                        para {c.para}
                      </span>
                    </span>
                    <span className="raya-mono shrink-0 text-[0.68rem] text-tinta/75">
                      {new Date(c.enviadoEn).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </Tarjeta>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
      <Pie />
    </>
  );
}
