"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El héroe de la página es la altimetría de la carrera dibujándose sola.
 * Para quien corre XCM ese perfil es la primera pregunta ("¿cuánto sube?"),
 * así que la respuesta abre la página en lugar de una foto genérica.
 */

const CRESTA =
  "M0,300 L60,282 L120,244 L190,268 L250,196 L310,224 L370,150 L430,186 L500,132 L560,168 L620,104 L680,144 L740,86 L800,120 L860,58 L920,88 L1000,20";

const CIMAS = [
  { x: 250, y: 196, nombre: "Alto del Zarzo", altura: "2.640" },
  { x: 500, y: 132, nombre: "Filo de Tibetá", altura: "2.980" },
  { x: 740, y: 86, nombre: "Muro de la Bruja", altura: "3.190" },
  { x: 1000, y: 20, nombre: "Meta · Páramo", altura: "3.420" },
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
        aria-label="Perfil de altimetría del recorrido: 92 kilómetros con 2.850 metros de desnivel positivo, con meta a 3.420 metros sobre el nivel del mar."
      >
        <defs>
          <linearGradient id="hero-relleno" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-lima)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--color-lima)" stopOpacity="0" />
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
            stroke="rgb(243 251 239 / 0.09)"
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
          stroke="var(--color-lima)"
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
              fill={i === CIMAS.length - 1 ? "var(--color-magenta)" : "var(--color-noche)"}
              stroke="var(--color-lima)"
              strokeWidth="3.5"
            />
            <text
              x={Math.min(c.x, 930)}
              y={c.y - 26}
              textAnchor={i === CIMAS.length - 1 ? "end" : "middle"}
              className="fill-hueso font-mono text-[13px] font-bold"
              style={{ fontFamily: "var(--font-mono-race)" }}
            >
              {c.altura} m
            </text>
            <text
              x={Math.min(c.x, 930)}
              y={c.y - 12}
              textAnchor={i === CIMAS.length - 1 ? "end" : "middle"}
              className="fill-hueso/45 text-[11px]"
              style={{ fontFamily: "var(--font-instrument)" }}
            >
              {c.nombre}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-1 flex justify-between border-t-[3px] border-dashed border-hueso/15 pt-2">
        {["KM 00", "KM 23", "KM 46", "KM 69", "KM 92"].map((k) => (
          <span key={k} className="raya-mono text-[0.65rem] text-hueso/40">
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
    <span className="raya-mono tabular-nums text-lima">{restante ?? "—"}</span>
  );
}
