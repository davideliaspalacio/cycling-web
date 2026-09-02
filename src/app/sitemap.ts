import type { MetadataRoute } from "next";

const SITIO = process.env.URL_PUBLICA ?? "https://www.santanderxtreme.com";

/** Solo las dos páginas públicas: el resto son privadas o personales. */
export default function sitemap(): MetadataRoute.Sitemap {
  const hoy = new Date();
  return [
    { url: SITIO, lastModified: hoy, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITIO}/inscripcion`,
      lastModified: hoy,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
