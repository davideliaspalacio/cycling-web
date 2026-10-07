import "server-only";
import { guardarInscripcion, inscripcionDuplicada } from "./almacen";
import { categoriaPorCodigo } from "./catalogo";
import { pesos } from "./dinero";
import {
  cambiosDeEdicion,
  fraseDeCambio,
  pareceCesion,
  type Cambio,
} from "./edicion-campos";
import type { DatosCiclista, Inscripcion, Tallas } from "./tipos";
import { avisoDeCategoria } from "./validacion";

/**
 * Corregir los datos de un inscrito. NO es una cesión.
 *
 * La cesión (`cambiarCompetidor`, en `servicio.ts`) cambia de titular: el cupo
 * pasa a otra persona, se le manda la constancia por correo y la bitácora
 * guarda al anterior completo. Esto es lo otro: una cédula con un dígito
 * volteado, una talla que se eligió mal, un correo con un dedazo. El titular es
 * el mismo; lo que estaba mal escrito es el dato.
 *
 * Tres reglas la definen:
 *
 * 1. **Solo se escribe lo que de verdad cambió.** El `ciclista` que se guarda
 *    se arma sobre el que ya estaba y solo se le pisan los campos distintos.
 *    Así una corrección de la talla no reescribe de paso la dirección con el
 *    mismo valor recortado por zod, y la bitácora no miente diciendo que se
 *    tocó. Sin ninguna diferencia real no se escribe nada.
 * 2. **La bitácora nombra al revisor y el valor anterior.** «Se editó la
 *    inscripción» no sirve de nada dentro de tres meses; «cambió el documento
 *    de 1090434534 a 1090434543» sí. El nombre sale de la sesión, nunca del
 *    cuerpo de la petición.
 * 3. **Nada de dinero.** La referencia, el estado, el plan, el total, lo pagado
 *    y los abonos no se tocan aquí: eso lo mueve el flujo de pago. Cambiar de
 *    categoría tampoco recalcula el precio — si hay que ajustarlo, es una
 *    decisión de plata, no una corrección de dato.
 *
 * `servicio.ts` no se toca: de ahí no hace falta nada, y `anota()` es privada,
 * así que la anotación se escribe aquí con la misma forma (la más reciente
 * primero).
 */

/**
 * Copiar un campo de un ciclista a otro conservando su tipo.
 *
 * Con la clave suelta (`keyof DatosCiclista`) TypeScript no puede saber que
 * `sexo` solo admite dos valores; con el genérico sí, y el compilador sigue
 * vigilando que no se cuele una cadena cualquiera donde va un literal.
 */
function copiarCampo<K extends keyof DatosCiclista>(
  destino: DatosCiclista,
  origen: DatosCiclista,
  campo: K,
): void {
  destino[campo] = origen[campo];
}

export type ErrorEdicion =
  | "DOCUMENTO_OCUPADO"
  | "SIN_CAMBIO"
  | "CATEGORIA_DESCONOCIDA";

export type ResultadoEdicion =
  | {
      ok: true;
      inscripcion: Inscripcion;
      cambios: Cambio[];
      /** Si la categoría que quedó no cuadra con la edad. No bloquea. */
      avisoCategoria: string | null;
      parecioCesion: boolean;
    }
  | { ok: false; error: ErrorEdicion; mensaje: string };

