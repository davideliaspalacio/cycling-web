/**
 * Graba las demos en vídeo usando el Chrome ya instalado en el equipo.
 *
 *   node scripts/grabar-demo.mjs            # todo
 *   node scripts/grabar-demo.mjs pc         # solo el de escritorio
 *   node scripts/grabar-demo.mjs celular
 *   node scripts/grabar-demo.mjs panel
 *
 * Los .webm salen a videos-demo/.crudo y se convierten a .mp4 con ffmpeg.
 */
import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  PINTAR_CURSOR,
  centrar,
  clic,
  desplazar,
  escribir,
  leer,
  mover,
  pausa,
} from "./humano.mjs";

const ejecutar = promisify(execFile);

const BASE = process.env.BASE ?? "http://localhost:3000";
const SALIDA = path.resolve("videos-demo");
const CRUDO = path.join(SALIDA, ".crudo");

const PC = { width: 1280, height: 800 };
const CELULAR = { width: 430, height: 932 };

const CICLISTA = {
  nombres: "Mateo",
  apellidos: "Guerrero Peña",
  correo: "mateo.guerrero@example.com",
  telefono: "3145558899",
  ciudad: "Bogotá",
  direccion: "Calle 116 #9-72, apto 402",
  contacto: "Sara Peña (esposa)",
  telContacto: "3167774411",
};

const documento = () => String(80_000_000 + Math.floor(Math.random() * 9_000_000));

async function abrir(navegador, viewport, nombre) {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: viewport.width < 640,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    colorScheme: "dark",
    reducedMotion: "no-preference",
    recordVideo: { dir: CRUDO, size: viewport },
  });
  await contexto.addInitScript(PINTAR_CURSOR(viewport.width < 640));
  const pagina = await contexto.newPage();
  pagina.__nombre = nombre;
  return { contexto, pagina };
}

async function cerrar({ contexto, pagina }, nombre) {
  const origen = await pagina.video().path();
  await contexto.close();
  const destino = path.join(CRUDO, `${nombre}.webm`);
  await fs.rename(origen, destino);
  return destino;
}

/* ------------------------- Tramos reutilizables ------------------------- */

/** Rellena el paso de datos personales. */
async function llenarDatos(pagina, { compacto = false } = {}) {
  const doc = documento();
  await escribir(pagina, pagina.locator("#identificacion"), doc, { velocidad: 55 });
  await pagina.locator("#fechaNacimiento").fill("1993-04-18");
  await pausa(500);

  await escribir(pagina, pagina.locator("#nombres"), CICLISTA.nombres);
  await escribir(pagina, pagina.locator("#apellidos"), CICLISTA.apellidos, {
    velocidad: 45,
  });

  await pagina.locator("#rh").selectOption("A+");
  await pausa(420);

  await desplazar(pagina, compacto ? 240 : 190);
  await escribir(pagina, pagina.locator("#correo"), CICLISTA.correo, {
    velocidad: 34,
  });
  await escribir(pagina, pagina.locator("#telefono"), CICLISTA.telefono, {
    velocidad: 40,
  });

  // La ciudad autocompleta el departamento: vale la pena que se vea.
  await escribir(pagina, pagina.locator("#ciudad"), CICLISTA.ciudad, {
    velocidad: 95,
  });
  await leer(1.5);

  await desplazar(pagina, compacto ? 230 : 180);
  await escribir(pagina, pagina.locator("#direccion"), CICLISTA.direccion, {
    velocidad: 26,
  });
  await escribir(pagina, pagina.locator("#contactoEmergencia"), CICLISTA.contacto, {
    velocidad: 30,
  });
  await escribir(
    pagina,
    pagina.locator("#telefonoEmergencia"),
    CICLISTA.telContacto,
    { velocidad: 38 },
  );
  return doc;
}

