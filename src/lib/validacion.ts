import { z } from "zod";
import {
  ANIO_CARRERA,
  CANALES_PAGO,
  CATEGORIAS,
  TALLAS,
  TIPOS_RH,
} from "./catalogo";

const texto = (min: number, max: number, campo: string) =>
  z
    .string()
    .trim()
    .min(min, `Escribe ${campo}.`)
    .max(max, `${campo} es demasiado largo.`);

const soloLetras = /^[\p{L}\p{M}\s'.-]+$/u;

export const esquemaCiclista = z.object({
  identificacion: z
    .string()
    .trim()
    .regex(/^\d{5,15}$/, "El documento son solo números, entre 5 y 15 dígitos."),
  nombres: texto(2, 60, "tus nombres").regex(
    soloLetras,
    "Los nombres llevan solo letras.",
  ),
  apellidos: texto(2, 60, "tus apellidos").regex(
    soloLetras,
    "Los apellidos llevan solo letras.",
  ),
  sexo: z.enum(["Masculino", "Femenino"]),
  eps: z.string().trim().max(60).default(""),
  correo: z.string().trim().toLowerCase().email("Revisa el correo: falta el @ o el dominio."),
  telefono: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "El celular son entre 7 y 15 dígitos, sin espacios."),
  contactoEmergencia: texto(3, 80, "el nombre de tu contacto de emergencia"),
  telefonoEmergencia: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "El teléfono de emergencia son entre 7 y 15 dígitos."),
  direccion: texto(5, 120, "tu dirección"),
  fechaNacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Elige tu fecha de nacimiento."),
  rh: z.enum(TIPOS_RH as [string, ...string[]]),
  referidoPor: z.string().trim().max(60).default(""),
  ciudad: texto(2, 60, "tu ciudad"),
  departamento: texto(2, 60, "tu departamento"),
  pais: z.string().trim().default("Colombia"),
});

export const esquemaTallas = z.object({
  jersey: z.enum(TALLAS as [string, ...string[]]),
  running: z.enum(TALLAS as [string, ...string[]]),
});

export const esquemaConsentimientos = z.object({
  politicaPago: z.literal(true),
  datos: z.literal(true),
  exoneracion: z.literal(true),
});

export const esquemaInscripcion = z.object({
  categoriaCodigo: z.enum(
    CATEGORIAS.map((c) => c.codigo) as [string, ...string[]],
  ),
  ciclista: esquemaCiclista,
  tallas: esquemaTallas,
  consentimientos: esquemaConsentimientos,
});

export type EntradaInscripcion = z.infer<typeof esquemaInscripcion>;

/** Edad cumplida al 31 de diciembre del año de la carrera. */
export function edadEnCarrera(
  fechaNacimiento: string,
  anioCarrera = ANIO_CARRERA,
): number {
  const nacimiento = new Date(fechaNacimiento);
  return anioCarrera - nacimiento.getUTCFullYear();
}

/**
 * Regla del reglamento: la categoría debe coincidir con la edad.
 * Devuelve un aviso legible, no un error: la organización siempre revisa
 * manualmente y no queremos bloquear casos límite en el formulario.
 */
export function avisoDeCategoria(
  codigo: string,
  fechaNacimiento: string,
): string | null {
  if (!fechaNacimiento) return null;
  const edad = edadEnCarrera(fechaNacimiento);
  const rangos: Record<string, [number, number]> = {
    SENIOR: [18, 29],
    "MASTER-A": [30, 39],
    "MASTER-B": [40, 49],
    "MASTER-C": [50, 120],
    "DAMAS-MASTER-A": [35, 120],
  };
  const rango = rangos[codigo];
  if (!rango) return null;
  if (edad < rango[0] || edad > rango[1]) {
    return `Cumples ${edad} años en ${ANIO_CARRERA} y esta categoría es para ${rango[0]}${rango[1] > 100 ? " años o más" : ` a ${rango[1]} años`}. Puedes seguir, pero la organización va a pedirte que la cambies.`;
  }
  return null;
}

/**
 * Los campos de texto que acompañan a un comprobante.
 *
 * Llegan de un `multipart/form-data`, así que todo entra como cadena; por eso
 * el monto se convierte aquí y no se confía en que venga como número. El
 * archivo NO se valida con zod: eso se hace mirando sus bytes en
 * `src/lib/almacenamiento.ts`.
 *
 * Aquí el monto solo se comprueba como cifra: que sean pesos enteros y
 * positivos. **El mínimo real ya no es una constante** —desde el plan de dos
 * cuotas depende de si es el primer comprobante o el segundo y de cuánto se
 * verificó antes—, así que esa regla vive en `montoMinimoDeAbono`
 * (`src/lib/servicio.ts`), que es el único sitio que conoce la inscripción.
 */
export const esquemaAbono = z.object({
  referencia: texto(4, 40, "la referencia de tu inscripción").toUpperCase(),
  canal: z.enum(CANALES_PAGO as [string, ...string[]]),
  montoDeclarado: z
    .string()
    .trim()
    // El ciclista escribe "150.000" o "150000"; los dos son el mismo número.
    .transform((v) => v.replace(/[^\d]/g, ""))
    .refine((v) => v.length > 0, "Escribe cuánto transferiste.")
    .transform(Number)
    .refine(
      (v) => Number.isInteger(v) && v > 0,
      "El monto son pesos enteros, sin centavos.",
    ),
  transferidoEl: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha de la transferencia.")
    .optional(),
  referenciaExterna: z.string().trim().max(60).optional(),
});

export type EntradaAbono = z.infer<typeof esquemaAbono>;
