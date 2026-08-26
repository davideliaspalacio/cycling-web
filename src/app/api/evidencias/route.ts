import { NextResponse } from "next/server";
import {
  MAX_BYTES_EVIDENCIA,
  borrarEvidencia,
  guardarEvidencia,
  tipoPorContenido,
} from "@/lib/almacenamiento";
import { abonosConMismaEvidencia, inscripcionPorReferencia } from "@/lib/almacen";
import { huellaDe } from "@/lib/huella";
import { registrarAbono } from "@/lib/servicio";
import { esquemaAbono } from "@/lib/validacion";
import type { CanalPago } from "@/lib/tipos";

/**
 * Recepción de comprobantes de pago.
 *
 * Es el único punto por donde entra un archivo subido por un desconocido, así
 * que la desconfianza es total: se lee el tamaño real del cuerpo, se decide el
 * tipo por los bytes del contenido y el nombre del archivo lo pone el
 * servidor. Nada de lo que dice el cliente sobre su propio archivo se usa.
 *
 * Nota de plataforma: `serverActions.bodySizeLimit` de `next.config.ts` NO
 * aplica aquí — es solo para Server Actions. Un Route Handler recibe el cuerpo
 * completo, así que el tope de 8 MB se hace cumplir en este archivo. Lo que sí
 * existe es el límite del hosting (4.5 MB por petición en funciones de
 * Vercel), y por eso la interfaz debería comprimir las fotos antes de subir.
 */

// El cuerpo se lee entero en memoria; no hay nada que prerenderizar.
export const dynamic = "force-dynamic";

const rechazo = (mensaje: string, estado: number, extra?: object) =>
  NextResponse.json({ error: mensaje, ...extra }, { status: estado });

export async function POST(peticion: Request) {
  // Corte barato antes de leer nada: si el cliente ya declara más de la
  // cuenta, no vale la pena traerse los bytes.
  const declarado = Number(peticion.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_EVIDENCIA * 1.1) {
    return rechazo("El archivo pesa más de 8 MB.", 413);
  }

  let formulario: FormData;
  try {
    formulario = await peticion.formData();
  } catch {
    return rechazo("No pudimos leer el formulario.", 400);
  }

  const archivo = formulario.get("evidencia");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return rechazo("Falta el comprobante.", 422);
  }
  // El tamaño de verdad, no el que anunció la cabecera.
  if (archivo.size > MAX_BYTES_EVIDENCIA) {
    return rechazo("El archivo pesa más de 8 MB.", 413);
  }

  const parseo = esquemaAbono.safeParse({
    referencia: formulario.get("referencia") ?? "",
    canal: formulario.get("canal") ?? "",
    montoDeclarado: formulario.get("montoDeclarado") ?? "",
    transferidoEl: formulario.get("transferidoEl") || undefined,
    referenciaExterna: formulario.get("referenciaExterna") || undefined,
  });
  if (!parseo.success) {
    return rechazo("Faltan datos o alguno quedó mal.", 422, {
      detalles: parseo.error.flatten(),
    });
  }

  const inscripcion = await inscripcionPorReferencia(parseo.data.referencia);
  if (!inscripcion) {
    return rechazo("No encontramos esa inscripción.", 404);
  }

  const contenido = new Uint8Array(await archivo.arrayBuffer());

  // El tipo lo dicta la cabecera del archivo. `archivo.type` lo escribe el
  // navegador y se falsifica en una línea: un ejecutable renombrado a .jpg
  // llega anunciándose como imagen.
  const tipo = tipoPorContenido(contenido);
  if (!tipo) {
    return rechazo(
      "Ese archivo no es una imagen ni un PDF. Sube una foto o el PDF del comprobante.",
      415,
    );
  }

  // Se escribe primero el archivo: si la fila falla después, queda un blob
  // huérfano que se limpia abajo, y eso es preferible a una fila que apunta a
  // un archivo que no existe.
  const guardada = await guardarEvidencia(contenido, tipo);

  // Aviso, no bloqueo: la misma captura reenviada suele ser un error honesto,
  // pero también es el modo obvio de que un pago valga por dos. Decide el
  // revisor (índice, no restricción única, en `esquema.sql`).
  const repetidos = await abonosConMismaEvidencia(guardada.sha256);

  const resultado = await registrarAbono({
    inscripcion,
    canal: parseo.data.canal as CanalPago,
    montoDeclarado: parseo.data.montoDeclarado,
    transferidoEl: parseo.data.transferidoEl,
    referenciaExterna: parseo.data.referenciaExterna,
    evidencia: {
      clave: guardada.clave,
      tipo: guardada.tipo,
      bytes: guardada.bytes,
      sha256: guardada.sha256,
    },
    huella: huellaDe(peticion),
  });

  if (!resultado.ok) {
    // El abono no se registró: el archivo subido no le sirve a nadie.
    await borrarEvidencia(guardada.clave);
    const estado = resultado.error === "SIN_INSCRIPCION" ? 404 : 409;
    return rechazo(resultado.mensaje, estado, { codigo: resultado.error });
  }

  return NextResponse.json(
    {
      abonoId: resultado.abono.id,
      numero: resultado.abono.numero,
      estado: resultado.abono.estado,
      montoDeclarado: resultado.abono.montoDeclarado,
      // El saldo que se informa es el verificado: lo que se acaba de subir
      // todavía no es dinero.
      saldo: resultado.saldo,
      referencia: resultado.inscripcion.referencia,
      // Para que el panel lo pueda pintar; el ciclista no necesita saberlo.
      evidenciaRepetida: repetidos.length > 0,
    },
    { status: 201 },
  );
}
