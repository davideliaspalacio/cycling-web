"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CajaEvidencia,
  type AbonoRegistrado,
} from "@/components/formulario/caja-evidencia";
import { CuentasRecaudo } from "@/components/formulario/cuentas-recaudo";
import { Boton, Campo, Chip, Tarjeta } from "@/components/ui";
import type { CuentaRecaudo } from "@/lib/catalogo";
import { recorridoDe } from "@/lib/catalogo";
import { fechaLarga, pesos } from "@/lib/dinero";
import type { CanalPago, EstadoAbono, EstadoInscripcion } from "@/lib/tipos";

/**
 * La página del ciclista bajo pago manual.
 *
 * Lo que antes eran botones de cobro ("adelantar cuota", "pagar el saldo")
 * aquí es una sola cosa: registrar un abono, o sea transferir y subir la
 * prueba. Nada de lo que pase en esta pantalla mueve dinero.
 *
 * La distinción que gobierna todo lo que se muestra: **abonado** es lo que un
 * revisor confirmó contra el extracto, **en revisión** es lo que el ciclista
 * dice haber transferido. Solo lo primero baja el saldo, y la interfaz nunca
 * los suma para que nadie crea que ya pagó.
 */

/** Un abono como lo puede ver su dueño: sin la clave del archivo ni la huella. */
export type AbonoVisible = {
  id: string;
  numero: number;
  creadoEn: string;
  canal: CanalPago;
  montoDeclarado: number;
  transferidoEl?: string;
  referenciaExterna?: string;
  estado: EstadoAbono;
  montoAprobado?: number;
  revisadoEn?: string;
  motivoRechazo?: string;
};

export type ResumenPago = {
  abonos: AbonoVisible[];
  /** Lo que un revisor confirmó. Es lo único que baja el saldo. */
  verificado: number;
  /** Lo subido y todavía sin revisar. Es una promesa, no dinero. */
  enRevision: number;
  saldo: number;
  excedente: number;
  abonosDisponibles: number;
  cerrado: boolean;
  fechaLimite: string;
};

export type VistaPortal = {
  referencia: string;
  estado: EstadoInscripcion;
  categoria: { nombre: string; km?: number; desnivel?: number } | null;
  ciclista: { nombres: string; apellidos: string; correo: string; ciudad: string };
  total: number;
  pago: ResumenPago;
};

const ETIQUETA_ESTADO: Record<
  EstadoInscripcion,
  { texto: string; tono: "turquesa" | "sol" | "alerta" | "nube" }
> = {
  BORRADOR: { texto: "Sin terminar", tono: "nube" },
  PENDIENTE_PAGO: { texto: "Falta el pago", tono: "alerta" },
  EN_VERIFICACION: { texto: "Revisando tu comprobante", tono: "sol" },
  AL_DIA: { texto: "Al día", tono: "turquesa" },
  EN_MORA: { texto: "Cobro pendiente", tono: "alerta" },
  COMPLETA: { texto: "Pago completo", tono: "turquesa" },
};

const ETIQUETA_ABONO: Record<
  EstadoAbono,
  { texto: string; tono: "turquesa" | "sol" | "alerta" | "marea"; ayuda: string }
> = {
  ENVIADA: {
    texto: "Enviado",
    tono: "marea",
    ayuda: "Lo recibimos. Está en la fila de revisión.",
  },
  EN_REVISION: {
    texto: "En revisión",
    tono: "sol",
    ayuda: "Alguien de la organización lo está comparando con el extracto.",
  },
  VERIFICADA: {
    texto: "Verificado",
    tono: "turquesa",
    ayuda: "El dinero entró y ya está descontado de tu saldo.",
  },
  RECHAZADA: {
    texto: "Rechazado",
    tono: "alerta",
    ayuda: "No pudimos darlo por bueno. Abajo dice por qué.",
  },
};

export function PortalCiclista({
  vista,
  cuentas,
}: {
  /** Ya resuelta en el servidor cuando la URL trae ?ref=. */
  vista: VistaPortal | null;
  cuentas: CuentaRecaudo[];
}) {
  if (!vista) return <Buscador />;
  return <Inscripcion vista={vista} cuentas={cuentas} />;
}

/* ------------------------------- Buscador -------------------------------- */

