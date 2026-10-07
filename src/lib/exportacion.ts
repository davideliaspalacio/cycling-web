import {
  ANIO_CARRERA,
  EVENTO,
  PRENDAS,
  TALLAS,
  categoriaPorCodigo,
  etapaDeInscripcion,
  etapaPorCodigo,
} from "./catalogo";
import { edadEnCarrera } from "./validacion";
import type { EstadoInscripcion, Inscripcion } from "./tipos";

/**
 * La lista de inscritos, para mandársela a quien no entra al panel.
 *
 * ── Por qué CSV y no otra cosa ──────────────────────────────────────────────
 * El destinatario es el del cronometraje, el que manda a hacer las camisetas y
 * la brigada médica. Abren el archivo en Excel y punto. CSV es lo único que
 * abren los tres sin instalar nada, y lo único que esta app puede generar sin
 * meter una dependencia nueva para escribir .xlsx.
 *
 * CSV tiene dos trampas conocidas y las dos están resueltas aquí:
 *
 *  1. **Los acentos.** Excel en Windows no supone UTF-8: sin marca al
 *     principio del archivo lee el byte como Latin-1 y "Girón" sale "GirÃ³n".
 *     Por eso el archivo empieza por BOM (`﻿`). Con BOM, Excel, Numbers y
 *     LibreOffice aciertan sin preguntar.
 *
 *  2. **Los documentos.** Una cédula es una cadena de dígitos, no un número.
 *     Si se escribe pelada, Excel la convierte a número y un documento de diez
 *     dígitos aparece como 1,08E+09 — y de paso se come los ceros de la
 *     izquierda. La única forma de que Excel lo trate como texto desde un CSV
 *     es escribir la celda como `="1080123456"`: la lee como fórmula, la
 *     fórmula es una cadena literal, y queda texto. Lo mismo con los celulares.
 *
 * El separador es `;` y no `,` porque el Excel en español usa el punto y coma
 * como separador de listas; con coma, todo se apilaría en la columna A.
 *
 * ── Por qué varios archivos y no uno ───────────────────────────────────────
 * Cada uno de estos archivos sale de la organización hacia un tercero. El que
 * imprime las camisetas no necesita —y no debería tener— el RH, la dirección
 * ni el teléfono de la madre de nadie: necesita cuántas M y cuántas L. Un
 * único archivo con todo obligaría a mandar la base entera cada vez, y la
 * base son datos personales de cientos de personas.
 *
 * Así que hay una vista por conversación real, cada una con lo mínimo, y la
 * vista `completa` —que sí lo lleva todo— es para la organización misma.
 */

/* --------------------------------- El CSV --------------------------------- */

/** Punto y coma: es lo que espera el Excel configurado en español. */
const SEPARADOR = ";";

/**
 * Marca de orden de bytes. Tres bytes al principio del archivo que le dicen a
 * Excel "esto es UTF-8". Sin ella se pierden todos los acentos.
 */
const BOM = "﻿";

/** Windows: Excel viejo se traga el \n solo, pero \r\n no falla en ningún lado. */
const FIN_DE_LINEA = "\r\n";

/**
 * Una celda de texto, escapada.
 *
 * El `'` delante de los signos que abren fórmula no es cosmética: una celda
 * que empieza por `=`, `+`, `@` o `-` la ejecuta Excel al abrir el archivo, y
 * ese es el agujero clásico de la inyección por CSV. Aquí los datos vienen de
 * un formulario público, así que se neutralizan siempre.
 */
