# Tibet Epic XCM — inscripciones y recaudo

Plataforma de inscripción y cobro para el maratón de montaña **Tibet Epic XCM 2027**.
Permite inscribirse en cinco pasos y pagar de contado o en cuatro cuotas mensuales
que se cobran solas.

**Next.js 16** (App Router) · **React 19** · **Tailwind 4** · **Postgres** (Neon) ·
**Wompi** (Bancolombia) · **Resend**

---

## Arranque

```bash
pnpm install
cp .env.example .env.local                        # y pega tus llaves
node --env-file=.env.local scripts/migrar.mjs     # crea las tablas
pnpm dev
node scripts/sembrar-demo.mjs                     # datos de ejemplo
```

Sin `DATABASE_URL` la app arranca igual, guardando en `.datos/`. Sirve para ver la
demo; no para producción. Sin llaves de Wompi corre en modo simulación.

---

## Arquitectura

```mermaid
graph TD
    subgraph nav["Navegador"]
        F["Formulario · 5 pasos"]
        M["Modal de Wompi<br/>captura la tarjeta"]
        P["Portal del ciclista<br/>y ticket"]
    end

    subgraph app["Next.js · App Router"]
        API["Rutas /api"]
        SRV["lib/servicio.ts<br/>reglas de negocio"]
        ALM["lib/almacen<br/>persistencia"]
        WOM["lib/wompi.ts<br/>cliente de pagos"]
        COR["lib/correos<br/>plantillas y envío"]
    end

    subgraph fuera["Servicios externos"]
        WP["Wompi<br/>bóveda y cobros"]
        RS["Resend · correo"]
        PG["Postgres · Neon"]
    end

    CRON["Cron diario<br/>8:00 Colombia"]

    F -->|"datos de la inscripción"| API
    M -->|"token de la tarjeta"| API
    P -->|"consultas y adelantos"| API
    API --> SRV
    SRV --> ALM
    SRV --> WOM
    SRV --> COR
    ALM --> PG
    WOM -->|"cobra"| WP
    COR -->|"envía"| RS
    WP -.->|"webhook: resultado real"| API
    CRON -->|"GET /api/cobros"| API
```

**La regla que sostiene todo:** nadie fuera de `lib/servicio.ts` decide sobre dinero,
y nadie fuera de `lib/almacen` toca la persistencia.

---

## El flujo de inscripción

Cinco pasos. La inscripción se crea en la base al salir de *Permisos*, antes de pagar,
para que un pago fallido no obligue a llenar todo otra vez.

```mermaid
graph LR
    A["KM 00<br/>Categoría"] --> B["KM 23<br/>Datos"]
    B --> C["KM 46<br/>Tallas"]
    C --> D["KM 69<br/>Permisos"]
    D -->|"POST /api/inscripciones"| E["KM 92<br/>Pago"]
    E --> T["Ticket"]
```

El avance no se muestra como «paso 3 de 5» sino como el **perfil de altimetría de la
carrera**: un ciclista de XCM sabe dónde está por el kilómetro y la pendiente.

---

## Pagos

### Lo primero: Wompi no tiene cuotas

Hay que separar tres cosas que se llaman igual:

| | Qué es |
|---|---|
| `payment_method.installments` | **Cuotas del banco emisor.** El banco financia al tarjetahabiente y al comercio le consignan todo de una. No sirve para recaudo mensual. |
| Suscripciones | **No existen en Wompi.** |
| **Fuentes de pago** | Lo que sí hay, y lo que usamos: Wompi guarda la tarjeta y nos da un `payment_source_id` para cobrar cuando queramos. |

**El calendario, los reintentos, la mora y los correos son lógica de esta app.** Wompi
es el datáfono; nosotros decidimos a quién cobrarle, cuándo y qué hacer si el banco
rechaza.

### Pago de contado

```mermaid
sequenceDiagram
    participant C as Ciclista
    participant A as App
    participant W as Wompi

    C->>A: Elige "todo de una"
    A->>A: Calcula la firma de integridad<br/>(el secreto no sale del servidor)
    A-->>C: Configuración del widget
    C->>W: Abre el modal y paga
    W-->>C: Devuelve id de transacción
    C->>A: POST /api/pagos/confirmar
    A->>W: GET /transactions/{id}
    W-->>A: APPROVED
    A->>A: Marca pagado y envía comprobante
    W--)A: Webhook (fuente de verdad)
```

