"use client";

/**
 * Perfil de etapa — la barra de progreso del formulario.
 *
 * Un ciclista de XCM lee la altimetría antes que cualquier otra cosa: sabe
 * dónde está por el kilómetro y por la pendiente, no por un "paso 3 de 5".
 * Así que el avance del formulario ES un perfil de altimetría, con el punto
 * de carrera subiendo hacia la meta. Es la pieza que da identidad a todo el
 * flujo y por eso es la única que se permite ser llamativa.
 */

const PERFIL: [number, number][] = [
  [0, 100],
  [50, 92],
  [110, 74],
  [170, 86],
  [250, 62],
  [310, 72],
  [380, 44],
  [440, 60],
  [500, 40],
  [560, 56],
  [630, 30],
  [700, 48],
  [750, 26],
  [820, 42],
  [890, 18],
  [950, 28],
  [1000, 6],
];

const linea = PERFIL.map(([x, y]) => `${x},${y}`).join(" ");
const area = `0,120 ${linea} 1000,120`;

export type Hito = { titulo: string; km: number };

const MARCAS = [
  { x: 0, y: 100 },
  { x: 250, y: 62 },
  { x: 500, y: 40 },
  { x: 750, y: 26 },
  { x: 1000, y: 6 },
];

export function PerfilDeEtapa({
  hitos,
  actual,
  onIr,
}: {
  hitos: Hito[];
  /** Índice del paso actual, base 0. */
  actual: number;
  onIr?: (indice: number) => void;
}) {
  const total = hitos.length - 1;
  const marca = MARCAS[Math.min(actual, MARCAS.length - 1)];
  const avance = total > 0 ? (actual / total) * 100 : 0;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-end justify-between gap-4">
        <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.2em] text-rio">
          Perfil de inscripción
        </p>
        <p className="raya-mono text-[0.72rem] font-bold text-tinta/75">
          KM {String(hitos[actual]?.km ?? 0).padStart(2, "0")} / {hitos[total]?.km}
        </p>
      </div>

      <div className="relative rounded-2xl border-[3px] border-tinta bg-rio px-3 pb-2 pt-3 shadow-[6px_6px_0_0_var(--color-tinta)]">
        <svg
          viewBox="0 0 1000 120"
          preserveAspectRatio="none"
          className="block h-20 w-full sm:h-24"
          role="img"
          aria-label={`Paso ${actual + 1} de ${hitos.length}: ${hitos[actual]?.titulo}`}
        >
          <defs>
            <clipPath id="avance-perfil">
              <rect
                x="0"
                y="0"
                height="120"
                width={avance * 10}
                style={{ transition: "width 620ms cubic-bezier(.2,.9,.25,1)" }}
              />
            </clipPath>
            <linearGradient id="relleno-perfil" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-turquesa)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--color-turquesa)" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* Terreno por recorrer */}
          <polygon points={area} fill="rgb(255 255 255 / 0.10)" />
          <polyline
            points={linea}
            fill="none"
            stroke="rgb(255 255 255 / 0.42)"
            strokeWidth="3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="7 6"
          />

          {/* Terreno ya cubierto */}
          <g clipPath="url(#avance-perfil)">
            <polygon points={area} fill="url(#relleno-perfil)" />
            <polyline
              points={linea}
              fill="none"
              stroke="var(--color-turquesa)"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          {/* Marcas de kilómetro */}
          {MARCAS.map((m, i) => (
            <line
              key={i}
              x1={m.x === 0 ? 2 : m.x === 1000 ? 998 : m.x}
              x2={m.x === 0 ? 2 : m.x === 1000 ? 998 : m.x}
              y1={m.y}
              y2="120"
              stroke={i <= actual ? "var(--color-turquesa)" : "rgb(255 255 255 / 0.32)"}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="3 4"
            />
          ))}
        </svg>

        {/* Corredor: fuera del SVG para que no se deforme con preserveAspectRatio */}
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-tinta bg-turquesa text-tinta shadow-[3px_3px_0_0_var(--color-tinta)] animate-pulse-ring"
          style={{
            left: `calc(0.75rem + ${(marca.x / 1000) * 100}% - ${(marca.x / 1000) * 1.5}rem)`,
            top: `calc(0.75rem + ${(marca.y / 120) * 100}% * 0.78)`,
            transition: "left 620ms cubic-bezier(.2,.9,.25,1), top 620ms cubic-bezier(.2,.9,.25,1)",
          }}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M5 20a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm14 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8ZM5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm14 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM14.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM9 9l2.5-2.2L14 9l2 2v4h-1.5v-3.2L12 9.6 9.8 12 12 14v2.2h-1.5V13L8 10.4V8h1Z" />
          </svg>
        </span>
      </div>

      {/* Hitos */}
      <ol className="mt-3 grid grid-cols-5 gap-1">
        {hitos.map((h, i) => {
          const cubierto = i <= actual;
          const navegable = onIr && i < actual;
          const Etiqueta = navegable ? "button" : "div";
          return (
            <li key={h.titulo} className="min-w-0">
              <Etiqueta
                {...(navegable
                  ? { type: "button" as const, onClick: () => onIr(i) }
                  : {})}
                className={`w-full text-left ${navegable ? "cursor-pointer hover:opacity-80" : ""}`}
                aria-current={i === actual ? "step" : undefined}
              >
                <span
                  className={`raya-mono block text-[0.62rem] font-bold ${cubierto ? "text-rio" : "text-tinta/75"}`}
                >
                  KM {String(h.km).padStart(2, "0")}
                </span>
                <span
                  className={`block truncate font-display text-[0.72rem] font-bold leading-tight sm:text-[0.84rem] ${
                    i === actual
                      ? "text-tinta"
                      : cubierto
                        ? "text-tinta/85"
                        : "text-tinta/75"
                  }`}
                >
                  {h.titulo}
                </span>
              </Etiqueta>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
