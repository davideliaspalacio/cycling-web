import type { Categoria, CanalPago, Tallas } from "./tipos";

const FECHA_CARRERA = "2027-07-03";

/** Año de la carrera. Se deriva de la fecha para no repetirlo en requisitos, títulos ni avisos. */
export const ANIO_CARRERA = Number(FECHA_CARRERA.slice(0, 4));

export const EVENTO = {
  nombre: "Santander Xtreme",
  /** Va separado del año: "10ª" es la edición, "2027" es cuándo se corre. */
  edicionOrdinal: "10ª",
  anio: String(ANIO_CARRERA),
  /** Mismo año que `anio`: `src/lib/autorizacion.ts` todavía lee `edicion`. */
  edicion: String(ANIO_CARRERA),
  lema: "EL LEGADO",
  tipo: "MTB · XCM · 2 etapas",
  etapas: 2,
  fecha: FECHA_CARRERA,
  fechaLegible: `3, 4 y 5 de julio de ${ANIO_CARRERA}`,
  lugar: "Barichara, Santander",
  correoContacto: "oficialsangilxtreme@gmail.com",
  /**
   * Provisional: el documento del cliente no fija el cupo total. Solo se usa
   * para el rango del dorsal, no se anuncia en la página.
   */
  cupos: 900,
  prefijoReferencia: "SX27",
  /** El logotipo, en partes, para que web, correo y ticket digan lo mismo. */
  wordmark: { inicio: "SANTANDER", acento: "XTREME", sufijo: "XCM" },
} as const;

/** Nombre completo tal como se firma en textos legales, correos y pies de página. */
export const NOMBRE_COMPLETO = `${EVENTO.nombre} ${EVENTO.anio}`;

/* --------------------------------- Etapas ---------------------------------- */

/**
 * Las etapas de inscripción.
 *
 * Una etapa es una tarifa con su propia letra pequeña: precio, cupos, en
 * cuántas cuotas se puede repartir y si admite el descuento de referido. La
 * organización abre una etapa nueva cuando se agota la anterior, y la nueva es
 * más cara.
 *
 * ── La regla que no se puede romper ────────────────────────────────────────
 * **Cada inscripción recuerda su etapa y su precio.** No se le pregunta al
 * catálogo cuánto vale una inscripción vieja: se le pregunta a la inscripción
 * (`ins.total`, `ins.etapa`, `ins.precioBase`). Si el saldo de alguien saliera
 * de esta constante, abrir la etapa 2 le subiría la deuda a las 142 personas
 * que entraron en la 1 — gente que ya pagó una parte de otro precio.
 *
 * De aquí sale solo lo de **quien se inscribe ahora**. Todo lo demás —montos
 * de cuota, saldos, mínimos de comprobante— sale del total de su inscripción y
 * de los planes de SU etapa (`etapaDeInscripcion`).
 */
export type Etapa = {
  /** El código que se guarda en la columna `etapa`. No se cambia nunca. */
  codigo: string;
  /** Como la llama la organización. */
  nombre: string;
  /** Precio de lista, en pesos, antes de cualquier descuento. */
  precio: number;
  /** Cuántas inscripciones caben en esta etapa. */
  cupos: number;
  /**
   * Los planes de pago de esta etapa, en número de cuotas. De menos a más: es
   * el orden que ve el ciclista y el que recorre `planesViables`.
   *
   * El número de cuotas es a la vez el número de comprobantes: uno por cuota,
   * no una bolsa de abonos libres. "1 cuota" es el pago total de siempre,
   * modelado como un plan más para no mantener dos caminos.
   */
  planes: readonly number[];
  /**
   * Porcentaje de descuento que aplica un código de referido válido en esta
   * etapa. 0 = esta etapa no admite descuento.
   *
   * ── Por qué el porcentaje vive en la etapa y no en el código ─────────────
   * Porque así lo pidió la organización: el 10% es una condición de la etapa 2
   * («10% con código de referido»), no algo que se negocie embajador por
   * embajador. Un solo número que cambiar, y ningún riesgo de que veinte
   * códigos se desincronicen entre ellos.
   *
   * Lo que podría dar miedo —que cambiar el porcentaje mueva lo ya cobrado— no
   * puede pasar: la inscripción guarda el descuento **en pesos**
   * (`ins.descuento`), no el porcentaje. Esta cifra solo decide lo que se le
   * aplica a quien se inscribe ahora.
   *
   * Si algún día hace falta un porcentaje por código, la tabla
   * `codigos_referido` admite una columna nueva con DEFAULT NULL que signifique
   * «usa el de la etapa»; nada de lo de aquí tendría que cambiar.
   */
  descuento: number;
};

