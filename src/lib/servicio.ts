import "server-only";
import { randomUUID } from "node:crypto";
import {
  abonosDe,
  crearAbono,
  guardarInscripcion,
  inscripcionDuplicada,
  inscripcionPorId,
  nuevaReferencia,
  reclamarAbono,
  resolverAbono,
} from "./almacen";
import {
  ABONO_MINIMO,
  FECHA_LIMITE_ABONOS,
  MAX_ABONOS,
  categoriaPorCodigo,
  cuentaDeCanal,
} from "./catalogo";
import {
  abonadoVerificado,
  abonosQueCuentan,
  diasHasta,
  estadoDesdeAbonos,
  excedente,
  pesos,
  saldoDesdeAbonos,
} from "./dinero";
import type { EntradaInscripcion } from "./validacion";
import type {
  Abono,
  CanalPago,
  DatosCiclista,
  Inscripcion,
  Tallas,
} from "./tipos";
import { enviarAlCiclista } from "./correos/enviar";
import {
  cambioDeCompetidor,
  evidenciaRecibida,
  evidenciaRechazada,
  evidenciaVerificada,
  inscripcionCompleta,
  recordatorioCuota,
} from "./correos/plantillas";
import type { PlantillaCorreo } from "./correos/plantillas";

function anota(ins: Inscripcion, tipo: string, detalle: string) {
  ins.eventos.unshift({ en: new Date().toISOString(), tipo, detalle });
}

/**
 * Notificación que no puede tumbar la operación que la disparó.
 *
 * Verificar un abono mueve dinero; mandar el correo no. Si el proveedor está caído,
 * lo último que queremos es que la excepción del correo deje al revisor
 * creyendo que la aprobación falló cuando ya quedó escrita en la base. Se
 * registra en el log y sigue.
 */
