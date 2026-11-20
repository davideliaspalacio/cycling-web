import { NextResponse, type NextRequest } from "next/server";
import {
  abonosDe,
  listarInscripciones,
  ultimoCorreoPorPlantilla,
} from "@/lib/almacen";
import { enviarAlCiclista, MODO_CORREO } from "@/lib/correos/enviar";
import {
  evidenciaVerificada,
  inscripcionCompleta,
} from "@/lib/correos/plantillas";
import { resumenDePago } from "@/lib/servicio";
import { COOKIE_SESION, leerSesion } from "@/lib/sesion";
import type { Inscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Reenvío de los correos que nunca salieron.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Del 3 de octubre al 20 de noviembre de 2026 se agotó el crédito de
 * ZeptoMail. `avisar` en `servicio.ts` se traga el error a propósito —un fallo
 * de correo no puede tumbarle la inscripción a nadie—, así que el sistema
 * siguió cobrando y verificando con normalidad mientras ni un solo aviso
 * salía. Cincuenta y cinco personas transfirieron, alguien les aprobó el
 * comprobante, y no se enteraron.
 *
 * ── Qué manda, y qué no ────────────────────────────────────────────────────
 * **Un correo por persona, con su situación de hoy.** No los 137 que se
 * perdieron. Reenviar un "recibimos tu comprobante" de hace seis semanas, a
 * alguien cuyo pago ya se aprobó, no informa: confunde. Y un "cuota
 * verificada" de octubre traería un saldo que ya no es el suyo, porque muchos
 * han abonado otra cuota desde entonces.
 *
 *   saldo en cero → `inscripcion-completa`, que trae el dorsal.
 *   saldo pendiente → `evidencia-verificada` con su saldo real y su próxima cuota.
 *
 * ── Por qué se puede llamar dos veces sin miedo ────────────────────────────
 * No mira fechas de apagón: mira el estado de cada inscripción y lo que ya se
 * le mandó. Si alguien ya recibió su correo después de su último abono
 * verificado, se salta. Correrlo otra vez no manda nada repetido, y si mañana
 * vuelve a caerse el correo, esto mismo recupera lo de mañana sin tocar nada.
 *
 * ── Cómo se usa ────────────────────────────────────────────────────────────
 *   GET  → simulacro: dice a quién y qué, sin mandar nada.
 *   GET ?enviar=1 → manda de verdad.
 * Vale cualquiera de las dos credenciales: el bearer de CRON_SECRET, igual
 * que `/api/cobros`, o la sesión del panel. La segunda existe para que quien
 * maneja el evento pueda mirar la lista y soltar el envío desde su navegador
 * sin que nadie tenga que pasarse un secreto por un chat.
 */

/** Lo que se le dice a quien abre un correo de algo de hace seis semanas. */
const NOTA =
  "Se nos cayó el envío de correos durante unas semanas y este aviso se " +
  "quedó sin salir. Tu inscripción y tus pagos están correctos y al día: " +
  "esto es solo la confirmación que no te llegó en su momento. No tienes " +
  "que hacer nada.";

/**
 * Entre un envío y el siguiente. Gmail limita los dominios que llevan tiempo
 * callados y de pronto sueltan una ráfaga, y este dominio lleva mes y medio
 * sin mandar nada: es justo el patrón que acaba en la carpeta de spam.
 */
const PAUSA_MS = 1_500;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pendiente = {
  ins: Inscripcion;
  plantilla: "inscripcion-completa" | "evidencia-verificada";
  saldo: number;
  verificado: number;
  motivo: string;
};

export async function GET(peticion: NextRequest) {
  const secreto = process.env.CRON_SECRET ?? process.env.CRON_SECRETO;
  const porBearer = Boolean(
    secreto && peticion.headers.get("authorization") === `Bearer ${secreto}`,
  );
  const sesion = leerSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!porBearer && !sesion) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const enviar = new URL(peticion.url).searchParams.get("enviar") === "1";

  // Sin llave no se manda nada y la fila se guardaría como no enviada, que es
  // peor que no intentarlo: perderíamos el rastro de que sigue pendiente.
  if (enviar && MODO_CORREO !== "zeptomail") {
    return NextResponse.json(
      {
        error: `El correo está en modo "${MODO_CORREO}". Sin ZEPTOMAIL_API_KEY no se manda nada.`,
      },
      { status: 503 },
    );
  }

  /*
   * `ultimoCorreoPorPlantilla` y no `listarCorreos`: esa segunda trae solo las
   * 200 filas más recientes, porque está hecha para la pantalla del panel. Con
   * ella, en cuanto la tabla pasó de 200 correos, la gente más antigua empezó
   * a parecer que no había recibido nunca nada — y se le reenvió. Ocho
   * personas recibieron por duplicado un correo de septiembre antes de que
   * esto se arreglara. Decidir a quién se le escribe con una consulta que
   * tiene tope de filas no puede volver a pasar.
   */
  const [inscripciones, ultimoPorClave] = await Promise.all([
    listarInscripciones(),
    ultimoCorreoPorPlantilla(),
  ]);

  const ultimoEnvio = new Map<string, number>();
  for (const [clave, cuando] of ultimoPorClave) {
    ultimoEnvio.set(clave, new Date(cuando).getTime());
  }

  const pendientes: Pendiente[] = [];

  for (const ins of inscripciones) {
    const abonos = await abonosDe(ins.id);
    const verificados = abonos.filter((a) => a.estado === "VERIFICADA");
    if (verificados.length === 0) continue;

    // El más reciente por revisión: es el que disparó el correo que falta.
    const ultimo = verificados.reduce((a, b) =>
      new Date(a.revisadoEn ?? 0) > new Date(b.revisadoEn ?? 0) ? a : b,
    );
    const revisadoEn = new Date(ultimo.revisadoEn ?? ins.actualizadaEn).getTime();

    const resumen = await resumenDePago(ins);
    const plantilla =
      resumen.saldo === 0 ? "inscripcion-completa" : "evidencia-verificada";

    // Ya lo recibió después de ese abono: nada que recuperar.
    const yaEnviado = ultimoEnvio.get(`${ins.referencia}·${plantilla}`) ?? 0;
    if (yaEnviado > revisadoEn) continue;

    pendientes.push({
      ins,
      plantilla,
      saldo: resumen.saldo,
      verificado: resumen.verificado,
      motivo:
        plantilla === "inscripcion-completa"
          ? "Saldo en cero y nunca se le avisó del dorsal."
          : "Última cuota verificada sin confirmación.",
    });
  }

  const detalle = pendientes.map((p) => ({
    referencia: p.ins.referencia,
    nombre: `${p.ins.ciclista.nombres} ${p.ins.ciclista.apellidos}`,
    correo: p.ins.ciclista.correo,
    plantilla: p.plantilla,
    pagado: p.verificado,
    saldo: p.saldo,
    motivo: p.motivo,
  }));

  if (!enviar) {
    return NextResponse.json({
      simulacro: true,
      modoCorreo: MODO_CORREO,
      aEnviar: pendientes.length,
      porPlantilla: {
        "inscripcion-completa": detalle.filter(
          (d) => d.plantilla === "inscripcion-completa",
        ).length,
        "evidencia-verificada": detalle.filter(
          (d) => d.plantilla === "evidencia-verificada",
        ).length,
      },
      detalle,
    });
  }

  const enviados: string[] = [];
  const fallidos: { referencia: string; error: string }[] = [];

  for (const p of pendientes) {
    try {
      const contenido =
        p.plantilla === "inscripcion-completa"
          ? inscripcionCompleta(p.ins, { nota: NOTA })
          : evidenciaVerificada(
              p.ins,
              (await abonosDe(p.ins.id))
                .filter((a) => a.estado === "VERIFICADA")
                .reduce((a, b) =>
                  new Date(a.revisadoEn ?? 0) > new Date(b.revisadoEn ?? 0)
                    ? a
                    : b,
                ),
              { verificado: p.verificado, saldo: p.saldo, nota: NOTA },
            );
      await enviarAlCiclista(p.ins, p.plantilla, contenido);
      enviados.push(p.ins.referencia);
    } catch (error) {
      // Que uno falle no puede parar a los demás: el que falle se queda
      // pendiente y la siguiente pasada lo recoge, porque esto es idempotente.
      fallidos.push({
        referencia: p.ins.referencia,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await dormir(PAUSA_MS);
  }

  return NextResponse.json({
    simulacro: false,
    enviados: enviados.length,
    fallidos: fallidos.length,
    referenciasEnviadas: enviados,
    errores: fallidos,
  });
}
