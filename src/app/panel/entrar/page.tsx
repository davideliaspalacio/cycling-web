import { Suspense } from "react";
import { EntrarAlPanel } from "@/components/entrar-al-panel";

export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },
 title: "Entrar" };

export default function Entrar() {
  return (
    <main className="terreno mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      {/* useSearchParams() obliga a un límite de Suspense para prerenderizar. */}
      <Suspense fallback={null}>
        <EntrarAlPanel />
      </Suspense>
    </main>
  );
}
