# ZeptoMail — implementación

Correo transaccional de Santander Xtreme. Proveedor: **ZeptoMail (Zoho)**.
Costo: 2,50 USD por cada 10.000 correos, primer crédito gratis.

## 1. En Zoho

1. Crear un **Mail Agent** (el nuestro: `santanderxtreme`).
2. **Dominios** → agregar `santanderxtreme.com` y poner en el DNS los dos
   registros que da: un `TXT` (DKIM) y un `CNAME` (`bounce-zem`).
3. **SMTP/API** → copiar el *Send Mail Token*.
4. **Webhooks** → agregar uno con:
   - URL: `https://www.santanderxtreme.com/api/correos/webhook`
   - Encabezado: `X-Webhook-Clave` = el mismo valor que `ZEPTOMAIL_WEBHOOK_SECRETO`
   - Eventos: devoluciones temporales, permanentes, bucle de retroalimentación y entregado.

## 2. En Vercel

| Variable | Tipo | Valor |
|---|---|---|
| `ZEPTOMAIL_API_KEY` | Secret | el Send Mail Token (con o sin `Zoho-enczapikey`) |
| `ZEPTOMAIL_WEBHOOK_SECRETO` | Secret | cadena aleatoria larga |
| `CORREO_REMITENTE` | Config | `Santander Xtreme <noreply@santanderxtreme.com>` |
| `CORREO_RESPUESTA` | Config | `oficialsangilxtreme@gmail.com` |

Después, redeploy.

## 3. DNS (Hostinger)

| Tipo | Nombre | Valor |
|---|---|---|
| TXT | `219110._domainkey` | la clave DKIM que da Zoho |
| CNAME | `bounce-zem` | `cluster89.zeptomail.com` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:oficialsangilxtreme@gmail.com` |

## 4. Cómo funciona

**Enviar** — `src/lib/correos/enviar.ts`. Un `POST` a
`https://api.zeptomail.com/v1.1/email` con la cabecera
`Authorization: Zoho-enczapikey <token>`. Cada envío manda en
`client_reference` el id del correo, que Zoho devuelve en el webhook.

**Saber si llegó** — `src/app/api/correos/webhook/route.ts`. Zoho avisa
cuando entrega, rebota o marcan spam, y se guarda en la tabla `correos`.
Se ve en `/panel/correos`.

**Sin llave** no falla: en local guarda el correo y lo muestra en `/correos`;
en producción lo marca como *no enviado* y lo avisa en consola.

## 5. Cosas a tener en cuenta

- **El remitente tiene que ser del dominio propio.** Con un Gmail, Zoho rechaza.
- **El webhook responde 200 a todo** menos a clave incorrecta (401). Si Zoho
  recibe errores, desactiva el webhook.
- En el evento de entrega, `event_name` dice `delivered` pero el objeto
  interno dice `email_delivery`. Se usa `event_name`.
- **Gmail limita dominios nuevos** si reciben muchos correos seguidos a la
  misma dirección. Para probar, usar `tucorreo+1@gmail.com`, `+2`, etc.
- **Si el token pasa por un chat, rotarlo**: SMTP/API → generar uno nuevo,
  cambiarlo en Vercel y borrar el viejo.
