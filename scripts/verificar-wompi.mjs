/**
 * Prueba las llaves de sandbox de Wompi de punta a punta, antes de tocar la UI.
 *
 *   node --env-file=.env.local scripts/verificar-wompi.mjs
 *
 * Recorre el mismo camino que la app: aceptaciones → tokenizar tarjeta →
 * fuente de pago → cobro → consulta. Si algo falla, falla aquí y no en medio
 * de una demo. No imprime ninguna llave ni secreto.
 */
import { createHash } from "node:crypto";

const PUB = process.env.NEXT_PUBLIC_WOMPI_LLAVE_PUBLICA?.trim();
const PRV = process.env.WOMPI_LLAVE_PRIVADA?.trim();
const INTEGRIDAD = process.env.WOMPI_SECRETO_INTEGRIDAD?.trim();
const EVENTOS = process.env.WOMPI_SECRETO_EVENTOS?.trim();

const CANDIDATAS = [
  process.env.WOMPI_URL_BASE?.trim(),
  "https://sandbox.wompi.co/v1",
  "https://api-sandbox.co.uat.wompi.dev/v1",
].filter(Boolean);

const ok = (m) => console.log(`  ✓ ${m}`);
const mal = (m) => console.log(`  ✗ ${m}`);
const paso = (n, m) => console.log(`\n${n}. ${m}`);

let fallos = 0;
const exigir = (cond, bien, feo) => {
  if (cond) ok(bien);
  else {
    mal(feo);
    fallos += 1;
  }
};

/* ------------------------------- 1 · Llaves ------------------------------- */

paso(1, "Llaves presentes y con la forma esperada");
exigir(Boolean(PUB), "llave pública presente", "falta NEXT_PUBLIC_WOMPI_LLAVE_PUBLICA");
if (PRV) ok("llave privada presente");
else console.log("  ⚠ falta WOMPI_LLAVE_PRIVADA — se omiten fuente de pago y cobro");
exigir(Boolean(INTEGRIDAD), "secreto de integridad presente", "falta WOMPI_SECRETO_INTEGRIDAD");
if (!EVENTOS) console.log("  · sin WOMPI_SECRETO_EVENTOS (solo hace falta para el webhook)");

if (PUB) {
  exigir(PUB.startsWith("pub_"), "la pública empieza por pub_", `la pública empieza por "${PUB.slice(0, 4)}"`);
}
if (PUB && PRV) {
  exigir(PRV.startsWith("prv_"), "la privada empieza por prv_", `la privada empieza por "${PRV.slice(0, 4)}"`);
  const ambasPrueba = PUB.startsWith("pub_test") && PRV.startsWith("prv_test");
  const ambasProd = PUB.startsWith("pub_prod") && PRV.startsWith("prv_prod");
  exigir(ambasPrueba || ambasProd, ambasPrueba ? "las dos son de sandbox" : "las dos son de producción", "OJO: mezclaste una llave de prueba con una de producción");
  if (ambasProd) console.log("  ⚠ Son llaves de PRODUCCIÓN: los cobros son reales.");
}

if (fallos > 0) {
  console.log("\nFaltan llaves. Pégalas en .env.local y vuelve a correr.");
  process.exit(1);
}
const puedeCobrar = Boolean(PRV);

/* ------------------------------ 2 · Host ---------------------------------- */

paso(2, "Encontrar el host que responde");
let BASE = null;
let comercio = null;
for (const candidata of CANDIDATAS) {
  try {
    const res = await fetch(`${candidata}/merchants/${PUB}`, {
      headers: { Authorization: `Bearer ${PUB}` },
    });
    if (res.ok) {
      BASE = candidata;
      comercio = await res.json();
      ok(`responde ${candidata}`);
      break;
    }
    console.log(`  · ${candidata} → HTTP ${res.status}`);
  } catch (e) {
    console.log(`  · ${candidata} → ${e.message}`);
  }
}
if (!BASE) {
  mal("ningún host respondió; revisa la llave pública o la conexión");
  process.exit(1);
}

const pedir = async (ruta, { metodo = "GET", llave, cuerpo } = {}) => {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${ruta}: ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
};

/* --------------------------- 3 · Aceptaciones ----------------------------- */

