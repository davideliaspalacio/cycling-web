# Tibet Epic XCM — inscripciones y recaudo

Plataforma de inscripción y cobro para el maratón de montaña Tibet Epic XCM 2027.
Next.js 16 (App Router) · React 19 · Tailwind 4 · Wompi · Resend.

```bash
pnpm install
pnpm dev          # http://localhost:3000
node scripts/sembrar-demo.mjs   # datos de ejemplo para la demo
```

---

## Lo primero: ¿Wompi cobra por cuotas?

Sí, pero no como uno esperaría. Hay que separar tres cosas que se llaman igual.

**1. `installments` en la API de Wompi — NO sirve para lo que queremos.**
Cuando creas una transacción con tarjeta puedes mandar
`payment_method: { installments: 12 }`. Eso son las **cuotas del banco emisor**:
el banco le financia la compra al tarjetahabiente y **a nosotros nos consigna
los $750.000 completos de una vez**. No hay recaudo mensual del lado del
organizador, y el cupo del ciclista depende de su cupo de crédito.

**2. Wompi no tiene producto de suscripciones ni de planes recurrentes.**
No existe un `/subscriptions` como en Stripe. Lo revisé en la documentación
oficial: no está.

**3. Lo que Wompi sí da, y es lo que usamos: Fuentes de Pago.**
[`docs.wompi.co/docs/colombia/fuentes-de-pago`](https://docs.wompi.co/en/docs/colombia/fuentes-de-pago/)

```
POST /v1/tokens/cards        (llave pública)  → tok_...
POST /v1/payment_sources     (llave privada)  → payment_source_id
POST /v1/transactions        (llave privada)  → cobro contra ese id, cuando queramos
     { payment_source_id, amount_in_cents, reference, recurrent: true }
```

La tarjeta queda guardada del lado de Wompi y nosotros cobramos cuando toque,
sin volver a pedirle nada al ciclista. **El calendario, los reintentos, la mora
y los correos son lógica nuestra** — eso es lo que está implementado en
[`src/lib/servicio.ts`](src/lib/servicio.ts).

### El plan de recaudo que quedó montado

| | |
|---|---|
| Cuotas | 4 |
| Reparto | $188.000 · $188.000 · $187.000 · $187.000 = **$750.000 exactos** |
| Recargo | ninguno |
| Cuota 1 | se cobra al inscribirse, y ahí queda reservado el cupo |
| Cuotas 2–4 | día 5 de cada mes, automáticas |
| Aviso previo | correo 3 días antes de cada cobro |
| Si el banco rechaza | correo con el motivo + reintento a las 48 h, hasta 3 intentos |
| Adelantar | el ciclista puede pagar la siguiente cuota cuando quiera desde su portal |

El reparto se calcula en `repartirEnCuotas()`: redondea al millar y mete el
sobrante en las primeras cuotas, de modo que la suma **siempre** da el total.
Nada de "4 × 188.000 = 752.000".

### Limitaciones que hay que decirle al cliente

- **El plan de cuotas exige tarjeta.** PSE no se puede tokenizar para cobro
  silencioso, y Nequi como fuente de pago necesita que el usuario apruebe en su
  celular. Para quien no tenga tarjeta, la alternativa es mandarle un link de
  pago por cuota (queda como siguiente paso).
- **Antes de producción hay que mover la tokenización al navegador.** Hoy el
  número de tarjeta pasa por nuestro servidor para tokenizarse
  (`src/lib/wompi.ts`). Funciona, pero nos mete en un alcance PCI más pesado del
  necesario. Con la llave pública se puede tokenizar desde el cliente y que al
  servidor solo le llegue el `tok_`. Es un cambio de una tarde.
- **`/panel` no tiene autenticación todavía.**

---

## Cómo está armado

```
src/
  app/
    page.tsx                    Landing
    inscripcion/                Formulario de 5 pasos
    mi-inscripcion/             Portal del ciclista: saldo, cuotas, adelantar
    ticket/[referencia]/        Ticket de inscripción: dorsal, QR, estado de pago
    panel/                      Vista de la organización: recaudo, mora
    correos/                    Bandeja de todo lo enviado, con vista previa
    api/
      inscripciones/            POST  crea la inscripción
      pagos/                    POST  tokeniza, crea fuente de pago, cobra cuota 1
      pagos/cuota/              POST  cobra una cuota puntual
      mi-inscripcion/           POST  consulta por documento + correo
      wompi/webhook/            POST  fuente de verdad de los pagos
      cobros/                   GET   barrido diario (cron)
  lib/
    catalogo.ts     Categorías, municipios, tallas, constantes del evento
    dinero.ts       Reparto de cuotas, calendario, formato COP
    wompi.ts        Cliente de Wompi + firma de integridad + firma de webhooks
    servicio.ts     Reglas de negocio: cobrar, reintentar, disparar correos
    almacen.ts      Persistencia (hoy JSON en disco — ver abajo)
    correos/        Plantillas HTML + envío con Resend
  components/
    perfil-de-etapa.tsx   El progreso del formulario como perfil de altimetría
```

### Decisiones que tomé y por qué

**Persistencia en archivo JSON, detrás de una interfaz.**
`src/lib/almacen.ts` es la única pieza que toca el disco; toda la app habla con
esas seis funciones. Cambiar a Postgres (Neon o Supabase) es reimplementarlas y
nada más se entera. Lo dejé así para no bloquear la demo esperando credenciales
de base de datos — **pero no aguanta producción**: no hay transacciones y no
sobrevive a un despliegue en Vercel (sistema de archivos efímero). Es la primera
tarea después de la reunión.

**Modo simulación en Wompi y en Resend.**
Sin llaves, la app no se cae: `WOMPI_MODO=simulacion` devuelve respuestas
coherentes (la tarjeta `4242…` aprueba, la `4111…` rechaza, igual que el sandbox
real) y los correos se renderizan y quedan en `/correos`. Cuando lleguen las
llaves se cambia el `.env` y **no hay que tocar una sola línea de código**.

**El webhook es la fuente de verdad.**
El cobro por API nos da una respuesta inmediata, pero un pago por PSE o efectivo
solo vuelve por webhook. `/api/wompi/webhook` valida la firma SHA-256 y es
idempotente: si Wompi repite el evento, no se manda el correo dos veces.

**El ticket lleva un QR de verdad.**
`/ticket/<referencia>` genera el código con la librería `qrcode` del lado del
servidor y apunta a la propia URL del ticket, así que en la entrega de kits se
escanea y abre la inscripción con su estado de pago. El dorsal se deriva de la
referencia con un hash estable: el mismo ciclista ve siempre el mismo número sin
necesidad de un contador en base de datos.

**El progreso del formulario es un perfil de altimetría.**
Un ciclista de XCM lee la altimetría antes que nada; sabe dónde está por el
kilómetro, no por un "paso 3 de 5". El avance del formulario **es** el perfil de
la carrera, con el corredor subiendo hacia la meta.

---

## Correos

Seis plantillas, todas en `src/lib/correos/plantillas.ts`, HTML con tablas e
estilos en línea porque Gmail y Outlook descartan `<style>`, flexbox y fuentes web.

| Plantilla | Cuándo sale |
|---|---|
| `inscripcion-confirmada` | pago de contado aprobado |
| `plan-cuotas-activado` | primera cuota cobrada, con el calendario completo |
| `cuota-pagada` | cada cobro mensual, con comprobante y saldo restante |
| `recordatorio-cuota` | 3 días antes del cobro |
| `cuota-fallida` | el banco rechazó, con el motivo y cómo resolverlo |
| `inscripcion-saldada` | última cuota pagada |

Todo lo enviado queda en **`/correos`**, con vista previa del HTML real.

### Para que no caigan en spam

Resend por sí solo no basta. Hay que hacer esto en el DNS de `tibetepic.com`:

1. Verificar el dominio en Resend (`Domains → Add Domain`).
2. Publicar los registros que entrega: **DKIM** (`resend._domainkey`), **SPF**
   (`v=spf1 include:amazonses.com ~all`) y el CNAME de return-path.
3. Agregar **DMARC**: `_dmarc.tibetepic.com` → `v=DMARC1; p=none; rua=mailto:dmarc@tibetepic.com`
   (arrancar en `p=none`, y subir a `quarantine` cuando los reportes salgan limpios).
4. Enviar desde un subdominio dedicado (`inscripciones@tibetepic.com` o
   `mail.tibetepic.com`) para que un problema de reputación no toque el correo
   corporativo.

Costo: Resend es gratis hasta 3.000 correos/mes y 100/día; el plan de US$20
sube a 50.000/mes. Con 900 cupos y ~6 correos por ciclista, el plan pago cubre
la temporada de sobra.

---

## Demos en vídeo

```bash
node scripts/grabar-demo.mjs            # los tres
node scripts/grabar-demo.mjs celular    # solo uno
```

Usa el Chrome instalado en el equipo (no descarga navegadores) y deja los `.mp4`
en `videos-demo/`, con un `LEEME.md` que explica cada uno. Las grabaciones
simulan a una persona: cursor visible, movimientos con curva, tecleo irregular y
scroll con inercia — nada de saltos de robot. Requiere `ffmpeg`.

---

## Variables de entorno

```bash
# Wompi — https://comercios.wompi.co
WOMPI_MODO=sandbox                    # simulacion | sandbox | produccion
NEXT_PUBLIC_WOMPI_LLAVE_PUBLICA=pub_test_...
WOMPI_LLAVE_PRIVADA=prv_test_...
WOMPI_SECRETO_INTEGRIDAD=test_integrity_...
WOMPI_SECRETO_EVENTOS=test_events_...

# Resend — https://resend.com/api-keys
RESEND_API_KEY=re_...
CORREO_REMITENTE="Tibet Epic XCM <inscripciones@tibetepic.com>"
CORREO_RESPUESTA=contacto@tibetepic.com

# App
URL_PUBLICA=https://inscripciones.tibetepic.com
CRON_SECRETO=<cadena larga aleatoria>
```

En el panel de Wompi hay que registrar el webhook apuntando a
`https://<dominio>/api/wompi/webhook`.

El cobro mensual lo dispara el cron de Vercel (`vercel.json`), todos los días a
las 8:00 de Colombia.

---

## Lo que sigue

1. Base de datos real (Postgres) reemplazando `almacen.ts`.
2. Tokenización de tarjeta en el navegador.
3. Autenticación en `/panel`.
4. Link de pago por cuota para quien no tenga tarjeta.
5. Exportar inscritos a CSV para cronometraje y seguros.
