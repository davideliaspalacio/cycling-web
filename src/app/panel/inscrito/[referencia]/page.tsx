import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado, Pie } from "@/components/marco";
import { BotonEnlace, Chip, Tarjeta, TituloSeccion } from "@/components/ui";
import { inscripcionPorReferencia, seguimientoCorreos } from "@/lib/almacen";
import {
  ANIO_CARRERA,
  PRENDAS,
  categoriaPorCodigo,
  cuentaDeCanal,
} from "@/lib/catalogo";
import { estadoVisible, nombreDePlantilla } from "@/lib/correos/seguimiento";
import { HAY_WEBHOOK } from "@/lib/correos/webhook";
import { fechaLarga, pesos } from "@/lib/dinero";
import { resumenDePago } from "@/lib/servicio";
import type {
  Abono,
  EstadoAbono,
  EstadoInscripcion,
  Inscripcion,
  PlanPago,
} from "@/lib/tipos";
import { avisoDeCategoria, edadEnCarrera } from "@/lib/validacion";

export const dynamic = "force-dynamic";
export const metadata = {
  // Datos personales: fuera de los buscadores, además del robots.txt.
  robots: { index: false, follow: false },

  title: "Ficha del inscrito",
};

/**
 * Todo lo que se sabe de UNA inscripción, en una pantalla.
 *
 * La tabla de /panel responde la pregunta del dinero —quién debe— y para eso
 * está bien. Lo que no había en ninguna parte era lo demás: el RH, la EPS, el
 * contacto de emergencia, las tallas, quién lo refirió. Estaba guardado y solo
 * se podía consultar entrando a la base a mano, que es tanto como no tenerlo.
 *
 * El orden de los bloques no es el de la base, es el de las preguntas que se
 * hacen de verdad: quién es → cómo lo llamo → qué pasa si se cae → qué corre y
 * qué talla usa → cómo va de plata → qué comprobantes subió → qué le mandamos
 * → qué le ha pasado a esta inscripción. Salud y emergencia va arriba del todo
 * de lo operativo a propósito: es lo que alguien busca con prisa.
 *
 * La ruta va por `referencia` y no por `id`: es lo que la organización tiene a
 * mano (está en el correo del ciclista y en el chat de WhatsApp), así que el
 * enlace se puede pegar y funciona.
 */

const TONO_ESTADO: Record<
  EstadoInscripcion,
  "turquesa" | "sol" | "alerta" | "nube"
> = {
  BORRADOR: "nube",
  PENDIENTE_PAGO: "alerta",
  EN_VERIFICACION: "sol",
  AL_DIA: "sol",
  EN_MORA: "alerta",
  COMPLETA: "turquesa",
};

const TEXTO_ESTADO: Record<EstadoInscripcion, string> = {
  BORRADOR: "Sin terminar",
  PENDIENTE_PAGO: "Sin pagar",
  EN_VERIFICACION: "Por verificar",
  AL_DIA: "Al día",
  EN_MORA: "En mora",
  COMPLETA: "Completa",
};

const PLAN: Record<PlanPago, string> = {
  CONTADO: "Contado (tarjeta · histórico)",
  CUOTAS: "Cuotas (tarjeta · histórico)",
  TOTAL: "Pago total",
  ABONOS: "Dos cuotas",
  ABONOS_2: "Dos cuotas",
  ABONOS_3: "Tres cuotas",
};

const TEXTO_ABONO: Record<EstadoAbono, string> = {
  ENVIADA: "Sin revisar",
  EN_REVISION: "En revisión",
  VERIFICADA: "Verificado",
  RECHAZADA: "Rechazado",
};

const TONO_ABONO: Record<EstadoAbono, "turquesa" | "sol" | "alerta" | "marea"> = {
  ENVIADA: "marea",
  EN_REVISION: "sol",
  VERIFICADA: "turquesa",
  RECHAZADA: "alerta",
};

/**
 * Los tipos que escribe `anota()` en `servicio.ts`. Uno nuevo sin traducir se
 * lee raro pero se lee, igual que en el seguimiento de correos.
 */
const TEXTO_EVENTO: Record<string, string> = {
  creada: "Se inscribió",
  "abono-recibido": "Subió un comprobante",
  "abono-verificado": "Comprobante verificado",
  "abono-rechazado": "Comprobante rechazado",
  "inscripcion-completa": "Inscripción completa",
  vencida: "Se pasó de fecha",
  "cambio-de-competidor": "Cambio de competidor",
  "correccion-de-datos": "Corrección de datos",
};