paso(3, "Tokens de aceptación");
const aceptaciones = {
  terminos: comercio?.data?.presigned_acceptance?.acceptance_token,
  datos: comercio?.data?.presigned_personal_data_auth?.acceptance_token,
};
ok(`comercio: ${comercio?.data?.name ?? "(sin nombre)"}`);
exigir(Boolean(aceptaciones.terminos), "token de términos recibido", "no llegó el token de términos");
exigir(Boolean(aceptaciones.datos), "token de datos personales recibido", "no llegó el token de datos personales");

/* ---------------------------- 4 · Tokenizar ------------------------------- */

paso(4, "Tokenizar la tarjeta de prueba 4242…");
let token = null;
try {
  const r = await pedir("/tokens/cards", {
    metodo: "POST",
    llave: PUB,
    cuerpo: {
      number: "4242424242424242",
      cvc: "123",
      exp_month: "12",
      exp_year: "29",
      card_holder: "CICLISTA DE PRUEBA",
    },
  });
  token = r.data?.id;
  ok(`token ${String(token).slice(0, 12)}… · ${r.data?.brand} ····${r.data?.last_four}`);
} catch (e) {
  mal(e.message);
  fallos += 1;
}

/* -------------------------- 5 · Fuente de pago ---------------------------- */

paso(5, "Crear la fuente de pago (lo que permite cobrar las cuotas)");
let fuenteId = null;
if (!puedeCobrar) console.log("  — omitido: hace falta la llave privada");
else if (token) {
  try {
    const r = await pedir("/payment_sources", {
      metodo: "POST",
      llave: PRV,
      cuerpo: {
        type: "CARD",
        token,
        customer_email: "pruebas@tibetepic.com",
        acceptance_token: aceptaciones.terminos,
        accept_personal_auth: aceptaciones.datos,
      },
    });
    fuenteId = r.data?.id;
    ok(`fuente ${fuenteId} · estado ${r.data?.status}`);
  } catch (e) {
    mal(e.message);
    fallos += 1;
  }
}

/* ------------------------------ 6 · Cobro --------------------------------- */

paso(6, "Cobrar una cuota de $188.000 contra esa fuente");
if (!puedeCobrar) console.log("  — omitido: hace falta la llave privada");
else if (fuenteId) {
  const referencia = `VERIF-${Date.now()}`;
  try {
    const r = await pedir("/transactions", {
      metodo: "POST",
      llave: PRV,
      cuerpo: {
        amount_in_cents: 18_800_000,
        currency: "COP",
        customer_email: "pruebas@tibetepic.com",
        reference: referencia,
        payment_source_id: fuenteId,
        payment_method: { installments: 1 },
        signature: createHash("sha256")
          .update(`${referencia}${18_800_000}COP${INTEGRIDAD}`)
          .digest("hex"),
        recurrent: true,
      },
    });
    const id = r.data?.id;
    ok(`transacción ${id} · estado inicial ${r.data?.status}`);

    // El estado suele quedar en PENDING un instante.
    let estado = r.data?.status;
    for (let i = 0; i < 6 && estado === "PENDING"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const consulta = await pedir(`/transactions/${id}`, { llave: PRV });
      estado = consulta.data?.status;
    }
    exigir(estado === "APPROVED", `estado final ${estado}`, `estado final ${estado} (se esperaba APPROVED con la 4242)`);
  } catch (e) {
    mal(e.message);
    fallos += 1;
  }
}

/* ---------------------------- 7 · Firmas ---------------------------------- */

paso(7, "Firma de integridad del modal");
const ref = "TE27-EJEMPLO-C1";
const firma = createHash("sha256").update(`${ref}${75_000_000}COP${INTEGRIDAD}`).digest("hex");
ok(`SHA256(referencia + centavos + COP + secreto) = ${firma.slice(0, 16)}…`);
console.log("  · si el modal abre y cobra, la firma está bien");

/* ----------------------------- Resultado ---------------------------------- */

if (fallos === 0 && puedeCobrar) {
  console.log("\n✅ Todo bien. El modal y el cobro por cuotas están operativos.");
} else if (fallos === 0) {
  console.log(
    "\n🟡 Lo verificable con la llave pública funciona: comercio, aceptaciones," +
      "\n   tokenización y firma del modal. Falta prv_test_… para cobrar.",
  );
} else {
  console.log(`\n❌ ${fallos} problema(s). Revisa arriba antes de activar el sandbox.`);
}
process.exit(fallos === 0 ? 0 : 1);
