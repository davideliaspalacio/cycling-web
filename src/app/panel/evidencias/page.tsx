import Link from "next/link";
import { cookies } from "next/headers";
import { Encabezado, Pie } from "@/components/marco";
import { Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import {
  abonosConMismaEvidencia,
  abonosDe,
  abonosPorRevisar,
  inscripcionPorId,
} from "@/lib/almacen";
import {
  MAX_ABONOS,
  NOMBRE_COMPLETO,
  categoriaPorCodigo,
  cuentaDeCanal,
} from "@/lib/catalogo";
import {
  abonadoVerificado,
  excedente,
  fechaLarga,
  montosDelPlan,
  pesos,
  saldoDesdeAbonos,
} from "@/lib/dinero";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import type { Abono, Inscripcion } from "@/lib/tipos";
import { Revisar } from "./revisar";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: `Comprobantes por revisar — ${NOMBRE_COMPLETO}`,
};

/**
 * La cola de revisión.
 *
 * Es la pantalla donde una persona decide que un pago entró, así que está
 * ordenada por antigüedad (el que más lleva esperando, primero) y pone lado a
 * lado las tres cosas que hay que confrontar: el comprobante, lo que el
 * ciclista declaró y lo que dice la inscripción. Si el revisor tiene que
 * abrir otra pestaña para cuadrar una cifra, va a dejar de cuadrarla.
 */

type Fila = {
  abono: Abono;
  inscripcion: Inscripcion | undefined;
  verificado: number;
  saldo: number;
  sobra: number;
  /** Otras inscripciones donde ya se subió exactamente este mismo archivo. */
  repetidos: { referencia: string; estado: Abono["estado"]; monto: number }[];
};

async function armarFila(abono: Abono): Promise<Fila> {
  const inscripcion = await inscripcionPorId(abono.inscripcionId);
  const abonos = inscripcion ? await abonosDe(inscripcion.id) : [];
  const total = inscripcion?.total ?? 0;

  // El fraude obvio del pago manual: la misma captura para dos inscripciones.
  // No lo bloquea el sistema (a veces es legítimo, o es un reenvío honesto):
  // lo decide quien mira.
  const mismos = await abonosConMismaEvidencia(abono.evidenciaSha256, abono.id);
  const repetidos = await Promise.all(
    mismos.map(async (otro) => {
      const suya = await inscripcionPorId(otro.inscripcionId);
      return {
        referencia: suya?.referencia ?? "—",
        estado: otro.estado,
        monto: otro.montoAprobado ?? otro.montoDeclarado,
      };
    }),
  );

  return {
    abono,
    inscripcion,
    verificado: abonadoVerificado(abonos),
    saldo: saldoDesdeAbonos(total, abonos),
    sobra: excedente(total, abonos),
    repetidos,
  };
}

/** El comprobante, a tamaño de leerlo. */
function Evidencia({ abono }: { abono: Abono }) {
  const url = `/api/evidencias/${abono.id}`;
  const esPdf = abono.evidenciaTipo === "application/pdf";
  // HEIC es lo que sube un iPhone y lo que ningún navegador pinta. Antes que
  // un cuadro roto, el enlace para abrirlo con el visor del sistema.
  const esHeic = abono.evidenciaTipo === "image/heic";

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl border-[3px] border-tinta bg-nube">
        {esPdf ? (
          <iframe
            title={`Comprobante ${abono.id}`}
            src={url}
            className="h-[540px] w-full border-0 bg-nube"
          />
        ) : esHeic ? (
          <p className="p-8 text-center text-[0.9rem] text-tinta/75">
            Es una foto HEIC de iPhone: el navegador no la muestra. Ábrela con
            el enlace de abajo.
          </p>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={`Comprobante del abono ${abono.numero}`}
            className="max-h-[540px] w-full bg-nube object-contain"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          {/*
            El PDF se sirve con `Content-Security-Policy: sandbox` (correcto: es
            un extracto bancario), y algunos navegadores se niegan a montar su
            visor con esa cabecera y dejan el marco en blanco. La salida está a
            un clic, y hay que decirlo, no dejar al revisor mirando un recuadro
            vacío.
          */}
          {esPdf ? "¿No se ve el PDF? Ábrelo aquí ↗" : "Abrir a tamaño completo ↗"}
        </a>
        <span className="raya-mono text-[0.66rem] text-tinta/75">
          {abono.evidenciaTipo} · {Math.round(abono.evidenciaBytes / 1024)} KB ·
          sha {abono.evidenciaSha256.slice(0, 12)}
        </span>
      </div>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-tinta/12 py-2">
      <span className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.13em] text-tinta/75">
        {etiqueta}
      </span>
      <span
        className={`text-right font-display text-[0.92rem] font-extrabold ${alerta ? "text-alerta" : "text-tinta"}`}
      >
        {valor}
      </span>
    </div>
  );
}

