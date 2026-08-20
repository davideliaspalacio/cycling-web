/**
 * Siembra un set de inscripciones para la demo: contado, cuotas al día,
 * cuotas con cobro rechazado y una saldada por completo.
 */
const B = process.env.BASE ?? "http://localhost:3000";

const APRUEBA = { numero: "4242424242424242", titular: "CICLISTA PRUEBA", mesExp: "12", anioExp: "29", cvc: "123" };
const RECHAZA = { ...APRUEBA, numero: "4111111111111111" };

const CICLISTAS = [
  { doc: "43512890", nombres: "Laura Camila", apellidos: "Ospina Ríos", sexo: "Femenino", cat: "DAMAS-MASTER", nac: "1986-03-02", ciudad: "Bogotá", dep: "Cundinamarca", eq: "Andes Racing", plan: "CONTADO", tarjeta: APRUEBA, avanzar: 0 },
  { doc: "79885412", nombres: "Juan Sebastián", apellidos: "Cárdenas Mora", sexo: "Masculino", cat: "MASTER-A2", nac: "1990-11-21", ciudad: "Chía", dep: "Cundinamarca", eq: "Independiente", plan: "CUOTAS", tarjeta: APRUEBA, avanzar: 2 },
  { doc: "1032445566", nombres: "Valentina", apellidos: "Gómez Arango", sexo: "Femenino", cat: "PRO-DAMAS", nac: "1999-07-09", ciudad: "Rionegro", dep: "Antioquia", eq: "Team Antioquia", plan: "CUOTAS", tarjeta: RECHAZA, avanzar: 0 },
  { doc: "16789234", nombres: "Ricardo", apellidos: "Bermúdez Salas", sexo: "Masculino", cat: "MASTER-C", nac: "1972-01-30", ciudad: "Duitama", dep: "Boyacá", eq: "Boyacá Bike", plan: "CUOTAS", tarjeta: APRUEBA, avanzar: 3 },
];

const correo = (c) => `${c.nombres.split(" ")[0]}.${c.apellidos.split(" ")[0]}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@example.com";

async function json(ruta, cuerpo) {
  const res = await fetch(`${B}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return { ok: res.ok, datos: await res.json() };
}

for (const c of CICLISTAS) {
  const alta = await json("/api/inscripciones", {
    categoriaCodigo: c.cat,
    ciclista: {
      identificacion: c.doc, nombres: c.nombres, apellidos: c.apellidos, sexo: c.sexo,
      eps: "Sura", correo: correo(c), telefono: "3001234567", equipo: c.eq,
      instagram: "", contactoEmergencia: "Contacto de emergencia", telefonoEmergencia: "3009876543",
      direccion: "Calle 10 # 20-30", fechaNacimiento: c.nac, rh: "O+", referidoPor: "Instagram",
      ciudad: c.ciudad, departamento: c.dep, pais: "Colombia",
    },
    tallas: { jersey: "M", running: "L" },
    consentimientos: { reembolso: true, datos: true, exoneracion: true },
  });
  if (!alta.ok) { console.log(`· ${c.doc} omitido: ${alta.datos.error}`); continue; }

  const ref = alta.datos.referencia;
  const pago = await json("/api/pagos", { referencia: ref, plan: c.plan, tarjeta: { ...c.tarjeta, titular: `${c.nombres} ${c.apellidos}` } });
  for (let i = 0; i < c.avanzar; i++) await json("/api/pagos/cuota", { referencia: ref });
  console.log(`✓ ${ref} · ${c.nombres} ${c.apellidos} · ${c.plan}${c.avanzar ? ` (+${c.avanzar} cuotas)` : ""} · ${pago.datos.aprobado ? "aprobado" : "rechazado"}`);
}