async function elegirTallas(pagina) {
  await leer(1.2);
  await desplazar(pagina, 260);
  await leer(1);
  const talla = (campo, valor) =>
    pagina
      .locator("label")
      .filter({ has: pagina.locator(`input[name="${campo}"][value="${valor}"]`) });
  await clic(pagina, talla("jersey", "L"));
  await clic(pagina, talla("running", "L"));
  await leer(0.9);
}

async function aceptarPermisos(pagina) {
  await leer(1.4);
  // Abre un texto legal para mostrar que está completo, no recortado.
  await clic(pagina, pagina.locator("summary").first());
  await leer(2);
  await clic(pagina, pagina.locator("summary").first());
  await pausa(400);

  for (const etiqueta of [
    "Acepto la política de reembolso",
    "Acepto la autorización de tratamiento de datos",
    "Acepto la exoneración de responsabilidad",
  ]) {
    const casilla = pagina.locator("label").filter({ hasText: etiqueta });
    await clic(pagina, casilla, { despues: 420 });
  }
  await leer(0.8);
}

async function pagarEnCuotas(pagina) {
  await leer(2);
  const opciones = pagina
    .locator("label")
    .filter({ has: pagina.locator("input[name=plan]") });
  await clic(pagina, opciones.nth(1), { despues: 900 });
  await leer(2.4); // el calendario de cuotas aparece

  await centrar(pagina, pagina.getByRole("button", { name: /4242/ }));
  await clic(pagina, pagina.getByRole("button", { name: /4242/ }), { despues: 900 });
  await leer(1.6);

  const pagar = pagina.getByRole("button", { name: /^Pagar/ });
  await centrar(pagina, pagar);
  await clic(pagina, pagar, { despues: 400 });

  await pagina
    .getByText(/Cupo reservado/)
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  await leer(3);
}

/* ------------------------------ Guiones ------------------------------ */

async function guionCompleto(pagina, { compacto }) {
  // 1 · La portada, con la altimetría dibujándose
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await leer(3.4);
  await desplazar(pagina, compacto ? 520 : 620, 1500);
  await leer(1.6);
  await desplazar(pagina, compacto ? 620 : 700, 1500);
  await leer(1.4);

  // 2 · Elegir categoría desde la portada
  const tarjeta = pagina.locator('a[href*="categoria=PRO-HOMBRES"]');
  await centrar(pagina, tarjeta);
  await mover(pagina, tarjeta);
  await leer(1.1); // se ve el hover levantando la tarjeta
  await clic(pagina, tarjeta, { despues: 1400 });

  // 3 · Datos personales
  await pagina.waitForURL(/inscripcion/);
  await leer(2.2);
  await llenarDatos(pagina, { compacto });

  await centrar(pagina, pagina.getByRole("button", { name: /Siguiente/ }));
  await clic(pagina, pagina.getByRole("button", { name: /Siguiente/ }), {
    despues: 1300,
  });

  // 4 · Tallas
  await elegirTallas(pagina);
  await centrar(pagina, pagina.getByRole("button", { name: /Siguiente/ }));
  await clic(pagina, pagina.getByRole("button", { name: /Siguiente/ }), {
    despues: 1300,
  });

  // 5 · Permisos
  await aceptarPermisos(pagina);
  const irAPagar = pagina.getByRole("button", { name: /Ir a pagar/ });
  await centrar(pagina, irAPagar);
  await clic(pagina, irAPagar, { despues: 1800 });

  // 6 · Pago en cuotas
  await pagarEnCuotas(pagina);

  // 7 · El ticket
  const verTicket = pagina.getByRole("link", { name: /Ver mi ticket/ });
  await centrar(pagina, verTicket);
  await clic(pagina, verTicket, { despues: 2000 });
  await pagina.waitForURL(/ticket/);
  await leer(3.6);
  await desplazar(pagina, compacto ? 420 : 300, 1400);
  await leer(3);

  // 8 · El portal: adelantar una cuota y ver bajar el saldo
  await desplazar(pagina, -600, 900);
  // El enlace de vuelta del ticket, no el del menú: ese lleva la referencia.
  await clic(pagina, pagina.locator('a[href*="/mi-inscripcion?ref="]').first(), {
    despues: 1800,
  });
  await pagina.waitForURL(/mi-inscripcion/);
  await leer(3);
  await desplazar(pagina, compacto ? 300 : 220, 1100);
  await leer(1.4);

  const adelantar = pagina.getByRole("button", { name: /Adelantar la cuota/ });
  await centrar(pagina, adelantar);
  await clic(pagina, adelantar, { despues: 500 });
  await pagina
    .getByText(/cobrada/)
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  await leer(3.2);
  await desplazar(pagina, 320, 1200);
  await leer(2.4);

  // 9 · Los correos que le llegaron
  await pagina.goto(`${BASE}/correos`, { waitUntil: "networkidle" });
  await leer(2.8);
  await desplazar(pagina, 200, 900);
  await leer(1.2);
  const correo = pagina
    .locator('a[href^="/correos/"]')
    .filter({ hasText: /Plan de 4 cuotas/ })
    .first();
  await centrar(pagina, correo);
  await clic(pagina, correo, { despues: 2200 });
  await leer(3);
  await desplazar(pagina, compacto ? 380 : 300, 1400);
  await leer(3.4);
}

