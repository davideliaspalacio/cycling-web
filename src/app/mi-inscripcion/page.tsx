import { Encabezado, Pie } from "@/components/marco";
import {
  PortalCiclista,
  type AbonoVisible,
  type VistaPortal,
} from "@/components/portal-ciclista";
import { inscripcionPorReferencia } from "@/lib/almacen";
import {
  CUENTAS_RECAUDO,
  FECHA_LIMITE_ABONOS,
  NOMBRE_COMPLETO,
  categoriaPorCodigo,
} from "@/lib/catalogo";
import { abonadoEnRevision } from "@/lib/dinero";
import { resumenDePago } from "@/lib/servicio";
import type { Abono, Inscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Mi inscripción — ${NOMBRE_COMPLETO}`,
};

/**
 * Un abono recortado a lo que su dueño necesita ver.
 *
 * Se quitan `evidenciaClave` (la ruta del archivo en el almacén privado),
 * `evidenciaSha256` y la huella de red. Nada de eso le sirve al ciclista y
 * publicarlo solo agranda la superficie: la clave es lo único que separa un
 * comprobante ajeno de quien sepa adivinar una URL.
 */
function abonoVisible(abono: Abono): AbonoVisible {
  return {
    id: abono.id,
    numero: abono.numero,
    creadoEn: abono.creadoEn,
    canal: abono.canal,
    montoDeclarado: abono.montoDeclarado,
    transferidoEl: abono.transferidoEl,
    referenciaExterna: abono.referenciaExterna,
    estado: abono.estado,
    montoAprobado: abono.montoAprobado,
    revisadoEn: abono.revisadoEn,
    motivoRechazo: abono.motivoRechazo,
  };
}

/**
 * Arma la vista del portal en el servidor.
 *
 * El estado de pago sale de los abonos, no de `ins.pagado` ni de las cuotas:
 * bajo pago manual la tabla de cuotas es un plan sugerido y no el libro de
 * dinero (docs/decisiones-pago-manual.md §1).
 */
async function vistaDe(ins: Inscripcion): Promise<VistaPortal> {
  const categoria = categoriaPorCodigo(ins.categoriaCodigo);
  const resumen = await resumenDePago(ins);

  return {
    referencia: ins.referencia,
    estado: ins.estado,
    categoria: categoria
      ? { nombre: categoria.nombre, km: categoria.km, desnivel: categoria.desnivel }
      : null,
    ciclista: {
      nombres: ins.ciclista.nombres,
      apellidos: ins.ciclista.apellidos,
      correo: ins.ciclista.correo,
      ciudad: ins.ciclista.ciudad,
    },
    total: ins.total,
    pago: {
      abonos: resumen.abonos.map(abonoVisible),
      verificado: resumen.verificado,
      enRevision: abonadoEnRevision(resumen.abonos),
      saldo: resumen.saldo,
      excedente: resumen.excedente,
      abonosDisponibles: resumen.abonosDisponibles,
      cerrado: resumen.cerrado,
      fechaLimite: FECHA_LIMITE_ABONOS,
      plan: resumen.plan,
      dosCuotas: resumen.dosCuotas,
      venceSegundaCuota: resumen.venceSegundaCuota,
      montoMinimo: resumen.montoMinimo,
    },
  };
}

export default async function PaginaPortal({
  searchParams,
}: PageProps<"/mi-inscripcion">) {
  const { ref } = await searchParams;

  // El enlace de los correos —y el buscador, después de encontrar la
  // referencia— traen ?ref=. Se resuelve aquí para que la página llegue ya
  // pintada y con el historial de abonos completo.
  const inscripcion =
    typeof ref === "string" ? await inscripcionPorReferencia(ref) : undefined;

  return (
    <>
      <Encabezado compacto />
      <main className="flex-1">
        {/*
          `CUENTAS_RECAUDO` se lee en el servidor a propósito: sus números
          salen de variables de entorno sin `NEXT_PUBLIC_` y en el navegador
          valdrían el respaldo del repositorio.
        */}
        <PortalCiclista
          vista={inscripcion ? await vistaDe(inscripcion) : null}
          cuentas={CUENTAS_RECAUDO}
        />
      </main>
      <Pie />
    </>
  );
}
