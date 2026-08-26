"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Boton, Campo } from "@/components/ui";
import type { CuentaRecaudo } from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";
import { Procesando } from "./procesando";

/**
 * La caja de adjuntar el comprobante.
 *
 * Es el único punto del flujo donde el ciclista puede perder su pago: si el
 * archivo no llega, transfirió y nadie lo sabe. Por eso aquí todo está de su
 * lado — arrastrar o buscar, vista previa para confirmar que subió el archivo
 * correcto, progreso real, y errores que dicen qué hacer en vez de un código.
 */

/** Lo que responde `POST /api/evidencias` cuando el abono queda registrado. */
export type AbonoRegistrado = {
  abonoId: string;
  numero: number;
  montoDeclarado: number;
  saldo: number;
  referencia: string;
};

/**
 * Tope duro del lado del navegador.
 *
 * La ruta acepta 8 MB, pero una función de Vercel corta la petición en 4,5 MB
 * antes de que el código la vea. Un archivo entre esos dos números funciona en
 * `next dev` y falla en producción, que es la peor forma de fallar.
 */
const MAX_SUBIDA = 4 * 1024 * 1024;

/** A dónde apunta la compresión. Deja aire de sobra bajo el corte de Vercel. */
const OBJETIVO = 3 * 1024 * 1024;

/** Debajo de esto una foto ya viaja bien; recomprimir solo la empeora. */
const YA_ES_LIVIANA = 900 * 1024;

/** Lado máximo tras redimensionar. Un comprobante se lee de sobra a 2200 px. */
const LADO_MAX = 2200;

const ACEPTA = "image/*,application/pdf";

/**
 * Peso legible. Por debajo de un mega se dice en KB: "0 MB" en la tarjeta del
 * archivo se lee como "no se subió nada".
 */
function mb(bytes: number): string {
  const enMegas = bytes / 1024 / 1024;
  if (enMegas < 1) {
    return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("es-CO")} KB`;
  }
  return `${enMegas.toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

/* ------------------------------- Compresión -------------------------------- */

/**
 * Reencoda la foto en el navegador antes de subirla.
 *
 * Una foto de un iPhone reciente son 6-9 MB; el mismo comprobante a 2200 px y
 * calidad 0,82 son menos de un mega y se lee igual de bien. Sin este paso, el
 * caso más común del mundo real —una foto de la pantalla del banco— rebota
 * contra el límite de Vercel.
 *
 * Nunca rompe la subida: si el navegador no sabe decodificar el formato (HEIC
 * en Chrome, por ejemplo) devuelve el archivo original y que decida el tope.
 */
async function comprimirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;
  if (archivo.size <= YA_ES_LIVIANA) return archivo;
  if (typeof createImageBitmap !== "function") return archivo;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return archivo;
  }

  try {
    let escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    let calidad = 0.82;
    let mejor: Blob | null = null;

    for (let intento = 0; intento < 4; intento += 1) {
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
      lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
      const pincel = lienzo.getContext("2d");
      if (!pincel) return archivo;

      // Fondo blanco: un PNG con transparencia se vuelve negro al pasar a
      // JPEG, y un comprobante en negro sobre negro no se lee.
      pincel.fillStyle = "#ffffff";
      pincel.fillRect(0, 0, lienzo.width, lienzo.height);
      pincel.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);

      const blob = await new Promise<Blob | null>((resolver) =>
        lienzo.toBlob(resolver, "image/jpeg", calidad),
      );
      if (!blob) return archivo;
      mejor = blob;
      if (blob.size <= OBJETIVO) break;

      calidad = Math.max(0.5, calidad - 0.15);
      escala *= 0.8;
    }

    // Si el "comprimido" pesa más que el original (pasa con capturas PNG
    // pequeñas y planas), el original gana.
    if (!mejor || mejor.size >= archivo.size) return archivo;
    return new File([mejor], "comprobante.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

/* --------------------------------- Subida ---------------------------------- */

type Respuesta = { estado: number; cuerpo: Record<string, unknown> | null };

/**
 * Sube con XMLHttpRequest y no con `fetch` a propósito: `fetch` no informa el
 * progreso de la subida, y sin barra real el ciclista con mala señal no sabe
 * si su comprobante está avanzando o si la aplicación se colgó.
 */
function subirConProgreso(
  datos: FormData,
  alProgreso: (fraccion: number) => void,
  registrar: (xhr: XMLHttpRequest) => void,
): Promise<Respuesta> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    registrar(xhr);
    xhr.open("POST", "/api/evidencias");
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) alProgreso(evento.loaded / evento.total);
    };
    xhr.onload = () => {
      let cuerpo: Record<string, unknown> | null = null;
      try {
        cuerpo = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        cuerpo = null;
      }
      resolver({ estado: xhr.status, cuerpo });
    };
    xhr.onerror = () => resolver({ estado: 0, cuerpo: null });
    xhr.onabort = () => resolver({ estado: -1, cuerpo: null });
    xhr.send(datos);
  });
}

