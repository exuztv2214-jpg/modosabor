# Agente de WhatsApp para Modo Sabor

Esta carpeta tiene todo lo necesario para conectar un agente de IA a tu WhatsApp usando n8n (gratis, self-hosted) + la API oficial de WhatsApp Business (gratis para conversaciones que arranca el cliente) + el sistema Modo Sabor.

Contenido:

- `prompt-agente.md` — el "cerebro"/personalidad del agente. Se pega en el nodo de IA de n8n.
- `prompt-copiloto-dale.md` — prompt recomendado para el modo actual: la IA no responde sola, solo arma un borrador cuando el operador escribe `#dale`.
- `workflow-copiloto-dale.md` — estructura exacta del workflow recomendado para n8n en modo copiloto.
- `payload-copiloto-dale.example.json` — ejemplo de body para probar `POST /api/agente/copiloto/dale`.
- `workflow-n8n.json` — workflow de n8n para importar. **Aviso importante:** lo armé sin poder probarlo en vivo dentro de n8n (no tengo acceso a tu instancia), así que es un punto de partida sólido, pero es posible que algún nombre de nodo o parámetro necesite un ajuste menor según la versión de n8n que uses. Si algo no importa bien, es más rápido rehacer ese nodo puntual a mano siguiendo la lógica de abajo que perder tiempo debugueando el JSON.

## Lo que ya está listo del lado de Modo Sabor

Agregué rutas nuevas en el backend, protegidas con una clave (no cualquiera puede llamarlas):

- `GET /api/agente/estado` — si el local está abierto y qué turno corre.
- `GET /api/agente/menu?categoria=...` — catálogo real (productos, precios, disponibilidad).
- `GET /api/agente/producto/:id` — detalle de un producto (variantes, extras).
- `POST /api/agente/cotizar` `{ query }` — cotiza un item en lenguaje natural contra el catálogo real.
- `POST /api/agente/envio` `{ direccion }` — valida zona de reparto (Monteros) y calcula envío.
- `GET /api/agente/cliente/:telefono` — historial rápido de un cliente por teléfono.
- `POST /api/agente/copiloto/dale` — modo copiloto: si el operador escribió `#dale`, crea un borrador de pedido de WhatsApp para revisar en el sistema.
- `POST /api/agente/pedido` — crea el pedido real en el sistema.

Todas requieren el header `x-agent-key` con el valor que está en `server/.env` (`AGENT_API_KEY`). **Los precios de cada pedido se recalculan siempre en el servidor contra el catálogo real** — el agente nunca puede fijar un precio, solo elegir productos y variantes por nombre. Esto es a propósito: aunque la IA se equivoque o alguien intente manipular el flujo, el sistema no va a cobrar de más ni de menos.

## Modo recomendado ahora: Copiloto con `#dale`

Este es el modo que conviene usar primero para Modo Sabor.

1. El cliente escribe por WhatsApp.
2. El local responde manualmente, como siempre.
3. Cuando el pedido ya está claro, el operador escribe `#dale`.
4. n8n detecta ese mensaje, lee la conversación reciente y usa la IA con `prompt-copiloto-dale.md`.
5. La IA arma el `pedido_json` y llama a `POST /api/agente/copiloto/dale`.
6. El pedido entra como borrador en `/admin/whatsapp-copiloto`.
7. El local revisa y toca "Confirmar pedido". Recién ahí se crea el pedido real, suena la alarma y entra al flujo normal de cocina/delivery.

Importante: en este modo n8n no debe mandar mensajes automáticos al cliente. El humano sigue atendiendo.

Más adelante se puede activar el agente automático usando `prompt-agente.md` y `POST /api/agente/pedido`, pero conviene hacerlo después de probar bien el copiloto.

## Pasos que tenés que hacer vos (no los puedo hacer yo)

### 1. Meta Business y WhatsApp Cloud API

1. Entrá a business.facebook.com con la cuenta que administra la página de Facebook de Modo Sabor. Si no tenés Business Manager, te lo va a pedir crear ahí mismo.
2. Andá a developers.facebook.com, creá una app tipo "Business", y agregale el producto "WhatsApp".
3. Ahí Meta te da un número de prueba gratis para probar todo el flujo sin tocar tu número real. **Te recomiendo probar todo con ese número de prueba primero**, y recién migrar tu número real cuando veas que el agente responde bien.
4. Cuando migres tu número real, Meta te va a guiar el proceso de verificación (puede pedir documentación del negocio).
5. De ahí vas a sacar: el **Phone Number ID**, el **WhatsApp Business Account ID**, y un **token de acceso** (primero temporal, después uno permanente vía un usuario de sistema).

### 2. n8n

Si no lo tenés instalado: la forma más simple gratis es self-hosted con Docker (`docker run -it --rm -p 5678:5678 n8nio/n8n`) o en un VPS chico (DigitalOcean, Hetzner, etc. — unos USD 5/mes). Necesita estar accesible por HTTPS público porque Meta le manda los mensajes entrantes por webhook — no alcanza con correrlo en tu PC local salvo que uses algo tipo ngrok/Cloudflare Tunnel para exponerlo (funciona para probar, pero para producción real conviene un servidor fijo).

### 3. Variables de entorno en n8n

El workflow espera estas variables configuradas en n8n (Settings → Variables, o como env vars del proceso):

- `MODO_SABOR_API_URL` — la URL pública de tu API (hoy tenés `PUBLIC_API_URL=http://192.168.1.92:3001` en `server/.env`, que es una IP de LAN — **para que n8n en la nube le pueda pegar, esa URL tiene que ser accesible desde internet**, no solo desde tu red local. Si tu sistema corre en tu PC del local sin IP pública, vamos a necesitar resolver esto — dímelo cuando lleguemos a esta parte y lo vemos, hay varias formas (túnel, VPS intermedio, etc).
- Para Railway usar la URL pública configurada en `PUBLIC_API_URL`.
- `AGENT_API_KEY` — el mismo valor que pusiste en `server/.env`.
- `WHATSAPP_PHONE_NUMBER_ID` — el que te da Meta.

### 4. Credenciales dentro de n8n

- Credencial de WhatsApp (trigger y nodo de envío): token de acceso de Meta.
- Credencial de Anthropic: tu API key de Claude (console.anthropic.com). Esto es lo único que no es gratis — el costo es por uso, centavos por conversación, no una suscripción.

### 5. Importar y pegar el prompt

1. En n8n: Workflows → Import from File → `workflow-n8n.json`.
2. Abrí el nodo "Agente Modo Sabor" y pegá el contenido completo de `prompt-agente.md` en el campo de system prompt (reemplazando el placeholder que dejé ahí).
3. Conectá las credenciales en cada nodo que las pide.
4. Probá primero por chat de prueba dentro de n8n antes de conectar el WhatsApp real.

## Cuando llegues hasta acá

Avisame y seguimos juntos con la conexión real — especialmente el tema de la URL pública del servidor, que es lo único técnicamente delicado que falta resolver de mi lado.

## Validación local realizada

El modo `#dale` quedó probado contra el backend local:

- `POST /api/agente/copiloto/dale` con `x-agent-key`: OK.
- El sistema rechazó correctamente items sin `producto_id`, para impedir precios inventados por IA.
- Con `producto_id` real (`Smash Simple`, id `40`) creó un borrador en `/admin/whatsapp-copiloto`: OK.
- El borrador de prueba se descartó desde la pantalla para dejar la base limpia.

## Activar la clave del agente en Railway

Cargar `AGENT_API_KEY` en las variables del servicio Railway y reiniciar o
redeployar el servicio para que la tome.
