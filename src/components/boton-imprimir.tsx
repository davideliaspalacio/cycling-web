"use client";

import { Boton } from "./ui";

export function BotonImprimir() {
  return (
    <Boton tono="lima" onClick={() => window.print()}>
      Imprimir o guardar en PDF
    </Boton>
  );
}
