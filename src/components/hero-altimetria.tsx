"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El héroe de la página es la altimetría de la carrera dibujándose sola.
 * Para quien corre XCM ese perfil es la primera pregunta ("¿cuánto sube?"),
 * así que la respuesta abre la página en lugar de una foto genérica.
 */

const CRESTA =
  "M0,300 L60,282 L120,244 L190,268 L250,196 L310,224 L370,150 L430,186 L500,132 L560,168 L620,104 L680,144 L740,86 L800,120 L860,58 L920,88 L1000,20";

// Sin altitudes: la organización todavía no publicó la altimetría real.
const CIMAS = [
  { x: 250, y: 196, nombre: "Camino real" },
  { x: 500, y: 132, nombre: "Guane" },
  { x: 740, y: 86, nombre: "Mirador del cañón" },
  { x: 1000, y: 20, nombre: "Meta · Barichara" },
];

export function HeroAltimetria() {
  const ref = useRef<SVGPathElement>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setListo(true), 180);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 1000 340"
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label="Perfil de altimetría del recorrido: subidas y bajadas por los caminos reales del cañón, con meta en Barichara."
      >
        <defs>
          <linearGradient id="hero-relleno" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-turquesa)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--color-turquesa)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Rejilla de altitud */}
        {[80, 150, 220, 290].map((y) => (
          <line
            key={y}
            x1="0"
            x2="1000"
            y1={y}
            y2={y}
            stroke="rgb(8 33 58 / 0.16)"
            strokeWidth="1"
            strokeDasharray="4 8"
          />
        ))}

        <path
          d={`${CRESTA} L1000,340 L0,340 Z`}
          fill="url(#hero-relleno)"
          style={{
            opacity: listo ? 1 : 0,
            transition: "opacity 1.4s ease 1.1s",
          }}
        />

        <path
          ref={ref}
          d={CRESTA}
          fill="none"
          stroke="var(--color-rio)"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: listo ? 0 : 1,
            transition: "stroke-dashoffset 2.1s cubic-bezier(.35,.05,.2,1)",
          }}
        />

        {CIMAS.map((c, i) => (
          <g
            key={c.nombre}
            style={{
              opacity: listo ? 1 : 0,
              transform: listo ? "translateY(0)" : "translateY(10px)",
              transition: `opacity .5s ease ${0.9 + i * 0.32}s, transform .5s cubic-bezier(.2,.9,.25,1) ${0.9 + i * 0.32}s`,
            }}
          >
            <circle
              cx={c.x}
              cy={c.y}
              r="7"
              fill={i === CIMAS.length - 1 ? "var(--color-fucsia)" : "var(--color-nube)"}
              stroke="var(--color-rio)"
              strokeWidth="3.5"
            />
            <text
              x={Math.min(c.x, 930)}
              y={c.y - 16}
              textAnchor={i === CIMAS.length - 1 ? "end" : "middle"}
              className="fill-tinta font-mono text-[13px] font-bold"
              style={{ fontFamily: "var(--font-mono-race)" }}
            >
              {c.nombre}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-1 flex justify-between border-t-[3px] border-dashed border-tinta/25 pt-2">
        {["ETAPA 1", "META 1 · SALIDA 2", "ETAPA 2"].map((k) => (
          <span key={k} className="raya-mono text-[0.65rem] text-tinta/75">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Cuenta({ hasta }: { hasta: string }) {
  const [restante, setRestante] = useState<string | null>(null);

  useEffect(() => {
    const objetivo = new Date(`${hasta}T07:00:00-05:00`).getTime();
    const tic = () => {
      const dif = objetivo - Date.now();
      if (dif <= 0) return setRestante("¡HOY!");
      const dias = Math.floor(dif / 86_400_000);
      const horas = Math.floor((dif % 86_400_000) / 3_600_000);
      const min = Math.floor((dif % 3_600_000) / 60_000);
      setRestante(
        `${dias}d ${String(horas).padStart(2, "0")}h ${String(min).padStart(2, "0")}m`,
      );
    };
    tic();
    const id = setInterval(tic, 30_000);
    return () => clearInterval(id);
  }, [hasta]);

  return (
    <span className="raya-mono tabular-nums text-rio">{restante ?? "—"}</span>
  );
}
