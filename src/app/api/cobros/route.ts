import { NextResponse } from "next/server";
import { listarInscripciones } from "@/lib/almacen";
import { barrerCobros } from "@/lib/servicio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Barrido diario de cobros. Lo dispara el cron de Vercel (ver vercel.json).
 * Cobra lo vencido y manda recordatorios de lo que vence en tres días.
 */
export async function GET(peticion: Request) {
  // Vercel manda "Authorization: Bearer $CRON_SECRET" con ese nombre exacto.
  const secreto = process.env.CRON_SECRET ?? process.env.CRON_SECRETO;
  const autorizacion = peticion.headers.get("authorization");
  if (secreto && autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const inscripciones = await listarInscripciones();
  const resumen = await barrerCobros(inscripciones);
  return NextResponse.json({ corridaEn: new Date().toISOString(), ...resumen });
}
