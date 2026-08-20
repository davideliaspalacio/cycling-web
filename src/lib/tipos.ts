export type Genero = "MUJERES" | "HOMBRES" | "EQUIPOS";

export type Categoria = {
  codigo: string;
  nombre: string;
  grupo: Genero;
  requisito: string;
  /** Precio en pesos colombianos (no centavos). */
  precio: number;
  /** Distancia aproximada de la ruta, en km. */
  km: number;
  /** Desnivel positivo acumulado, en metros. */
  desnivel: number;
  destacada?: boolean;
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
  | "AL_DIA"
  | "EN_MORA"
  | "COMPLETA";

export type PlanPago = "CONTADO" | "CUOTAS";

export type DatosCiclista = {
  identificacion: string;
  nombres: string;
  apellidos: string;
  sexo: "Masculino" | "Femenino";
  eps: string;
  correo: string;
  telefono: string;
  equipo: string;
  instagram: string;
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
  reembolso: boolean;
  datos: boolean;
  exoneracion: boolean;
};

export type Inscripcion = {
  id: string;
  /** Referencia legible: TE27-A4F91C */
  referencia: string;
  creadaEn: string;
  actualizadaEn: string;
  estado: EstadoInscripcion;
  categoriaCodigo: string;
  ciclista: DatosCiclista;
  tallas: Tallas;
  consentimientos: Consentimientos;
  plan: PlanPago;
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
