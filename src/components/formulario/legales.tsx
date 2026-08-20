"use client";

import { EVENTO } from "@/lib/catalogo";

export const MEDIDAS = [
  { numero: 1, talla: "XS", pecho: "85–90", cintura: "73–78", cadera: "85–90" },
  { numero: 2, talla: "S", pecho: "90–95", cintura: "78–83", cadera: "90–95" },
  { numero: 3, talla: "M", pecho: "95–100", cintura: "83–88", cadera: "95–100" },
  { numero: 4, talla: "L", pecho: "100–105", cintura: "88–93", cadera: "100–105" },
  { numero: 5, talla: "XL", pecho: "105–110", cintura: "93–99", cadera: "105–110" },
  { numero: 6, talla: "XXL", pecho: "110–116", cintura: "99–105", cadera: "110–116" },
];

type Clave = "reembolso" | "datos" | "exoneracion";

const TEXTOS: {
  clave: Clave;
  titulo: string;
  resumen: string;
  cuerpo: string[];
}[] = [
  {
    clave: "reembolso",
    titulo: "Política de reembolso",
    resumen:
      "Hasta el 1 de abril de 2027 te devolvemos el 70 %. Después de esa fecha, no hay reembolso.",
    cuerpo: [
      "Entre el 1 de marzo y el 1 de abril de 2027 se reembolsa el 70 % del monto cancelado.",
      "Después del 2 de abril de 2027 no se realizan reembolsos.",
      "El valor que corresponda solo se reembolsa después de la carrera.",
      "No se paga reembolso si la organización cancela la inscripción por inelegibilidad según el reglamento — por ejemplo, ser declarado culpable de dopaje.",
      `Si tienes un plan de cuotas activo y cancelas, el reembolso se calcula sobre lo efectivamente abonado y se detienen los cobros pendientes. Escríbenos a ${EVENTO.correoContacto}.`,
    ],
  },
  {
    clave: "datos",
    titulo: "Autorización de tratamiento de datos",
    resumen:
      "Usamos tus datos para organizar la carrera y podemos publicar fotos y video del evento donde aparezcas.",
    cuerpo: [
      `En cumplimiento de la ley 1581 de 2012 y el Decreto 1377 de 2013, autorizo a los organizadores del evento ${EVENTO.nombre} ${EVENTO.edicion} y a sus patrocinadores a tratar mis datos personales con el propósito de crear una base de datos afín a los intereses de los organizadores.`,
      "Autorizo también a la organización y a sus patrocinadores para el uso ilimitado de fotografías, películas, videos, grabaciones y cualquier otro medio de registro del evento donde aparezca mi imagen, para cualquier uso legítimo y sin compensación económica.",
      "Puedo pedir en cualquier momento la consulta, corrección o supresión de mis datos escribiendo al correo de contacto de la organización.",
    ],
  },
  {
    clave: "exoneracion",
    titulo: "Exoneración de responsabilidad",
    resumen:
      "Declaras estar en condiciones de salud para competir y asumes los riesgos propios del ciclismo de montaña.",
    cuerpo: [
      `He decidido participar del evento ${EVENTO.nombre} ${EVENTO.edicion} y a la fecha me encuentro en condiciones de salud física y mental adecuadas; no padezco enfermedad, lesión, incapacidad o preexistencia que me inhabilite para participar en esta competencia.`,
      "Conozco, entiendo, asumo y acepto todos los riesgos relacionados con mi participación: caídas, accidentes, contacto con otros participantes o vehículos, condiciones del terreno y del clima del páramo, y efectos de la altitud.",
      "Exonero de toda responsabilidad a los organizadores, voluntarios, patrocinadores, sus representantes y sucesores, de todo reclamo o responsabilidad de cualquier tipo que surja de mi participación en este evento.",
      "Me comprometo a cumplir el reglamento de la competencia, a usar casco durante todo el recorrido y a acatar las indicaciones del personal de ruta y del cuerpo médico.",
    ],
  },
];

export function TextosLegales({
  valores,
  onCambio,
}: {
  valores: Record<Clave, boolean>;
  onCambio: (clave: Clave, valor: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {TEXTOS.map((t) => {
        const aceptado = valores[t.clave];
        return (
          <article
            key={t.clave}
            className={`rounded-3xl border-[3px] border-tinta shadow-[6px_6px_0_0_var(--color-tinta)] transition-colors ${
              aceptado ? "bg-lima" : "bg-hueso"
            }`}
          >
            <div className="p-5 sm:p-6">
              <h2 className="font-display text-lg font-extrabold leading-tight tracking-tight text-tinta">
                {t.titulo}
              </h2>
              <p className="mt-1.5 text-[0.9rem] leading-snug text-tinta/70">
                {t.resumen}
              </p>

              <details className="group mt-3">
                <summary className="cursor-pointer list-none font-mono text-[0.7rem] font-bold uppercase tracking-[0.14em] text-tinta/60 underline decoration-dotted underline-offset-4 hover:text-tinta">
                  Leer el texto completo
                  <span className="ml-1 inline-block transition-transform group-open:rotate-90">
                    ▸
                  </span>
                </summary>
                <div className="mt-3 max-h-56 overflow-y-auto rounded-2xl border-[2.5px] border-tinta/25 bg-white/70 p-4">
                  {t.cuerpo.map((p, i) => (
                    <p
                      key={i}
                      className="mb-3 text-[0.85rem] leading-relaxed text-tinta/80 last:mb-0"
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </details>

              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border-[3px] border-tinta bg-white px-4 py-3 shadow-[3px_3px_0_0_var(--color-tinta)]">
                <input
                  type="checkbox"
                  checked={aceptado}
                  onChange={(e) => onCambio(t.clave, e.target.checked)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-[3px] border-tinta ${
                    aceptado ? "bg-tinta" : "bg-white"
                  }`}
                >
                  {aceptado && (
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-lima">
                      <path d="M7.6 14.6 3.4 10.4l1.6-1.6 2.6 2.6 6.8-6.8 1.6 1.6z" />
                    </svg>
                  )}
                </span>
                <span className="font-display text-[0.9rem] font-bold text-tinta">
                  Acepto la {t.titulo.toLowerCase()}
                </span>
              </label>
            </div>
          </article>
        );
      })}
    </div>
  );
}