async function guionPanel(pagina) {
  await pagina.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
  await leer(3.4);
  await desplazar(pagina, 190, 1100);
  await leer(2.6);

  const fila = pagina.locator("tbody tr").first();
  await mover(pagina, fila);
  await leer(1.6);
  await desplazar(pagina, 160, 900);
  await leer(2.8);
}

/* ------------------------------ Conversión ------------------------------ */

async function aMp4(webm, destino, escala) {
  await ejecutar("ffmpeg", [
    "-y",
    "-i", webm,
    "-vf", `scale=${escala}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "20",
    "-movflags", "+faststart",
    "-r", "30",
    destino,
  ]);
  const { size } = await fs.stat(destino);
  return size;
}

/* -------------------------------- Main -------------------------------- */

const quiere = process.argv[2];
const hacer = (n) => !quiere || quiere === n;

await fs.rm(CRUDO, { recursive: true, force: true });
await fs.mkdir(CRUDO, { recursive: true });

const navegador = await chromium.launch({ channel: "chrome" });
const grabados = [];

if (hacer("pc")) {
  console.log("▶ Grabando escritorio…");
  const sesion = await abrir(navegador, PC, "pc");
  await guionCompleto(sesion.pagina, { compacto: false });
  grabados.push(["01-PC-flujo-completo", await cerrar(sesion, "pc"), "1280:800"]);
}

if (hacer("celular")) {
  console.log("▶ Grabando celular…");
  const sesion = await abrir(navegador, CELULAR, "celular");
  await guionCompleto(sesion.pagina, { compacto: true });
  grabados.push(["02-CELULAR-flujo-completo", await cerrar(sesion, "celular"), "860:1864"]);
}

if (hacer("panel")) {
  console.log("▶ Grabando panel…");
  const sesion = await abrir(navegador, PC, "panel");
  await guionPanel(sesion.pagina);
  grabados.push(["03-PC-panel-organizacion", await cerrar(sesion, "panel"), "1280:800"]);
}

await navegador.close();

console.log("\n▶ Convirtiendo a mp4…");
for (const [nombre, webm, escala] of grabados) {
  const destino = path.join(SALIDA, `${nombre}.mp4`);
  const bytes = await aMp4(webm, destino, escala);
  console.log(`  ✓ ${nombre}.mp4  (${(bytes / 1e6).toFixed(1)} MB)`);
}

await fs.rm(CRUDO, { recursive: true, force: true });
console.log(`\nListo → ${SALIDA}`);
