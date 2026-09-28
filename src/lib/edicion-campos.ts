import { PRENDAS, categoriaPorCodigo } from "./catalogo";
import type { DatosCiclista, Inscripcion, Tallas } from "./tipos";

/**
 * Qué cambiaría de verdad en una corrección de datos, y cómo se dice.
 *
 * Vive aparte de `edicion.ts` —y sin `server-only`— porque lo necesitan los
 * dos lados: el formulario del panel lo usa para enseñar «esto es lo que vas a
 * cambiar» antes de tocar nada, y el servidor lo usa para decidir qué escribe y
 * qué anota. Una sola comparación para las dos cosas; si fueran dos, la
 * pantalla y la bitácora acabarían contando historias distintas.
 *
 * Aquí no hay nada de persistencia a propósito: son funciones puras sobre los
 * datos que ya se tienen en la mano.
 */

/** Cómo se llama cada campo cuando se lo lee una persona en la bitácora. */
export const ETIQUETAS_CICLISTA: Record<keyof DatosCiclista, string> = {
  identificacion: "el documento",
  nombres: "los nombres",
  apellidos: "los apellidos",
  sexo: "el sexo",
  eps: "la EPS",
  correo: "el correo",
  telefono: "el celular",
  contactoEmergencia: "el contacto de emergencia",
  telefonoEmergencia: "el teléfono de emergencia",
  direccion: "la dirección",
  fechaNacimiento: "la fecha de nacimiento",
  rh: "el RH",
  referidoPor: "quién lo refirió",
  ciudad: "la ciudad",
  departamento: "el departamento",
  pais: "el país",
};

/** El correo se compara sin mayúsculas; lo demás, sin espacios de sobra. */
function normalizar(campo: keyof DatosCiclista, valor: string): string {
  const limpio = (valor ?? "").trim();
  return campo === "correo" ? limpio.toLowerCase() : limpio;
}

export type Cambio = {
  /** Clave técnica: `ciclista.correo`, `tallas.jersey`, `categoriaCodigo`. */
  campo: string;
  /** Cómo se llama el campo en la interfaz y en la bitácora. */
  etiqueta: string;
  antes: string;
  ahora: string;
};

const vacio = (v: string) => (v === "" ? "(vacío)" : v);

/** «el documento de «1090434534» a «1090434543»», tal cual va a la bitácora. */
export const fraseDeCambio = (c: Cambio) =>
  `${c.etiqueta} de «${vacio(c.antes)}» a «${vacio(c.ahora)}»`;

export function cambiosDeEdicion(params: {
  inscripcion: Pick<Inscripcion, "ciclista" | "tallas" | "categoriaCodigo">;
  ciclista: DatosCiclista;
  tallas: Tallas;
  categoriaCodigo: string;
}): Cambio[] {
  const { inscripcion } = params;
  const cambios: Cambio[] = [];

  for (const campo of Object.keys(ETIQUETAS_CICLISTA) as (keyof DatosCiclista)[]) {
    const antes = normalizar(campo, inscripcion.ciclista[campo] ?? "");
    const ahora = normalizar(campo, params.ciclista[campo] ?? "");
    if (antes !== ahora) {
      cambios.push({
        campo: `ciclista.${campo}`,
        etiqueta: ETIQUETAS_CICLISTA[campo],
        antes,
        ahora,
      });
    }
  }

  for (const prenda of PRENDAS) {
    const antes = (inscripcion.tallas[prenda.campo] ?? "").trim();
    const ahora = (params.tallas[prenda.campo] ?? "").trim();
    if (antes !== ahora) {
      cambios.push({
        campo: `tallas.${prenda.campo}`,
        etiqueta: prenda.nombre.toLowerCase(),
        antes,
        ahora,
      });
    }
  }

  if (inscripcion.categoriaCodigo !== params.categoriaCodigo) {
    cambios.push({
      campo: "categoriaCodigo",
      etiqueta: "la categoría",
      antes:
        categoriaPorCodigo(inscripcion.categoriaCodigo)?.nombre ??
        inscripcion.categoriaCodigo,
      ahora:
        categoriaPorCodigo(params.categoriaCodigo)?.nombre ??
        params.categoriaCodigo,
    });
  }

  return cambios;
}

/**
 * Esto ya no es un dedazo: es otra persona.
 *
 * Cambiar documento, nombre y correo a la vez es exactamente lo que se hace
 * para pasarle el cupo a alguien más, y para eso está `/panel/competidor`, que
 * deja otra clase de constancia (guarda al titular anterior completo y le manda
 * la constancia por correo a quien recibe el cupo). No se bloquea —la
 * organización decide— pero se avisa en la interfaz y queda dicho en la
 * bitácora.
 */
export function pareceCesion(cambios: Cambio[]): boolean {
  const tocado = (campo: string) => cambios.some((c) => c.campo === campo);
  return (
    tocado("ciclista.identificacion") &&
    (tocado("ciclista.nombres") || tocado("ciclista.apellidos")) &&
    tocado("ciclista.correo")
  );
}
