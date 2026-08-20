import { z } from "zod";
import { CATEGORIAS, TALLAS, TIPOS_RH } from "./catalogo";

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
  equipo: z.string().trim().max(60).default(""),
  instagram: z.string().trim().max(40).default(""),
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
  reembolso: z.literal(true),
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
export function edadEnCarrera(fechaNacimiento: string, anioCarrera = 2027): number {
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
    JUVENIL: [18, 29],
    "MASTER-A1": [30, 34],
    "MASTER-A2": [35, 39],
    "MASTER-B1": [40, 44],
    "MASTER-B2": [45, 49],
    "MASTER-C": [50, 59],
    "MASTER-D": [60, 120],
    DAMAS: [18, 34],
    "DAMAS-MASTER": [35, 120],
  };
  const rango = rangos[codigo];
  if (!rango) return null;
  if (edad < rango[0] || edad > rango[1]) {
    return `Cumples ${edad} años en 2027 y esta categoría es para ${rango[0]}${rango[1] > 100 ? " años o más" : ` a ${rango[1]} años`}. Puedes seguir, pero la organización va a pedirte que la cambies.`;
  }
  return null;
}

export const esquemaTarjeta = z.object({
  numero: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => /^\d{13,19}$/.test(v), "El número de la tarjeta no está completo."),
  titular: texto(3, 60, "el nombre del titular"),
  mesExp: z.string().regex(/^(0[1-9]|1[0-2])$/, "Mes inválido."),
  anioExp: z.string().regex(/^\d{2}$/, "Año inválido."),
  cvc: z.string().regex(/^\d{3,4}$/, "El código son 3 o 4 dígitos."),
});