No le creemos al navegador: el modal nos da un id y **nosotros le preguntamos a Wompi**
cuál es el estado real.

### Activar el plan de cuotas

El modal se abre en modo `tokenize`: **no cobra nada**, solo captura la tarjeta. El
número nunca pasa por nuestro servidor.

```mermaid
sequenceDiagram
    participant C as Ciclista
    participant A as App
    participant W as Wompi

    C->>A: Elige "4 cuotas" y autoriza el cobro recurrente
    C->>W: Modal en modo tokenize
    W-->>A: POST /api/pagos/tokenizado (token de tarjeta)
    A->>W: POST /payment_sources
    W-->>A: payment_source_id
    A->>A: Crea el calendario de 4 cuotas
    A->>W: POST /transactions (cuota 1)
    W-->>A: PENDING, luego APPROVED
    A->>C: Correo con el calendario y la constancia
```

### Cobro mensual

```mermaid
sequenceDiagram
    participant K as Cron (8:00)
    participant A as App
    participant W as Wompi
    participant C as Ciclista

    K->>A: GET /api/cobros
    A->>A: Busca cuotas que vencen hoy
    Note over A: Faltan 3 días, sale correo de aviso
    A->>W: POST /transactions con payment_source_id
    alt Aprobado
        W-->>A: APPROVED
        A->>C: Comprobante con el saldo restante
    else Rechazado
        W-->>A: DECLINED y el motivo
        A->>C: Correo con el motivo y cómo resolverlo
        Note over A: Reintenta a las 48 h, hasta 3 veces
    end
```

### Estados de una cuota

```mermaid
stateDiagram-v2
    [*] --> PENDIENTE: se crea el calendario
    PENDIENTE --> EN_PROCESO: se reclama para cobrar
    EN_PROCESO --> PAGADA: APPROVED
    EN_PROCESO --> FALLIDA: DECLINED o ERROR
    EN_PROCESO --> EN_PROCESO: sigue PENDING, lo cierra el webhook
    FALLIDA --> EN_PROCESO: reintento a las 48 h
    PAGADA --> [*]
```

**`EN_PROCESO` no es decorativo.** Wompi responde `PENDING` y liquida un par de segundos
después; tratar ese `PENDING` como fallo hacía que reintentáramos un cobro que iba a
aprobarse — y eso es cobrar dos veces. Una cuota sin liquidar nunca se reintenta.

### Cómo se evita el cobro doble

Tres capas independientes:

1. **Reclamo atómico.** Tomar una cuota es un solo `UPDATE ... WHERE estado <> 'EN_PROCESO'`.
   Si entran dos peticiones a la vez, la base deja pasar una y a la otra le devuelve cero filas.
2. **Estado `EN_PROCESO`.** Un cobro cuyo resultado no conocemos no se relanza.
3. **Referencia única por intento** (`TE27-XXXXXX-C2-1`). Wompi rechaza referencias repetidas.

---

## Modelo de datos

```mermaid
erDiagram
    INSCRIPCIONES ||--o{ CUOTAS : tiene
    INSCRIPCIONES {
        uuid id PK
        text referencia UK
        text estado
        text categoria_codigo
        jsonb ciclista
        jsonb tallas
        jsonb consentimientos
        text plan
        integer total
        integer pagado
        bigint fuente_pago_id
        jsonb tarjeta_resumen
        jsonb autorizacion_cobro
        jsonb eventos
    }
    CUOTAS {
        uuid inscripcion_id PK
        integer numero PK
        date vence
        integer monto
        text estado
        text referencia
        text transaccion_id
        integer intentos
        timestamptz ultimo_intento_en
        text ultimo_error
    }
    CORREOS {
        uuid id PK
        text para
        text asunto
        text plantilla
        text html
        text referencia
    }
```

- `estado` de la inscripción: `PENDIENTE_PAGO` · `AL_DIA` · `EN_MORA` · `COMPLETA`
- `plan`: `CONTADO` · `CUOTAS`
- `fuente_pago_id`: el id que Wompi da al guardar la tarjeta
- `autorizacion_cobro`: constancia con texto, hora, IP y navegador

