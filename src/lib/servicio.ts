import "server-only";
import { randomUUID } from "node:crypto";
import {
  abonosDe,
  abonosPorRevisar,
  codigoPorTexto,
  crearAbono,
  guardarInscripcion,
  inscripcionDuplicada,
  inscripcionPorId,
  nuevaReferencia,
  reclamarAbono,
  resolverAbono,
  sumarUsoDeCodigo,
} from "./almacen";
import {
  ETAPA_ACTIVA,
  FECHA_LIMITE_ABONOS,
  categoriaPorCodigo,
  cuentaDeCanal,
  etapaDeInscripcion,
  normalizarCodigo,
  type Etapa,
} from "./catalogo";
import {
  abonadoVerificado,
  abonosQueCuentan,
  cuotasDelPlan,
  descuentoEnPesos,
  diasHasta,
  estadoDesdeAbonos,
  excedente,
  fechaLarga,
  maxCuotasViables,
  montosDelPlan,
  pesos,
  planDeCuotas,
  planPagoDeCuotas,
  planesViables,
  proximaCuotaDelPlan,
  saldoDesdeAbonos,
  type CuotaDelPlan,
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

/* --------------------------- Códigos de referido ---------------------------- */

/**
 * Qué pasa con el código que escribió el ciclista.
 *
 * `aplica` es lo único que mueve dinero. Las otras tres razones no son
 * errores: un código mal escrito, caducado o puesto en una etapa que no da
 * descuento **no puede tumbar la inscripción** —el ciclista ya llenó cinco
 * pasos—, así que se avisa y se sigue sin descuento.
 */
export type RevisionCodigo = {
  /** El código normalizado, tal como se guardaría. Vacío si no escribió nada. */
  codigo: string;
  aplica: boolean;
  /** Pesos, no porcentaje: es lo que se guarda en la inscripción. */
  descuento: number;
  /** El porcentaje que se usó para calcularlo, para poder decirlo en pantalla. */
  porcentaje: number;
  /** Precio de lista de la etapa, antes del descuento. */
  precioBase: number;
  /** Lo que acabaría debiendo: `precioBase − descuento`. */
  total: number;
  propietario?: string;
  /** Por qué no aplica. `null` cuando aplica o cuando no escribió código. */
  motivo: "SIN_CODIGO" | "NO_EXISTE" | "INACTIVO" | "ETAPA_SIN_DESCUENTO" | null;
  /** El aviso que se le enseña. `null` cuando no hay nada que decir. */
  aviso: string | null;
};

/**
 * Revisa un código contra una etapa, sin escribir nada.
 *
 * Se usa en dos sitios y tiene que dar lo mismo en los dos: el formulario la
 * llama para enseñar el precio con descuento **antes** de pagar, y
 * `crearInscripcion` la vuelve a llamar para decidir de verdad. Lo que decide
 * es la segunda llamada: lo que diga el navegador no se usa para nada más que
 * pintar.
 */
export async function revisarCodigo(
  textoCrudo: string | undefined,
  etapa: Etapa = ETAPA_ACTIVA,
): Promise<RevisionCodigo> {
  const codigo = normalizarCodigo(textoCrudo ?? "");
  const base = {
    codigo,
    aplica: false as boolean,
    descuento: 0,
    porcentaje: etapa.descuento,
    precioBase: etapa.precio,
    total: etapa.precio,
    propietario: undefined as string | undefined,
  };

  if (!codigo) {
    return { ...base, motivo: "SIN_CODIGO", aviso: null };
  }

  if (etapa.descuento <= 0) {
    return {
      ...base,
      motivo: "ETAPA_SIN_DESCUENTO",
      aviso:
        "La etapa de inscripción abierta ahora no tiene descuento por referido. Tu inscripción sigue adelante al precio de lista.",
    };
  }

  const registro = await codigoPorTexto(codigo);
  if (!registro) {
    return {
      ...base,
      motivo: "NO_EXISTE",
      aviso: `El código «${codigo}» no existe. Revisa que esté bien escrito o pídeselo otra vez a tu embajador; tu inscripción sigue adelante sin descuento.`,
    };
  }
  if (!registro.activo) {
    return {
      ...base,
      propietario: registro.propietario,
      motivo: "INACTIVO",
      aviso: `El código «${codigo}» ya no está vigente. Tu inscripción sigue adelante sin descuento.`,
    };
  }

  const descuento = descuentoEnPesos(etapa.precio, etapa.descuento);
  return {
    ...base,
    aplica: true,
    descuento,
    total: etapa.precio - descuento,
    propietario: registro.propietario,
    motivo: null,
    aviso: null,
  };
}

/* ------------------------------ Crear inscripción ----------------------------- */

export type ResultadoCreacion = {
  inscripcion: Inscripcion;
  /** La revisión del código, para que la interfaz diga qué pasó con él. */
  codigo: RevisionCodigo;
};

export async function crearInscripcion(
  entrada: EntradaInscripcion,
): Promise<ResultadoCreacion> {
  const categoria = categoriaPorCodigo(entrada.categoriaCodigo);
  if (!categoria) throw new Error("La categoría no existe.");

  /*
   * La etapa se resuelve en el servidor y de la etapa activa: ni el navegador
   * la elige ni sale de la categoría. Es la cifra que fija el precio y los
   * planes de cuotas de esta inscripción para siempre.
   */
  const etapa = ETAPA_ACTIVA;
  const codigo = await revisarCodigo(entrada.codigoReferido, etapa);

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
    // La etapa y su precio de lista quedan escritos aquí y no se vuelven a
    // consultar al catálogo: es lo que impide que abrir una etapa más cara le
    // cambie la deuda a quien ya está pagando.
    etapa: etapa.codigo,
    precioBase: etapa.precio,
    codigoReferido: codigo.aplica ? codigo.codigo : undefined,
    // En pesos, no en porcentaje. Si el 10% cambia mañana, esto no se mueve.
    descuento: codigo.aplica ? codigo.descuento : 0,
    total: codigo.aplica ? etapa.precio - codigo.descuento : etapa.precio,
    pagado: 0,
    cuotas: [],
    eventos: [],
  };
  anota(
    inscripcion,
    "creada",
    `Formulario completo · ${categoria.nombre} · ${inscripcion.ciclista.ciudad}` +
      ` · etapa ${etapa.nombre} a ${pesosSimple(etapa.precio)}`,
  );
  if (codigo.aplica) {
    anota(
      inscripcion,
      "descuento-aplicado",
      `Código ${codigo.codigo}${codigo.propietario ? ` (${codigo.propietario})` : ""}: ` +
        `−${pesosSimple(codigo.descuento)} (${codigo.porcentaje}% de ${pesosSimple(etapa.precio)}). ` +
        `Total a pagar ${pesosSimple(inscripcion.total)}.`,
    );
  } else if (codigo.codigo) {
    // Queda anotado aunque no aplique: si el ciclista reclama "yo puse el
    // código", esto es lo que dice qué pasó y por qué.
    anota(
      inscripcion,
      "descuento-no-aplicado",
      `Escribió el código ${codigo.codigo} y no se aplicó (${codigo.motivo}).`,
    );
  }

  const guardada = await guardarInscripcion(inscripcion);

  /*
   * El contador del código se sube DESPUÉS de guardar y sin poder tumbar la
   * inscripción. El uso de verdad es la fila que acaba de quedar escrita con
   * `codigo_referido`; este contador es la cuenta propia del registro, y
   * perderlo por un fallo de red sería mucho peor que tenerlo corto.
   */
  if (codigo.aplica) {
    try {
      await sumarUsoDeCodigo(codigo.codigo);
    } catch (error) {
      console.error(
        `[codigos] no se pudo contar el uso de ${codigo.codigo}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { inscripcion: guardada, codigo };
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

  /*
   * Quién tiene un comprobante esperando revisión. `ins.pagado` solo cuenta
   * dinero ya verificado, así que sin esto marcaríamos en mora a alguien que
   * transfirió a tiempo y solo espera a que lo miremos — y con revisión
   * manual eso no es raro, es lo normal el día del vencimiento.
   */
  const enRevision = new Set(
    (await abonosPorRevisar(500)).map((a) => a.inscripcionId),
  );

  for (const ins of inscripciones) {
    if (ins.estado === "COMPLETA" || ins.estado === "BORRADOR") continue;
    if (ins.pagado >= ins.total) continue;
    if (enRevision.has(ins.id)) continue;

    // La fecha que le importa a ESTA inscripción es la de su **siguiente cuota
    // pendiente**: con un plan diferido hay vencimientos propios y
    // comprometidos —45 días por cuota desde que se inscribió— y recordar
    // contra el cierre general le llegaría semanas tarde. Quien todavía no ha
    // cubierto ni la primera cuota no tiene más fecha que el cierre: la primera
    // se paga al inscribirse y no hay un plazo intermedio que recordarle.
    const cuotas = cuotasDelPlan(ins.plan);
    const plan = planDeCuotas(ins.total, ins.creadaEn, cuotas);
    const siguiente = proximaCuotaDelPlan(plan, ins.pagado);
    const conPlazoPropio = !!siguiente && siguiente.numero > 1;
    const vence = conPlazoPropio ? siguiente!.vence : FECHA_LIMITE_ABONOS;
    const dias = diasHasta(vence, hoy);

    // Pasada su fecha con saldo, la inscripción queda en mora. No se cancela
    // sola: quién pierde el cupo es decisión de la organización. Y seguir en
    // mora no cierra la puerta: hasta el cierre general todavía se le admite
    // el comprobante.
    if (dias < 0) {
      if (ins.estado !== "EN_MORA") {
        ins.estado = "EN_MORA";
        anota(
          ins,
          "vencida",
          `Venció el ${fechaLarga(vence)} con ${pesos(ins.total - ins.pagado)} pendientes` +
            (conPlazoPropio
              ? ` de la cuota ${siguiente!.numero} de ${cuotas}.`
              : "."),
        );
        await guardarInscripcion(ins);
        vencidas += 1;
      }
      continue;
    }

    // Aviso a 15, 7 y 3 días del vencimiento, y el día mismo. Un solo correo
    // por corrida.
    if ([15, 7, 3, 0].includes(dias)) {
      await enviarAlCiclista(
        ins,
        "recordatorio-cuota",
        recordatorioCuota(ins, siguiente?.numero ?? 1, dias),
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

/**
 * Los planes de cuotas que todavía caben para ESTA inscripción.
 *
 * Dos cosas a la vez, y las dos importan: los planes salen de la etapa en la
 * que entró —1, 2 o 3 en la primera; 1, 2, 3 o 4 en la segunda— y se filtran
 * contra su fecha de inscripción, porque un plan cuya última cuota no llega
 * antes del cierre no se puede ofrecer.
 *
 * Que exista esta función es lo que impide el error de fondo del encargo:
 * preguntarle al catálogo vigente en cuántas cuotas puede pagar alguien que se
 * inscribió con otras condiciones.
 */
function planesDe(ins: Inscripcion): number[] {
  return planesViables(ins.creadaEn, etapaDeInscripcion(ins).planes);
}

/**
 * En cuántas cuotas queda la inscripción según lo que declara su **primer**
 * comprobante.
 *
 * El plan no se envía desde el navegador: se deduce del monto, que es la única
 * cifra que el ciclista se compromete a transferir de verdad. Se elige el plan
 * más corto cuya primera cuota quepa en lo declarado —el que menos
 * comprobantes le deja por subir—; quien transfiere el total no entra en
 * ningún plan diferido (regla 7: no quedan cuotas).
 */
function cuotasSegunElPrimerAbono(ins: Inscripcion, declarado: number): number {
  if (declarado >= ins.total) return 1;
  // Los planes son los de SU etapa: una inscripción de la etapa 1 no puede
  // caer en el plan de cuatro cuotas aunque la etapa activa ya lo ofrezca.
  const diferidos = planesDe(ins).filter((n) => n > 1);
  for (const n of diferidos) {
    if (montosDelPlan(ins.total, n)[0] <= declarado) return n;
  }
  return diferidos[diferidos.length - 1] ?? 1;
}

/**
 * Cuánto tiene que declarar, como mínimo, el comprobante que se está subiendo.
 *
 * Los planes de cuotas mataron el "abona lo que puedas": cada comprobante
 * cubre la cuota que le toca, y el último cubre el saldo entero —aceptarlo por
 * menos dejaría una deuda sin ninguna vía de pago—. Mientras no haya un primer
 * comprobante no hay plan elegido, así que el mínimo es la primera cuota del
 * plan más largo que quepa: es lo que deja abiertas las tres opciones.
 *
 * Lo que este mínimo NO toca es la revisión: el revisor sigue pudiendo aprobar
 * por un monto distinto al declarado (docs/decisiones-pago-manual.md §6). Esto
 * filtra lo que el ciclista escribe, no lo que la organización confirma.
 */
export function montoMinimoDeAbono(ins: Inscripcion, previos: Abono[]): number {
  const saldo = saldoDesdeAbonos(ins.total, previos);
  const hechos = abonosQueCuentan(previos).length;

  if (hechos === 0) {
    return Math.min(
      montosDelPlan(ins.total, maxCuotasViables(ins.creadaEn, etapaDeInscripcion(ins).planes))[0],
      saldo,
    );
  }

  const cuotas = cuotasDelPlan(ins.plan);
  // El último comprobante del plan cierra la inscripción.
  if (hechos + 1 >= cuotas) return saldo;
  return Math.min(montosDelPlan(ins.total, cuotas)[hechos], saldo);
}

/** El mínimo con el texto que explica de dónde sale. */
function montoExigido(
  ins: Inscripcion,
  previos: Abono[],
): { minimo: number; mensaje: string } {
  const minimo = montoMinimoDeAbono(ins, previos);
  const saldo = saldoDesdeAbonos(ins.total, previos);
  const hechos = abonosQueCuentan(previos).length;

  if (hechos > 0) {
    const cuotas = cuotasDelPlan(ins.plan);
    const numero = hechos + 1;
    if (numero >= cuotas) {
      return {
        minimo,
        mensaje: `Este es el comprobante ${numero} y último de tu plan de ${cuotas} cuotas: tiene que cubrir los ${pesosSimple(saldo)} que faltan.`,
      };
    }
    return {
      minimo,
      mensaje: `La cuota ${numero} de tu plan de ${cuotas} son ${pesosSimple(minimo)}: el comprobante no puede ser por menos.`,
    };
  }

  if (minimo >= saldo) {
    return {
      minimo,
      mensaje: `Tu inscripción se paga de una: el comprobante tiene que ser por ${pesosSimple(saldo)}. Ya no queda plazo para repartirla en cuotas antes del ${fechaLarga(FECHA_LIMITE_ABONOS)}.`,
    };
  }
  const opciones = planesDe(ins)
    .map((n) =>
      n === 1
        ? `${pesosSimple(ins.total)} (pago total)`
        : `${pesosSimple(montosDelPlan(ins.total, n)[0])} (${n} cuotas)`,
    )
    .join(", ");
  return {
    minimo,
    mensaje: `El monto decide tu plan y no puede ser menor que ${pesosSimple(minimo)}. Las opciones son: ${opciones}.`,
  };
}

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
  //
  // El cupo de comprobantes es el número de cuotas de ESTA inscripción, no una
  // constante global: quien va por el plan de dos no puede subir un tercero
  // aunque el plan de tres exista. Mientras no haya un primer comprobante no
  // hay plan que agotar.
  const vigentes = abonosQueCuentan(previos);
  const comprometidas = vigentes.length > 0 ? cuotasDelPlan(ins.plan) : 0;
  if (vigentes.length > 0 && vigentes.length >= comprometidas) {
    return {
      ok: false,
      error: "SIN_CUPO",
      mensaje: `Tu inscripción ya tiene los ${comprometidas} comprobantes de tu plan de ${comprometidas} cuota${comprometidas === 1 ? "" : "s"}. Si algo no cuadra, escríbenos y lo revisamos contigo.`,
    };
  }

  // El monto dejó de ser libre: cada comprobante tiene un mínimo que depende
  // del plan y de en qué cuota va la inscripción. Va después de `abonosDe`
  // porque sin los abonos previos no se puede saber.
  const exigido = montoExigido(ins, previos);
  if (params.montoDeclarado < exigido.minimo) {
    return {
      ok: false,
      error: "MONTO_INVALIDO",
      mensaje: exigido.mensaje,
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
  //
  // El primer comprobante es el que fija el plan: el monto declarado dice en
  // cuántas cuotas queda la inscripción, y a partir de ahí ese número manda
  // sobre el cupo de comprobantes y sobre las fechas. Los siguientes no lo
  // tocan — cambiar de plan a mitad de camino movería vencimientos ya
  // comprometidos. Transferir el total de una lo deja en TOTAL y no habrá más
  // cuotas (§1, regla 7).
  const cuotas =
    vigentes.length === 0
      ? cuotasSegunElPrimerAbono(ins, abono.montoDeclarado)
      : comprometidas;

  const cuenta = cuentaDeCanal(params.canal);
  anota(
    ins,
    "abono-recibido",
    `Cuota ${abono.numero} de ${cuotas} por ${pesosSimple(abono.montoDeclarado)} vía ${cuenta?.entidad ?? params.canal}` +
      (abono.referenciaExterna ? ` · ref. ${abono.referenciaExterna}` : "") +
      (params.huella?.ip ? ` · desde ${params.huella.ip}` : ""),
  );
  ins.medioPago = "TRANSFERENCIA";
  if (vigentes.length === 0) ins.plan = planPagoDeCuotas(cuotas);
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
 * El cupo del ciclista NO se toca y el rechazo no gasta ninguno de los
 * comprobantes de su plan: puede corregir y volver a subir hasta la fecha de cierre
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
export type OpcionDePlan = { cuotas: number; cuotasDelPlan: CuotaDelPlan[] };

export async function resumenDePago(ins: Inscripcion): Promise<{
  abonos: Abono[];
  verificado: number;
  saldo: number;
  excedente: number;
  abonosDisponibles: number;
  cerrado: boolean;
  /**
   * En cuántas cuotas quedó la inscripción. `null` mientras no haya subido
   * ningún comprobante: hasta entonces el plan está sin elegir.
   */
  cuotas: number | null;
  /** Todos los montos con todas sus fechas del plan elegido. Vacío si no hay. */
  plan: CuotaDelPlan[];
  /**
   * Los planes que todavía puede elegir, con sus montos y fechas. Solo trae
   * algo mientras el plan esté sin elegir; los que no caben antes del cierre
   * no aparecen (docs/decisiones-pago-manual.md §1).
   */
  opciones: OpcionDePlan[];
  /** Vencimiento de la próxima cuota con plazo propio. `null` si no hay. */
  venceProximaCuota: string | null;
  /** Lo mínimo que puede declarar el próximo comprobante. */
  montoMinimo: number;
  /**
   * El plan más largo de la etapa de esta inscripción (3 en la primera, 4 en
   * la segunda). Lo usa la interfaz para explicar qué planes faltan y por qué,
   * y tiene que salir de aquí: el catálogo solo sabe cuál es la etapa abierta.
   */
  maxCuotas: number;
}> {
  const abonos = await abonosDe(ins.id);
  const saldo = saldoDesdeAbonos(ins.total, abonos);
  const verificado = abonadoVerificado(abonos);
  const hechos = abonosQueCuentan(abonos).length;

  // El plan lo fija el primer comprobante. Antes de eso la inscripción nace en
  // TOTAL, que no es una elección sino un valor por defecto: mientras no haya
  // subido nada se le siguen ofreciendo todos los planes que quepan.
  const decidido = hechos > 0;
  const cuotas = decidido ? cuotasDelPlan(ins.plan) : null;
  // Con el saldo en cero no queda ninguna cuota que enseñar: si el ciclista
  // cubrió el total antes de tiempo, las que quedaban desaparecen (regla 7).
  const plan =
    cuotas && saldo > 0 ? planDeCuotas(ins.total, ins.creadaEn, cuotas) : [];
  const opciones: OpcionDePlan[] =
    !decidido && saldo > 0
      ? planesDe(ins).map((n) => ({
          cuotas: n,
          cuotasDelPlan: planDeCuotas(ins.total, ins.creadaEn, n),
        }))
      : [];

  // La cuota que le toca al PRÓXIMO comprobante, contando los que ya subió y
  // no le rechazamos. No se mira el dinero verificado: un comprobante subido y
  // sin revisar ya ocupa su cuota, y decirle que la siguiente vence en el
  // cierre general le movería la fecha que tiene comprometida.
  const siguiente = plan[hechos];
  const cupo =
    cuotas ?? maxCuotasViables(ins.creadaEn, etapaDeInscripcion(ins).planes);

  return {
    abonos,
    verificado,
    saldo,
    excedente: excedente(ins.total, abonos),
    abonosDisponibles: Math.max(0, cupo - hechos),
    cerrado: diasHasta(FECHA_LIMITE_ABONOS) < 0,
    cuotas,
    plan,
    opciones,
    venceProximaCuota:
      siguiente && siguiente.numero > 1 ? siguiente.vence : null,
    montoMinimo: montoMinimoDeAbono(ins, abonos),
    maxCuotas: Math.max(...etapaDeInscripcion(ins).planes),
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

