"use client";

import { useEffect, useState } from "react";
import { Campo } from "@/components/ui";
import { LARGO_MAX_CODIGO, normalizarCodigo } from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";

/**
 * El campo del código de referido.
 *
 * Lo que tiene que lograr: que el ciclista **vea el precio con el descuento
 * aplicado antes de pagar**. Por eso valida contra el servidor mientras
 * escribe, en vez de guardar la sorpresa para el final.
 *
 * ── Lo que esta pantalla NO decide ─────────────────────────────────────────
 * El descuento. Lo que se ve aquí es un anticipo informativo; el que cuenta lo
 * calcula el servidor otra vez al crear la inscripción
 * (`revisarCodigo` en `src/lib/servicio.ts`). Si alguien falsea la respuesta
 * de `/api/codigos/validar` solo se engaña a sí mismo.
 *
 * ── Un código malo no es un error del formulario ───────────────────────────
 * Se avisa en amarillo y se deja seguir. Bloquear el paso por una errata en un
 * campo opcional dejaría al ciclista atascado a dos pantallas del final por
 * algo que no le cuesta el cupo: se inscribe igual, al precio de lista.
 */

export type EstadoCodigo = {
  /** El código normalizado, listo para mandar al servidor. */
  codigo: string;
  aplica: boolean;
  /** Pesos. Solo para pintar: el que manda lo calcula el servidor. */
  descuento: number;
  total: number;
};

type Respuesta = {
  codigo: string;
  aplica: boolean;
  porcentaje: number;
  descuento: number;
  precioBase: number;
  total: number;
  aviso: string | null;
};

export function CampoCodigoReferido({
  precio,
  porcentaje,
  onCambio,
}: {
  /** Precio de lista de la etapa activa. */
  precio: number;
  /** El descuento que da un código en esta etapa. Si es 0, no se pinta nada. */
  porcentaje: number;
  onCambio: (estado: EstadoCodigo) => void;
}) {
  const [texto, setTexto] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);

  const codigo = normalizarCodigo(texto);

  /*
   * Escribir invalida el descuento en el acto, aquí y no en un efecto.
   *
   * Así el padre nunca se queda un render con el descuento del código
   * anterior mientras se comprueba el nuevo: entre "PICHURRIAS10" y
   * "PICHURRIAS1" no hay descuento que valga, y el pie de página no puede
   * seguir anunciando el precio rebajado.
   */
  function escribir(valor: string) {
    setTexto(valor);
    setRespuesta(null);
    const limpio = normalizarCodigo(valor);
    setRevisando(limpio.length > 0);
    onCambio({ codigo: limpio, aplica: false, descuento: 0, total: precio });
  }

  useEffect(() => {
    if (!codigo) return;

    /*
     * Medio segundo de espera y cancelación del anterior. Sin esto cada tecla
     * sería una consulta a la base, y "PICHURRIAS10" son doce. `cancelado`
     * evita que una respuesta lenta de un código a medio escribir pise la del
     * código completo.
     */
    let cancelado = false;
    const temporizador = setTimeout(async () => {
      try {
        const r = await fetch("/api/codigos/validar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo }),
        });
        const datos = (await r.json()) as Respuesta;
        if (cancelado || !r.ok) return;
        setRespuesta(datos);
        onCambio({
          codigo,
          aplica: datos.aplica,
          descuento: datos.descuento,
          total: datos.total,
        });
      } catch {
        // Sin red no se puede comprobar, y tampoco pasa nada: el código viaja
        // igual con el formulario y el servidor lo revisa al crear la
        // inscripción. Lo único que se pierde es el anticipo del precio.
        if (!cancelado) setRespuesta(null);
      } finally {
        if (!cancelado) setRevisando(false);
      }
    }, 500);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
    // `onCambio` se recrea en cada render del padre; meterlo aquí relanzaría
    // la consulta sin que el código haya cambiado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, precio]);

  if (porcentaje <= 0) return null;

  return (
    <div className="sm:col-span-2">
      <Campo
        id="codigoReferido"
        etiqueta="Código de referido"
        ayuda={`Si un embajador te dio un código, escríbelo y te descontamos el ${porcentaje}%. Opcional.`}
      >
        <>
          <input
            id="codigoReferido"
            name="codigoReferido"
            className="campo raya-mono uppercase"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={LARGO_MAX_CODIGO}
            placeholder="PICHURRIAS10"
            value={texto}
            onChange={(e) => escribir(e.target.value)}
          />

          {codigo && revisando && (
            <p className="mt-2 font-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] text-tinta/75">
              Comprobando el código…
            </p>
          )}

          {codigo && !revisando && respuesta?.aplica && (
            <div
              className="mt-2 rounded-2xl border-[3px] border-tinta bg-turquesa px-4 py-3"
              role="status"
            >
              <p className="font-display text-[0.95rem] font-extrabold leading-snug text-tinta">
                Código válido: −{pesos(respuesta.descuento)} ({respuesta.porcentaje}%)
              </p>
              <p className="mt-1 text-[0.85rem] leading-snug text-tinta/85">
                Tu inscripción queda en{" "}
                <strong className="raya-mono">{pesos(respuesta.total)}</strong>{" "}
                en vez de {pesos(respuesta.precioBase)}. Es el total sobre el
                que se calculan tus cuotas.
              </p>
            </div>
          )}

          {codigo && !revisando && respuesta && !respuesta.aplica && (
            <p
              role="status"
              className="mt-2 rounded-2xl border-[3px] border-tinta bg-sol px-4 py-3 text-[0.86rem] font-semibold leading-snug text-tinta"
            >
              {respuesta.aviso ??
                "Ese código no se puede aplicar. Puedes seguir sin descuento."}
            </p>
          )}
        </>
      </Campo>
    </div>
  );
}
