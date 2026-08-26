"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Tarjeta } from "@/components/ui";
import { PRENDAS, TALLAS, TIPOS_RH } from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";

/**
 * Cesión del cupo a otra persona.
 *
 * Los campos de identidad arrancan **vacíos** a propósito, con los del titular
 * actual al lado en solo lectura. Prellenarlos sería más cómodo y muchísimo
 * peor: bastaría con no tocar el correo para que la constancia de la cesión le
 * llegue a quien acaba de perder el cupo, y para que el dorsal salga con el
 * documento equivocado. Las tallas sí vienen puestas — el kit ya está pedido y
 * casi siempre se respeta.
 */

type Props = {
  referencia: string;
  actual: {
    nombres: string;
    apellidos: string;
    identificacion: string;
    correo: string;
    telefono: string;
    ciudad: string;
    departamento: string;
  };
  categoria: string;
  total: number;
  pagado: number;
  saldo: number;
  tallas: { jersey: string; running: string };
};

const VACIO = {
  identificacion: "",
  nombres: "",
  apellidos: "",
  sexo: "Masculino",
  eps: "",
  correo: "",
  telefono: "",
  contactoEmergencia: "",
  telefonoEmergencia: "",
  direccion: "",
  fechaNacimiento: "",
  rh: TIPOS_RH[0],
  referidoPor: "",
  ciudad: "",
  departamento: "",
  pais: "Colombia",
};

