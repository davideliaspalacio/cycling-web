"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PerfilDeEtapa, type Hito } from "@/components/perfil-de-etapa";
import { Boton, Campo, Tarjeta } from "@/components/ui";
import {
  ANIO_CARRERA,
  EMBAJADORES,
  EVENTO,
  GRUPOS,
  MUNICIPIOS,
  OTRO_EMBAJADOR,
  PRECIO_INSCRIPCION,
  PRENDAS,
  TALLAS,
  TIPOS_RH,
  categoriaPorCodigo,
  categoriasDeGrupo,
  recorridoDe,
} from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";
import { avisoDeCategoria, esquemaCiclista, esquemaTallas } from "@/lib/validacion";
import type { CuentaRecaudo } from "@/lib/catalogo";
import type { DatosCiclista, Tallas as TipoTallas } from "@/lib/tipos";
import { PasoPago } from "./paso-pago";
import { MEDIDAS, TextosLegales } from "./legales";

const HITOS: Hito[] = [
  { titulo: "Categoría", km: 0 },
  { titulo: "Tus datos", km: 23 },
  { titulo: "Tallas", km: 45 },
  { titulo: "Permisos", km: 68 },
  { titulo: "Pago", km: 90 },
];

const CICLISTA_VACIO: DatosCiclista = {
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
  rh: "O+",
  referidoPor: "",
  ciudad: "",
  departamento: "",
  pais: "Colombia",
};

type Errores = Record<string, string>;