export const ETAPAS: readonly Etapa[] = [
  {
    codigo: "ETAPA_1",
    nombre: "Creyentes",
    precio: 380000,
    cupos: 150,
    planes: [1, 2, 3],
    descuento: 0,
  },
  {
    codigo: "ETAPA_2",
    nombre: "Segunda etapa",
    precio: 470000,
    cupos: 250,
    planes: [1, 2, 3, 4],
    descuento: 10,
  },
] as const;

/**
 * La etapa que se le aplica a quien se inscribe ahora.
 *
 * Es un valor escrito a mano y no «la última de la lista» a propósito: abrir
 * una etapa tiene que ser una decisión explícita de una línea, no el efecto
 * colateral de añadir una fila más abajo.
 */
export const CODIGO_ETAPA_ACTIVA = "ETAPA_2";

export function etapaPorCodigo(codigo: string | undefined): Etapa | undefined {
  return codigo ? ETAPAS.find((e) => e.codigo === codigo) : undefined;
}

/** La etapa activa. Si el código no existiera, el arranque falla y se ve. */
export const ETAPA_ACTIVA: Etapa = (() => {
  const etapa = etapaPorCodigo(CODIGO_ETAPA_ACTIVA);
  if (!etapa) {
    throw new Error(
      `CODIGO_ETAPA_ACTIVA apunta a «${CODIGO_ETAPA_ACTIVA}», que no está en ETAPAS.`,
    );
  }
  return etapa;
})();

/**
 * La etapa de una inscripción ya guardada.
 *
 * El respaldo es la etapa 1 y no la activa: las filas anteriores a esta
 * columna son todas de la primera etapa, y suponer la activa les cambiaría los
 * planes de pago y el precio de referencia de un despliegue a otro.
 */
export const CODIGO_ETAPA_HISTORICA = "ETAPA_1";

export function etapaDeInscripcion(ins: { etapa?: string }): Etapa {
  return (
    etapaPorCodigo(ins.etapa) ??
    etapaPorCodigo(CODIGO_ETAPA_HISTORICA) ??
    ETAPA_ACTIVA
  );
}

/**
 * Precio de la inscripción de quien se inscribe **ahora**.
 *
 * Sigue existiendo con este nombre porque la portada, el Open Graph y los
 * metadatos anuncian la tarifa vigente, que es exactamente esto. Nada que
 * calcule el saldo de una inscripción puede usarlo.
 */
export const PRECIO_INSCRIPCION = ETAPA_ACTIVA.precio;

/** Número de cuotas del plan de financiación. */
export const CUOTAS_DEL_PLAN = 4;

/** Día del mes en que se cobra cada cuota. */
export const DIA_DE_COBRO = 5;

/* ------------------------- Pago manual por transferencia ------------------- */

/**
 * Los planes de pago de la etapa activa — ver docs/decisiones-pago-manual.md §1.
 *
 * Es lo que se le ofrece a quien se inscribe hoy. Los planes de una
 * inscripción ya existente salen de SU etapa (`etapaDeInscripcion(ins).planes`),
 * nunca de aquí: las de la etapa 1 siguen con 1–3 aunque la activa llegue a 4.
 */
export const PLANES_DE_CUOTAS = ETAPA_ACTIVA.planes;

/** El plan más largo de la etapa activa. */
export const MAX_CUOTAS = Math.max(...PLANES_DE_CUOTAS);

/**
 * Días de plazo entre dos cuotas consecutivas — ver
 * docs/decisiones-pago-manual.md §2.
 *
 * Se cuentan desde la fecha de inscripción, no desde que la organización
 * verifica el comprobante anterior: el ciclista no controla cuándo revisamos, y
 * anclarlo a la revisión le movería las fechas bajo los pies. Con tres cuotas
 * la última cae a los 90 días.
 */
export const DIAS_ENTRE_CUOTAS = 45;

/**
 * Margen mínimo, en días, que tiene que quedar entre la **última** cuota de un
 * plan y `FECHA_LIMITE_ABONOS` para poder ofrecerlo.
 *
 * Por qué existe: cada fecha se acota contra el cierre, así que quien se
 * inscriba tarde vería un plan con las fechas aplastadas una contra otra. Con
 * menos de dos semanas de separación el plazo deja de serlo y pasa a ser una
 * trampa —hay que transferir, y además nos tiene que dar tiempo de revisarlo
 * antes del cierre—, así que ese plan no se ofrece y la interfaz dice por qué.
 *
 * El pago total (una cuota) no pasa por este filtro: se admite hasta el cierre.
 */
