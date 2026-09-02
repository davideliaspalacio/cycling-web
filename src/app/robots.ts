import type { MetadataRoute } from "next";
import { EVENTO } from "@/lib/catalogo";

const SITIO = process.env.URL_PUBLICA ?? "https://www.santanderxtreme.com";

/**
 * Solo se indexa la parte pública. El panel y el visor de correos muestran
 * datos personales de los inscritos, y un ticket lleva el nombre y el dorsal
 * de alguien: nada de eso debe salir en una búsqueda.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/correos", "/ticket", "/mi-inscripcion", "/api"],
    },
    sitemap: `${SITIO}/sitemap.xml`,
    host: EVENTO.nombre ? SITIO : undefined,
  };
}