**Por qué las cuotas son filas y el ciclista es `jsonb`:** las cuotas son el libro de
dinero — se actualizan una por una, se consultan por vencimiento y llevan `CHECK` de
monto positivo y estados válidos. Los datos del ciclista siempre se leen y escriben
completos, así que como documento son más simples, con índices de expresión sobre
documento y correo, que son los únicos campos por los que se busca.

El dinero se guarda en **pesos enteros**: el COP no maneja centavos en la práctica.
Wompi sí trabaja en centavos, y la conversión vive en un solo sitio (`aCentavos`).

### El reparto de las cuotas

`repartirEnCuotas()` redondea al millar y mete el sobrante en las primeras cuotas, de
modo que la suma **siempre** da el total exacto:

```
750.000 → 188.000 · 188.000 · 187.000 · 187.000
```

Nada de «4 × 188.000 = 752.000».

---

## Correos

Seis plantillas en `src/lib/correos/plantillas.ts`. HTML con tablas y estilos en línea a
propósito: Gmail y Outlook descartan `<style>` externo, flexbox y fuentes web.

| Plantilla | Cuándo sale |
|---|---|
| `inscripcion-confirmada` | Pago de contado aprobado |
| `plan-cuotas-activado` | Primera cuota cobrada, con el calendario y la constancia |
| `cuota-pagada` | Cada cobro mensual, con comprobante y saldo restante |
| `recordatorio-cuota` | Tres días antes del cobro |
| `cuota-fallida` | El banco rechazó, con el motivo y cómo resolverlo |
| `inscripcion-saldada` | Última cuota pagada |

Todo lo enviado queda en **`/correos`**, con vista previa del HTML real.

### Para que no caigan en spam

El proveedor no es lo que decide: lo que manda a spam es no tener el DNS en orden. En
`tibetepic.com` hay que publicar **DKIM**, **SPF** (`v=spf1 include:amazonses.com ~all`)
y **DMARC** (`v=DMARC1; p=none; rua=mailto:dmarc@tibetepic.com`, subiendo a `quarantine`
cuando los reportes salgan limpios), y enviar desde un subdominio dedicado para que un
problema de reputación no toque el correo corporativo.

---

## Autorización de cobro recurrente

Las reglas de tarjeta archivada de Visa y Mastercard exigen que el tarjetahabiente
autorice los cobros futuros **conociendo montos y fechas**, y que el comercio conserve
constancia. Sin ella, un contracargo por «yo no autoricé eso» lo pierde el comercio.

El texto lo **compone el servidor** a partir del mismo calendario con el que va a cobrar
— si lo mandara el navegador, alguien podría alterar lo que «aceptó». Se guarda en
`autorizacion_cobro` con hora, IP y navegador, va por escrito en el correo ya con la
tarjeta real, y se puede consultar después desde el portal.

---

## Estructura

```
src/
  app/
    page.tsx                    Landing
    inscripcion/                Formulario de 5 pasos
    mi-inscripcion/             Portal: saldo, cuotas, adelantar, saldar
    ticket/[referencia]/        Ticket con dorsal, QR y estado de pago
    panel/                      Vista de la organización
    correos/                    Bandeja de lo enviado, con vista previa
    api/
      inscripciones/            POST  crea la inscripción
      pagos/widget/             POST  configuración firmada del modal
      pagos/tokenizado/         POST  recibe el token del modal, activa las cuotas
      pagos/confirmar/          POST  verifica contra Wompi el pago del modal
      pagos/cuota/              POST  cobra una cuota puntual
      pagos/saldar/             POST  paga todo el saldo en un solo cobro
      mi-inscripcion/           POST  consulta por documento y correo
      wompi/webhook/            POST  fuente de verdad de los pagos
      cobros/                   GET   barrido diario (cron)
  lib/
    catalogo.ts     Categorías, municipios, tallas, constantes del evento
    dinero.ts       Reparto de cuotas, calendario, formato COP
    validacion.ts   Esquemas de zod, compartidos cliente y servidor
    autorizacion.ts Texto de la autorización de cobro recurrente
    wompi.ts        Cliente de Wompi, firmas de integridad y de webhooks
    servicio.ts     Reglas de negocio: cobrar, reintentar, disparar correos
    db.ts           Pool de Postgres y helper de transacciones
    esquema.sql     DDL idempotente
    almacen/        postgres.ts | json.ts, elegidos en index.ts
    correos/        Plantillas HTML y envío con Resend
  components/
    perfil-de-etapa.tsx   El progreso del formulario como altimetría
    formulario/           Pasos, modal de Wompi, cortina de procesamiento
```

