import type { Metadata, Viewport } from "next";
import {
  CATEGORIAS,
  EVENTO,
  MAX_CUOTAS,
  NOMBRE_COMPLETO,
  PRECIO_INSCRIPCION,
} from "@/lib/catalogo";
import { pesos } from "@/lib/dinero";
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-mono-race",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

/**
 * La URL pública tiene que ser absoluta para que las tarjetas de WhatsApp,
 * Instagram y X resuelvan la imagen. Sin `metadataBase`, Next genera rutas
 * relativas y la vista previa sale sin foto.
 */
const SITIO = new URL(
  process.env.URL_PUBLICA ?? "https://www.santanderxtreme.com",
);

/**
 * Lo que se lee al compartir el enlace por WhatsApp. Es de los textos más
 * vistos del proyecto, así que ni el precio ni el número de cuotas se escriben
 * a mano: salen de la etapa abierta (`PRECIO_INSCRIPCION` y `MAX_CUOTAS` siguen
 * a `ETAPA_ACTIVA`). Cuando la organización abre una etapa, esta frase cambia
 * sola en vez de quedarse prometiendo "dos o tres cuotas" sobre un plan que ya
 * admite cuatro.
 */
const DESCRIPCION =
  `Maratón de montaña de ${EVENTO.etapas} etapas en ${EVENTO.lugar}, ` +
  `${EVENTO.fechaLegible}. ${CATEGORIAS.length} categorías, ` +
  `${pesos(PRECIO_INSCRIPCION)}. Inscríbete en cinco pasos y paga de una o ` +
  `hasta en ${MAX_CUOTAS} cuotas sin recargo.`;

export const metadata: Metadata = {
  metadataBase: SITIO,
  title: {
    default: `${NOMBRE_COMPLETO} — Inscripciones`,
    // Las páginas internas solo ponen su nombre y heredan la marca.
    template: `%s — ${NOMBRE_COMPLETO}`,
  },
  description: DESCRIPCION,
  applicationName: NOMBRE_COMPLETO,
  keywords: [
    NOMBRE_COMPLETO,
    "Santander Xtreme",
    `${EVENTO.lugar}`,
    "MTB",
    "XCM",
    "maratón de montaña",
    "ciclismo de montaña Colombia",
    "carrera MTB Santander",
    `inscripciones ${EVENTO.anio}`,
  ],
  authors: [{ name: NOMBRE_COMPLETO }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: "/",
    siteName: NOMBRE_COMPLETO,
    title: `${NOMBRE_COMPLETO} · ${EVENTO.lema}`,
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${NOMBRE_COMPLETO} · ${EVENTO.lema}`,
    description: DESCRIPCION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#dfeefc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CO"
      className={`${bricolage.variable} ${instrument.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="terreno flex min-h-full flex-col">{children}</body>
    </html>
  );
}
