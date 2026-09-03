export type Genero = "MUJERES" | "HOMBRES" | "MIXTAS";

export type Categoria = {
  codigo: string;
  nombre: string;
  grupo: Genero;
  requisito: string;
  /** Precio en pesos colombianos (no centavos). */
  precio: number;
  /** Distancia de la ruta en km, cuando el reglamento la publica. */
  km?: number;
  /** Desnivel positivo acumulado en metros, cuando el reglamento lo publica. */
  desnivel?: number;
};

/**
 * EN_PROCESO es la clave para no cobrar dos veces: Wompi responde PENDING y
 * liquida un par de segundos después. Tratar ese PENDING como fallo hacía que
 * reintentáramos un cobro que en realidad iba a aprobarse.
 */
export type EstadoCuota =
  | "PENDIENTE"
  | "EN_PROCESO"
  | "PAGADA"
  | "VENCIDA"
  | "FALLIDA";

export type Cuota = {
  numero: number;
  /** ISO date (YYYY-MM-DD) */
  vence: string;
  /** En pesos, no centavos. */
  monto: number;
  estado: EstadoCuota;
  referencia: string;
  transaccionId?: string;
  pagadaEn?: string;
  intentos: number;
  ultimoIntentoEn?: string;
  ultimoError?: string;
};

export type EstadoInscripcion =
  | "BORRADOR"
  | "PENDIENTE_PAGO"
  /** Subió comprobante y nadie lo ha revisado todavía. */
  | "EN_VERIFICACION"
  | "AL_DIA"
  | "EN_MORA"
  | "COMPLETA";

/**
 * CONTADO y CUOTAS son los valores del cobro con pasarela; siguen en la base y
 * no se pueden retirar del tipo sin romper las inscripciones ya guardadas.
 *
 * Los del pago manual por transferencia dicen además **en cuántas cuotas**
 * quedó la inscripción, porque la tabla no tiene columna para ese número:
 * TOTAL es una cuota (el pago total), ABONOS_2 dos y ABONOS_3 tres. `ABONOS` a
 * secas es histórico —de cuando el único plan diferido eran dos cuotas— y se
 * lee como dos; no se escribe más. La traducción vive en `cuotasDelPlan`
 * (`src/lib/dinero.ts`), que es el único sitio que conoce esta correspondencia.
 */
export type PlanPago =
  | "CONTADO"
  | "CUOTAS"
  | "TOTAL"
  | "ABONOS"
  | "ABONOS_2"
  | "ABONOS_3";

/** Cómo paga esta inscripción: la pasarela vieja o transferencia manual. */
export type MedioPago = "WOMPI" | "TRANSFERENCIA";

/** Destinos de recaudo. Bre-B es la llave interoperable del Banco de la República. */
export type CanalPago = "BANCOLOMBIA" | "NEQUI" | "DAVIPLATA" | "BRE_B";

/**
 * Ciclo de vida de un comprobante:
 * ENVIADA → el ciclista lo subió y espera turno.
 * EN_REVISION → un revisor lo tomó (reclamo atómico, para que no lo tomen dos).
 * VERIFICADA → el dinero entró; `montoAprobado` es la cifra que cuenta.
 * RECHAZADA → no cuadró; el cupo sigue reservado y puede volver a subir.
 */
export type EstadoAbono = "ENVIADA" | "EN_REVISION" | "VERIFICADA" | "RECHAZADA";

/**
 * Un pago por transferencia con su comprobante.
 *
 * El archivo nunca vive aquí: `evidenciaClave` apunta al almacenamiento
 * privado. El SHA-256 es del contenido, para reconocer la misma captura
 * reenviada.
 */
export type Abono = {
  id: string;
  inscripcionId: string;
  creadoEn: string;
  /**
   * De 1 a 3: la cuota del plan a la que corresponde. El tope real es el
   * número de cuotas de **esta** inscripción (`cuotasDelPlan`), no una
   * constante global; MAX_CUOTAS es solo el techo de todos los planes.
   */
  numero: number;
  canal: CanalPago;
  /** En pesos, no centavos. Lo que dice el ciclista que transfirió. */
  montoDeclarado: number;
  /** ISO date (YYYY-MM-DD) que aparece en el comprobante. */
  transferidoEl?: string;
  /** Número de aprobación o referencia que imprime el banco. */
  referenciaExterna?: string;
  evidenciaClave: string;
  evidenciaTipo: string;
  evidenciaBytes: number;
  evidenciaSha256: string;
  huella?: { ip?: string; navegador?: string };
  estado: EstadoAbono;
  /** En pesos. Lo que el revisor confirma que entró; manda sobre lo declarado. */
  montoAprobado?: number;
  revisadoEn?: string;
  revisadoPor?: string;
  motivoRechazo?: string;
};

export type DatosCiclista = {
  identificacion: string;
  nombres: string;
  apellidos: string;
  sexo: "Masculino" | "Femenino";
  eps: string;
  correo: string;
  telefono: string;
  contactoEmergencia: string;
  telefonoEmergencia: string;
  direccion: string;
  fechaNacimiento: string;
  rh: string;
  referidoPor: string;
  ciudad: string;
  departamento: string;
  pais: string;
};