function Buscador() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState({ identificacion: "", correo: "" });

  const consultar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/mi-inscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(busqueda),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error);
        return;
      }
      // La búsqueda solo sirve para encontrar la referencia; el estado de pago
      // completo —abonos incluidos— lo arma el servidor en `?ref=`.
      router.push(`/mi-inscripcion?ref=${datos.referencia}`);
    } catch {
      setError("No pudimos conectarnos. Inténtalo otra vez.");
    } finally {
      setCargando(false);
    }
  }, [busqueda, router]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="font-display text-[clamp(1.9rem,5.5vw,2.8rem)] font-extrabold leading-[0.95] tracking-[-0.035em] text-tinta">
        ¿Cómo va tu pago?
      </h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-tinta/75">
        Consulta con el documento y el correo que usaste al inscribirte.
      </p>

      <Tarjeta tono="nube" className="mt-7 flex flex-col gap-5 p-6">
        <Campo id="doc" etiqueta="Documento" obligatorio>
          <input
            id="doc"
            className="campo raya-mono"
            inputMode="numeric"
            value={busqueda.identificacion}
            onChange={(e) =>
              setBusqueda({ ...busqueda, identificacion: e.target.value })
            }
          />
        </Campo>
        <Campo id="mail" etiqueta="Correo" obligatorio>
          <input
            id="mail"
            className="campo"
            type="email"
            value={busqueda.correo}
            onChange={(e) => setBusqueda({ ...busqueda, correo: e.target.value })}
          />
        </Campo>
        <Boton
          onClick={consultar}
          disabled={cargando}
          tamano="lg"
          className="self-start"
        >
          {cargando ? "Buscando…" : "Consultar"}
        </Boton>
        {error && (
          <p
            role="alert"
            className="text-[0.85rem] font-semibold leading-snug text-alerta"
          >
            {error}
          </p>
        )}
      </Tarjeta>

      <p className="mt-6 text-[0.85rem] text-tinta/75">
        ¿Todavía no te inscribes?{" "}
        <Link href="/inscripcion" className="text-rio underline underline-offset-4">
          Empieza aquí
        </Link>
        .
      </p>
    </div>
  );
}

/* ------------------------------ La inscripción ---------------------------- */

