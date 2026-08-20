import Link from "next/link";
import { EVENTO } from "@/lib/catalogo";
import { BotonEnlace } from "./ui";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group flex items-baseline gap-1.5 font-display text-xl font-extrabold tracking-[-0.045em] text-hueso ${className}`}
    >
      <span>TIBET</span>
      <span className="text-lima transition-transform duration-200 group-hover:translate-x-0.5">
        EPIC
      </span>
      <span className="raya-mono self-center text-[0.6rem] font-bold text-hueso/45">
        XCM
      </span>
    </Link>
  );
}

export function Encabezado({ compacto = false }: { compacto?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-tinta bg-noche/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2 sm:gap-5">
          {!compacto && (
            <>
              <Link
                href="/#categorias"
                className="hidden text-sm font-medium text-hueso/70 transition-colors hover:text-lima sm:block"
              >
                Categorías
              </Link>
              <Link
                href="/#pagos"
                className="hidden text-sm font-medium text-hueso/70 transition-colors hover:text-lima sm:block"
              >
                Cómo se paga
              </Link>
            </>
          )}
          <Link
            href="/mi-inscripcion"
            className="whitespace-nowrap text-[0.8rem] font-medium text-hueso/70 transition-colors hover:text-lima sm:text-sm"
          >
            Mi inscripción
          </Link>
          <BotonEnlace
            href="/inscripcion"
            className="!px-3.5 !py-2 !text-[0.8rem] sm:!px-4 sm:!text-sm"
          >
            Inscribirme
          </BotonEnlace>
        </nav>
      </div>
    </header>
  );
}

export function Pie() {
  return (
    <footer className="mt-24 border-t-[3px] border-tinta bg-noche">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-hueso/55">
            Maratón de montaña en el páramo de {EVENTO.lugar}. 92 km, 2.850 m de
            desnivel, techo a {EVENTO.altitudMax.toLocaleString("es-CO")} msnm.
          </p>
        </div>
        <nav className="flex flex-col gap-2 text-sm">
          <p className="mb-1 font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-lima">
            Carrera
          </p>
          <Link href="/#categorias" className="text-hueso/60 hover:text-lima">
            Categorías
          </Link>
          <Link href="/#pagos" className="text-hueso/60 hover:text-lima">
            Cómo se paga
          </Link>
          <Link href="/inscripcion" className="text-hueso/60 hover:text-lima">
            Inscribirme
          </Link>
        </nav>
        <nav className="flex flex-col gap-2 text-sm">
          <p className="mb-1 font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-lima">
            Ciclistas
          </p>
          <Link href="/mi-inscripcion" className="text-hueso/60 hover:text-lima">
            Estado de mi pago
          </Link>
          <Link href="/correos" className="text-hueso/60 hover:text-lima">
            Correos enviados
          </Link>
          <a
            href={`mailto:${EVENTO.correoContacto}`}
            className="text-hueso/60 hover:text-lima"
          >
            {EVENTO.correoContacto}
          </a>
        </nav>
      </div>
      <div className="border-t border-hueso/10 py-5 text-center">
        <p className="raya-mono text-[0.68rem] text-hueso/35">
          PAGOS PROCESADOS POR WOMPI · BANCOLOMBIA — {EVENTO.nombre}{" "}
          {EVENTO.edicion}
        </p>
      </div>
    </footer>
  );
}