const nombreDeEvento = (tipo: string) =>
  TEXTO_EVENTO[tipo] ??
  tipo.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ------------------------------ Piezas sueltas ---------------------------- */

/**
 * Una etiqueta y su valor. `vacio` es el texto que se pinta cuando el ciclista
 * no llenó el campo: dejar la línea en blanco haría dudar de si el dato falta
 * o si la pantalla se lo comió.
 */
function Dato({
  etiqueta,
  valor,
  vacio = "No lo puso",
  destacado,
}: {
  etiqueta: string;
  valor?: string | null;
  vacio?: string;
  destacado?: boolean;
}) {
  const hay = Boolean(valor && valor.trim());
  return (
    <div className="flex flex-col gap-0.5 border-b border-tinta/12 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.13em] text-tinta/75">
        {etiqueta}
      </span>
      <span
        className={`break-words sm:text-right ${
          hay
            ? `font-display font-extrabold text-tinta ${destacado ? "text-[1.15rem]" : "text-[0.92rem]"}`
            : "text-[0.85rem] italic text-tinta/75"
        }`}
      >
        {hay ? valor : vacio}
      </span>
    </div>
  );
}

function Bloque({
  titulo,
  nota,
  tono = "nube",
  children,
}: {
  titulo: string;
  nota?: string;
  tono?: "nube" | "sol" | "marea";
  children: React.ReactNode;
}) {
  return (
    <Tarjeta tono={tono} className="p-5 sm:p-6">
      <h3 className="font-display text-[1.15rem] font-extrabold leading-tight tracking-[-0.02em] text-tinta">
        {titulo}
      </h3>
      {nota && (
        <p className="mt-1 text-[0.82rem] leading-snug text-tinta/75">{nota}</p>
      )}
      <div className="mt-3">{children}</div>
    </Tarjeta>
  );
}

/* --------------------------------- Bloques -------------------------------- */

