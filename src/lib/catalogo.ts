import type { Categoria } from "./tipos";

export const EVENTO = {
  nombre: "Tibet Epic XCM",
  edicion: "2027",
  lema: "Ready to Race",
  fecha: "2027-04-24",
  fechaLegible: "24 de abril de 2027",
  lugar: "Tibetá, Cundinamarca",
  altitudMax: 3420,
  cupos: 900,
  correoContacto: "contacto@tibetepic.com",
  cierreInscripciones: "2027-04-01",
} as const;

/** Número de cuotas del plan de financiación. */
export const CUOTAS_DEL_PLAN = 4;

/** Día del mes en que se cobra cada cuota. */
export const DIA_DE_COBRO = 5;

export const CATEGORIAS: Categoria[] = [
  // — Mujeres —
  {
    codigo: "PRO-DAMAS",
    nombre: "Pro Damas",
    grupo: "MUJERES",
    requisito: "Categoría abierta. Élite y ex profesionales de los últimos 4 años.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
    destacada: true,
  },
  {
    codigo: "DAMAS-MASTER",
    nombre: "Damas Master",
    grupo: "MUJERES",
    requisito: "35 años o más al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "DAMAS",
    nombre: "Damas",
    grupo: "MUJERES",
    requisito: "Entre 18 y 34 años al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "RUTA-CORTA-F",
    nombre: "Ruta Corta Damas",
    grupo: "MUJERES",
    requisito: "Edad abierta desde los 18 años.",
    precio: 750000,
    km: 48,
    desnivel: 1240,
  },
  // — Hombres —
  {
    codigo: "PRO-HOMBRES",
    nombre: "Pro Hombres",
    grupo: "HOMBRES",
    requisito: "Categoría abierta. Élite y ex profesionales de los últimos 4 años.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
    destacada: true,
  },
  {
    codigo: "MASTER-D",
    nombre: "Master D",
    grupo: "HOMBRES",
    requisito: "60 años o más al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "MASTER-C",
    nombre: "Master C",
    grupo: "HOMBRES",
    requisito: "Entre 50 y 59 años al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "MASTER-B2",
    nombre: "Master B2",
    grupo: "HOMBRES",
    requisito: "Entre 45 y 49 años al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "MASTER-B1",
    nombre: "Master B1",
    grupo: "HOMBRES",
    requisito: "Entre 40 y 44 años al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "MASTER-A2",
    nombre: "Master A2",
    grupo: "HOMBRES",
    requisito: "Entre 35 y 39 años al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "MASTER-A1",
    nombre: "Master A1",
    grupo: "HOMBRES",
    requisito: "Entre 30 y 34 años al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "JUVENIL",
    nombre: "Juvenil",
    grupo: "HOMBRES",
    requisito: "Entre 18 y 29 años al 31 de diciembre de 2027.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "RUTA-CORTA-M",
    nombre: "Ruta Corta Hombres",
    grupo: "HOMBRES",
    requisito: "Edad abierta desde los 18 años.",
    precio: 750000,
    km: 48,
    desnivel: 1240,
  },
  // — Equipos —
  {
    codigo: "DUO-MIXTO",
    nombre: "Dúo Mixto",
    grupo: "EQUIPOS",
    requisito: "Dos ciclistas, un hombre y una mujer. Se inscribe cada uno por separado.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
  {
    codigo: "DUO-ABIERTO",
    nombre: "Dúo Abierto",
    grupo: "EQUIPOS",
    requisito: "Dos ciclistas del mismo género. Se inscribe cada uno por separado.",
    precio: 750000,
    km: 92,
    desnivel: 2850,
  },
];

export const GRUPOS: { id: Categoria["grupo"]; titulo: string; nota: string }[] = [
  { id: "MUJERES", titulo: "Mujeres", nota: "Cuatro categorías" },
  { id: "HOMBRES", titulo: "Hombres", nota: "Nueve categorías" },
  { id: "EQUIPOS", titulo: "Equipos", nota: "Dos modalidades en pareja" },
];

export function categoriaPorCodigo(codigo: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.codigo === codigo);
}

export const TALLAS = ["XS", "S", "M", "L", "XL", "XXL"];

export const TIPOS_RH = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

/** Municipios frecuentes con su departamento, para autocompletar. */
export const MUNICIPIOS: Record<string, string> = {
  Bogotá: "Cundinamarca",
  Medellín: "Antioquia",
  Cali: "Valle del Cauca",
  Barranquilla: "Atlántico",
  Cartagena: "Bolívar",
  Bucaramanga: "Santander",
  Pereira: "Risaralda",
  Manizales: "Caldas",
  Armenia: "Quindío",
  Ibagué: "Tolima",
  Villavicencio: "Meta",
  Neiva: "Huila",
  Tunja: "Boyacá",
  Popayán: "Cauca",
  Pasto: "Nariño",
  "Santa Marta": "Magdalena",
  Cúcuta: "Norte de Santander",
  Montería: "Córdoba",
  Sincelejo: "Sucre",
  Valledupar: "Cesar",
  Riohacha: "La Guajira",
  Quibdó: "Chocó",
  Florencia: "Caquetá",
  Yopal: "Casanare",
  Arauca: "Arauca",
  Mocoa: "Putumayo",
  Leticia: "Amazonas",
  Chía: "Cundinamarca",
  Zipaquirá: "Cundinamarca",
  Fusagasugá: "Cundinamarca",
  Sopó: "Cundinamarca",
  Envigado: "Antioquia",
  Rionegro: "Antioquia",
  Sabaneta: "Antioquia",
  Palmira: "Valle del Cauca",
  Tuluá: "Valle del Cauca",
  Duitama: "Boyacá",
  Sogamoso: "Boyacá",
  Paipa: "Boyacá",
  Girardot: "Cundinamarca",
  Facatativá: "Cundinamarca",
};

export const REFERIDORES = [
  "Un amigo ciclista",
  "Mi tienda de bicicletas",
  "Instagram",
  "Strava",
  "Edición anterior del Tibet Epic",
  "Mi equipo o club",
];
