import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import {
  ETAPA_ACTIVA,
  EVENTO,
  NOMBRE_COMPLETO,
  PRECIO_INSCRIPCION,
} from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";

/**
 * La tarjeta que se ve al compartir el enlace en WhatsApp, Instagram o X.
 *
 * Se genera en vez de ser un JPG fijo para que el precio y las fechas salgan
 * del catálogo: si cambian, la tarjeta cambia sola y no se queda anunciando
 * un precio viejo en cada grupo de WhatsApp donde se compartió.
 */

export const alt = `${NOMBRE_COMPLETO} — ${EVENTO.fechaLegible} en ${EVENTO.lugar}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Los recursos se incrustan en base64: la generación no puede pedirse a sí misma por HTTP. */
function recurso(relativo: string, tipo: string) {
  const bytes = readFileSync(path.join(process.cwd(), "public", relativo));
  return `data:${tipo};base64,${bytes.toString("base64")}`;
}

export default async function Imagen() {
  // El PNG oficial, con su transparencia: aplanarlo sobre blanco dejaba un
  // recuadro visible contra el azul del fondo.
  const logo = recurso("marca/logo.png", "image/png");
  const foto = recurso("og/foto.jpg", "image/jpeg");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#dfeefc",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 52px",
            width: 680,
          }}
        >
          {/*
            Alto reducido de 270 a 232: la tarjeta mide 630 px exactos y el
            distintivo del descuento añadió una línea abajo. Sin recortar el
            logotipo, "MTB · XCM · 2 etapas" se salía del borde inferior y se
            veía cortado en la vista previa de WhatsApp. `objectFit: contain`
            mantiene la proporción, así que el logotipo no se deforma.
          */}
          <img src={logo} alt="" width={250} height={232} style={{ objectFit: "contain" }} />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 21,
                letterSpacing: 2,
                color: "#0b4f8f",
                fontWeight: 700,
              }}
            >
              {EVENTO.edicionOrdinal.toUpperCase()} EDICIÓN · {EVENTO.lema}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 62,
                lineHeight: 1.02,
                fontWeight: 800,
                color: "#08213a",
                marginTop: 12,
              }}
            >
              Nadie hereda un legado.
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "#08213a", marginTop: 18 }}>
              {EVENTO.fechaLegible} · {EVENTO.lugar}
            </div>
          </div>

          {/*
            El precio y, si la etapa abierta lo tiene, su descuento por código.
            Los dos salen del catálogo, igual que las fechas: la tarjeta que
            circula por WhatsApp no puede quedarse anunciando las condiciones
            de una etapa cerrada.

            Va todo dentro de UNA columna porque el contenedor de la izquierda
            reparte con `space-between`: con un cuarto hijo, las piezas se
            separarían en vez de quedar agrupadas abajo.

            El tipo de carrera baja a su propia línea: con el segundo
            distintivo al lado del precio, la fila se saldría de los 576 px
            útiles de esta columna (680 menos los 52 de margen a cada lado).
          */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  background: "#0b4f8f",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "12px 26px",
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                {pesos(PRECIO_INSCRIPCION)}
              </div>
              {ETAPA_ACTIVA.descuento > 0 && (
                <div
                  style={{
                    display: "flex",
                    background: "#ffd24a",
                    color: "#08213a",
                    borderRadius: 999,
                    padding: "12px 24px",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  −{ETAPA_ACTIVA.descuento}% CON CÓDIGO
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: "#08213a",
                marginTop: 12,
              }}
            >
              {EVENTO.tipo}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", width: 520, height: 630 }}>
          <img src={foto} alt="" width={520} height={630} style={{ objectFit: "cover" }} />
        </div>
      </div>
    ),
    size,
  );
}
