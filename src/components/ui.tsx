import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tono = "lima" | "magenta" | "naranja" | "cielo" | "hueso" | "selva";

const FONDOS: Record<Tono, string> = {
  lima: "bg-lima text-tinta",
  magenta: "bg-magenta text-tinta",
  naranja: "bg-naranja text-tinta",
  cielo: "bg-cielo text-tinta",
  hueso: "bg-hueso text-tinta",
  selva: "bg-selva text-hueso",
};

/* --------------------------------- Tarjeta --------------------------------- */

export function Tarjeta({
  tono = "hueso",
  className = "",
  children,
  ...resto
}: { tono?: Tono; children: ReactNode } & ComponentProps<"div">) {
  return (
    <div
      className={`rounded-3xl tinta ${FONDOS[tono]} ${className}`}
      {...resto}
    >
      {children}
    </div>
  );
}

/* ---------------------------------- Botón ---------------------------------- */

type BotonProps = {
  tono?: Tono;
  tamano?: "md" | "lg";
  children: ReactNode;
};

function clasesBoton(tono: Tono = "lima", tamano: "md" | "lg" = "md") {
  const medida =
    tamano === "lg" ? "px-8 py-4 text-lg" : "px-5 py-3 text-[0.95rem]";
  return `inline-flex items-center justify-center gap-2 rounded-2xl tinta-sm pulsable font-display font-extrabold tracking-tight disabled:opacity-45 disabled:pointer-events-none ${FONDOS[tono]} ${medida}`;
}

export function Boton({
  tono,
  tamano,
  className = "",
  children,
  ...resto
}: BotonProps & ComponentProps<"button">) {
  return (
    <button className={`${clasesBoton(tono, tamano)} ${className}`} {...resto}>
      {children}
    </button>
  );
}

export function BotonEnlace({
  tono,
  tamano,
  className = "",
  children,
  ...resto
}: BotonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={`${clasesBoton(tono, tamano)} ${className}`} {...resto}>
      {children}
    </Link>
  );
}

/* --------------------------------- Etiqueta -------------------------------- */

export function Chip({
  tono = "lima",
  children,
  className = "",
}: {
  tono?: Tono;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[2.5px] border-tinta px-3 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] ${FONDOS[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------- Campo ---------------------------------- */

export function Campo({
  etiqueta,
  ayuda,
  error,
  obligatorio,
  children,
  id,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  obligatorio?: boolean;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-tinta"
      >
        {etiqueta}
        {obligatorio && <span className="text-magenta"> *</span>}
      </label>
      {children}
      {error ? (
        <p
          role="alert"
          className="font-mono text-[0.72rem] font-bold text-[#c2185b]"
        >
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-[0.78rem] leading-snug text-[#5d6f63]">{ayuda}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------- Encabezado ------------------------------- */

export function TituloSeccion({
  eyebrow,
  titulo,
  bajada,
  className = "",
}: {
  eyebrow?: string;
  titulo: ReactNode;
  bajada?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-col gap-3 ${className}`}>
      {eyebrow && (
        <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.22em] text-lima">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-[clamp(1.9rem,4.6vw,3.1rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-hueso">
        {titulo}
      </h2>
      {bajada && (
        <p className="max-w-2xl text-[1.02rem] leading-relaxed text-hueso/70">
          {bajada}
        </p>
      )}
    </header>
  );
}