export const MARGEN_MINIMO_CUOTAS = 15;

/**
 * DECISIÓN PENDIENTE DE CONFIRMAR — ver docs/decisiones-pago-manual.md §4.
 * Cuántos días antes de la carrera se cierra la recepción de abonos.
 */
export const DIAS_CIERRE_ABONOS = 30;

/**
 * Último día para subir un comprobante, derivado de la fecha de carrera para
 * que mover el evento mueva el plazo solo.
 */
export const FECHA_LIMITE_ABONOS = (() => {
  const [y, m, d] = FECHA_CARRERA.split("-").map(Number);
  const limite = new Date(Date.UTC(y, m - 1, d - DIAS_CIERRE_ABONOS));
  return limite.toISOString().slice(0, 10);
})();

export type CuentaRecaudo = {
  canal: CanalPago;
  /** Nombre del destino tal como lo ve el ciclista. */
  entidad: string;
  /** "Ahorros", "Nequi", "Llave Bre-B"… */
  tipo: string;
  numero: string;
  titular: string;
  /**
   * Código QR de la organización, si lo hay. Escanearlo evita el error más
   * caro del pago manual: transcribir mal un dígito de la cuenta.
   */
  qr?: string;
  /** Una línea de cómo se paga por aquí, para que la tarjeta no quede muda. */
  como: string;
};

/**
 * Dónde transfiere el ciclista.
 *
 * Los números salen de variables de entorno: cambiar una cuenta no debería
 * exigir un despliegue de código, y el repo no tiene por qué llevar los datos
 * bancarios de la organización escritos a mano. El respaldo es el valor real
 * en producción hoy, para que la demo funcione sin configurar nada.
 *
 * OJO para la interfaz: estas variables no llevan prefijo NEXT_PUBLIC_, así
 * que en el navegador valen `undefined` y aquí gana el respaldo. Si se
 * configura un número distinto por entorno, hay que pasar `CUENTAS_RECAUDO`
 * desde un componente de servidor; leerlo dentro de un componente de cliente
 * daría un valor en el servidor y otro en el navegador.
 */
/*
 * El nombre que el ciclista va a ver en su banco al confirmar la
 * transferencia. Tiene que ser el del titular real de la cuenta: si la página
 * dice una cosa y el banco muestra otra, la transferencia parece una estafa y
 * la gente no la completa.
 */
export const TITULAR_RECAUDO =
  process.env.RECAUDO_TITULAR ?? "Carlos Eduardo Burgos Prada";

const CUENTA_BANCOLOMBIA = process.env.RECAUDO_BANCOLOMBIA ?? "32200001101";
const CELULAR_RECAUDO = process.env.RECAUDO_CELULAR ?? "3106651613";
/** La llave Bre-B de la cuenta Bancolombia es un alias, no el celular. */
const LLAVE_BRE_B = process.env.RECAUDO_LLAVE_BRE_B ?? "@santanderxtreme";

export const CUENTAS_RECAUDO: CuentaRecaudo[] = [
  {
    canal: "BANCOLOMBIA",
    entidad: "Bancolombia",
    tipo: "Cuenta de ahorros",
    numero: CUENTA_BANCOLOMBIA,
    titular: TITULAR_RECAUDO,
      como: "Transferencia desde tu banco, o en efectivo en cualquier corresponsal.",
  },
  {
    canal: "NEQUI",
    entidad: "Nequi",
    tipo: "Celular",
    numero: CELULAR_RECAUDO,
    titular: TITULAR_RECAUDO,
    qr: "/qr/nequi.jpg",
      como: "Desde la app de Nequi: envía a un celular o escanea el QR.",
  },
  {
    canal: "DAVIPLATA",
    entidad: "Daviplata",
    tipo: "Celular",
    numero: CELULAR_RECAUDO,
    titular: TITULAR_RECAUDO,
      como: "Desde la app de Daviplata: envía a un celular.",
  },
  {
    canal: "BRE_B",
    entidad: "Bre-B · Bancolombia",
    tipo: "Llave",
    numero: LLAVE_BRE_B,
    titular: TITULAR_RECAUDO,
    qr: "/qr/bancolombia.jpg",
      como: "Desde la app de cualquier banco: busca la llave o escanea el QR.",
  },
];