export function FormularioInscripcion({
  categoriaInicial,
  cuentas,
  fechaLimite,
}: {
  categoriaInicial?: string;
  /**
   * Las cuentas de recaudo, resueltas en el servidor. No se importan aquí
   * porque salen de variables de entorno sin `NEXT_PUBLIC_`: en el navegador
   * valdrían el respaldo del repositorio y no la cuenta configurada.
   */
  cuentas: CuentaRecaudo[];
  /** Último día para subir comprobantes (ISO). */
  fechaLimite: string;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(categoriaInicial ? 1 : 0);
  const [categoriaCodigo, setCategoriaCodigo] = useState(categoriaInicial ?? "");
  const [ciclista, setCiclista] = useState<DatosCiclista>(CICLISTA_VACIO);
  const [tallas, setTallas] = useState<TipoTallas>({ jersey: "", running: "" });
  const [consentimientos, setConsentimientos] = useState({
    politicaPago: false,
    datos: false,
    exoneracion: false,
  });
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [referencia, setReferencia] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const categoria = useMemo(
    () => categoriaPorCodigo(categoriaCodigo),
    [categoriaCodigo],
  );
  const aviso = useMemo(
    () => avisoDeCategoria(categoriaCodigo, ciclista.fechaNacimiento),
    [categoriaCodigo, ciclista.fechaNacimiento],
  );

  function actualizar<C extends keyof DatosCiclista>(campo: C, valor: string) {
    setCiclista((prev) => {
      const siguiente = { ...prev, [campo]: valor };
      if (campo === "ciudad" && MUNICIPIOS[valor]) {
        siguiente.departamento = MUNICIPIOS[valor];
      }
      return siguiente;
    });
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const resto = { ...prev };
      delete resto[campo];
      return resto;
    });
  }

  function irA(destino: number) {
    setPaso(destino);
    setErrorGeneral(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validarPaso(): boolean {
    if (paso === 0) {
      if (!categoriaCodigo) {
        setErrorGeneral("Escoge una categoría para seguir.");
        return false;
      }
      return true;
    }
    if (paso === 1) {
      const r = esquemaCiclista.safeParse(ciclista);
      if (!r.success) {
        const nuevos: Errores = {};
        for (const asunto of r.error.issues) {
          const clave = String(asunto.path[0]);
          if (!nuevos[clave]) nuevos[clave] = asunto.message;
        }
        setErrores(nuevos);
        setErrorGeneral("Faltan datos por completar. Están marcados abajo.");
        return false;
      }
      setErrores({});
      return true;
    }
    if (paso === 2) {
      const r = esquemaTallas.safeParse(tallas);
      if (!r.success) {
        setErrorGeneral("Elige las dos tallas para continuar.");
        return false;
      }
      return true;
    }
    if (paso === 3) {
      const faltan = Object.values(consentimientos).some((v) => !v);
      if (faltan) {
        setErrorGeneral("Necesitamos las tres autorizaciones para inscribirte.");
        return false;
      }
      return true;
    }
    return true;
  }

  async function siguiente() {
    if (!validarPaso()) return;
    setErrorGeneral(null);

    // Al salir de permisos creamos la inscripción y pasamos a pago.
    if (paso === 3 && !referencia) {
      setEnviando(true);
      try {
        const res = await fetch("/api/inscripciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoriaCodigo,
            ciclista,
            tallas,
            consentimientos,
          }),
        });
        const datos = await res.json();
        if (!res.ok) {
          setErrorGeneral(datos.error ?? "No pudimos guardar la inscripción.");
          return;
        }
        setReferencia(datos.referencia);
      } catch {
        setErrorGeneral("Se cayó la conexión. Inténtalo otra vez.");
        return;
      } finally {
        setEnviando(false);
      }
    }
    irA(Math.min(paso + 1, HITOS.length - 1));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <PerfilDeEtapa
        hitos={HITOS}
        actual={paso}
        onIr={referencia ? undefined : irA}
      />

      <div className="mt-8">
        {paso === 0 && (
          <PasoCategoria
            seleccionada={categoriaCodigo}
            onElegir={(c) => {
              setCategoriaCodigo(c);
              setErrorGeneral(null);
            }}
          />
        )}

        {paso === 1 && (
          <PasoDatos
            ciclista={ciclista}
            errores={errores}
            aviso={aviso}
            onCambio={actualizar}
          />
        )}

        {paso === 2 && (
          <PasoTallas
            tallas={tallas}
            sexo={ciclista.sexo}
            onCambio={(k, v) => setTallas((prev) => ({ ...prev, [k]: v }))}
          />
        )}

        {paso === 3 && (
          <PasoPermisos
            valores={consentimientos}
            onCambio={(k, v) =>
              setConsentimientos((prev) => ({ ...prev, [k]: v }))
            }
          />
        )}

        {paso === 4 && referencia && categoria && (
          <PasoPago
            referencia={referencia}
            categoria={categoria}
            ciclista={ciclista}
            tallas={tallas}
            cuentas={cuentas}
            fechaLimite={fechaLimite}
            onCompletado={() => router.push(`/mi-inscripcion?ref=${referencia}`)}
          />
        )}
      </div>

      {errorGeneral && (
        <p
          role="alert"
          className="mt-5 rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 font-display text-sm font-bold text-nube"
        >
          {errorGeneral}
        </p>
      )}

      {paso < 4 && (
        <div className="mt-8 flex items-center justify-between gap-4">
          <Boton
            tono="rio"
            onClick={() => irA(Math.max(0, paso - 1))}
            disabled={paso === 0}
          >
            ← Atrás
          </Boton>

          <div className="flex items-center gap-4">
            {categoria && (
              <span className="raya-mono hidden text-[0.75rem] text-tinta/75 sm:block">
                {categoria.nombre} · {pesos(categoria.precio)}
              </span>
            )}
            <Boton onClick={siguiente} disabled={enviando} tamano="lg">
              {enviando
                ? "Guardando…"
                : paso === 3
                  ? "Ir al pago →"
                  : "Siguiente →"}
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================ Paso 0 ================================= */

function PasoCategoria({
  seleccionada,
  onElegir,
}: {
  seleccionada: string;
  onElegir: (codigo: string) => void;
}) {
  return (
    <section>
      <h1 className="font-display text-[clamp(1.8rem,5vw,2.7rem)] font-extrabold leading-none tracking-[-0.035em] text-tinta">
        ¿Dónde compites?
      </h1>
      <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-tinta/75">
        Todas cuestan {pesos(PRECIO_INSCRIPCION)}. La organización revisa que tu
        edad al 31 de diciembre de {ANIO_CARRERA} coincida con la categoría antes
        de confirmar el cupo.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {GRUPOS.map((grupo) => (
          <fieldset key={grupo.id} className="border-0 p-0">
            <legend className="mb-3 font-display text-xl font-extrabold tracking-tight text-tinta">
              {grupo.titulo}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {categoriasDeGrupo(grupo.id).map((cat) => {
                const activa = seleccionada === cat.codigo;
                return (
                  <label
                    key={cat.codigo}
                    className={`pulsable flex cursor-pointer gap-3 rounded-2xl border-[3px] border-tinta p-4 shadow-[4px_4px_0_0_var(--color-tinta)] transition-colors ${
                      activa ? "bg-turquesa" : "bg-nube"
                    }`}
                  >
                    <input
                      type="radio"
                      name="categoria"
                      value={cat.codigo}
                      checked={activa}
                      onChange={() => onElegir(cat.codigo)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-[3px] border-tinta ${activa ? "bg-tinta" : "bg-nube"}`}
                    >
                      {activa && <span className="h-1.5 w-1.5 rounded-full bg-turquesa" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-base font-extrabold leading-tight text-tinta">
                        {cat.nombre}
                      </span>
                      <span className="mt-1 block text-[0.82rem] leading-snug text-tinta/75">
                        {cat.requisito}
                      </span>
                      {recorridoDe(cat) && (
                        <span className="raya-mono mt-2 block text-[0.68rem] font-bold uppercase text-tinta/75">
                          {recorridoDe(cat)}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

/* ================================ Paso 1 ================================= */

function PasoDatos({
  ciclista,
  errores,
  aviso,
  onCambio,
}: {
  ciclista: DatosCiclista;
  errores: Errores;
  aviso: string | null;
  onCambio: (campo: keyof DatosCiclista, valor: string) => void;
}) {
  // Al volver de otro paso el valor escrito a mano es la única pista de que
  // el ciclista había elegido "Otro".
  const [otroEmbajador, setOtroEmbajador] = useState(
    () => !!ciclista.referidoPor && !EMBAJADORES.includes(ciclista.referidoPor),
  );

  const entrada = (
    campo: keyof DatosCiclista,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <input
      id={campo}
      name={campo}
      className="campo"
      value={ciclista[campo]}
      onChange={(e) => onCambio(campo, e.target.value)}
      aria-invalid={errores[campo] ? "true" : undefined}
      {...props}
    />
  );

  return (
    <Tarjeta tono="nube" className="p-6 sm:p-8">
      <h1 className="font-display text-[clamp(1.6rem,4.4vw,2.3rem)] font-extrabold leading-none tracking-[-0.03em] text-tinta">
        Cuéntanos quién eres
      </h1>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-tinta/75">
        Estos datos van al dorsal, al seguro y al brazalete médico. Los campos con{" "}
        <span className="text-alerta">*</span> son obligatorios.
      </p>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <Campo id="identificacion" etiqueta="Documento" obligatorio error={errores.identificacion}>
          {entrada("identificacion", { inputMode: "numeric", autoComplete: "off", placeholder: "1020304050" })}
        </Campo>
        <Campo id="fechaNacimiento" etiqueta="Fecha de nacimiento" obligatorio error={errores.fechaNacimiento}>
          {entrada("fechaNacimiento", { type: "date", max: "2010-12-31" })}
        </Campo>
        <Campo id="nombres" etiqueta="Nombres" obligatorio error={errores.nombres}>
          {entrada("nombres", { autoComplete: "given-name" })}
        </Campo>
        <Campo id="apellidos" etiqueta="Apellidos" obligatorio error={errores.apellidos}>
          {entrada("apellidos", { autoComplete: "family-name" })}
        </Campo>

        <Campo id="sexo" etiqueta="Sexo" obligatorio>
          <select
            id="sexo"
            className="campo"
            value={ciclista.sexo}
            onChange={(e) => onCambio("sexo", e.target.value)}
          >
            <option>Masculino</option>
            <option>Femenino</option>
          </select>
        </Campo>
        <Campo id="rh" etiqueta="Grupo sanguíneo" obligatorio ayuda="Va impreso en tu dorsal.">
          <select
            id="rh"
            className="campo"
            value={ciclista.rh}
            onChange={(e) => onCambio("rh", e.target.value)}
          >
            {TIPOS_RH.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Campo>

        <Campo id="correo" etiqueta="Correo electrónico" obligatorio error={errores.correo} ayuda="Aquí llegan los comprobantes y el estado de tus cuotas.">
          {entrada("correo", { type: "email", autoComplete: "email", placeholder: "tu@correo.com" })}
        </Campo>
        <Campo id="telefono" etiqueta="Celular" obligatorio error={errores.telefono}>
          {entrada("telefono", { inputMode: "tel", autoComplete: "tel", placeholder: "3001234567" })}
        </Campo>

        <Campo id="ciudad" etiqueta="Ciudad o municipio" obligatorio error={errores.ciudad} ayuda="Escribe y te completamos el departamento.">
          <>
            {entrada("ciudad", { list: "municipios", autoComplete: "address-level2" })}
            <datalist id="municipios">
              {Object.keys(MUNICIPIOS).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </>
        </Campo>
        <Campo id="departamento" etiqueta="Departamento" obligatorio error={errores.departamento}>
          {entrada("departamento", { autoComplete: "address-level1" })}
        </Campo>

        <div className="sm:col-span-2">
          <Campo id="direccion" etiqueta="Dirección" obligatorio error={errores.direccion} ayuda={`Para enviarte el kit si no lo recoges en ${EVENTO.lugar}.`}>
            {entrada("direccion", { autoComplete: "street-address" })}
          </Campo>
        </div>

        <Campo id="contactoEmergencia" etiqueta="Contacto de emergencia" obligatorio error={errores.contactoEmergencia}>
          {entrada("contactoEmergencia", { placeholder: "Nombre y parentesco" })}
        </Campo>
        <Campo id="telefonoEmergencia" etiqueta="Celular de emergencia" obligatorio error={errores.telefonoEmergencia}>
          {entrada("telefonoEmergencia", { inputMode: "tel" })}
        </Campo>

        <Campo id="eps" etiqueta="EPS" ayuda="Opcional, pero acelera la atención médica en ruta.">
          {entrada("eps")}
        </Campo>

        <Campo
          id="referidoPor"
          etiqueta="Embajador o comunidad"
          ayuda="Quién te trajo a la carrera. Opcional."
        >
          <>
            <select
              id="referidoPor"
              className="campo"
              value={otroEmbajador ? OTRO_EMBAJADOR : ciclista.referidoPor}
              onChange={(e) => {
                const elegido = e.target.value;
                setOtroEmbajador(elegido === OTRO_EMBAJADOR);
                onCambio("referidoPor", elegido === OTRO_EMBAJADOR ? "" : elegido);
              }}
            >
              <option value="">Prefiero no decir</option>
              {EMBAJADORES.map((r) => (
                <option key={r}>{r}</option>
              ))}
              <option>{OTRO_EMBAJADOR}</option>
            </select>
            {otroEmbajador && (
              <input
                className="campo mt-2"
                aria-label="Nombre de la comunidad"
                placeholder="Escribe el nombre de la comunidad"
                value={ciclista.referidoPor}
                onChange={(e) => onCambio("referidoPor", e.target.value)}
              />
            )}
          </>
        </Campo>
      </div>

      {aviso && (
        <p className="mt-6 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.88rem] font-semibold leading-snug text-tinta">
          {aviso}
        </p>
      )}
    </Tarjeta>
  );
}

/* ================================ Paso 2 ================================= */

function PasoTallas({
  tallas,
  sexo,
  onCambio,
}: {
  tallas: TipoTallas;
  sexo: string;
  onCambio: (campo: keyof TipoTallas, valor: string) => void;
}) {
  return (
    <Tarjeta tono="nube" className="p-6 sm:p-8">
      <h1 className="font-display text-[clamp(1.6rem,4.4vw,2.3rem)] font-extrabold leading-none tracking-[-0.03em] text-tinta">
        Tu kit
      </h1>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-tinta/75">
        Las {PRENDAS.length} prendas del kit, corte{" "}
        {sexo === "Femenino" ? "femenino" : "masculino"}. Mídete sobre la piel, sin
        apretar. Si estás entre dos tallas, sube una: el jersey es ajustado.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <caption className="sr-only">
            Medidas en centímetros por talla
          </caption>
          <thead>
            <tr className="border-b-[3px] border-tinta">
              {["Talla", "Pecho", "Cintura", "Cadera"].map((t) => (
                <th
                  key={t}
                  scope="col"
                  className="py-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-tinta/75"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEDIDAS.map((m) => {
              const activa = tallas.jersey === m.talla;
              return (
                <tr
                  key={m.talla}
                  className={`border-b-2 border-dashed border-tinta/20 transition-colors ${activa ? "bg-turquesa" : ""}`}
                >
                  <th
                    scope="row"
                    className="py-2.5 font-display text-[0.95rem] font-extrabold text-tinta"
                  >
                    <span className="raya-mono mr-1.5 text-[0.7rem] text-tinta/75">
                      {m.numero}
                    </span>
                    {m.talla}
                  </th>
                  {[m.pecho, m.cintura, m.cadera].map((v, i) => (
                    <td key={i} className="raya-mono py-2.5 text-[0.85rem] text-tinta/75">
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {PRENDAS.map(({ campo, nombre }) => (
          <fieldset key={campo} className="border-0 p-0">
            <legend className="mb-2 font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta">
              {nombre} <span className="text-alerta">*</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {TALLAS.map((t) => {
                const activa = tallas[campo] === t;
                return (
                  <label
                    key={t}
                    className={`pulsable cursor-pointer rounded-xl border-[3px] border-tinta px-4 py-2.5 font-display text-sm font-extrabold shadow-[3px_3px_0_0_var(--color-tinta)] ${
                      activa ? "bg-turquesa text-tinta" : "bg-nube text-tinta/75"
                    }`}
                  >
                    <input
                      type="radio"
                      name={campo}
                      value={t}
                      checked={activa}
                      onChange={() => onCambio(campo, t)}
                      className="sr-only"
                    />
                    {t}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Tarjeta>
  );
}

/* ================================ Paso 3 ================================= */

function PasoPermisos({
  valores,
  onCambio,
}: {
  valores: { politicaPago: boolean; datos: boolean; exoneracion: boolean };
  onCambio: (
    campo: "politicaPago" | "datos" | "exoneracion",
    valor: boolean,
  ) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[clamp(1.6rem,4.4vw,2.3rem)] font-extrabold leading-none tracking-[-0.03em] text-tinta">
          Las letras pequeñas
        </h1>
        <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-tinta/75">
          Tres textos que la ley y el reglamento nos exigen. Están completos, sin
          recortes: léelos y acepta cada uno.
        </p>
      </div>

      <TextosLegales valores={valores} onCambio={onCambio} />
    </section>
  );
}