function Comprobante({ fila }: { fila: Fila }) {
  const { abono, inscripcion, verificado, saldo, sobra, repetidos } = fila;
  const cat = inscripcion
    ? categoriaPorCodigo(inscripcion.categoriaCodigo)
    : undefined;
  const cuenta = cuentaDeCanal(abono.canal);
  const total = inscripcion?.total ?? 0;
  // Lo declarado sobre lo ya verificado: el aviso tiene que estar antes de
  // aprobar, no después.
  const seExcede = verificado + abono.montoDeclarado > total;

  return (
    <Tarjeta tono="nube" className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tono={abono.estado === "EN_REVISION" ? "sol" : "marea"}>
          {abono.estado === "EN_REVISION" ? "En revisión" : "Sin revisar"}
        </Chip>
        <Chip tono="nube">
          Cuota {abono.numero} de {MAX_ABONOS}
        </Chip>
        <span className="raya-mono text-[0.7rem] text-tinta/75">
          Subido el{" "}
          {new Date(abono.creadoEn).toLocaleString("es-CO", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {repetidos.length > 0 && (
          <Chip tono="alerta">⚠ Evidencia repetida ×{repetidos.length}</Chip>
        )}
        {(sobra > 0 || seExcede) && <Chip tono="alerta">⚠ Sobrepago</Chip>}
      </div>

      {repetidos.length > 0 && (
        <p className="mb-4 rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 text-[0.85rem] font-bold leading-relaxed text-nube">
          Este mismo archivo (byte por byte) ya se subió en{" "}
          {repetidos
            .map((r) => `${r.referencia} (${r.estado.toLowerCase()}, ${pesos(r.monto)})`)
            .join(", ")}
          . Confirma en el extracto que son transferencias distintas antes de
          verificar.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Evidencia abono={abono} />

        <div className="flex flex-col gap-5">
          <section>
            <h3 className="mb-1 font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
              Lo que declaró el ciclista
            </h3>
            <Dato etiqueta="Monto declarado" valor={pesos(abono.montoDeclarado)} />
            <Dato
              etiqueta="Canal"
              valor={`${cuenta?.entidad ?? abono.canal}${cuenta ? ` · ${cuenta.numero}` : ""}`}
            />
            <Dato
              etiqueta="Fecha de la transferencia"
              valor={abono.transferidoEl ? fechaLarga(abono.transferidoEl) : "No la puso"}
            />
            <Dato
              etiqueta="Número de comprobante"
              valor={abono.referenciaExterna || "No lo puso"}
            />
          </section>

          <section>
            <h3 className="mb-1 font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
              La inscripción
            </h3>
            {inscripcion ? (
              <>
                <Dato
                  etiqueta="Ciclista"
                  valor={`${inscripcion.ciclista.nombres} ${inscripcion.ciclista.apellidos}`}
                />
                <Dato etiqueta="Documento" valor={inscripcion.ciclista.identificacion} />
                <Dato etiqueta="Referencia" valor={inscripcion.referencia} />
                <Dato
                  etiqueta="Categoría"
                  valor={cat?.nombre ?? inscripcion.categoriaCodigo}
                />
                <Dato etiqueta="Total" valor={pesos(inscripcion.total)} />
                {/*
                  Lo que le tocaba a esta cuota, para poder confrontarlo con el
                  extracto. El revisor puede aprobar por otro monto —pasa
                  constantemente—, pero tiene que ver contra qué se compara.
                */}
                <Dato
                  etiqueta={`Cuota ${abono.numero} del plan`}
                  valor={pesos(montosDelPlan(inscripcion.total)[abono.numero - 1] ?? inscripcion.total)}
                />
                <Dato etiqueta="Ya verificado" valor={pesos(verificado)} />
                <Dato
                  etiqueta="Saldo"
                  valor={pesos(saldo)}
                  alerta={saldo === 0 && sobra > 0}
                />
                {sobra > 0 && (
                  <Dato etiqueta="Excedente ya cobrado" valor={pesos(sobra)} alerta />
                )}
                <p className="mt-2">
                  <Link
                    href={`/mi-inscripcion?ref=${inscripcion.referencia}`}
                    className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#2f7d32] hover:underline"
                  >
                    Ver la inscripción ↗
                  </Link>
                </p>
              </>
            ) : (
              <p className="py-2 text-[0.85rem] text-alerta">
                El comprobante no tiene inscripción asociada. No lo verifiques:
                repórtalo.
              </p>
            )}
          </section>

          {inscripcion && (
            <Revisar
              abonoId={abono.id}
              montoDeclarado={abono.montoDeclarado}
              total={inscripcion.total}
              verificado={verificado}
            />
          )}
        </div>
      </div>
    </Tarjeta>
  );
}

export default async function ColaDeEvidencias() {
  const sesion = leerSesion((await cookies()).get(COOKIE_SESION)?.value);
  const pendientes = await abonosPorRevisar();
  const filas = await Promise.all(pendientes.map(armarFila));

  const declarado = pendientes.reduce((s, a) => s + a.montoDeclarado, 0);

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
        <Link
          href="/panel"
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          ← Panel
        </Link>

        <TituloSeccion
          className="mt-5"
          eyebrow={
            sesion ? `Revisa ${sesion.nombre}` : "Uso interno"
          }
          titulo={
            pendientes.length === 0
              ? "No queda nada por revisar."
              : `${pendientes.length} comprobante${pendientes.length === 1 ? "" : "s"} esperando.`
          }
          bajada={
            pendientes.length === 0
              ? "Cuando un ciclista suba un comprobante, aparece aquí."
              : `El más viejo primero. Hay ${pesos(declarado)} declarados sin confirmar: hasta que alguien los verifique, no son dinero.`
          }
        />

        {pendientes.length === 0 ? (
          <Tarjeta tono="marea" className="mt-9 p-8">
            <p className="text-tinta/75">
              La cola está vacía.{" "}
              <Link href="/panel" className="text-rio underline underline-offset-4">
                Volver al panel
              </Link>
              .
            </p>
          </Tarjeta>
        ) : (
          <div className="mt-9 flex flex-col gap-6">
            {filas.map((fila) => (
              <Comprobante key={fila.abono.id} fila={fila} />
            ))}
          </div>
        )}
      </main>
      <Pie />
    </>
  );
}
