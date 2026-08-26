import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tono = "turquesa" | "alerta" | "sol" | "marea" | "nube" | "rio";

const FONDOS: Record<Tono, string> = {
  turquesa: "bg-turquesa text-tinta",
  alerta: "bg-alerta text-nube",
  sol: "bg-sol text-tinta",
  marea: "bg-marea text-tinta",
  nube: "bg-nube text-tinta",
  rio: "bg-rio text-nube",
};

/* --------------------------------- Tarjeta --------------------------------- */

export function Tarjeta({
  tono = "nube",
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

function clasesBoton(tono: Tono = "turquesa", tamano: "md" | "lg" = "md") {
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
  tono = "turquesa",
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
        {obligatorio && <span className="text-alerta"> *</span>}
      </label>
      {children}
      {error ? (
        <p
          role="alert"
          className="font-mono text-[0.72rem] font-bold text-alerta"
        >
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-[0.78rem] leading-snug text-tinta/75">{ayuda}</p>
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
        <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.22em] text-rio">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-[clamp(1.9rem,4.6vw,3.1rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-tinta">
        {titulo}
      </h2>
      {bajada && (
        <p className="max-w-2xl text-[1.02rem] leading-relaxed text-tinta/75">
          {bajada}
        </p>
      )}
    </header>
  );
}