async function avisar(
  ins: Inscripcion,
  plantilla: string,
  contenido: PlantillaCorreo,
): Promise<void> {
  try {
    await enviarAlCiclista(ins, plantilla, contenido);
  } catch (error) {
    console.error(
      `[correos] no se pudo enviar "${plantilla}" de ${ins.referencia}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/* ------------------------------ Crear inscripción ----------------------------- */

export async function crearInscripcion(
  entrada: EntradaInscripcion,
): Promise<Inscripcion> {
  const categoria = categoriaPorCodigo(entrada.categoriaCodigo);
  if (!categoria) throw new Error("La categoría no existe.");

  const referencia = nuevaReferencia();
  const inscripcion: Inscripcion = {
    id: randomUUID(),
    referencia,
    creadaEn: new Date().toISOString(),
    actualizadaEn: new Date().toISOString(),
    estado: "PENDIENTE_PAGO",
    categoriaCodigo: entrada.categoriaCodigo,
    ciclista: { ...entrada.ciclista, pais: "Colombia" },
    tallas: entrada.tallas,
    consentimientos: entrada.consentimientos,
    // Las inscripciones nuevas se pagan por transferencia. El plan arranca en
    // TOTAL y pasa a ABONOS solo cuando llega el primer abono parcial.
    plan: "TOTAL",
    medioPago: "TRANSFERENCIA",
    total: categoria.precio,
    pagado: 0,
    cuotas: [],
    eventos: [],
  };
  anota(
    inscripcion,
    "creada",
    `Formulario completo · ${categoria.nombre} · ${inscripcion.ciclista.ciudad}`,
  );
  return guardarInscripcion(inscripcion);
}

/* --------------------------------- Cobros ------------------------------------ */










const pesosSimple = (v: number) => `$${v.toLocaleString("es-CO")}`;

/* ------------------------------ Barrido diario ------------------------------- */

/**
 * Barrido diario. Ya no cobra nada: con pago manual el dinero lo empuja el
 * ciclista, así que lo único que puede hacer el servidor es recordar a tiempo
 * y marcar lo que se pasó de fecha.
 *
 * Recuerda una sola vez por inscripción y corrida, para no convertir el
 * recordatorio en spam.
 */
export async function barrerRecordatorios(
  inscripciones: Inscripcion[],
  hoy = new Date(),
): Promise<{ recordadas: number; vencidas: number }> {
  let recordadas = 0;
  let vencidas = 0;

  for (const ins of inscripciones) {
    if (ins.estado === "COMPLETA" || ins.estado === "BORRADOR") continue;

    const limite = diasHasta(FECHA_LIMITE_ABONOS, hoy);

    // Pasada la fecha límite con saldo, la inscripción queda en mora. No se
    // cancela sola: quién pierde el cupo es decisión de la organización.
    if (limite < 0 && ins.pagado < ins.total) {
      if (ins.estado !== "EN_MORA") {
        ins.estado = "EN_MORA";
        anota(
          ins,
          "vencida",
          `Pasó la fecha límite de abonos con ${pesos(ins.total - ins.pagado)} pendientes.`,
        );
        await guardarInscripcion(ins);
        vencidas += 1;
      }
      continue;
    }

    // Aviso a 15, 7 y 3 días del cierre. Un solo correo por corrida.
    if ([15, 7, 3].includes(limite) && ins.pagado < ins.total) {
      await enviarAlCiclista(
        ins,
        "recordatorio-cuota",
        recordatorioCuota(ins, 1, limite),
      );
      recordadas += 1;
    }
  }

  return { recordadas, vencidas };
}

/* --------------------------- Pago manual: abonos ----------------------------- */

/**
 * Registrar y revisar abonos es el reemplazo del cobro automático.
 *
 * Diferencia de fondo con Wompi: aquí no hay una autoridad externa que diga
 * "aprobado". Lo que hay es una persona mirando una captura de pantalla. Todo
 * el diseño sale de ahí — el dinero solo cuenta cuando alguien lo verificó, y
 * cada paso deja escrito quién lo hizo y cuándo.
 */

export type ErrorAbono =
  | "SIN_INSCRIPCION"
  | "YA_ESTA_PAGADA"
  | "CERRADO"
  | "SIN_CUPO"
  | "MONTO_INVALIDO"
  | "CANAL_INVALIDO";

export type ResultadoRegistro =
  | { ok: true; abono: Abono; inscripcion: Inscripcion; saldo: number }
  | { ok: false; error: ErrorAbono; mensaje: string };

/**
 * Guarda un comprobante que subió el ciclista.
 *
 * El orden no es casual: el abono se escribe ANTES de tocar nada más. Si el
 * proceso se cae al recalcular el estado o al notificar, lo peor que pasa es
 * que la inscripción quede un momento con el estado viejo — que se arregla
 * solo en la siguiente revisión. Al revés, se perdería la evidencia de un pago
 * que el ciclista ya hizo y que ya no puede volver a subir igual.
 *
 * Nada de esto cambia el saldo: un abono nace ENVIADA y no vale un peso hasta
 * que alguien lo verifique.
 */
export async function registrarAbono(params: {
  inscripcion: Inscripcion;
  canal: CanalPago;
  montoDeclarado: number;
  transferidoEl?: string;
  referenciaExterna?: string;
  evidencia: {
    clave: string;
    tipo: string;
    bytes: number;
    sha256: string;
  };
  huella?: { ip?: string; navegador?: string };
  hoy?: Date;
}): Promise<ResultadoRegistro> {
  const ins = params.inscripcion;
  const hoy = params.hoy ?? new Date();

  if (!cuentaDeCanal(params.canal)) {
    return {
      ok: false,
      error: "CANAL_INVALIDO",
      mensaje: "Ese destino de pago no existe.",
    };
  }

  if (!Number.isInteger(params.montoDeclarado) || params.montoDeclarado <= 0) {
    return {
      ok: false,
      error: "MONTO_INVALIDO",
      mensaje: "El monto debe ser un número entero de pesos mayor que cero.",
    };
  }
  if (params.montoDeclarado < ABONO_MINIMO) {
    return {
      ok: false,
      error: "MONTO_INVALIDO",
      mensaje: `El abono mínimo es ${pesosSimple(ABONO_MINIMO)}.`,
    };
  }

  // El plazo se mide contra la fecha de hoy, no contra la del comprobante: lo
  // que se cierra es la recepción, no la transferencia.
  if (diasHasta(FECHA_LIMITE_ABONOS, hoy) < 0) {
    return {
      ok: false,
      error: "CERRADO",
      mensaje: `La recepción de comprobantes cerró el ${FECHA_LIMITE_ABONOS}.`,
    };
  }

  const previos = await abonosDe(ins.id);
  if (saldoDesdeAbonos(ins.total, previos) === 0) {
    return {
      ok: false,
      error: "YA_ESTA_PAGADA",
      mensaje: "Esta inscripción ya está pagada por completo.",
    };
  }

  // Los rechazados no gastan intento: el ciclista puede volver a subir sin
  // límite hasta el cierre (docs/decisiones-pago-manual.md §7).
  const vigentes = abonosQueCuentan(previos);
  if (vigentes.length >= MAX_ABONOS) {
    return {
      ok: false,
      error: "SIN_CUPO",
      mensaje: `Ya usaste los ${MAX_ABONOS} abonos permitidos.`,
    };
  }

  const abono = await crearAbono({
    id: randomUUID(),
    inscripcionId: ins.id,
    creadoEn: new Date().toISOString(),
    numero: vigentes.length + 1,
    canal: params.canal,
    montoDeclarado: params.montoDeclarado,
    transferidoEl: params.transferidoEl,
    referenciaExterna: params.referenciaExterna,
    evidenciaClave: params.evidencia.clave,
    evidenciaTipo: params.evidencia.tipo,
    evidenciaBytes: params.evidencia.bytes,
    evidenciaSha256: params.evidencia.sha256,
    huella: params.huella,
    estado: "ENVIADA",
  });

  // A partir de aquí la evidencia ya está a salvo; lo demás es cosmética.
  const cuenta = cuentaDeCanal(params.canal);
  anota(
    ins,
    "abono-recibido",
    `Comprobante ${abono.numero}/${MAX_ABONOS} por ${pesosSimple(abono.montoDeclarado)} vía ${cuenta?.entidad ?? params.canal}` +
      (abono.referenciaExterna ? ` · ref. ${abono.referenciaExterna}` : "") +
      (params.huella?.ip ? ` · desde ${params.huella.ip}` : ""),
  );
  ins.medioPago = "TRANSFERENCIA";
  // Un abono parcial convierte el plan; pagar todo de una lo deja en TOTAL.
  if (abono.montoDeclarado < ins.total) ins.plan = "ABONOS";
  ins.estado = estadoDesdeAbonos(ins.total, [...previos, abono]);
  const actualizada = await guardarInscripcion(ins);

  const todos = [...previos, abono];
  const saldo = saldoDesdeAbonos(ins.total, todos);

  // Acuse de recibo. Va después de guardar y no puede tumbar el registro: el
  // comprobante ya está a salvo, que es lo único irrecuperable.
  await avisar(
    actualizada,
    "evidencia-recibida",
    evidenciaRecibida(actualizada, abono, {
      verificado: abonadoVerificado(todos),
      saldo,
    }),
  );

  return { ok: true, abono, inscripcion: actualizada, saldo };
}

export type ResultadoRevision =
  | {
      ok: true;
      abono: Abono;
      inscripcion: Inscripcion;
      saldo: number;
      excedente: number;
      completa: boolean;
    }
  | { ok: false; error: "NO_EXISTE" | "YA_RESUELTO" | "MONTO_INVALIDO"; mensaje: string };

/**
 * Vuelve a calcular el estado y el recaudo de una inscripción a partir de sus
 * abonos, y lo guarda.
 *
 * `pagado` pasa a ser la suma de lo verificado. La tabla de cuotas se queda
 * quieta: bajo pago manual es un plan sugerido, no el libro de dinero
 * (docs/decisiones-pago-manual.md §1). Mezclar las dos cuentas fue justamente
 * lo que se quiso evitar.
 */
async function recalcularDesdeAbonos(
  ins: Inscripcion,
  abonos: Abono[],
): Promise<Inscripcion> {
  ins.pagado = abonadoVerificado(abonos);
  ins.estado = estadoDesdeAbonos(ins.total, abonos);
  return guardarInscripcion(ins);
}

/**
 * Da por bueno un comprobante.
 *
 * Dos pasos y no uno: primero `reclamarAbono` (UPDATE condicional atómico,
 * mismo patrón que `reclamarCuota`) y solo si ese reclamo gana se resuelve. Si
 * dos revisores abren la misma cola, uno queda fuera con un mensaje claro en
 * vez de sumar el mismo pago dos veces.
 *
 * `montoAprobado` manda sobre lo declarado: el revisor está mirando el
 * extracto y el ciclista escribió de memoria.
 */
export async function verificarAbono(params: {
  abonoId: string;
  montoAprobado: number;
  revisadoPor: string;
}): Promise<ResultadoRevision> {
  if (!Number.isInteger(params.montoAprobado) || params.montoAprobado < 0) {
    return {
      ok: false,
      error: "MONTO_INVALIDO",
      mensaje: "El monto aprobado debe ser un número entero de pesos.",
    };
  }

  const reclamado = await reclamarAbono(params.abonoId, params.revisadoPor);
  if (!reclamado) {
    return {
      ok: false,
      error: "YA_RESUELTO",
      mensaje: "Otro revisor tomó este comprobante o ya está resuelto.",
    };
  }

  const abono = await resolverAbono({
    id: params.abonoId,
    estado: "VERIFICADA",
    montoAprobado: params.montoAprobado,
    revisadoPor: params.revisadoPor,
  });
  if (!abono) {
    return {
      ok: false,
      error: "YA_RESUELTO",
      mensaje: "El comprobante cambió de estado mientras se revisaba.",
    };
  }

  const ins = await inscripcionPorId(abono.inscripcionId);
  if (!ins) {
    return {
      ok: false,
      error: "NO_EXISTE",
      mensaje: "El comprobante no tiene inscripción.",
    };
  }

  const abonos = await abonosDe(ins.id);
  const saldo = saldoDesdeAbonos(ins.total, abonos);
  const sobra = excedente(ins.total, abonos);

  const diferencia = abono.montoAprobado! - abono.montoDeclarado;
  anota(
    ins,
    "abono-verificado",
    `${pesosSimple(abono.montoAprobado!)} confirmados por ${params.revisadoPor}` +
      (diferencia !== 0
        ? ` (declaró ${pesosSimple(abono.montoDeclarado)})`
        : "") +
      ` · saldo ${pesosSimple(saldo)}` +
      // DECISIÓN PENDIENTE DE CONFIRMAR (§6): el excedente no se devuelve
      // solo; queda anotado para que alguien lo hable con el ciclista.
      (sobra > 0 ? ` · sobra ${pesosSimple(sobra)}` : ""),
  );

  // El saldo en cero es lo único que marca COMPLETA, y es también lo que
  // habilita el dorsal y el ticket (docs/decisiones-pago-manual.md §3).
  if (saldo === 0) {
    anota(ins, "inscripcion-completa", "Saldo en cero: se puede emitir el dorsal.");
  }

  const actualizada = await recalcularDesdeAbonos(ins, abonos);

  // Un solo correo, no dos: con saldo en cero el de "inscripción completa" ya
  // dice todo lo que diría el de abono verificado, y encima trae el dorsal.
  if (actualizada.estado === "COMPLETA") {
    await avisar(
      actualizada,
      "inscripcion-completa",
      inscripcionCompleta(actualizada, { excedente: sobra }),
    );
  } else {
    await avisar(
      actualizada,
      "evidencia-verificada",
      evidenciaVerificada(actualizada, abono, {
        verificado: abonadoVerificado(abonos),
        saldo,
      }),
    );
  }

  return {
    ok: true,
    abono,
    inscripcion: actualizada,
    saldo,
    excedente: sobra,
    completa: actualizada.estado === "COMPLETA",
  };
}

/**
 * Descarta un comprobante.
 *
 * El cupo del ciclista NO se toca y el rechazo no gasta uno de los tres
 * abonos: puede corregir y volver a subir hasta la fecha de cierre
 * (docs/decisiones-pago-manual.md §7). El motivo es obligatorio porque es lo
 * único que el ciclista va a leer para saber qué arreglar.
 */
export async function rechazarAbono(params: {
  abonoId: string;
  motivo: string;
  revisadoPor: string;
}): Promise<ResultadoRevision> {
  const motivo = params.motivo.trim();
  if (!motivo) {
    return {
      ok: false,
      error: "MONTO_INVALIDO",
      mensaje: "Hay que decir por qué se rechaza.",
    };
  }

  const reclamado = await reclamarAbono(params.abonoId, params.revisadoPor);
  if (!reclamado) {
    return {
      ok: false,
      error: "YA_RESUELTO",
      mensaje: "Otro revisor tomó este comprobante o ya está resuelto.",
    };
  }

  const abono = await resolverAbono({
    id: params.abonoId,
    estado: "RECHAZADA",
    motivoRechazo: motivo,
    revisadoPor: params.revisadoPor,
  });
  if (!abono) {
    return {
      ok: false,
      error: "YA_RESUELTO",
      mensaje: "El comprobante cambió de estado mientras se revisaba.",
    };
  }

  const ins = await inscripcionPorId(abono.inscripcionId);
  if (!ins) {
    return {
      ok: false,
      error: "NO_EXISTE",
      mensaje: "El comprobante no tiene inscripción.",
    };
  }

  const abonos = await abonosDe(ins.id);
  anota(ins, "abono-rechazado", `${params.revisadoPor}: ${motivo}`);
  const actualizada = await recalcularDesdeAbonos(ins, abonos);
  const saldo = saldoDesdeAbonos(ins.total, abonos);

  // El motivo es la razón de ser de este correo: el ciclista no tiene otra
  // forma de saber qué corregir.
  await avisar(
    actualizada,
    "evidencia-rechazada",
    evidenciaRechazada(actualizada, {
      motivo,
      monto: abono.montoDeclarado,
      saldo,
    }),
  );

  return {
    ok: true,
    abono,
    inscripcion: actualizada,
    saldo,
    excedente: excedente(ins.total, abonos),
    completa: false,
  };
}

/**
 * Todo lo que la interfaz necesita para pintar el estado de pago de una
 * inscripción, en una sola llamada.
 */
export async function resumenDePago(ins: Inscripcion): Promise<{
  abonos: Abono[];
  verificado: number;
  saldo: number;
  excedente: number;
  abonosDisponibles: number;
  cerrado: boolean;
}> {
  const abonos = await abonosDe(ins.id);
  return {
    abonos,
    verificado: abonadoVerificado(abonos),
    saldo: saldoDesdeAbonos(ins.total, abonos),
    excedente: excedente(ins.total, abonos),
    abonosDisponibles: Math.max(0, MAX_ABONOS - abonosQueCuentan(abonos).length),
    cerrado: diasHasta(FECHA_LIMITE_ABONOS) < 0,
  };
}

/* --------------------------- Cambio de competidor ---------------------------- */

/**
 * Ceder la inscripción a otra persona.
 *
 * La política del cliente es explícita: la inscripción **no se devuelve, pero
 * sí se puede ceder**. Sin esto, el que no puede correr solo tiene dos
 * salidas: perder el dinero o pelear por un reembolso que no existe.
 *
 * Lo que cambia son los datos de la persona. Lo que NO cambia —y es
 * deliberado— es todo lo demás: referencia, categoría, total, lo ya abonado y
 * los comprobantes. El dinero le pertenece al cupo, no al nombre; si se creara
 * una inscripción nueva habría que mover abonos verificados de una fila a
 * otra, que es exactamente la operación que nadie quiere auditar después.
 *
 * Queda escrito en la bitácora quién lo hizo, cuándo y con qué datos estaba
 * antes: una cesión es la única vía por la que el titular de un cupo cambia,
 * así que tiene que poder reconstruirse.
 */
export type ErrorCambio = "DOCUMENTO_OCUPADO" | "SIN_CAMBIO";

export type ResultadoCambio =
  | {
      ok: true;
      inscripcion: Inscripcion;
      anterior: DatosCiclista;
      saldo: number;
    }
  | { ok: false; error: ErrorCambio; mensaje: string };

export async function cambiarCompetidor(params: {
  inscripcion: Inscripcion;
  ciclista: DatosCiclista;
  tallas: Tallas;
  /** Nombre del revisor, sacado de la sesión. Nunca del cuerpo de la petición. */
  hechoPor: string;
  motivo?: string;
  huella?: { ip?: string; navegador?: string };
}): Promise<ResultadoCambio> {
  const ins = params.inscripcion;
  const anterior = ins.ciclista;
  const nuevo: DatosCiclista = { ...params.ciclista, pais: params.ciclista.pais || "Colombia" };

  // Una persona, un cupo. Si el documento nuevo ya corre, la cesión crearía
  // un doble registro imposible de entregar en la mesa de kits.
  const ocupado = await inscripcionDuplicada(nuevo.identificacion);
  if (ocupado && ocupado.id !== ins.id) {
    return {
      ok: false,
      error: "DOCUMENTO_OCUPADO",
      mensaje: `El documento ${nuevo.identificacion} ya tiene la inscripción ${ocupado.referencia}.`,
    };
  }

  const igual =
    anterior.identificacion.trim() === nuevo.identificacion.trim() &&
    anterior.nombres.trim() === nuevo.nombres.trim() &&
    anterior.apellidos.trim() === nuevo.apellidos.trim() &&
    anterior.correo.trim().toLowerCase() === nuevo.correo.trim().toLowerCase() &&
    ins.tallas.jersey === params.tallas.jersey &&
    ins.tallas.running === params.tallas.running;
  if (igual) {
    return {
      ok: false,
      error: "SIN_CAMBIO",
      mensaje: "Los datos son los mismos que ya tenía la inscripción.",
    };
  }

  ins.ciclista = nuevo;
  ins.tallas = params.tallas;

  // El detalle guarda a la persona anterior completa: es la única constancia
  // de a quién se le quitó el cupo y quién lo autorizó.
  anota(
    ins,
    "cambio-de-competidor",
    `${params.hechoPor} cedió el cupo de ${anterior.nombres} ${anterior.apellidos} ` +
      `(doc. ${anterior.identificacion} · ${anterior.correo} · tel. ${anterior.telefono}) ` +
      `a ${nuevo.nombres} ${nuevo.apellidos} (doc. ${nuevo.identificacion} · ${nuevo.correo}). ` +
      `Se conservan la referencia ${ins.referencia}, la categoría y ${pesosSimple(ins.pagado)} ya abonados.` +
      (params.motivo ? ` Motivo: ${params.motivo}` : "") +
      (params.huella?.ip ? ` · desde ${params.huella.ip}` : ""),
  );

  const actualizada = await guardarInscripcion(ins);
  const saldo = Math.max(0, actualizada.total - actualizada.pagado);

  await avisar(
    actualizada,
    "cambio-competidor",
    cambioDeCompetidor(actualizada, {
      anterior: { nombres: anterior.nombres, apellidos: anterior.apellidos },
      hechoPor: params.hechoPor,
      saldo,
    }),
  );

  return { ok: true, inscripcion: actualizada, anterior, saldo };
}

