import Image from "next/image";
import Link from "next/link";
import { CUENTAS_RECAUDO, EVENTO, NOMBRE_COMPLETO } from "@/lib/catalogo";
import { BotonEnlace } from "./ui";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      // A 375 px el logotipo completo más el menú se salían del ancho: la
      // barra desbordaba y `overflow-x: hidden` del body solo lo tapaba.
      className={`group flex items-baseline gap-1.5 font-display text-base font-extrabold tracking-[-0.045em] text-tinta sm:text-xl ${className}`}
    >
      <span>{EVENTO.wordmark.inicio}</span>
      <span className="text-rio transition-transform duration-200 group-hover:translate-x-0.5">
        {EVENTO.wordmark.acento}
      </span>
      <span className="raya-mono hidden self-center text-[0.6rem] font-bold text-tinta/75 min-[380px]:inline">
        {EVENTO.wordmark.sufijo}
      </span>
    </Link>
  );
}

/**
 * El logotipo oficial, el de los carteles. Solo donde hay altura para que se
 * lea: es un bloque apilado y por debajo de unos 70 px no dice nada.
 */
export function LogoOficial({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/marca/logo.png"
      alt={NOMBRE_COMPLETO}
      width={583}
      height={629}
      // Sin optimizador: son 36 KB y al pasarlo a PNG con paleta el navegador
      // no lo decodifica. Optimizar aquí no ahorra nada.
      unoptimized
      className={`w-auto ${className}`}
    />
  );
}

export function Encabezado({ compacto = false }: { compacto?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-tinta bg-bruma/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1.5 sm:gap-5">
          {!compacto && (
            <>
              <Link
                href="/#categorias"
                className="hidden text-sm font-medium text-tinta/75 transition-colors hover:text-rio sm:block"
              >
                Categorías
              </Link>
              <Link
                href="/#pagos"
                className="hidden text-sm font-medium text-tinta/75 transition-colors hover:text-rio sm:block"
              >
                Cómo se paga
              </Link>
            </>
          )}
          {/* En pantalla de teléfono el rótulo largo empujaba el botón fuera
              de la barra. Dice lo mismo con menos letras. */}
          <Link
            href="/mi-inscripcion"
            className="whitespace-nowrap text-[0.8rem] font-medium text-tinta/75 transition-colors hover:text-rio sm:text-sm"
          >
            <span className="sm:hidden">Mi pago</span>
            <span className="hidden sm:inline">Mi inscripción</span>
          </Link>
          <BotonEnlace
            href="/inscripcion"
            className="!px-3 !py-2 !text-[0.8rem] sm:!px-4 sm:!text-sm"
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
    <footer className="mt-24 border-t-[3px] border-tinta bg-bruma">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <LogoOficial className="h-20" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-tinta/75">
            Maratón de montaña en {EVENTO.lugar}. {EVENTO.etapas} etapas de XCM
            entre caminos reales, piedra y el calor del cañón del Chicamocha.
          </p>
        </div>
        <nav className="flex flex-col gap-2 text-sm">
          <p className="mb-1 font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-rio">
            Carrera
          </p>
          <Link href="/#categorias" className="text-tinta/75 hover:text-rio">
            Categorías
          </Link>
          <Link href="/#pagos" className="text-tinta/75 hover:text-rio">
            Cómo se paga
          </Link>
          <Link href="/inscripcion" className="text-tinta/75 hover:text-rio">
            Inscribirme
          </Link>
        </nav>
        <nav className="flex flex-col gap-2 text-sm">
          <p className="mb-1 font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-rio">
            Ciclistas
          </p>
          <Link href="/mi-inscripcion" className="text-tinta/75 hover:text-rio">
            Estado de mi pago
          </Link>
          <a
            href={`mailto:${EVENTO.correoContacto}`}
            className="text-tinta/75 hover:text-rio"
          >
            {EVENTO.correoContacto}
          </a>
        </nav>
      </div>
      <div className="border-t border-tinta/10 py-5 text-center">
        <p className="raya-mono text-[0.68rem] text-tinta/75">
          PAGO POR TRANSFERENCIA ·{" "}
          {CUENTAS_RECAUDO.map((c) => c.entidad.toUpperCase()).join(" · ")} —{" "}
          {NOMBRE_COMPLETO}
        </p>
      </div>
    </footer>
  );
}
