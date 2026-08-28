# Pago manual — decisiones tomadas

El documento del cliente no fija estas reglas. Las decidí para poder avanzar;
todas son de una línea y están marcadas en el código con el comentario
`DECISIÓN PENDIENTE DE CONFIRMAR`. Cambiarlas no rompe el esquema.

## 1. Abonos, no cuotas fijas

El documento ofrece "Pago total / Pago parcial" y tres casillas de abono.
Se retira el plan de 4 cuotas del día 5: **nadie cobra automáticamente**, así
que un calendario de cobro no representa nada real.

- `TOTAL`: un solo pago de $380.000.
- `ABONOS`: hasta **3** abonos de monto libre.

La verdad del saldo son los abonos verificados, no una tabla de cuotas:
`saldo = total − Σ(abonos verificados)`. Las cuotas quedan como plan sugerido.

## 2. Sin monto mínimo

`ABONO_MINIMO = 0`. Cualquier monto vale. Si la organización quiere exigir
un anticipo, es cambiar esa constante.

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
