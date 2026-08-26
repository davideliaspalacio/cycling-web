import { Suspense } from "react";
import { EntrarAlPanel } from "@/components/entrar-al-panel";
import { NOMBRE_COMPLETO } from "@/lib/catalogo";

export const metadata = { title: `Entrar — ${NOMBRE_COMPLETO}` };

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
