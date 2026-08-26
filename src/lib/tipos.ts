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
 * TOTAL y ABONOS son los del pago manual por transferencia.
 */
export type PlanPago = "CONTADO" | "CUOTAS" | "TOTAL" | "ABONOS";

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
  /** 1..3 — ver MAX_ABONOS. */
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

export type CorreoEnviado = {
  id: string;
  para: string;
  asunto: string;
  plantilla: string;
  html: string;
  enviadoEn: string;
  proveedor: "resend" | "simulacion";
  proveedorId?: string;
  referencia?: string;
};