/** Traduce la respuesta del servidor a algo que se pueda leer sin ser técnico. */
function mensajeDeError(respuesta: Respuesta): string {
  if (respuesta.estado === 0) {
    return "Se cortó la conexión antes de terminar de subir. Revisa tu señal e inténtalo otra vez.";
  }
  const delServidor = respuesta.cuerpo?.error;
  if (typeof delServidor === "string" && delServidor.length > 0) {
    return delServidor;
  }
  if (respuesta.estado === 413) {
    return `El comprobante pesa demasiado. El máximo son ${mb(MAX_SUBIDA)}.`;
  }
  return "No pudimos guardar tu comprobante. Inténtalo otra vez en un momento.";
}

/* ------------------------------- El componente ----------------------------- */

export function CajaEvidencia({
  referencia,
  cuentas,
  montoSugerido,
  canalInicial,
  onRegistrado,
}: {
  referencia: string;
  /** Llegan del servidor: definen los destinos válidos del selector. */
  cuentas: CuentaRecaudo[];
  /** Lo que falta por pagar; se ofrece como valor de arranque. */
  montoSugerido?: number;
  canalInicial?: string;
  onRegistrado: (abono: AbonoRegistrado) => void;
}) {
  const idBase = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const enVuelo = useRef<XMLHttpRequest | null>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const [canal, setCanal] = useState(canalInicial ?? cuentas[0]?.canal ?? "");
  // `montoTocado` existe para que cambiar de plan (total ↔ abonos) mueva el
  // monto sugerido, pero deje de hacerlo en cuanto el ciclista escriba el
  // suyo. Sin esto, elegir "abonos" seguía proponiendo el total completo,
  // porque un useState solo lee su valor inicial una vez.
  const [monto, setMonto] = useState("");
  const [montoTocado, setMontoTocado] = useState(false);
  const [fecha, setFecha] = useState("");
  const [refExterna, setRefExterna] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);

  const montoEfectivo =
    montoTocado || montoSugerido === undefined ? monto : String(montoSugerido);

  // Un object URL es memoria retenida hasta que se revoca a mano.
  useEffect(
    () => () => {
      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
    },
    [vistaPrevia],
  );

  // Si el ciclista sale de la página a mitad de la subida, la petición se
  // corta en vez de quedar colgada.
  useEffect(() => () => enVuelo.current?.abort(), []);

  const tomarArchivo = useCallback((elegido: File | undefined) => {
    setError(null);
    if (!elegido) return;

    const esImagen = elegido.type.startsWith("image/");
    const esPdf = elegido.type === "application/pdf";
    if (!esImagen && !esPdf) {
      setError(
        "Ese archivo no es una imagen ni un PDF. Sube la foto, la captura de pantalla o el PDF del comprobante.",
      );
      return;
    }
    // El PDF no se puede comprimir aquí; si no cabe, no cabe.
    if (esPdf && elegido.size > MAX_SUBIDA) {
      setError(
        `Ese PDF pesa ${mb(elegido.size)} y el máximo son ${mb(MAX_SUBIDA)}. Sube mejor una captura de pantalla del comprobante.`,
      );
      return;
    }

    setArchivo(elegido);
    setErrores((prev) => {
      const resto = { ...prev };
      delete resto.archivo;
      return resto;
    });
    setVistaPrevia((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return esImagen ? URL.createObjectURL(elegido) : null;
    });
  }, []);

  function quitarArchivo() {
    setArchivo(null);
    setVistaPrevia((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return null;
    });
    if (entrada.current) entrada.current.value = "";
  }

  function validar(): boolean {
    const nuevos: Record<string, string> = {};
    if (!archivo) nuevos.archivo = "Adjunta el comprobante de la transferencia.";
    if (!canal) nuevos.canal = "Elige por dónde transferiste.";
    const enPesos = Number(montoEfectivo.replace(/\D/g, ""));
    if (!enPesos) nuevos.monto = "Escribe cuánto transferiste.";
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) {
      setError("Faltan datos. Están marcados abajo.");
      return false;
    }
    setError(null);
    return true;
  }

  async function enviar() {
    if (progreso !== null) return;
    if (!validar() || !archivo) return;

    setProgreso(0);
    try {
      const listo = await comprimirImagen(archivo);
      if (listo.size > MAX_SUBIDA) {
        setError(
          `Esa imagen pesa ${mb(listo.size)} y no logramos bajarla de ${mb(MAX_SUBIDA)}. Prueba con una captura de pantalla del comprobante en vez de la foto.`,
        );
        return;
      }

      const datos = new FormData();
      datos.set("referencia", referencia);
      datos.set("canal", canal);
      datos.set("montoDeclarado", montoEfectivo.replace(/\D/g, ""));
      if (fecha) datos.set("transferidoEl", fecha);
      if (refExterna.trim()) datos.set("referenciaExterna", refExterna.trim());
      datos.set("evidencia", listo, "comprobante");

      const respuesta = await subirConProgreso(
        datos,
        setProgreso,
        (xhr) => (enVuelo.current = xhr),
      );
      // El propio ciclista canceló al salir de la página: sin mensaje.
      if (respuesta.estado === -1) return;

      if (respuesta.estado < 200 || respuesta.estado >= 300) {
        setError(mensajeDeError(respuesta));
        return;
      }

      const cuerpo = respuesta.cuerpo ?? {};
      onRegistrado({
        abonoId: String(cuerpo.abonoId ?? ""),
        numero: Number(cuerpo.numero ?? 0),
        montoDeclarado: Number(cuerpo.montoDeclarado ?? 0),
        saldo: Number(cuerpo.saldo ?? 0),
        referencia: String(cuerpo.referencia ?? referencia),
      });
    } catch {
      setError(
        "No pudimos preparar el archivo. Inténtalo con otra foto del comprobante.",
      );
    } finally {
      enVuelo.current = null;
      setProgreso(null);
    }
  }

  const enPesos = Number(montoEfectivo.replace(/\D/g, ""));
  const sobra =
    montoSugerido !== undefined && enPesos > montoSugerido && montoSugerido > 0;
  const porcentaje = Math.round((progreso ?? 0) * 100);

  return (
    <div className="flex flex-col gap-5">
      <Procesando
        visible={progreso !== null}
        titulo="Subiendo tu comprobante"
        detalle={
          porcentaje >= 100
            ? "Ya llegó. Lo estamos guardando."
            : `Va en ${porcentaje}%. No cierres esta ventana.`
        }
      >
        <div
          className="h-4 w-full overflow-hidden rounded-full border-[3px] border-tinta bg-nube"
          role="progressbar"
          aria-valuenow={porcentaje}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de la subida"
        >
          <div
            className="h-full bg-turquesa transition-[width] duration-200 ease-out"
            style={{ width: `${Math.max(3, porcentaje)}%` }}
          />
        </div>
      </Procesando>

      {/* ------------------------- Zona de arrastre ------------------------- */}
      <div>
        <p
          id={`${idBase}-titulo`}
          className="mb-2 font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta"
        >
          Comprobante <span className="text-alerta">*</span>
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            tomarArchivo(e.dataTransfer.files?.[0]);
          }}
          className={`rounded-2xl border-[3px] border-dashed p-5 transition-colors ${
            encima
              ? "border-tinta bg-turquesa"
              : errores.archivo
                ? "border-alerta bg-nube"
                : "border-tinta/35 bg-nube"
          }`}
        >
          <input
            ref={entrada}
            id={`${idBase}-archivo`}
            type="file"
            accept={ACEPTA}
            className="sr-only"
            onChange={(e) => tomarArchivo(e.target.files?.[0])}
          />

          {archivo ? (
            <div className="flex items-center gap-4">
              {vistaPrevia ? (
                // eslint-disable-next-line @next/next/no-img-element -- es un blob local del navegador, no hay nada que optimizar en el servidor
                <img
                  src={vistaPrevia}
                  alt="Vista previa del comprobante que vas a subir"
                  className="h-20 w-20 shrink-0 rounded-xl border-[3px] border-tinta object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border-[3px] border-tinta bg-fucsia"
                >
                  <IconoPdf />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[0.95rem] font-extrabold text-tinta">
                  {archivo.name || "comprobante"}
                </p>
                <p className="raya-mono text-[0.72rem] text-tinta/75">
                  {archivo.type === "application/pdf" ? "PDF" : "Imagen"} ·{" "}
                  {mb(archivo.size)}
                </p>
                {archivo.type.startsWith("image/") &&
                  archivo.size > YA_ES_LIVIANA && (
                    <p className="mt-1 text-[0.74rem] leading-snug text-tinta/75">
                      La vamos a comprimir antes de subirla, para que llegue
                      aunque tengas mala señal.
                    </p>
                  )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => entrada.current?.click()}
                    className="font-display text-[0.78rem] font-extrabold text-tinta underline underline-offset-4"
                  >
                    Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={quitarArchivo}
                    className="font-display text-[0.78rem] font-extrabold text-alerta underline underline-offset-4"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <IconoSubir />
              <p className="text-[0.9rem] leading-snug text-tinta/75">
                <span className="hidden sm:inline">
                  Arrastra aquí la foto o el PDF del comprobante, o{" "}
                </span>
                <span className="sm:hidden">Toma la foto del comprobante o </span>
                elígelo de tu dispositivo.
              </p>
              <Boton
                type="button"
                tono="nube"
                onClick={() => entrada.current?.click()}
              >
                Elegir archivo
              </Boton>
              <p className="raya-mono text-[0.68rem] uppercase tracking-[0.12em] text-tinta/75">
                JPG · PNG · WEBP · HEIC · PDF
              </p>
            </div>
          )}
        </div>

        {errores.archivo && (
          <p role="alert" className="mt-1.5 font-mono text-[0.72rem] font-bold text-alerta">
            {errores.archivo}
          </p>
        )}
      </div>

      {/* ---------------------------- Los campos ---------------------------- */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          id={`${idBase}-canal`}
          etiqueta="¿Por dónde transferiste?"
          obligatorio
          error={errores.canal}
        >
          <select
            id={`${idBase}-canal`}
            className="campo"
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
          >
            {cuentas.map((c) => (
              <option key={c.canal} value={c.canal}>
                {c.entidad}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          id={`${idBase}-monto`}
          etiqueta="¿Cuánto transferiste?"
          obligatorio
          error={errores.monto}
          ayuda={
            sobra
              ? undefined
              : montoSugerido
                ? `Te falta ${pesos(montoSugerido)}. Puedes abonar menos.`
                : "En pesos, sin centavos."
          }
        >
          <div className="relative">
            <span
              aria-hidden
              className="raya-mono pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[1rem] font-bold text-tinta/75"
            >
              $
            </span>
            <input
              id={`${idBase}-monto`}
              // `.campo` está fuera de capa en globals.css y le gana a
              // cualquier utilidad de padding de Tailwind; inline sí manda.
              style={{ paddingLeft: "2.1rem" }}
              className="campo raya-mono"
              inputMode="numeric"
              autoComplete="off"
              placeholder="150.000"
              value={enPesos ? enPesos.toLocaleString("es-CO") : ""}
              onChange={(e) => {
                setMontoTocado(true);
                setMonto(e.target.value.replace(/\D/g, ""));
                setErrores((prev) => {
                  const resto = { ...prev };
                  delete resto.monto;
                  return resto;
                });
              }}
            />
          </div>
        </Campo>

        <Campo
          id={`${idBase}-fecha`}
          etiqueta="Fecha de la transferencia"
          ayuda="Opcional. Ayuda a encontrarla en el extracto."
        >
          <input
            id={`${idBase}-fecha`}
            type="date"
            className="campo"
            max={new Date().toISOString().slice(0, 10)}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Campo>

        <Campo
          id={`${idBase}-ref`}
          etiqueta="Número de comprobante"
          ayuda="Opcional. El número de aprobación que da el banco."
        >
          <input
            id={`${idBase}-ref`}
            className="campo raya-mono"
            autoComplete="off"
            maxLength={60}
            placeholder="M1234567"
            value={refExterna}
            onChange={(e) => setRefExterna(e.target.value)}
          />
        </Campo>
      </div>

      {sobra && (
        <p className="rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.86rem] font-semibold leading-snug text-tinta">
          Estás declarando más de lo que te falta ({pesos(montoSugerido!)}). Si
          transferiste de más, súbelo igual y lo revisamos contigo.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 font-display text-sm font-bold leading-snug text-nube"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Boton
          type="button"
          tamano="lg"
          onClick={enviar}
          disabled={progreso !== null}
        >
          {progreso !== null ? "Subiendo…" : "Enviar el comprobante"}
        </Boton>
        <p className="text-[0.8rem] leading-snug text-tinta/75">
          Lo revisa una persona de la organización. Te avisamos apenas quede
          verificado.
        </p>
      </div>
    </div>
  );
}

function IconoSubir() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-9 w-9 fill-tinta/60">
      <path d="M12 3 6.5 8.5 8 10l3-3v9h2V7l3 3 1.5-1.5L12 3Z" />
      <path d="M4 18v-3H2v3a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-3h-2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function IconoPdf() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-9 w-9 fill-tinta">
      <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 2v5h5l-5-5Z" />
    </svg>
  );
}