function celda(valor: unknown): string {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * Una celda que Excel tiene que leer como texto sí o sí: documentos y
 * teléfonos. Ver la nota 2 de arriba.
 *
 * Solo se aplica a cadenas de puros dígitos. Cualquier otra cosa vuelve por
 * `celda()`, para no fabricar una fórmula con contenido que no controlamos.
 */
function celdaTexto(valor: string): string {
  const limpio = valor?.trim() ?? "";
  if (!/^\d+$/.test(limpio)) return celda(limpio);
  return `"=""${limpio}"""`;
}

/** Un número que sí es un número: pesos, edades, cantidades. Sin separadores. */
function celdaNumero(valor: number): string {
  return String(valor);
}

/* ------------------------------- Las vistas -------------------------------- */

export type VistaExport = "completa" | "cronometraje" | "camisetas" | "medica";

export const VISTAS: {
  clave: VistaExport;
  titulo: string;
  paraQuien: string;
  queLleva: string;
}[] = [
  {
    clave: "completa",
    titulo: "Lista completa",
    paraQuien: "Para la organización",
    queLleva:
      "Todo lo que llenó cada inscrito y cómo va de pago. Son datos personales de cientos de personas: no la mandes por WhatsApp ni se la pases a un proveedor.",
  },
  {
    clave: "cronometraje",
    titulo: "Cronometraje",
    paraQuien: "Para quien monta los dorsales y los tiempos",
    queLleva:
      "Referencia, nombre, documento, sexo, edad en carrera, categoría y si está a paz y salvo. Sin correo, sin dirección y sin datos de salud.",
  },
  {
    clave: "camisetas",
    titulo: "Conteo de tallas",
    paraQuien: "Para quien manda a hacer el kit",
    queLleva:
      "Cuántas prendas de cada talla hay que pedir, por prenda. No lleva ni un solo dato personal: son cifras.",
  },
  {
    clave: "medica",
    titulo: "Brigada médica",
    paraQuien: "Para el puesto de atención en carrera",
    queLleva:
      "Nombre, documento, categoría, RH, EPS, celular y a quién llamar. Sin datos de pago ni de dirección.",
  },
];

const nombreDeCategoria = (i: Inscripcion) =>
  categoriaPorCodigo(i.categoriaCodigo)?.nombre ?? i.categoriaCodigo;

const ESTADO_LEGIBLE: Record<EstadoInscripcion, string> = {
  BORRADOR: "Sin terminar",
  PENDIENTE_PAGO: "Sin pagar",
  EN_VERIFICACION: "Por verificar",
  AL_DIA: "Al día",
  EN_MORA: "En mora",
  COMPLETA: "Completa",
};

export const ESTADOS_INSCRIPCION = Object.keys(
  ESTADO_LEGIBLE,
) as EstadoInscripcion[];

export function textoDeEstado(estado: EstadoInscripcion): string {
  return ESTADO_LEGIBLE[estado];
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Una vista: sus encabezados y una función que convierte las inscripciones en
 * filas ya escapadas. Devuelve las filas y no una tabla de valores porque cada
 * columna sabe si es texto, número o documento, y eso no se puede adivinar
 * después.
 */
type Constructor = {
  encabezados: string[];
  filas: (inscripciones: Inscripcion[]) => string[][];
};

const edadDe = (i: Inscripcion): string =>
  i.ciclista.fechaNacimiento
    ? celdaNumero(edadEnCarrera(i.ciclista.fechaNacimiento))
    : celda("");

const CONSTRUCTORES: Record<VistaExport, Constructor> = {
  completa: {
    encabezados: [
      "Referencia",
      "Estado",
      "Se inscribió",
      "Categoría",
      "Nombres",
      "Apellidos",
      "Documento",
      "Sexo",
      "Fecha de nacimiento",
      `Edad al 31/12/${ANIO_CARRERA}`,
      "Correo",
      "Celular",
      "Dirección",
      "Ciudad",
      "Departamento",
      "País",
      "RH",
      "EPS",
      "Contacto de emergencia",
      "Teléfono de emergencia",
      ...PRENDAS.map((p) => p.nombre),
      "Referido por",
      // La etapa y su precio van juntos y antes del total: son lo que explica
      // por qué dos inscritos con el mismo estado deben cifras distintas.
      "Etapa",
      "Precio de la etapa",
      "Código de referido",
      "Descuento",
      "Total",
      "Pagado",
      "Saldo",
      "Medio de pago",
    ],
    filas: (inscripciones) =>
      inscripciones.map((i) => {
        const c = i.ciclista;
        return [
          celda(i.referencia),
          celda(ESTADO_LEGIBLE[i.estado]),
          celda(fechaHora(i.creadaEn)),
          celda(nombreDeCategoria(i)),
          celda(c.nombres),
          celda(c.apellidos),
          celdaTexto(c.identificacion),
          celda(c.sexo),
          celda(c.fechaNacimiento),
          edadDe(i),
          celda(c.correo),
          celdaTexto(c.telefono),
          celda(c.direccion),
          celda(c.ciudad),
          celda(c.departamento),
          celda(c.pais),
          celda(c.rh),
          celda(c.eps),
          celda(c.contactoEmergencia),
          celdaTexto(c.telefonoEmergencia),
          ...PRENDAS.map((p) => celda(i.tallas[p.campo])),
          celda(c.referidoPor),
          celda(etapaDeInscripcion(i).nombre),
          celdaNumero(i.precioBase),
          celda(i.codigoReferido ?? ""),
          celdaNumero(i.descuento),
          celdaNumero(i.total),
          celdaNumero(i.pagado),
          celdaNumero(Math.max(0, i.total - i.pagado)),
          celda(
            i.medioPago === "TRANSFERENCIA"
              ? "Transferencia"
              : "Tarjeta (histórico)",
          ),
        ];
      }),
  },

  cronometraje: {
    encabezados: [
      "Referencia",
      "Nombres",
      "Apellidos",
      "Documento",
      "Sexo",
      "Fecha de nacimiento",
      `Edad al 31/12/${ANIO_CARRERA}`,
      "Categoría",
      "Ciudad",
      "Departamento",
      "Etapa",
      // Va a propósito: quien arma la salida necesita saber a quién no puede
      // darle dorsal todavía.
      "Estado de pago",
    ],
    filas: (inscripciones) =>
      inscripciones.map((i) => {
        const c = i.ciclista;
        return [
          celda(i.referencia),
          celda(c.nombres),
          celda(c.apellidos),
          celdaTexto(c.identificacion),
          celda(c.sexo),
          celda(c.fechaNacimiento),
          edadDe(i),
          celda(nombreDeCategoria(i)),
          celda(c.ciudad),
          celda(c.departamento),
          celda(etapaDeInscripcion(i).nombre),
          celda(ESTADO_LEGIBLE[i.estado]),
        ];
      }),
  },

  /**
   * La única vista que no es una lista de personas: es el pedido.
   *
   * Quien manda a hacer las camisetas pregunta "¿cuántas M?", no quiere
   * cuatrocientos nombres. Y si no lleva nombres, no hay dato personal que
   * proteger cuando el archivo salga por correo.
   */
  camisetas: {
    encabezados: ["Prenda", "Talla", "Cantidad"],
    filas: (inscripciones) => {
      const filas: string[][] = [];
      for (const prenda of PRENDAS) {
        // `PRENDAS` nombra los campos del formulario ("Talla Jersey Oficial"),
        // que ahí está bien porque etiqueta un desplegable de tallas. En una
        // columna que se llama Prenda sobra: la prenda es el jersey.
        const nombre = prenda.nombre.replace(/^Talla\s+/i, "");
        const cuenta = new Map<string, number>();
        for (const i of inscripciones) {
          const talla = i.tallas[prenda.campo];
          if (!talla) continue;
          cuenta.set(talla, (cuenta.get(talla) ?? 0) + 1);
        }
        // Primero las tallas del catálogo en su orden (XS…XXL) y después
        // cualquier valor raro que se hubiera colado, para que no desaparezca
        // del pedido sin que nadie se entere.
        const otras = [...cuenta.keys()].filter((t) => !TALLAS.includes(t));
        for (const talla of [...TALLAS, ...otras.sort()]) {
          filas.push([
            celda(nombre),
            celda(talla),
            celdaNumero(cuenta.get(talla) ?? 0),
          ]);
        }
        filas.push([
          celda(`${nombre} · TOTAL`),
          celda(""),
          celdaNumero([...cuenta.values()].reduce((s, n) => s + n, 0)),
        ]);
      }
      return filas;
    },
  },

  medica: {
    encabezados: [
      "Nombres",
      "Apellidos",
      "Documento",
      "Categoría",
      "RH",
      "EPS",
      "Celular",
      "Contacto de emergencia",
      "Teléfono de emergencia",
    ],
    filas: (inscripciones) =>
      inscripciones.map((i) => {
        const c = i.ciclista;
        return [
          celda(c.nombres),
          celda(c.apellidos),
          celdaTexto(c.identificacion),
          celda(nombreDeCategoria(i)),
          celda(c.rh),
          celda(c.eps),
          celdaTexto(c.telefono),
          celda(c.contactoEmergencia),
          celdaTexto(c.telefonoEmergencia),
        ];
      }),
  },
};

export function esVista(valor: unknown): valor is VistaExport {
  return (
    typeof valor === "string" && VISTAS.some((v) => v.clave === valor)
  );
}

export function esEstadoInscripcion(valor: unknown): valor is EstadoInscripcion {
  return (
    typeof valor === "string" &&
    ESTADOS_INSCRIPCION.includes(valor as EstadoInscripcion)
  );
}

/* -------------------------------- Filtrado -------------------------------- */

export type FiltrosExport = {
  categoria?: string;
  estado?: EstadoInscripcion;
  /** Código de etapa. Las filas sin etapa cuentan como de la primera. */
  etapa?: string;
};

export function esEtapa(valor: unknown): valor is string {
  return typeof valor === "string" && Boolean(etapaPorCodigo(valor));
}

export function filtrar(
  inscripciones: Inscripcion[],
  filtros: FiltrosExport,
): Inscripcion[] {
  return inscripciones.filter(
    (i) =>
      (!filtros.categoria || i.categoriaCodigo === filtros.categoria) &&
      (!filtros.estado || i.estado === filtros.estado) &&
      // Por `etapaDeInscripcion` y no por `i.etapa` a pelo: una fila anterior
      // a la columna es de la etapa 1 y tiene que salir al filtrar por ella.
      (!filtros.etapa || etapaDeInscripcion(i).codigo === filtros.etapa),
  );
}

/* -------------------------------- Armado ---------------------------------- */

export type ArchivoExport = {
  nombre: string;
  contenido: string;
  /** Cuántas filas de datos lleva, sin contar el encabezado. Para el log. */
  filas: number;
};

/**
 * Nombre del archivo. Lleva la vista, los filtros y la fecha porque estos
 * archivos acaban en la carpeta de descargas de alguien junto a otros cinco, y
 * `inscritos.csv` a secas no dice cuál era el bueno.
 */
function nombreDeArchivo(vista: VistaExport, filtros: FiltrosExport): string {
  const partes = [
    EVENTO.prefijoReferencia.toLowerCase(),
    vista,
    filtros.etapa?.toLowerCase().replace(/_/g, "-"),
    filtros.categoria?.toLowerCase(),
    filtros.estado?.toLowerCase().replace(/_/g, "-"),
    new Date().toISOString().slice(0, 10),
  ].filter(Boolean);
  return `${partes.join("-")}.csv`;
}

export function construirCsv(
  inscripciones: Inscripcion[],
  vista: VistaExport,
  filtros: FiltrosExport = {},
): ArchivoExport {
  const constructor = CONSTRUCTORES[vista];
  const seleccion = filtrar(inscripciones, filtros);
  const filas = constructor.filas(seleccion);

  const lineas = [
    constructor.encabezados.map(celda).join(SEPARADOR),
    ...filas.map((f) => f.join(SEPARADOR)),
  ];

  return {
    nombre: nombreDeArchivo(vista, filtros),
    contenido: BOM + lineas.join(FIN_DE_LINEA) + FIN_DE_LINEA,
    filas: filas.length,
  };
}