export type Tallas = {
  jersey: string;
  running: string;
};

/**
 * Constancia de que el ciclista autorizó los cobros futuros. Se guarda tal
 * como la vio, con hora y huella del navegador: es la evidencia que pide el
 * banco ante un contracargo.
 */
export type AutorizacionCobro = {
  aceptadaEn: string;
  texto: string;
  cuotas: { numero: number; vence: string; monto: number }[];
  ip?: string;
  navegador?: string;
};

export type Consentimientos = {
  politicaPago: boolean;
  datos: boolean;
  exoneracion: boolean;
};

export type Inscripcion = {
  id: string;
  /** Referencia legible: SX27-A4F91C */
  referencia: string;
  creadaEn: string;
  actualizadaEn: string;
  estado: EstadoInscripcion;
  categoriaCodigo: string;
  ciclista: DatosCiclista;
  tallas: Tallas;
  consentimientos: Consentimientos;
  plan: PlanPago;
  /** Por dónde cobra esta inscripción. Las nuevas nacen TRANSFERENCIA. */
  medioPago: MedioPago;
  total: number;
  pagado: number;
  cuotas: Cuota[];
  /** id de fuente de pago Wompi para cobros recurrentes */
  fuentePagoId?: number;
  autorizacionCobro?: AutorizacionCobro;
  tarjetaResumen?: { marca: string; ultimos4: string };
  /** Bitácora visible para la organización. */
  eventos: { en: string; tipo: string; detalle: string }[];
};

/**
 * Qué se sabe de la entrega de un correo, según lo que cuente el proveedor.
 *
 * SIN_CONFIRMAR es el estado honesto por defecto: el proveedor aceptó el
 * correo y nadie ha dicho nada más. No es "entregado" — aceptar es meterlo en
 * la cola de salida; entregar es que el servidor del ciclista lo reciba, y eso
 * pasa después y solo lo sabemos por webhook.
 *
 * QUEJA es el "bucle de retroalimentación" de ZeptoMail: el ciclista le dio a
 * "esto es spam". Llegó, pero conviene enterarse.
 */
export type EstadoEntrega =
  | "SIN_CONFIRMAR"
  | "ENTREGADO"
  | "ABIERTO"
  | "REBOTADO"
  | "QUEJA";

/**
 * DURO: la dirección no existe (casi siempre, mal escrita).
 * BLANDO: existe pero hoy no pudo recibir (buzón lleno, servidor caído).
 */
export type TipoRebote = "DURO" | "BLANDO";

/** Lo que los webhooks van anotando sobre un correo ya enviado. */
export type EntregaCorreo = {
  estadoEntrega: EstadoEntrega;
  entregadoEn?: string;
  rebotadoEn?: string;
  reboteTipo?: TipoRebote;
  /** Tal cual lo manda el proveedor: "relaying-issue", "user-unknown"… */
  reboteMotivo?: string;
  /** La respuesta literal del servidor del destinatario. */
  reboteDiagnostico?: string;
  abiertoEn?: string;
  quejaEn?: string;
};

export type CorreoEnviado = EntregaCorreo & {
  id: string;
  para: string;
  asunto: string;
  plantilla: string;
  html: string;
  enviadoEn: string;
  /**
   * `sin-configurar` es producción sin llave: el correo se guardó pero nunca
   * salió. Es un estado distinto de la simulación de desarrollo.
   *
   * `resend` y `brevo` son históricos. Cada correo guarda con qué proveedor
   * salió, y las filas anteriores a cada cambio siguen diciendo la verdad de
   * su momento.
   */
  proveedor: "zeptomail" | "brevo" | "resend" | "simulacion" | "sin-configurar";
  proveedorId?: string;
  /**
   * El `request_id` que devuelve el envío en la raíz de la respuesta, que es
   * por donde el webhook identifica el correo. Se guarda aparte de
   * `proveedorId` (que trae el message_id cuando la respuesta lo incluye)
   * porque no está confirmado que sean el mismo valor: guardar los dos cuesta
   * una columna, no poder emparejar deja el seguimiento inservible.
   */
  proveedorRequestId?: string;
  referencia?: string;
};

/**
 * Una fila del seguimiento de /panel/correos.
 *
 * Sin `html` a propósito: son cientos de correos de 20 KB cada uno y el
 * listado no pinta ninguno. Para ver el HTML está /correos/[id].
 */
export type CorreoSeguido = Omit<CorreoEnviado, "html"> & {
  /** Del ciclista al que se le mandó, cuando la referencia sigue existiendo. */
  ciclista?: { nombres: string; apellidos: string; identificacion: string };
};

/** Las cifras de la cabecera de /panel/correos. */
export type ResumenCorreos = {
  total: number;
  hoy: number;
  entregados: number;
  rebotados: number;
  quejas: number;
  sinConfirmar: number;
  /** Guardados en producción sin llave del proveedor: nunca salieron. */
  noSalieron: number;
  /** De desarrollo: se renderizaron pero no se mandaron a nadie. */
  simulados: number;
};