export function Cesion({
  referencia,
  actual,
  categoria,
  total,
  pagado,
  saldo,
  tallas: tallasIniciales,
}: Props) {
  const router = useRouter();
  const [ciclista, setCiclista] = useState({ ...VACIO });
  const [tallas, setTallas] = useState(tallasIniciales);
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const set = (campo: keyof typeof VACIO) => (valor: string) =>
    setCiclista((c) => ({ ...c, [campo]: valor }));

  async function ceder() {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/panel/competidor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia,
          ciclista,
          tallas,
          motivo: motivo.trim() || undefined,
        }),
      });
      const datos = (await r.json().catch(() => ({}))) as {
        error?: string;
        detalles?: { fieldErrors?: Record<string, string[]> };
        ciclista?: string;
        anterior?: string;
        saldo?: number;
      };
      if (!r.ok) {
        const campos = datos.detalles?.fieldErrors ?? {};
        const primero = Object.values(campos).flat()[0];
        setError(primero ?? datos.error ?? "No se pudo hacer el cambio.");
        setConfirmando(false);
        return;
      }
      setListo(
        `${referencia} pasó de ${datos.anterior} a ${datos.ciclista}. Se conservan la categoría y ${pesos(pagado)} abonados; queda un saldo de ${pesos(datos.saldo ?? saldo)}. Le enviamos la constancia por correo.`,
      );
      router.refresh();
    } catch {
      setError("No se pudo conectar. Inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <Tarjeta tono="turquesa" className="mt-8 p-6">
        <p className="font-display text-[1.05rem] font-extrabold leading-snug text-tinta">
          Cupo cedido.
        </p>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-tinta/75">{listo}</p>
      </Tarjeta>
    );
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <Tarjeta tono="marea" className="h-fit p-5">
        <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-rio">
          Quién tiene el cupo hoy
        </p>
        <p className="mt-2 font-display text-[1.15rem] font-extrabold leading-tight text-tinta">
          {actual.nombres} {actual.apellidos}
        </p>
        <dl className="mt-3 flex flex-col gap-1.5 text-[0.82rem]">
          {[
            ["Documento", actual.identificacion],
            ["Correo", actual.correo],
            ["Celular", actual.telefono],
            ["Ciudad", `${actual.ciudad}, ${actual.departamento}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="raya-mono text-[0.66rem] uppercase text-tinta/75">{k}</dt>
              <dd className="text-right text-tinta/80">{v}</dd>
            </div>
          ))}
        </dl>

        <hr className="my-4 border-tinta/15" />

        <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-rio">
          Lo que se conserva
        </p>
        <dl className="mt-2 flex flex-col gap-1.5 text-[0.82rem]">
          {[
            ["Referencia", referencia],
            ["Categoría", categoria],
            ["Total", pesos(total)],
            ["Ya abonado", pesos(pagado)],
            ["Saldo", pesos(saldo)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="raya-mono text-[0.66rem] uppercase text-tinta/75">{k}</dt>
              <dd className="text-right font-bold text-tinta">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[0.78rem] leading-relaxed text-tinta/75">
          La inscripción no se devuelve, pero sí se cede. Los comprobantes ya
          verificados se quedan con el cupo, no con la persona.
        </p>
      </Tarjeta>

      <Tarjeta tono="nube" className="p-5 sm:p-6">
        <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
          Datos de quien recibe el cupo
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombres" id="c-nombres" obligatorio>
            <input
              id="c-nombres"
              className="campo"
              value={ciclista.nombres}
              onChange={(e) => set("nombres")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Apellidos" id="c-apellidos" obligatorio>
            <input
              id="c-apellidos"
              className="campo"
              value={ciclista.apellidos}
              onChange={(e) => set("apellidos")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Documento" id="c-doc" obligatorio>
            <input
              id="c-doc"
              className="campo"
              inputMode="numeric"
              value={ciclista.identificacion}
              onChange={(e) =>
                set("identificacion")(e.target.value.replace(/[^\d]/g, ""))
              }
            />
          </Campo>
          <Campo etiqueta="Sexo" id="c-sexo" obligatorio>
            <select
              id="c-sexo"
              className="campo"
              value={ciclista.sexo}
              onChange={(e) => set("sexo")(e.target.value)}
            >
              <option>Masculino</option>
              <option>Femenino</option>
            </select>
          </Campo>
          <Campo etiqueta="Correo" id="c-correo" obligatorio ayuda="Aquí le llega la constancia del cambio.">
            <input
              id="c-correo"
              type="email"
              className="campo"
              value={ciclista.correo}
              onChange={(e) => set("correo")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Celular" id="c-tel" obligatorio>
            <input
              id="c-tel"
              className="campo"
              inputMode="numeric"
              value={ciclista.telefono}
              onChange={(e) => set("telefono")(e.target.value.replace(/[^\d]/g, ""))}
            />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento" id="c-nac" obligatorio>
            <input
              id="c-nac"
              type="date"
              className="campo"
              value={ciclista.fechaNacimiento}
              onChange={(e) => set("fechaNacimiento")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="RH" id="c-rh" obligatorio>
            <select
              id="c-rh"
              className="campo"
              value={ciclista.rh}
              onChange={(e) => set("rh")(e.target.value)}
            >
              {TIPOS_RH.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="EPS" id="c-eps">
            <input
              id="c-eps"
              className="campo"
              value={ciclista.eps}
              onChange={(e) => set("eps")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Dirección" id="c-dir" obligatorio>
            <input
              id="c-dir"
              className="campo"
              value={ciclista.direccion}
              onChange={(e) => set("direccion")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Ciudad" id="c-ciudad" obligatorio>
            <input
              id="c-ciudad"
              className="campo"
              value={ciclista.ciudad}
              onChange={(e) => set("ciudad")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Departamento" id="c-dep" obligatorio>
            <input
              id="c-dep"
              className="campo"
              value={ciclista.departamento}
              onChange={(e) => set("departamento")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Contacto de emergencia" id="c-emerg" obligatorio>
            <input
              id="c-emerg"
              className="campo"
              value={ciclista.contactoEmergencia}
              onChange={(e) => set("contactoEmergencia")(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Teléfono de emergencia" id="c-emerg-tel" obligatorio>
            <input
              id="c-emerg-tel"
              className="campo"
              inputMode="numeric"
              value={ciclista.telefonoEmergencia}
              onChange={(e) =>
                set("telefonoEmergencia")(e.target.value.replace(/[^\d]/g, ""))
              }
            />
          </Campo>
          {PRENDAS.map((p) => (
            <Campo key={p.campo} etiqueta={p.nombre} id={`c-${p.campo}`} obligatorio>
              <select
                id={`c-${p.campo}`}
                className="campo"
                value={tallas[p.campo]}
                onChange={(e) =>
                  setTallas((t) => ({ ...t, [p.campo]: e.target.value }))
                }
              >
                {TALLAS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Campo>
          ))}
          <div className="sm:col-span-2">
            <Campo
              etiqueta="Motivo del cambio"
              id="c-motivo"
              ayuda="Opcional, pero queda en la bitácora del cupo. «Lesión», «no puede viajar»…"
            >
              <input
                id="c-motivo"
                className="campo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </Campo>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 font-mono text-[0.75rem] font-bold text-alerta"
          >
            {error}
          </p>
        )}

        {confirmando ? (
          <div className="mt-5 rounded-2xl border-[3px] border-tinta bg-sol p-4">
            <p className="text-[0.9rem] font-bold leading-relaxed text-tinta">
              El cupo {referencia} deja de ser de {actual.nombres}{" "}
              {actual.apellidos} y pasa a {ciclista.nombres} {ciclista.apellidos}{" "}
              (doc. {ciclista.identificacion}). No se deshace desde aquí.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Boton tono="turquesa" disabled={enviando} onClick={ceder}>
                {enviando ? "Cediendo…" : "Sí, ceder el cupo"}
              </Boton>
              <Boton tono="nube" onClick={() => setConfirmando(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <Boton
            tono="turquesa"
            className="mt-5"
            onClick={() => {
              setError(null);
              setConfirmando(true);
            }}
          >
            Ceder el cupo
          </Boton>
        )}
      </Tarjeta>
    </div>
  );
}