function Inscripcion({
  vista,
  cuentas,
}: {
  vista: VistaPortal;
  cuentas: CuentaRecaudo[];
}) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [recienSubido, setRecienSubido] = useState<AbonoRegistrado | null>(null);

  const { pago } = vista;
  const pagado = pago.verificado;
  const pct = Math.min(100, Math.round((pagado / vista.total) * 100));
  const recorrido = recorridoDe(vista.categoria ?? undefined);
  const estado = ETIQUETA_ESTADO[vista.estado];
  const completa = pago.saldo === 0;
  const puedeAbonar = !completa && !pago.cerrado && pago.abonosDisponibles > 0;

  function alRegistrar(abono: AbonoRegistrado) {
    setRecienSubido(abono);
    setAbriendo(false);
    // El historial y el saldo los pinta el servidor: hay que volver a pedirle
    // la página, no adivinar el nuevo estado desde aquí.
    router.refresh();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-rio">
            Inscripción {vista.referencia}
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.7rem,4.6vw,2.5rem)] font-extrabold leading-none tracking-[-0.035em] text-tinta">
            {vista.ciclista.nombres} {vista.ciclista.apellidos}
          </h1>
          <p className="mt-2 text-[0.9rem] text-tinta/75">
            {vista.categoria?.nombre}
            {recorrido ? ` · ${recorrido}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Chip tono={estado.tono}>{estado.texto}</Chip>
          <Link
            href={`/ticket/${vista.referencia}`}
            className="pulsable rounded-2xl border-[3px] border-tinta bg-turquesa px-4 py-2 font-display text-[0.9rem] font-extrabold text-tinta shadow-[4px_4px_0_0_var(--color-tinta)]"
          >
            {completa ? "Ver mi ticket" : "Ver mi constancia"}
          </Link>
        </div>
      </div>

      {recienSubido && (
        <p
          role="status"
          className="mt-6 rounded-2xl border-[3px] border-tinta bg-marea px-4 py-3 text-[0.9rem] font-semibold leading-snug text-tinta"
        >
          Recibimos tu comprobante por {pesos(recienSubido.montoDeclarado)}. Lo
          revisa una persona de la organización; te avisamos a{" "}
          {vista.ciclista.correo} en cuanto quede verificado.
        </p>
      )}

      {/* -------------------------------- Saldo ------------------------------ */}
      <Tarjeta tono="nube" className="mt-7 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
              {completa ? "Pagaste" : "Te falta"}
            </p>
            <p className="mt-1 font-display text-[clamp(2.4rem,7vw,3.6rem)] font-extrabold leading-none tracking-[-0.04em] text-tinta">
              {pesos(completa ? vista.total : pago.saldo)}
            </p>
          </div>
          <p className="raya-mono text-[0.8rem] font-bold text-tinta/75">
            {pesos(pagado)} de {pesos(vista.total)} · {pct}%
          </p>
        </div>

        <div
          className="mt-5 h-5 w-full overflow-hidden rounded-md border-[3px] border-tinta bg-nube"
          role="img"
          aria-label={`Llevas ${pct}% de la inscripción pagada`}
        >
          <div
            className="h-full bg-turquesa transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-3 border-t-2 border-dashed border-tinta/20 pt-4 text-[0.86rem] sm:grid-cols-3">
          <div>
            <dt className="raya-mono text-[0.62rem] uppercase tracking-[0.12em] text-tinta/75">
              Abonado y verificado
            </dt>
            <dd className="mt-0.5 font-display text-[1.05rem] font-extrabold text-tinta">
              {pesos(pagado)}
            </dd>
          </div>
          <div>
            <dt className="raya-mono text-[0.62rem] uppercase tracking-[0.12em] text-tinta/75">
              En revisión
            </dt>
            <dd className="mt-0.5 font-display text-[1.05rem] font-extrabold text-tinta">
              {pesos(pago.enRevision)}
            </dd>
          </div>
          <div>
            <dt className="raya-mono text-[0.62rem] uppercase tracking-[0.12em] text-tinta/75">
              Abonos disponibles
            </dt>
            <dd className="mt-0.5 font-display text-[1.05rem] font-extrabold text-tinta">
              {pago.abonosDisponibles}
            </dd>
          </div>
        </dl>

        {pago.enRevision > 0 && !completa && (
          <p className="mt-4 text-[0.88rem] leading-relaxed text-tinta/75">
            Tienes {pesos(pago.enRevision)} esperando revisión. El saldo baja
            cuando confirmemos ese dinero en el extracto, no antes.
          </p>
        )}

        {pago.excedente > 0 && (
          <p className="mt-4 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.88rem] font-semibold leading-snug text-tinta">
            Nos transferiste {pesos(pago.excedente)} de más. Escríbenos y lo
            resolvemos contigo.
          </p>
        )}

        {/* ---------------------------- La acción --------------------------- */}
        {completa ? (
          <p className="mt-5 rounded-2xl border-[3px] border-tinta bg-turquesa px-4 py-3 text-[0.9rem] font-semibold leading-snug text-tinta">
            Tu inscripción está pagada por completo. Ya puedes ver tu ticket con
            el dorsal.
          </p>
        ) : pago.cerrado ? (
          <p className="mt-5 rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 text-[0.9rem] font-semibold leading-snug text-nube">
            La recepción de comprobantes cerró el {fechaLarga(pago.fechaLimite)}.
            Escríbenos para resolver tu saldo.
          </p>
        ) : pago.abonosDisponibles === 0 ? (
          <p className="mt-5 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.9rem] font-semibold leading-snug text-tinta">
            Ya usaste los abonos permitidos y aún queda saldo. Escríbenos para
            terminar de pagar.
          </p>
        ) : (
          !abriendo && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Boton tamano="lg" onClick={() => setAbriendo(true)}>
                Registrar un abono
              </Boton>
              <p className="text-[0.82rem] leading-snug text-tinta/75">
                {pago.abonosDisponibles === 1
                  ? "Te queda 1 abono"
                  : `Te quedan ${pago.abonosDisponibles} abonos`}{" "}
                de {pago.abonosDisponibles + contarQueCuentan(pago.abonos)} ·
                hasta el {fechaLarga(pago.fechaLimite)}
              </p>
            </div>
          )
        )}
      </Tarjeta>

      {/* --------------------------- Registrar abono ------------------------- */}
      {abriendo && puedeAbonar && (
        <Tarjeta tono="nube" className="mt-5 animate-rise p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-tinta">
              Registrar un abono
            </h2>
            <button
              type="button"
              onClick={() => setAbriendo(false)}
              className="font-display text-[0.82rem] font-extrabold text-tinta/75 underline underline-offset-4"
            >
              Cancelar
            </button>
          </div>

          <p className="mt-2 text-[0.92rem] leading-relaxed text-tinta/75">
            Transfiere a una de estas cuentas y súbenos el comprobante. Copia el
            número: transcribirlo a mano es como se pierde una transferencia.
          </p>

          <CuentasRecaudo
            cuentas={cuentas}
            referencia={vista.referencia}
            className="mt-5"
          />

          <div className="mt-7 border-t-2 border-dashed border-tinta/20 pt-6">
            <CajaEvidencia
              referencia={vista.referencia}
              cuentas={cuentas}
              montoSugerido={pago.saldo}
              onRegistrado={alRegistrar}
            />
          </div>
        </Tarjeta>
      )}

      {/* ------------------------------ Historial ---------------------------- */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight text-tinta">
          Tus abonos
        </h2>

        {pago.abonos.length === 0 ? (
          <Tarjeta tono="marea" className="p-5">
            <p className="text-[0.9rem] leading-relaxed text-tinta/75">
              Todavía no has subido ningún comprobante. Cuando transfieras,
              súbelo aquí y aparece en esta lista con su estado.
            </p>
          </Tarjeta>
        ) : (
          <ol className="flex flex-col gap-2">
            {pago.abonos.map((abono) => (
              <li key={abono.id}>
                <FilaAbono
                  abono={abono}
                  cuentas={cuentas}
                  onVolverASubir={puedeAbonar ? () => setAbriendo(true) : undefined}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mt-8 text-[0.85rem] leading-relaxed text-tinta/75">
        Todos los movimientos te llegan a {vista.ciclista.correo}.
      </p>
    </div>
  );
}

/** Cuántos abonos gastan cupo: un rechazo no consume intento. */
function contarQueCuentan(abonos: AbonoVisible[]): number {
  return abonos.filter((a) => a.estado !== "RECHAZADA").length;
}

/* ------------------------------- Un abono --------------------------------- */

function FilaAbono({
  abono,
  cuentas,
  onVolverASubir,
}: {
  abono: AbonoVisible;
  cuentas: CuentaRecaudo[];
  onVolverASubir?: () => void;
}) {
  const marca = ETIQUETA_ABONO[abono.estado];
  const entidad =
    cuentas.find((c) => c.canal === abono.canal)?.entidad ?? abono.canal;
  const rechazado = abono.estado === "RECHAZADA";
  const verificado = abono.estado === "VERIFICADA";

  // El revisor puede aprobar por un monto distinto al declarado: es lo que
  // realmente entró y hay que decirlo, no esconderlo.
  const diferencia =
    verificado && abono.montoAprobado !== undefined
      ? abono.montoAprobado - abono.montoDeclarado
      : 0;

  return (
    <Tarjeta
      tono={verificado ? "turquesa" : "nube"}
      className={`p-4 sm:p-5 ${rechazado ? "opacity-90" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="raya-mono grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-tinta bg-nube text-[0.75rem] font-bold text-tinta">
          {abono.numero}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.95rem] font-extrabold leading-tight text-tinta">
            {entidad}
            {abono.transferidoEl
              ? ` · transferido el ${fechaLarga(abono.transferidoEl)}`
              : ""}
          </p>
          <p className="raya-mono text-[0.7rem] text-tinta/75">
            Subido el {new Date(abono.creadoEn).toLocaleDateString("es-CO")}
            {abono.referenciaExterna ? ` · ref. ${abono.referenciaExterna}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Chip tono={marca.tono}>{marca.texto}</Chip>
          <span className="raya-mono text-[1rem] font-bold text-tinta">
            {pesos(
              verificado && abono.montoAprobado !== undefined
                ? abono.montoAprobado
                : abono.montoDeclarado,
            )}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[0.82rem] leading-snug text-tinta/75">
        {marca.ayuda}
      </p>

      {diferencia !== 0 && (
        <p className="mt-1 text-[0.82rem] leading-snug text-tinta/75">
          Habías declarado {pesos(abono.montoDeclarado)}; el banco registró{" "}
          {pesos(abono.montoAprobado!)}.
        </p>
      )}

      {rechazado && (
        <div className="mt-3 rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3">
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-nube/80">
            Por qué se rechazó
          </p>
          <p className="mt-1 text-[0.88rem] font-semibold leading-snug text-nube">
            {abono.motivoRechazo ?? "No quedó registrado el motivo."}
          </p>
          <p className="mt-2 text-[0.82rem] leading-snug text-nube/85">
            Tu cupo sigue reservado y este intento no te gastó ningún abono.
          </p>
          {onVolverASubir && (
            <Boton
              tono="nube"
              className="mt-3"
              onClick={onVolverASubir}
            >
              Volver a subir el comprobante
            </Boton>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