---

## Decisiones y por qué

**Postgres detrás de una interfaz, con respaldo en archivo.** `src/lib/almacen/` es lo
único que toca la persistencia. Con `DATABASE_URL` usa Postgres; sin ella cae al archivo
JSON, para que cualquiera pueda clonar el repo y ver la demo sin montar una base. Lo que
gana Postgres no es velocidad, es integridad: guardar una inscripción con sus cuotas es
**una sola transacción**.

**Driver `pg` normal, no el HTTP de Neon.** La app corre en un contenedor de larga vida,
no en funciones serverless, así que un pool clásico es más rápido y más simple.

**El webhook es la fuente de verdad.** El cobro por API da respuesta inmediata, pero un
pago por PSE o efectivo solo vuelve por webhook. `/api/wompi/webhook` valida la firma
SHA-256 y es idempotente: si Wompi repite el evento, no se manda el correo dos veces.

**La tarjeta nunca pasa por nuestro servidor.** El modal de Wompi la captura y nos
devuelve un token. Eso saca el número de tarjeta de nuestro alcance PCI.

**El ticket lleva un QR real.** Apunta a su propia URL, así que en la entrega de kits se
escanea y abre la inscripción con su estado de pago. El dorsal sale de un hash estable de
la referencia: el mismo ciclista ve siempre el mismo número sin contador en base de datos.

**Cortina de procesamiento.** El cobro tarda varios segundos con la página quieta. Sin
una señal visible, el ciclista cree que el botón no hizo nada y vuelve a darle — que es
justo como se generan los cobros dobles.

---

## Variables de entorno

```bash
# Base de datos (Neon o cualquier Postgres)
DATABASE_URL="postgresql://usuario:clave@host/db?sslmode=verify-full"

# Wompi — https://comercios.wompi.co
WOMPI_MODO=sandbox                    # simulacion | sandbox | produccion
WOMPI_URL_BASE=https://sandbox.wompi.co/v1
NEXT_PUBLIC_WOMPI_LLAVE_PUBLICA=pub_test_...
WOMPI_LLAVE_PRIVADA=prv_test_...      # crea fuentes de pago y cobra
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

**Qué llave hace qué:** la pública abre el checkout y tokeniza (el titular está
presente); la privada crea fuentes de pago y cobra (el titular **no** está presente).
Por eso el cobro mensual necesita la privada y el contado no.

El webhook se registra en el panel de Wompi apuntando a
`https://<dominio>/api/wompi/webhook`. Para probarlo en local hace falta una URL pública:
`ngrok http <puerto>`.

---

## Scripts

```bash
node --env-file=.env.local scripts/migrar.mjs           # esquema e importación de la demo
node --env-file=.env.local scripts/verificar-wompi.mjs  # prueba las llaves de punta a punta
node scripts/sembrar-demo.mjs                           # inscripciones de ejemplo
node scripts/grabar-demo.mjs                            # graba los vídeos de demo
```

`verificar-wompi.mjs` recorre el mismo camino que la app — aceptaciones, tokenizar,
fuente de pago, cobro y consulta — y no imprime ninguna llave. Si eso pasa, el modal
funciona.

---

## Pendientes antes de producción

1. **Autenticación en `/panel`.** Hoy está abierto.
2. **Política de mora.** Tras tres cobros rechazados la inscripción queda marcada, pero
   no se libera el cupo. Es una decisión del cliente, no técnica.
3. **Cambiar de tarjeta.** Los correos lo ofrecen y no existe la pantalla.
4. **Recordatorio robusto.** Hoy solo sale si el cron corre exactamente tres días antes;
   debería registrar «recordatorio enviado» y mandarlo en cualquier día que falten ≤ 3.
5. **Alerta si el cron no corre.** Si el barrido falla el día 5, nadie se entera y se
   pierde un mes de recaudo.
6. **Rotar las llaves de sandbox** y poner las de producción solo como variables de
   entorno del hosting.
