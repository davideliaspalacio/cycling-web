# Pago manual — decisiones tomadas

El documento del cliente no fija todas estas reglas. Las que llevan
`DECISIÓN PENDIENTE DE CONFIRMAR` en el código las decidí para poder avanzar y
son de una línea. Las §1 y §2 ya no son de esas: **son lo que pidió la
organización.**

## 1. Tres planes: 1, 2 o 3 cuotas (confirmado por el cliente)

Reemplaza al esquema anterior de "hasta 3 abonos de monto libre". Se retira
también el plan de 4 cuotas del día 5 de la pasarela: **nadie cobra
automáticamente**, así que un calendario de cobro no representa nada real.

`PLANES_DE_CUOTAS = [1, 2, 3]`, y el número de cuotas es a la vez el de
comprobantes: uno por cuota.

| Cuotas | Montos |
| --- | --- |
| 1 | $380.000 |
| 2 | $190.000 · $190.000 |
| 3 | $127.000 · $127.000 · $126.000 |

**El pago total es el plan de una cuota.** No es un camino aparte: internamente
es el mismo modelo con `n = 1`, y solo la interfaz lo nombra "pago total". Fue
la decisión de fondo al pasar de dos planes a tres — mantener dos caminos
paralelos (uno para el total, otro para los abonos) era duplicar cada regla de
monto, fecha y cupo de comprobantes.

El reparto sale de `repartirEnCuotas(380000, n)` para que un precio que no
parta en partes exactas siga sumando el total al peso; de ahí que la tercera
cuota sean $126.000 y no $127.000.

La verdad del saldo siguen siendo los comprobantes verificados, no una tabla de
cuotas: `saldo = total − Σ(abonos verificados)`. La tabla `cuotas` sigue siendo
la de la pasarela vieja y las inscripciones por transferencia la tienen vacía.

### Dónde vive el número de cuotas

En la columna `plan`, porque la tabla no tiene una para él y hay sitios —los
correos, la constancia impresa— que solo tienen la inscripción a mano y no sus
abonos. `TOTAL` es una cuota, `ABONOS_2` dos y `ABONOS_3` tres; `ABONOS` a
secas es el valor histórico de cuando el único plan diferido eran dos cuotas y
se sigue leyendo como dos. La traducción vive en un solo sitio,
`cuotasDelPlan` (`src/lib/dinero.ts`).

**El plan lo fija el primer comprobante, no el navegador.** No se envía una
elección: se deduce del monto declarado, que es la única cifra que el ciclista
se compromete a transferir de verdad. Se elige el plan más corto cuya primera
cuota quepa en lo declarado —el que menos comprobantes le deja por subir—, así
que $190.000 es el plan de dos y $127.000 el de tres. Los comprobantes
siguientes no lo tocan: cambiar de plan a mitad de camino movería vencimientos
ya comprometidos.

### Las fechas de las cuotas

`DIAS_ENTRE_CUOTAS = 45` entre cuotas consecutivas, contados **desde la fecha
de inscripción**, no desde que la organización verifica la anterior. El
ciclista no controla cuándo revisamos; anclarlo a la revisión le movería las
fechas bajo los pies, y así las ve todas desde el minuto uno. Con tres cuotas
la última cae a los 90 días.

Cada fecha se acota contra el cierre:
`min(inscripción + (n−1)×45 días, FECHA_LIMITE_ABONOS)`. Hace falta — quien se
inscriba el 20 de mayo de 2027 tendría la segunda cuota el 4 de julio, un día
**después** de la carrera.

### Cuando un plan ya no cabe

`MARGEN_MINIMO_CUOTAS = 15` días. Un plan de `n` cuotas solo se ofrece si su
**última** cuota, sin acotar, cae al menos quince días antes de
`FECHA_LIMITE_ABONOS`: `diasHasta(cierre) ≥ (n−1)×45 + 15`. Los que no caben no
se muestran, y la interfaz explica por qué en vez de ofrecerlos y fallar al
subir el comprobante.

Con el cierre el 3 de junio de 2027 eso da: el plan de tres deja de ofrecerse a
partir del 19 de febrero de 2027, y el de dos a partir del 5 de abril. El de
una cuota **nunca** pasa por este filtro: el pago total se recibe hasta el
cierre.

El umbral es mío, no del cliente: con menos de dos semanas el tope contra el
cierre aplasta las fechas unas contra otras y el "plazo" deja de serlo —hay que
transferir *y* darnos tiempo de revisarlo antes del cierre. Subirlo o bajarlo
es cambiar esa constante.

Si el ciclista transfiere el total con el primer comprobante, queda saldado y
no quedan cuotas: el plan se queda en `TOTAL`. Y si cubre el total antes de
tiempo —con el segundo comprobante de un plan de tres, por ejemplo—, el saldo
llega a cero y las cuotas restantes desaparecen de la interfaz y de los
correos.

## 2. El monto de cada cuota es fijo (confirmado por el cliente)

Se acabó el "abona lo que puedas". `ABONO_MINIMO` desapareció: ya no hay una
constante única, porque el mínimo depende del plan y de en qué cuota va la
inscripción. Lo calcula `montoMinimoDeAbono` (`src/lib/servicio.ts`), que es el
único sitio que conoce los abonos previos:

- **Primer comprobante**: la primera cuota del plan **más largo que quepa**
  ($127.000 con los tres planes disponibles). Es lo que deja las tres opciones
  abiertas: por encima de esa cifra el monto elige plan. Si solo cabe el pago
  total (§1), el total y nada menos.
- **Comprobante intermedio**: la cuota que le toca, acotada al saldo.
- **Último comprobante del plan**: tiene que cubrir el saldo completo.
  Aceptarlo por menos dejaría un saldo sin ninguna vía de pago.

El cupo de comprobantes es el número de cuotas de **esa** inscripción, no una
constante global: quien va por el plan de dos no puede subir un tercero. Un
cuarto no es válido para nadie, y la base lo respalda
(`CHECK (numero >= 1 AND numero <= 3)`).

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