export function cuentaDeCanal(canal: CanalPago): CuentaRecaudo | undefined {
  return CUENTAS_RECAUDO.find((c) => c.canal === canal);
}

export const CANALES_PAGO = CUENTAS_RECAUDO.map((c) => c.canal);

const AL_CIERRE = `al 31 de diciembre de ${ANIO_CARRERA}`;

export const CATEGORIAS: Categoria[] = [
  // — Hombres —
  {
    codigo: "SENIOR",
    nombre: "Senior",
    grupo: "HOMBRES",
    requisito: `Entre 18 y 29 años ${AL_CIERRE}.`,
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "MASTER-A",
    nombre: "Master A",
    grupo: "HOMBRES",
    requisito: `Entre 30 y 39 años ${AL_CIERRE}.`,
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "MASTER-B",
    nombre: "Master B",
    grupo: "HOMBRES",
    requisito: `Entre 40 y 49 años ${AL_CIERRE}.`,
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "MASTER-C",
    nombre: "Master C",
    grupo: "HOMBRES",
    requisito: `50 años o más ${AL_CIERRE}.`,
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "BULL-90K",
    nombre: "Bull 90K",
    grupo: "HOMBRES",
    // El 90 es de kilos, no de kilómetros: es una categoría de peso y el
    // pesaje se hace al terminar, no al inscribirse.
    requisito:
      "90 kilos obligatorios al finalizar las dos etapas de competencia.",
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "PAREJAS-HOMBRES",
    nombre: "Parejas Hombres",
    grupo: "HOMBRES",
    requisito: "Dos ciclistas hombres, edad libre. Se inscribe cada uno por separado.",
    precio: PRECIO_INSCRIPCION,
  },
  // — Mujeres —
  {
    codigo: "DAMAS-OPEN",
    nombre: "Damas Open",
    grupo: "MUJERES",
    requisito: "Categoría abierta, edad libre.",
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "DAMAS-MASTER-A",
    nombre: "Damas Master A",
    grupo: "MUJERES",
    requisito: `35 años o más ${AL_CIERRE}.`,
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "DAMAS-AFICIONADAS",
    nombre: "Damas Aficionadas",
    grupo: "MUJERES",
    requisito: "Edad libre.",
    precio: PRECIO_INSCRIPCION,
  },
  // — Mixtas —
  {
    codigo: "PAREJAS-MIXTAS",
    nombre: "Parejas Mixtas",
    grupo: "MIXTAS",
    requisito:
      "Dos ciclistas, un hombre y una mujer, edad libre. Se inscribe cada uno por separado.",
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "EBIKE-MTB",
    nombre: "E-Bike MTB",
    grupo: "MIXTAS",
    requisito: "Categoría promocional para bicicleta eléctrica de montaña.",
    precio: PRECIO_INSCRIPCION,
  },
  {
    codigo: "SPORT-RECREATIVOS",
    nombre: "Sport Recreativos",
    grupo: "MIXTAS",
    requisito: "Modalidad recreativa, edad libre.",
    precio: PRECIO_INSCRIPCION,
  },
];

const TITULOS_DE_GRUPO: { id: Categoria["grupo"]; titulo: string }[] = [
  { id: "HOMBRES", titulo: "Hombres" },
  { id: "MUJERES", titulo: "Mujeres" },
  { id: "MIXTAS", titulo: "Mixtas y recreativas" },
];

export function categoriasDeGrupo(grupo: Categoria["grupo"]): Categoria[] {
  return CATEGORIAS.filter((c) => c.grupo === grupo);
}

export const GRUPOS = TITULOS_DE_GRUPO.map((g) => {
  const cuantas = categoriasDeGrupo(g.id).length;
  return {
    ...g,
    nota: cuantas === 1 ? "Una categoría" : `${cuantas} categorías`,
  };
});

export function categoriaPorCodigo(codigo: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.codigo === codigo);
}

/**
 * Km y desnivel son opcionales y hoy no los trae ninguna categoría: el
 * reglamento todavía no publica las distancias. Donde no hay dato, no se
 * muestra la línea — antes se creyó que el 90 de Bull eran kilómetros y son
 * kilos de peso del ciclista.
 */
