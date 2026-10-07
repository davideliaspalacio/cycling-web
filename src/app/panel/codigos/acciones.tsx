"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import {
  codigoSugerido,
  EMBAJADORES,
  LARGO_MAX_CODIGO,
  normalizarCodigo,
} from "@/lib/catalogo";

/**
 * Las tres acciones sobre un código: crear, activar/desactivar y borrar.
 *
 * Todas pasan por `/api/panel/codigos` y después `router.refresh()`: la lista
 * y los usos los pinta el servidor, así que no hay que adivinar aquí el estado
 * nuevo. Es el mismo patrón que la revisión de comprobantes.
 */

/* ------------------------------- Crear ------------------------------------ */

export function CrearCodigo() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [propietario, setPropietario] = useState("");
  /** `true` cuando el dueño es texto libre y no uno de los embajadores. */
  const [libre, setLibre] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const normalizado = normalizarCodigo(codigo);

  /*
   * Un código es adivinable cuando no lleva nada al azar: letras, números
   * sueltos al final y poco más. No se bloquea —puede haber un acuerdo donde
   * el código pactado es el que es—, pero sí se avisa, porque quien lo crea no
   * tiene por qué saber que hay una ruta pública que responde si existe.
   *
   * La regla es tosca a propósito: si tras quitarle los números del final y
   * los separadores queda algo corto y sin mezcla de letras y dígitos, es una
   * palabra. Lo que genera `codigoSugerido` nunca cae aquí.
   */
  const adivinable = (() => {
    if (normalizado.length < 4) return false;
    const sufijo = normalizado.split(/[-_]/).pop() ?? "";
    const tieneAzar =
      sufijo.length >= 5 && /[A-Z]/.test(sufijo) && /[0-9]/.test(sufijo);
    return !tieneAzar;
  })();

  async function crear() {
    setEnviando(true);
    setError(null);
    setListo(null);
    try {
      const r = await fetch("/api/panel/codigos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: normalizado, propietario }),
      });
      const datos = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(datos.error ?? "No se pudo crear el código.");
        return;
      }
      setListo(`Código ${normalizado} creado y activo.`);
      setCodigo("");
      setPropietario("");
      setLibre(false);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="codigo-nuevo"
          etiqueta="El código"
          obligatorio
          ayuda={`Se guarda en mayúsculas y sin tildes: ${normalizado || "XTREME-7F3QK2"}. Se lo vas a dictar por WhatsApp, así que corto.`}
        >
          <>
            <div className="flex gap-2">
              <input
                id="codigo-nuevo"
                className="campo raya-mono uppercase"
                autoComplete="off"
                spellCheck={false}
                maxLength={LARGO_MAX_CODIGO}
                placeholder="XTREME-7F3QK2"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
              <Boton
                type="button"
                tono="nube"
                onClick={() => setCodigo(codigoSugerido(propietario))}
              >
                Generar
              </Boton>
            </div>
            {adivinable && (
              <p className="mt-2 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.82rem] font-semibold leading-snug">
                Ese código se puede adivinar. La página pregunta en público si
                un código da descuento, y los nombres de los embajadores están
                publicados en el formulario de inscripción: alguien puede
                probar «{normalizado}» sin que nadie se lo haya dado. Dale a
                Generar y quedará con seis caracteres al azar.
              </p>
            )}
          </>
        </Campo>

        <Campo
          id="propietario-nuevo"
          etiqueta="De quién es"
          obligatorio
          ayuda="Un embajador del catálogo, o cualquier otro nombre si es un acuerdo nuevo."
        >
          <>
            <select
              id="propietario-nuevo"
              className="campo"
              value={libre ? "__libre__" : propietario}
              onChange={(e) => {
                const elegido = e.target.value;
                setLibre(elegido === "__libre__");
                setPropietario(elegido === "__libre__" ? "" : elegido);
              }}
            >
              <option value="">Elige a quién pertenece…</option>
              {EMBAJADORES.map((e) => (
                <option key={e}>{e}</option>
              ))}
              <option value="__libre__">Otro (lo escribo)</option>
            </select>
            {libre && (
              <input
                className="campo mt-2"
                aria-label="Nombre del dueño del código"
                placeholder="Tienda, comunidad, aliado…"
                maxLength={80}
                value={propietario}
                onChange={(e) => setPropietario(e.target.value)}
              />
            )}
          </>
        </Campo>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 text-[0.88rem] font-semibold leading-snug text-nube"
        >
          {error}
        </p>
      )}
      {listo && (
        <p
          role="status"
          className="rounded-2xl border-[3px] border-tinta bg-turquesa px-4 py-3 font-display text-[0.9rem] font-extrabold text-tinta"
        >
          {listo}
        </p>
      )}

      <div>
        <Boton
          onClick={crear}
          disabled={enviando || normalizado.length < 3 || propietario.trim().length < 2}
        >
          {enviando ? "Creando…" : "Crear el código"}
        </Boton>
      </div>
    </div>
  );
}

/* ---------------------- Activar, desactivar y borrar ---------------------- */

export function AccionesDeCodigo({
  codigo,
  activo,
  usos,
}: {
  codigo: string;
  activo: boolean;
  /** Cuántas inscripciones lo usaron. Decide si se puede borrar. */
  usos: number;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState<"ACTIVO" | "BORRAR" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function llamar(metodo: "PATCH" | "DELETE", cuerpo: object) {
    setEnviando(metodo === "PATCH" ? "ACTIVO" : "BORRAR");
    setError(null);
    try {
      const r = await fetch("/api/panel/codigos", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(datos.error ?? "No se pudo hacer el cambio.");
        return;
      }
      setConfirmando(false);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Inténtalo otra vez.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Boton
          tono={activo ? "sol" : "turquesa"}
          onClick={() => llamar("PATCH", { codigo, activo: !activo })}
          disabled={enviando !== null}
        >
          {enviando === "ACTIVO"
            ? "Guardando…"
            : activo
              ? "Desactivar"
              : "Activar"}
        </Boton>

        {/*
          Borrar solo aparece cuando el código no tiene ningún uso. Con usos no
          se ofrece siquiera: la acción correcta es desactivarlo, y un botón
          que siempre falla solo invita a insistir.
        */}
        {usos === 0 &&
          (confirmando ? (
            <>
              <Boton
                tono="alerta"
                onClick={() => llamar("DELETE", { codigo })}
                disabled={enviando !== null}
              >
                {enviando === "BORRAR" ? "Borrando…" : "Sí, borrarlo"}
              </Boton>
              <Boton
                tono="nube"
                onClick={() => setConfirmando(false)}
                disabled={enviando !== null}
              >
                No
              </Boton>
            </>
          ) : (
            <Boton
              tono="nube"
              onClick={() => setConfirmando(true)}
              disabled={enviando !== null}
            >
              Borrar
            </Boton>
          ))}
      </div>

      {error && (
        <p
          role="alert"
          className="max-w-md rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 text-left text-[0.84rem] font-semibold leading-snug text-nube"
        >
          {error}
        </p>
      )}
    </div>
  );
}