function Comprobante({ abono }: { abono: Abono }) {
  const cuenta = cuentaDeCanal(abono.canal);
  return (
    <li className="rounded-2xl border-[3px] border-tinta bg-bruma p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tono={TONO_ABONO[abono.estado]}>{TEXTO_ABONO[abono.estado]}</Chip>
        <Chip tono="nube">Cuota {abono.numero}</Chip>
        <span className="raya-mono text-[0.68rem] text-tinta/75">
          Subido el {cuando(abono.creadoEn)}
        </span>
      </div>
      <Dato etiqueta="Monto declarado" valor={pesos(abono.montoDeclarado)} />
      <Dato
        etiqueta="Monto aprobado"
        valor={
          abono.montoAprobado === undefined ? null : pesos(abono.montoAprobado)
        }
        vacio={
          abono.estado === "RECHAZADA" ? "Rechazado, no entró nada" : "Sin revisar"
        }
      />
      <Dato
        etiqueta="Canal"
        valor={`${cuenta?.entidad ?? abono.canal}${cuenta ? ` · ${cuenta.numero}` : ""}`}
      />
      <Dato
        etiqueta="Fecha de la transferencia"
        valor={abono.transferidoEl ? fechaLarga(abono.transferidoEl) : null}
      />
      <Dato
        etiqueta="Número de comprobante del banco"
        valor={abono.referenciaExterna}
      />
      <Dato
        etiqueta="Quién lo revisó"
        valor={
          abono.revisadoPor
            ? `${abono.revisadoPor}${abono.revisadoEn ? ` · ${cuando(abono.revisadoEn)}` : ""}`
            : null
        }
        vacio="Todavía nadie"
      />
      {abono.motivoRechazo && (
        <Dato etiqueta="Motivo del rechazo" valor={abono.motivoRechazo} />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <a
          href={`/api/evidencias/${abono.id}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          Ver el comprobante ↗
        </a>
        <span className="raya-mono text-[0.64rem] text-tinta/75">
          {abono.evidenciaTipo} · {Math.round(abono.evidenciaBytes / 1024)} KB
        </span>
      </div>
    </li>
  );
}

/* -------------------------------- Pantalla -------------------------------- */

export default async function FichaDelInscrito({
  params,
}: PageProps<"/panel/inscrito/[referencia]">) {
  const { referencia } = await params;
  const ins: Inscripcion | undefined = await inscripcionPorReferencia(
    decodeURIComponent(referencia),
  );
  if (!ins) notFound();

  const [pago, correos] = await Promise.all([
    resumenDePago(ins),
    // La referencia es UNIQUE, así que buscar por ella trae los correos de
    // esta inscripción y de ninguna otra.
    seguimientoCorreos({ q: ins.referencia }),
  ]);

  const categoria = categoriaPorCodigo(ins.categoriaCodigo);
  const c = ins.ciclista;
  const edad = c.fechaNacimiento ? edadEnCarrera(c.fechaNacimiento) : null;
  // El mismo aviso que ve el ciclista al inscribirse. Si su categoría no le
  // corresponde por edad, aquí es donde alguien tiene que enterarse.
  const aviso = avisoDeCategoria(ins.categoriaCodigo, c.fechaNacimiento);

  return (
    <>
      <Encabezado compacto />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/panel"
          className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
        >
          ← Panel
        </Link>

        <TituloSeccion
          className="mt-5"
          eyebrow={`Uso interno · ${ins.referencia}`}
          titulo={`${c.nombres} ${c.apellidos}`}
          bajada="Todo lo que llenó al inscribirse, lo que ha pagado, los comprobantes que subió, los correos que le mandamos y lo que le ha pasado a su cupo."
        />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Chip tono={TONO_ESTADO[ins.estado]}>{TEXTO_ESTADO[ins.estado]}</Chip>
          <Chip tono="nube">{categoria?.nombre ?? ins.categoriaCodigo}</Chip>
          <Chip tono="nube">{PLAN[ins.plan]}</Chip>
          <span className="raya-mono text-[0.7rem] text-tinta/75">
            Se inscribió el {cuando(ins.creadaEn)}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {/*
            Corregir y ceder son cosas distintas y se entra por puertas
            distintas a propósito: la corrección arregla un dato mal escrito del
            mismo titular; la cesión le pasa el cupo a otra persona y deja otra
            clase de constancia.
          */}
          <BotonEnlace
            href={`/panel/inscrito/${encodeURIComponent(ins.referencia)}/editar`}
            tono="turquesa"
          >
            Corregir sus datos
          </BotonEnlace>
          <BotonEnlace
            href={`/panel/competidor?q=${encodeURIComponent(ins.referencia)}`}
            tono="sol"
          >
            Ceder el cupo a otra persona
          </BotonEnlace>
          <BotonEnlace
            href={`/mi-inscripcion?ref=${encodeURIComponent(ins.referencia)}`}
            tono="nube"
          >
            Ver lo que ve el ciclista
          </BotonEnlace>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {/* ------------------------- Quién es ------------------------- */}
          <Bloque titulo="Quién es">
            <Dato etiqueta="Nombres" valor={c.nombres} />
            <Dato etiqueta="Apellidos" valor={c.apellidos} />
            <Dato etiqueta="Documento" valor={c.identificacion} />
            <Dato etiqueta="Sexo" valor={c.sexo} />
            <Dato
              etiqueta="Fecha de nacimiento"
              valor={c.fechaNacimiento ? fechaLarga(c.fechaNacimiento) : null}
            />
            {/*
              La edad al 31 de diciembre del año de la carrera es la que decide
              si su categoría vale. La cumplida hoy no sirve para nada aquí.
            */}
            <Dato
              etiqueta={`Edad al 31 de diciembre de ${ANIO_CARRERA}`}
              valor={edad === null ? null : `${edad} años`}
              destacado
            />
          </Bloque>

          {/* ----------------------- Cómo contactarlo -------------------- */}
          <Bloque titulo="Cómo contactarlo">
            <Dato etiqueta="Correo" valor={c.correo} />
            <Dato etiqueta="Celular" valor={c.telefono} />
            <Dato etiqueta="Dirección" valor={c.direccion} />
            <Dato etiqueta="Ciudad" valor={c.ciudad} />
            <Dato etiqueta="Departamento" valor={c.departamento} />
            <Dato etiqueta="País" valor={c.pais} />
          </Bloque>

          {/* ---------------------- Salud y emergencia ------------------- */}
          {/*
            En amarillo y con el RH en grande: este bloque no se consulta con
            calma, se consulta cuando alguien se cayó y hay que llamar a
            alguien ya.
          */}
          <Bloque
            titulo="Salud y emergencia"
            nota="Lo que hace falta si le pasa algo en carrera."
            tono="sol"
          >
            <Dato etiqueta="RH" valor={c.rh} destacado />
            <Dato etiqueta="EPS" valor={c.eps} />
            <Dato
              etiqueta="Contacto de emergencia"
              valor={c.contactoEmergencia}
              destacado
            />
            <Dato
              etiqueta="Teléfono de emergencia"
              valor={c.telefonoEmergencia}
              destacado
            />
          </Bloque>

          {/* --------------------------- Carrera ------------------------- */}
          <Bloque titulo="Carrera y kit">
            <Dato
              etiqueta="Categoría"
              valor={categoria?.nombre ?? ins.categoriaCodigo}
            />
            <Dato etiqueta="Requisito de la categoría" valor={categoria?.requisito} />
            {PRENDAS.map((prenda) => (
              <Dato
                key={prenda.campo}
                etiqueta={prenda.nombre}
                valor={ins.tallas[prenda.campo]}
              />
            ))}
            <Dato
              etiqueta="Quién lo refirió"
              valor={c.referidoPor}
              vacio="Nadie: llegó por su cuenta"
            />
            {aviso && (
              <p className="mt-3 rounded-2xl border-[3px] border-tinta bg-alerta px-4 py-3 text-[0.85rem] font-bold leading-relaxed text-nube">
                Ojo con la categoría: {aviso}
              </p>
            )}
          </Bloque>
        </div>

        {/* ----------------------------- Pago ---------------------------- */}
        <div className="mt-4">
          <Bloque
            titulo="Cómo va de pago"
            nota="Solo cuenta el dinero que alguien verificó contra el extracto. Lo declarado y sin revisar todavía no es dinero."
          >
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <Dato etiqueta="Plan" valor={PLAN[ins.plan]} />
                <Dato
                  etiqueta="En cuántas cuotas quedó"
                  valor={pago.cuotas ? `${pago.cuotas}` : null}
                  vacio="Sin elegir: no ha subido ningún comprobante"
                />
                <Dato
                  etiqueta="Medio de pago"
                  valor={
                    ins.medioPago === "TRANSFERENCIA"
                      ? "Transferencia con comprobante"
                      : "Tarjeta por pasarela (histórico)"
                  }
                />
              </div>
              <div>
                <Dato etiqueta="Total de la inscripción" valor={pesos(ins.total)} />
                <Dato etiqueta="Pagado y verificado" valor={pesos(pago.verificado)} />
                <Dato etiqueta="Saldo" valor={pesos(pago.saldo)} destacado />
                {pago.excedente > 0 && (
                  <Dato
                    etiqueta="Transfirió de más"
                    valor={pesos(pago.excedente)}
                    destacado
                  />
                )}
              </div>
            </div>

            {pago.plan.length > 0 ? (
              <>
                <h4 className="mt-5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
                  Su calendario de cuotas
                </h4>
                <ol className="mt-2 flex flex-col gap-2">
                  {pago.plan.map((cuota) => (
                    <li
                      key={cuota.numero}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border-[3px] border-tinta bg-bruma px-4 py-2.5"
                    >
                      <span className="font-display text-[0.92rem] font-extrabold text-tinta">
                        Cuota {cuota.numero} de {pago.cuotas}
                      </span>
                      <span className="text-[0.85rem] text-tinta/75">
                        Vence el {fechaLarga(cuota.vence)}
                      </span>
                      <span className="raya-mono text-[0.85rem] font-bold text-tinta">
                        {pesos(cuota.monto)}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-4 text-[0.88rem] leading-relaxed text-tinta/75">
                {pago.saldo === 0
                  ? "No quedan cuotas: la inscripción está saldada."
                  : "Todavía no hay calendario. El plan lo fija el primer comprobante que suba, según el monto que declare."}
              </p>
            )}

            {/*
              Las cuotas de la pasarela vieja son otra cosa que el plan de
              transferencias, y se guardan aparte. Donde existan, se enseñan:
              son el libro de dinero de esas inscripciones.
            */}
            {ins.cuotas.length > 0 && (
              <>
                <h4 className="mt-5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-tinta/75">
                  Cuotas de la pasarela (histórico)
                </h4>
                <ol className="mt-2 flex flex-col gap-2">
                  {ins.cuotas.map((cuota) => (
                    <li
                      key={cuota.numero}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border-[3px] border-tinta bg-bruma px-4 py-2.5"
                    >
                      <span className="font-display text-[0.92rem] font-extrabold text-tinta">
                        Cuota {cuota.numero} · {cuota.estado.toLowerCase()}
                      </span>
                      <span className="text-[0.85rem] text-tinta/75">
                        Vence el {fechaLarga(cuota.vence)}
                      </span>
                      <span className="raya-mono text-[0.85rem] font-bold text-tinta">
                        {pesos(cuota.monto)}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Bloque>
        </div>

        {/* ------------------------- Comprobantes ------------------------ */}
        <div className="mt-4">
          <Bloque
            titulo={`Sus comprobantes (${pago.abonos.length})`}
            nota="Lo que subió, lo que declaró, lo que se le aprobó y quién lo miró."
          >
            {pago.abonos.length === 0 ? (
              <p className="text-[0.88rem] leading-relaxed text-tinta/75">
                No ha subido ninguno.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pago.abonos.map((abono) => (
                  <Comprobante key={abono.id} abono={abono} />
                ))}
              </ul>
            )}
          </Bloque>
        </div>

        {/* ---------------------------- Correos -------------------------- */}
        <div className="mt-4">
          <Bloque
            titulo={`Sus correos (${correos.length})`}
            nota="Enviado no es entregado: aquí solo dice «entregado» cuando el servidor del ciclista lo confirmó."
          >
            {correos.length === 0 ? (
              <p className="text-[0.88rem] leading-relaxed text-tinta/75">
                No se le ha mandado ningún correo.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {correos.map((correo) => {
                  const estado = estadoVisible(correo, HAY_WEBHOOK);
                  return (
                    <li
                      key={correo.id}
                      className="flex flex-col gap-2 rounded-2xl border-[3px] border-tinta bg-bruma p-4 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <Chip tono={estado.tono} className="self-start sm:w-40 sm:shrink-0">
                        {estado.etiqueta}
                      </Chip>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[0.95rem] font-extrabold leading-snug text-tinta">
                          {nombreDePlantilla(correo.plantilla)}
                        </p>
                        <p className="raya-mono mt-0.5 break-words text-[0.68rem] text-tinta/75">
                          {correo.para} · {cuando(correo.enviadoEn)}
                        </p>
                      </div>
                      <Link
                        href={`/correos/${correo.id}`}
                        className="shrink-0 font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] text-rio hover:underline"
                      >
                        Ver el correo →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3">
              <Link
                href={`/panel/correos?q=${encodeURIComponent(ins.referencia)}`}
                className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
              >
                Abrir el seguimiento de sus correos →
              </Link>
            </p>
          </Bloque>
        </div>

        {/* --------------------------- Legales --------------------------- */}
        <div className="mt-4">
          <Bloque
            titulo="Lo que aceptó"
            nota="Las tres casillas son obligatorias para inscribirse; quedan aquí como constancia."
          >
            <Dato
              etiqueta="Política de pago"
              valor={ins.consentimientos.politicaPago ? "Aceptada" : null}
              vacio="NO aceptada"
            />
            <Dato
              etiqueta="Tratamiento de datos"
              valor={ins.consentimientos.datos ? "Aceptado" : null}
              vacio="NO aceptado"
            />
            <Dato
              etiqueta="Exoneración de responsabilidad"
              valor={ins.consentimientos.exoneracion ? "Aceptada" : null}
              vacio="NO aceptada"
            />
            {ins.autorizacionCobro && (
              <Dato
                etiqueta="Autorización de cobro recurrente"
                valor={`Aceptada el ${cuando(ins.autorizacionCobro.aceptadaEn)}${
                  ins.autorizacionCobro.ip
                    ? ` desde ${ins.autorizacionCobro.ip}`
                    : ""
                }`}
              />
            )}
            {ins.tarjetaResumen && (
              <Dato
                etiqueta="Tarjeta guardada (histórico)"
                valor={`${ins.tarjetaResumen.marca} ····${ins.tarjetaResumen.ultimos4}`}
              />
            )}
          </Bloque>
        </div>

        {/* --------------------------- Bitácora -------------------------- */}
        <div className="mt-4">
          <Bloque
            titulo="Bitácora"
            nota="Todo lo que le ha pasado a esta inscripción, de lo más reciente a lo más antiguo."
            tono="marea"
          >
            {ins.eventos.length === 0 ? (
              <p className="text-[0.88rem] leading-relaxed text-tinta/75">
                No hay nada anotado.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {ins.eventos.map((evento, i) => (
                  <li
                    key={`${evento.en}-${i}`}
                    className="rounded-2xl border-[3px] border-tinta bg-nube p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-display text-[0.95rem] font-extrabold text-tinta">
                        {nombreDeEvento(evento.tipo)}
                      </span>
                      <span className="raya-mono text-[0.68rem] text-tinta/75">
                        {cuando(evento.en)}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.88rem] leading-relaxed text-tinta/85">
                      {evento.detalle}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Bloque>
        </div>

        <p className="mt-8">
          <Link
            href="/panel"
            className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rio hover:underline"
          >
            ← Volver al panel
          </Link>
        </p>
      </main>
      <Pie />
    </>
  );
}
