"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boton, Campo, Tarjeta } from "@/components/ui";
import { CATEGORIAS, GRUPOS, MUNICIPIOS, PRENDAS, TALLAS, TIPOS_RH } from "@/lib/catalogo";
import {
  cambiosDeEdicion,
  fraseDeCambio,
  pareceCesion,
  type Cambio,
} from "@/lib/edicion-campos";
import type { DatosCiclista, Tallas as TallasTipo } from "@/lib/tipos";
import { avisoDeCategoria, esquemaCiclista, esquemaTallas } from "@/lib/validacion";

/**
 * El formulario de la corrección.
 *
 * Al revés que la cesión (`/panel/competidor`), aquí los campos **sí** vienen
 * llenos: corregir un dedazo es cambiar un carácter de un dato que ya existe, y
 * obligar a reescribir los dieciséis campos para arreglar una talla sería pedir
 * a gritos que se introduzcan errores nuevos. Por eso mismo, lo que se enseña
 * todo el tiempo es la lista de diferencias: lo que se guarda —y lo que se
 * anota— es exactamente eso y nada más.
 *
 * Las reglas de los campos son las del formulario público: `esquemaCiclista` y
 * `esquemaTallas`, los mismos objetos. Aquí se comprueban para marcar el campo
 * antes de mandar nada; el servidor los vuelve a aplicar, que es donde cuenta.
 */

type Props = {
  referencia: string;
  ciclista: DatosCiclista;
  tallas: TallasTipo;
  categoriaCodigo: string;
};

type Errores = Record<string, string>;

