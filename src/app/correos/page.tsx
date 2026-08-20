import Link from "next/link";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { listarCorreos } from "@/lib/almacen";
import { MODO_CORREO } from "@/lib/correos/enviar";

export const dynamic = "force-dynamic";

export const metadata = { title: "Correos enviados — Tibet Epic XCM" };

const COLOR_PLANTILLA: Record<string, "lima" | "naranja" | "magenta" | "cielo" | "hueso"> = {
  "inscripcion-confirmada": "lima",
  "plan-cuotas-activado": "naranja",
  "cuota-pagada": "lima",
  "recordatorio-cuota": "cielo",
  "cuota-fallida": "magenta",
  "inscripcion-saldada": "lima",
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
          <Tarjeta tono="selva" className="mt-10 p-8">
            <p className="text-[0.98rem] leading-relaxed text-hueso/70">
              Todavía no hay correos. Completa una inscripción y vuelve: aquí
              aparecerán la confirmación, los comprobantes de cada cuota y los
              recordatorios.
            </p>
            <Link
              href="/inscripcion"
              className="mt-4 inline-block font-display font-extrabold text-lima underline underline-offset-4"
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
                    tono="hueso"
                    className="pulsable flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <Chip
                      tono={COLOR_PLANTILLA[c.plantilla] ?? "hueso"}
                      className="self-start sm:shrink-0"
                    >
                      {c.plantilla.replace(/-/g, " ")}
                    </Chip>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[0.95rem] font-extrabold leading-snug text-tinta sm:truncate">
                        {c.asunto}
                      </span>
                      <span className="raya-mono block truncate text-[0.7rem] text-tinta/50">
                        para {c.para}
                      </span>
                    </span>
                    <span className="raya-mono shrink-0 text-[0.68rem] text-tinta/45">
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