export async function corregirInscripcion(params: {
  inscripcion: Inscripcion;
  ciclista: DatosCiclista;
  tallas: Tallas;
  categoriaCodigo: string;
  /** Nombre del revisor, sacado de la sesión. Nunca del cuerpo de la petición. */
  hechoPor: string;
  motivo?: string;
  huella?: { ip?: string; navegador?: string };
}): Promise<ResultadoEdicion> {
  const ins = params.inscripcion;

  const categoria = categoriaPorCodigo(params.categoriaCodigo);
  if (!categoria) {
    return {
      ok: false,
      error: "CATEGORIA_DESCONOCIDA",
      mensaje: `La categoría ${params.categoriaCodigo} no existe.`,
    };
  }

  const cambios = cambiosDeEdicion({
    inscripcion: ins,
    ciclista: params.ciclista,
    tallas: params.tallas,
    categoriaCodigo: params.categoriaCodigo,
  });

  // Nada que hacer: no se escribe ni se anota. Una bitácora con entradas que no
  // cambiaron nada es una bitácora que nadie lee.
  if (cambios.length === 0) {
    return {
      ok: false,
      error: "SIN_CAMBIO",
      mensaje: "No cambiaste ningún dato: todo quedó igual a lo que ya estaba.",
    };
  }

  // Una persona, un cupo. Si el documento corregido ya corre en otra
  // inscripción, o el dedazo era al revés o hay dos registros de la misma
  // persona; en cualquier caso esto no se arregla escribiéndolo encima.
  const cambioDocumento = cambios.find(
    (c) => c.campo === "ciclista.identificacion",
  );
  if (cambioDocumento) {
    const ocupado = await inscripcionDuplicada(cambioDocumento.ahora);
    if (ocupado && ocupado.id !== ins.id) {
      return {
        ok: false,
        error: "DOCUMENTO_OCUPADO",
        mensaje:
          `El documento ${cambioDocumento.ahora} ya lo tiene la inscripción ` +
          `${ocupado.referencia} (${ocupado.ciclista.nombres} ${ocupado.ciclista.apellidos}). ` +
          `Revisa cuál de las dos está mal antes de corregir.`,
      };
    }
  }

  // Se pisan solo los campos distintos: los demás se quedan tal como estaban
  // guardados, sin pasar por la normalización de zod.
  const ciclista: DatosCiclista = { ...ins.ciclista };
  for (const cambio of cambios) {
    if (!cambio.campo.startsWith("ciclista.")) continue;
    const campo = cambio.campo.slice("ciclista.".length) as keyof DatosCiclista;
    // Se escribe el valor que llegó del formulario, ya validado por
    // `esquemaCiclista`; `cambio.ahora` es su versión normalizada para comparar.
    copiarCampo(ciclista, params.ciclista, campo);
  }
  ins.ciclista = ciclista;

  const tallas: Tallas = { ...ins.tallas };
  for (const cambio of cambios) {
    if (!cambio.campo.startsWith("tallas.")) continue;
    const campo = cambio.campo.slice("tallas.".length) as keyof Tallas;
    tallas[campo] = params.tallas[campo];
  }
  ins.tallas = tallas;

  const cambioCategoria = cambios.some((c) => c.campo === "categoriaCodigo");
  if (cambioCategoria) ins.categoriaCodigo = params.categoriaCodigo;

  // El aviso del reglamento con los datos YA corregidos: la categoría nueva
  // contra la fecha de nacimiento nueva. Avisa, no bloquea — la organización
  // sabrá por qué lo hace, y que lo supo también queda escrito.
  const avisoCategoria = avisoDeCategoria(
    ins.categoriaCodigo,
    ins.ciclista.fechaNacimiento,
  );

  const parecio = pareceCesion(cambios);

  const detalle =
    `${params.hechoPor} corrigió ${cambios.length === 1 ? "1 dato" : `${cambios.length} datos`}: ` +
    `${cambios.map(fraseDeCambio).join("; ")}.` +
    // Cambiar de categoría no recalcula el precio, y eso hay que poder
    // reconstruirlo: si el total no cuadra con la tarifa, es porque se decidió
    // así aquí.
    //
    // La tarifa que vale es la de SU etapa (`ins.precioBase`), no la del
    // catálogo: las categorías heredan el precio de la etapa abierta, así que
    // comparar contra `categoria.precio` le dejaba escrito a un inscrito de la
    // etapa 1 que su categoría costaba lo de la etapa 2. Y queda escrito para
    // siempre, en el registro que se lee cuando alguien reclama.
    (cambioCategoria && ins.precioBase !== ins.total
      ? ` El total sigue en ${pesos(ins.total)} (la tarifa de su etapa es ${pesos(ins.precioBase)}): corregir la categoría no recalcula el precio.`
      : "") +
    (avisoCategoria ? ` Aviso de categoría aceptado: ${avisoCategoria}` : "") +
    (parecio
      ? " Ojo: cambiaron documento, nombre y correo a la vez, que es una cesión de cupo hecha como corrección; se avisó y se siguió igual."
      : "") +
    (params.motivo ? ` Motivo: ${params.motivo}` : "") +
    (params.huella?.ip ? ` · desde ${params.huella.ip}` : "");

  // Misma forma que `anota()` en `servicio.ts`: lo más reciente primero.
  ins.eventos.unshift({
    en: new Date().toISOString(),
    tipo: "correccion-de-datos",
    detalle,
  });

  const actualizada = await guardarInscripcion(ins);

  return {
    ok: true,
    inscripcion: actualizada,
    cambios,
    avisoCategoria,
    parecioCesion: parecio,
  };
}