export function Correccion({
  referencia,
  ciclista: ciclistaInicial,
  tallas: tallasIniciales,
  categoriaCodigo: categoriaInicial,
}: Props) {
  const router = useRouter();
  const [ciclista, setCiclista] = useState<DatosCiclista>({ ...ciclistaInicial });
  const [tallas, setTallas] = useState<TallasTipo>({ ...tallasIniciales });
  const [categoriaCodigo, setCategoriaCodigo] = useState(categoriaInicial);
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string[] | null>(null);

  const original = useMemo(
    () => ({
      ciclista: ciclistaInicial,
      tallas: tallasIniciales,
      categoriaCodigo: categoriaInicial,
    }),
    [ciclistaInicial, tallasIniciales, categoriaInicial],
  );

  // La misma función que usa el servidor para decidir qué escribe y qué anota.
  const cambios = useMemo(
    () =>
      cambiosDeEdicion({
        inscripcion: original,
        ciclista,
        tallas,
        categoriaCodigo,
      }),
    [original, ciclista, tallas, categoriaCodigo],
  );

  const esCesion = pareceCesion(cambios);

  // El mismo aviso del reglamento que ve el ciclista al inscribirse, calculado
  // sobre lo que quedaría: categoría nueva contra fecha de nacimiento nueva.
  const aviso = avisoDeCategoria(categoriaCodigo, ciclista.fechaNacimiento);

  const set = (campo: keyof DatosCiclista) => (valor: string) =>
    setCiclista((c) => {
      const siguiente = { ...c, [campo]: valor };
      // Igual que en el formulario público: la ciudad completa el departamento.
      if (campo === "ciudad" && MUNICIPIOS[valor]) {
        siguiente.departamento = MUNICIPIOS[valor];
      }
      return siguiente;
    });

  function validar(): boolean {
    const nuevos: Errores = {};
    const r = esquemaCiclista.safeParse(ciclista);
    if (!r.success) {
      for (const asunto of r.error.issues) {
        const clave = String(asunto.path[0]);
        if (!nuevos[clave]) nuevos[clave] = asunto.message;
      }
    }
    if (!esquemaTallas.safeParse(tallas).success) {
      nuevos.tallas = "Elige las dos tallas.";
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) {
      setError("Hay datos que no pasan las reglas. Están marcados abajo.");
      return false;
    }
    return true;
  }

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/panel/edicion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia,
          ciclista,
          tallas,
          categoriaCodigo,
          motivo: motivo.trim() || undefined,
        }),
      });
      const datos = (await r.json().catch(() => ({}))) as {
        error?: string;
        detalles?: { fieldErrors?: Record<string, string[]> };
        cambios?: Cambio[];
      };
      if (!r.ok) {
        const campos = datos.detalles?.fieldErrors ?? {};
        const primero = Object.values(campos).flat()[0];
        setError(primero ?? datos.error ?? "No se pudo guardar la corrección.");
        setConfirmando(false);
        return;
      }
      // Los cambios que se enseñan son los que el servidor dice haber escrito,
      // no los que la pantalla creía: si difieren, manda el servidor.
      setListo((datos.cambios ?? []).map(fraseDeCambio));
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
          Datos corregidos.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {listo.map((linea) => (
            <li key={linea} className="text-[0.9rem] leading-relaxed text-tinta/80">
              Cambió {linea}.
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.85rem] leading-relaxed text-tinta/75">
          Quedó anotado en la bitácora de {referencia} con tu nombre y con lo que
          decía antes.
        </p>
        <p className="mt-4">
          <Link
            href={`/panel/inscrito/${encodeURIComponent(referencia)}`}
            className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
          >
            Ver la ficha →
          </Link>
        </p>
      </Tarjeta>
    );
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <Tarjeta tono="nube" className="p-5 sm:p-6">
        <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
          Datos del ciclista
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo id="e-nombres" etiqueta="Nombres" obligatorio error={errores.nombres}>
            <input
              id="e-nombres"
              className="campo"
              value={ciclista.nombres}
              onChange={(e) => set("nombres")(e.target.value)}
            />
          </Campo>
          <Campo id="e-apellidos" etiqueta="Apellidos" obligatorio error={errores.apellidos}>
            <input
              id="e-apellidos"
              className="campo"
              value={ciclista.apellidos}
              onChange={(e) => set("apellidos")(e.target.value)}
            />
          </Campo>
          <Campo
            id="e-identificacion"
            etiqueta="Documento"
            obligatorio
            error={errores.identificacion}
            ayuda="Entre 5 y 15 dígitos, como en el formulario público."
          >
            <input
              id="e-identificacion"
              className="campo"
              inputMode="numeric"
              value={ciclista.identificacion}
              onChange={(e) =>
                set("identificacion")(e.target.value.replace(/[^\d]/g, ""))
              }
            />
          </Campo>
          <Campo id="e-sexo" etiqueta="Sexo" obligatorio error={errores.sexo}>
            <select
              id="e-sexo"
              className="campo"
              value={ciclista.sexo}
              onChange={(e) => set("sexo")(e.target.value)}
            >
              <option>Masculino</option>
              <option>Femenino</option>
            </select>
          </Campo>
          <Campo
            id="e-nacimiento"
            etiqueta="Fecha de nacimiento"
            obligatorio
            error={errores.fechaNacimiento}
          >
            <input
              id="e-nacimiento"
              type="date"
              className="campo"
              value={ciclista.fechaNacimiento}
              onChange={(e) => set("fechaNacimiento")(e.target.value)}
            />
          </Campo>
          <Campo id="e-correo" etiqueta="Correo" obligatorio error={errores.correo}>
            <input
              id="e-correo"
              type="email"
              className="campo"
              value={ciclista.correo}
              onChange={(e) => set("correo")(e.target.value)}
            />
          </Campo>
          <Campo id="e-telefono" etiqueta="Celular" obligatorio error={errores.telefono}>
            <input
              id="e-telefono"
              className="campo"
              inputMode="numeric"
              value={ciclista.telefono}
              onChange={(e) => set("telefono")(e.target.value.replace(/[^\d]/g, ""))}
            />
          </Campo>
          <Campo id="e-rh" etiqueta="RH" obligatorio error={errores.rh}>
            <select
              id="e-rh"
              className="campo"
              value={ciclista.rh}
              onChange={(e) => set("rh")(e.target.value)}
            >
              {TIPOS_RH.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo id="e-eps" etiqueta="EPS" error={errores.eps}>
            <input
              id="e-eps"
              className="campo"
              value={ciclista.eps}
              onChange={(e) => set("eps")(e.target.value)}
            />
          </Campo>
          <Campo
            id="e-ciudad"
            etiqueta="Ciudad o municipio"
            obligatorio
            error={errores.ciudad}
            ayuda="Escribe y se completa el departamento."
          >
            <input
              id="e-ciudad"
              className="campo"
              list="municipios-correccion"
              value={ciclista.ciudad}
              onChange={(e) => set("ciudad")(e.target.value)}
            />
            <datalist id="municipios-correccion">
              {Object.keys(MUNICIPIOS).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Campo>
          <Campo
            id="e-departamento"
            etiqueta="Departamento"
            obligatorio
            error={errores.departamento}
          >
            <input
              id="e-departamento"
              className="campo"
              value={ciclista.departamento}
              onChange={(e) => set("departamento")(e.target.value)}
            />
          </Campo>
          <Campo id="e-pais" etiqueta="País" error={errores.pais}>
            <input
              id="e-pais"
              className="campo"
              value={ciclista.pais}
              onChange={(e) => set("pais")(e.target.value)}
            />
          </Campo>
          <div className="sm:col-span-2">
            <Campo
              id="e-direccion"
              etiqueta="Dirección"
              obligatorio
              error={errores.direccion}
            >
              <input
                id="e-direccion"
                className="campo"
                value={ciclista.direccion}
                onChange={(e) => set("direccion")(e.target.value)}
              />
            </Campo>
          </div>
          <Campo
            id="e-emergencia"
            etiqueta="Contacto de emergencia"
            obligatorio
            error={errores.contactoEmergencia}
          >
            <input
              id="e-emergencia"
              className="campo"
              value={ciclista.contactoEmergencia}
              onChange={(e) => set("contactoEmergencia")(e.target.value)}
            />
          </Campo>
          <Campo
            id="e-emergencia-tel"
            etiqueta="Teléfono de emergencia"
            obligatorio
            error={errores.telefonoEmergencia}
          >
            <input
              id="e-emergencia-tel"
              className="campo"
              inputMode="numeric"
              value={ciclista.telefonoEmergencia}
              onChange={(e) =>
                set("telefonoEmergencia")(e.target.value.replace(/[^\d]/g, ""))
              }
            />
          </Campo>
          <Campo id="e-referido" etiqueta="Quién lo refirió" error={errores.referidoPor}>
            <input
              id="e-referido"
              className="campo"
              value={ciclista.referidoPor}
              onChange={(e) => set("referidoPor")(e.target.value)}
            />
          </Campo>
        </div>

        <hr className="my-6 border-tinta/15" />

        <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-tinta/75">
          Carrera y kit
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo
              id="e-categoria"
              etiqueta="Categoría"
              obligatorio
              ayuda="Cambiarla no toca el precio ni nada de pago."
            >
              <select
                id="e-categoria"
                className="campo"
                value={categoriaCodigo}
                onChange={(e) => setCategoriaCodigo(e.target.value)}
              >
                {GRUPOS.map((grupo) => (
                  <optgroup key={grupo.id} label={grupo.titulo}>
                    {CATEGORIAS.filter((c) => c.grupo === grupo.id).map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.nombre}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Campo>
          </div>
          {PRENDAS.map((prenda) => (
            <Campo
              key={prenda.campo}
              id={`e-${prenda.campo}`}
              etiqueta={prenda.nombre}
              obligatorio
              error={errores.tallas}
            >
              <select
                id={`e-${prenda.campo}`}
                className="campo"
                value={tallas[prenda.campo]}
                onChange={(e) =>
                  setTallas((t) => ({ ...t, [prenda.campo]: e.target.value }))
                }
              >
                {TALLAS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Campo>
          ))}
        </div>

        {aviso && (
          <p className="mt-5 rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 text-[0.85rem] font-bold leading-relaxed text-nube">
            Ojo con la categoría: {aviso} Puedes guardarla igual; quedará dicho en
            la bitácora que se supo.
          </p>
        )}

        <div className="mt-5">
          <Campo
            id="e-motivo"
            etiqueta="Motivo de la corrección"
            ayuda="Opcional, pero queda en la bitácora. «Llamó a decir que la cédula estaba mal», «pidió cambiar la talla»…"
          >
            <input
              id="e-motivo"
              className="campo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Campo>
        </div>
      </Tarjeta>

      {/* --------------------- Lo que se va a guardar --------------------- */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:h-fit">
        <Tarjeta tono="marea" className="p-5">
          <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-rio">
            Lo que vas a cambiar
          </p>
          {cambios.length === 0 ? (
            <p className="mt-2 text-[0.85rem] leading-relaxed text-tinta/75">
              Nada todavía. Solo se guarda lo que de verdad cambie.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {cambios.map((c) => (
                <li
                  key={c.campo}
                  className="rounded-2xl border-[3px] border-tinta bg-nube px-3 py-2"
                >
                  <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] text-tinta/75">
                    {c.etiqueta}
                  </p>
                  <p className="mt-0.5 break-words text-[0.85rem] leading-snug text-tinta">
                    <span className="line-through opacity-60">
                      {c.antes || "(vacío)"}
                    </span>{" "}
                    → <strong>{c.ahora || "(vacío)"}</strong>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        {/*
          Cambiar documento, nombre y correo a la vez no es corregir un dedazo:
          es pasarle el cupo a otra persona. Se avisa y se ofrece la puerta
          correcta, pero no se bloquea: la organización decide.
        */}
        {esCesion && (
          <Tarjeta tono="sol" className="p-5">
            <p className="font-display text-[0.98rem] font-extrabold leading-snug text-tinta">
              Esto parece una cesión, no una corrección.
            </p>
            <p className="mt-2 text-[0.85rem] leading-relaxed text-tinta/80">
              Estás cambiando el documento, el nombre y el correo a la vez: eso
              es otra persona. La cesión deja otra constancia —guarda al titular
              anterior completo y le manda el aviso por correo a quien recibe el
              cupo—. Puedes seguir por aquí si sabes lo que haces.
            </p>
            <p className="mt-3">
              <Link
                href={`/panel/competidor?q=${encodeURIComponent(referencia)}`}
                className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
              >
                Ir a ceder el cupo →
              </Link>
            </p>
          </Tarjeta>
        )}

        {error && (
          <p
            role="alert"
            className="font-mono text-[0.75rem] font-bold leading-relaxed text-alerta"
          >
            {error}
          </p>
        )}

        {confirmando ? (
          <div className="rounded-2xl border-[3px] border-tinta bg-sol p-4">
            <p className="text-[0.9rem] font-bold leading-relaxed text-tinta">
              Se guardan {cambios.length === 1 ? "este cambio" : `estos ${cambios.length} cambios`} en {referencia} y queda anotado
              con tu nombre y con lo que decía antes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Boton tono="turquesa" disabled={enviando} onClick={guardar}>
                {enviando ? "Guardando…" : "Sí, guardar la corrección"}
              </Boton>
              <Boton tono="nube" onClick={() => setConfirmando(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <Boton
            tono="turquesa"
            disabled={cambios.length === 0}
            onClick={() => {
              setError(null);
              if (!validar()) return;
              setConfirmando(true);
            }}
          >
            {cambios.length === 0
              ? "No hay nada que corregir"
              : `Revisar y guardar (${cambios.length})`}
          </Boton>
        )}
      </div>
    </div>
  );
}