export function recorridoDe(categoria?: {
  km?: number;
  desnivel?: number;
}): string | null {
  if (!categoria) return null;
  const partes: string[] = [];
  if (categoria.km) partes.push(`${categoria.km} km`);
  if (categoria.desnivel) {
    partes.push(`${categoria.desnivel.toLocaleString("es-CO")} m D+`);
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}

export const TALLAS = ["XS", "S", "M", "L", "XL", "XXL"];

/** Las dos prendas del kit. El nombre sale de aquí en formulario, ticket y correo. */
export const PRENDAS: { campo: keyof Tallas; nombre: string }[] = [
  { campo: "jersey", nombre: "Talla Jersey Oficial" },
  { campo: "running", nombre: `Talla Camiseta Premium ${EVENTO.edicionOrdinal}` },
];

export const TIPOS_RH = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

/** Municipios frecuentes con su departamento, para autocompletar. Santander primero. */
export const MUNICIPIOS: Record<string, string> = {
  Bucaramanga: "Santander",
  Barichara: "Santander",
  "San Gil": "Santander",
  Socorro: "Santander",
  Piedecuesta: "Santander",
  Floridablanca: "Santander",
  Girón: "Santander",
  Barbosa: "Santander",
  Málaga: "Santander",
  Vélez: "Santander",
  Bogotá: "Cundinamarca",
  Medellín: "Antioquia",
  Cali: "Valle del Cauca",
  Barranquilla: "Atlántico",
  Cartagena: "Bolívar",
  Cúcuta: "Norte de Santander",
  Ocaña: "Norte de Santander",
  Duitama: "Boyacá",
  Sogamoso: "Boyacá",
  Paipa: "Boyacá",
  Tunja: "Boyacá",
  Pereira: "Risaralda",
  Manizales: "Caldas",
  Armenia: "Quindío",
  Ibagué: "Tolima",
  Villavicencio: "Meta",
  Neiva: "Huila",
  Popayán: "Cauca",
  Pasto: "Nariño",
  "Santa Marta": "Magdalena",
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
  Girardot: "Cundinamarca",
  Facatativá: "Cundinamarca",
  Envigado: "Antioquia",
  Rionegro: "Antioquia",
  Sabaneta: "Antioquia",
  Palmira: "Valle del Cauca",
  Tuluá: "Valle del Cauca",
};

/** Embajadores y comunidades que traen ciclistas al evento. */
export const EMBAJADORES = [
  // Orden y grafía tal como los envía la organización. Las ciudades van
  // completas y no abreviadas: en un desplegable para ciclistas de todo el
  // país, "BGA" no lo lee igual alguien de Nariño que alguien de Santander.
  "PichurriasBike – Bucaramanga",
  "Team4am – Bucaramanga",
  "CandelerosRace – Bogotá",
  "DanielaFonseca – Bogotá",
  "PerfumadosMtb – Barbosa",
  "YeraldineJaramillo – Ocaña",
  "Ultrabga – Bucaramanga",
  "MikeOrtiz – Bucaramanga",
  "ParcerosSantander – Bucaramanga",
  "SussyPerez – Barbosa",
  "TeamBoyaca – Duitama",
  "ParcerosMedellin – Medellín",
  "TeamCuervosBike – San Gil",
  "TiendaBikeFull – Piedecuesta",
  "DementesBike – Bogotá",
  "Evolutionbike – Bogotá",
  "Chocorramito – Bogotá",
  "GoyeBike – Bogotá",
  "EspecializedBucaramanga – Bucaramanga",
  "EspecializedTunja – Tunja",
  "SabanaBike – Duitama",
  "LaFugaMTB – San Andrés",
];

/** Opción del selector que abre el campo libre para una comunidad nueva. */
export const OTRO_EMBAJADOR = "Otro";

/* --------------------------- Códigos de referido --------------------------- */

/** Lo máximo que puede medir un código. Se dicta por WhatsApp: corto. */
export const LARGO_MAX_CODIGO = 24;

/**
 * Un código, siempre escrito igual.
 *
 * El código es la clave de su tabla y lo que guarda la inscripción, así que
 * "pichurrias10", "PICHURRIAS10" y " Pichurrias 10 " tienen que ser el mismo
 * código o el ciclista escribe bien y el sistema le dice que no existe. Se
 * normaliza en los dos extremos: al crearlo en el panel y al recibirlo del
 * formulario.
 *
 * Solo letras sin tilde, números, guion y guion bajo: lo que se puede dictar
 * por teléfono sin aclarar nada.
 */
export function normalizarCodigo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, LARGO_MAX_CODIGO);
}
