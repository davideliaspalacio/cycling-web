# Pago manual — decisiones tomadas

El documento del cliente no fija todas estas reglas. Las que llevan
`DECISIÓN PENDIENTE DE CONFIRMAR` en el código las decidí para poder avanzar y
son de una línea. Las §1 y §2 ya no son de esas: **son lo que pidió la
organización.**

## 1. Dos cuotas fijas (confirmado por el cliente)

Reemplaza al esquema anterior de "hasta 3 abonos de monto libre". Se retira
también el plan de 4 cuotas del día 5 de la pasarela: **nadie cobra
automáticamente**, así que un calendario de cobro no representa nada real.

- `TOTAL`: un solo pago de $380.000.
- `ABONOS`: **2 cuotas de $190.000**. `MAX_ABONOS = 2`, y ese número es a la vez
  el de cuotas y el de comprobantes: uno por cuota.

El reparto sale de `repartirEnCuotas(380000, 2)` para que un precio que no
parta en mitades exactas siga sumando el total al peso.

La verdad del saldo siguen siendo los comprobantes verificados, no una tabla de
cuotas: `saldo = total − Σ(abonos verificados)`. La tabla `cuotas` sigue siendo
la de la pasarela vieja y las inscripciones por transferencia la tienen vacía.

### La fecha de la segunda cuota

`DIAS_ENTRE_CUOTAS = 45`, contados **desde la fecha de inscripción**, no desde
que la organización verifica la primera. El ciclista no controla cuándo
revisamos; anclarlo a la revisión le movería la fecha bajo los pies, y así ve
las dos fechas desde el minuto uno.

Se acota contra el cierre: `min(inscripción + 45 días, FECHA_LIMITE_ABONOS)`.
Hace falta — quien se inscriba el 20 de mayo de 2027 tendría la segunda cuota
el 4 de julio, un día **después** de la carrera.

### Cuando ya no caben las dos cuotas

`MARGEN_MINIMO_DOS_CUOTAS = 15` días. Si al inscribirse quedan menos de quince
días hasta `FECHA_LIMITE_ABONOS`, **el plan de dos cuotas no se ofrece**: solo
pago total, y la interfaz explica por qué en vez de mostrar la opción y fallar
después. El umbral es mío, no del cliente: con menos de dos semanas el tope
contra el cierre aplasta las dos fechas una contra otra y el "plazo" deja de
serlo —hay que transferir *y* darnos tiempo de revisarlo antes del cierre.
Subirlo o bajarlo es cambiar esa constante.

Si el ciclista transfiere el total con el primer comprobante, queda saldado y no
hay segunda cuota: el plan se queda en `TOTAL`.

## 2. El monto de cada cuota es fijo (confirmado por el cliente)

Se acabó el "abona lo que puedas". `ABONO_MINIMO` desapareció: ya no hay una
constante única, porque el mínimo depende de en qué cuota va la inscripción.
Lo calcula `montoMinimoDeAbono` (`src/lib/servicio.ts`), que es el único sitio
que conoce los abonos previos:

- **Primer comprobante**: la primera cuota ($190.000) o el total ($380.000). Si
  el plan de dos cuotas no se le llegó a ofrecer (§1), el total y nada menos.
- **Segundo comprobante**: tiene que cubrir el saldo completo. Es el último que
  admite el plan; aceptarlo por menos dejaría un saldo sin ninguna vía de pago.

`src/lib/validacion.ts` solo comprueba que sea una cifra —pesos enteros y
positivos—; la regla de negocio vive en el servicio.

Esto filtra lo que el **ciclista declara**, no lo que la organización confirma:
el revisor sigue pudiendo aprobar por un monto distinto al declarado (§6), que
pasa constantemente.

## 3. El ticket sale solo con el pago completo

Con saldo pendiente se entrega una **constancia** que muestra cuánto falta.
El dorsal y el ticket de carrera se emiten cuando `saldo = 0`.
Razón: el dorsal es el bien que se entrega; no se suelta sin pago completo.

## 4. Fecha límite de abonos

Los abonos vencen **30 días antes de la carrera** (3 junio 2027).
El documento habla de "plazos establecidos" sin fijarlos.

## 5. Acceso al panel

Clave compartida en `PANEL_CLAVE` + cookie firmada, y el revisor escribe su
nombre al entrar para que `revisado_por` no quede vacío.
**Esto no es identidad real.** Si van a revisar varias personas, hace falta
un usuario por persona; queda anotado como deuda.

## 6. Sobrepago

El revisor puede aprobar por un monto distinto al declarado (pasa siempre).
Si la suma supera el total, el panel lo marca en rojo y **no** se devuelve
nada automáticamente: es una conversación humana.

## 7. Rechazo

El cupo sigue reservado. El ciclista puede volver a subir evidencia sin
límite de intentos hasta la fecha de cierre.

---

## 8. Proveedor de correo: Resend, plan de pago

Confirmado con el cliente. Volumen real con 700 inscritos: entre 6 y 11
correos por ciclista según pague de una o en abonos, o sea **4.000 a 7.700
en total** repartidos en los meses de inscripción.

El gratuito de Resend da 3.000 al mes pero **tope 100 al día**, y ese tope
se revienta el primer día bueno de inscripciones. Cuando se revienta los
correos no se encolan: fallan. Y un ciclista que transfirió y no recibe
confirmación escribe a la organización, que es el trabajo manual que
estamos tratando de evitar.

AWS SES costaría unos 0,80 USD **en total** en vez de 20 al mes, pero exige
salir del sandbox, firmar a mano y reescribir el envío. No compensa.

**Lo que decide si los correos llegan no es el proveedor sino el dominio.**
Un remitente de Gmail no pasa la verificación de dominio y Resend lo
rechaza. Hace falta dominio propio.

### Corrección: se cambia a Brevo

El torneo es en julio de 2027 y faltan unos once meses. Resend Pro serían
**220 USD por mandar unos 5.000 correos** — 4 centavos por correo. No se
justifica.

Brevo cubre el evento entero **gratis**: 300 correos al día, y el pico real
más alto rondaría los 150. No es pago por uso: es un gratuito con tope
diario y, por encima, planes mensuales.

**Verificar antes de abrir inscripciones**: si el plan gratuito añade la
marca de Brevo al pie del correo. Si lo hace y molesta para un evento de
cliente, el plan más barato la quita.

El envío se hizo por HTTP contra la API en vez de con el SDK: quince
líneas, una dependencia menos, y cambiar de proveedor vuelve a ser tocar
`src/lib/correos/enviar.ts` y nada más. Ya pasó una vez.
