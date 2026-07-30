# Workflow n8n - Copiloto #dale

Este es el flujo recomendado para empezar: la IA no responde al cliente, solo crea un borrador en Modo Sabor cuando el operador escribe `#dale`.

## Variables de n8n

- `MODO_SABOR_API_URL`: `https://modosabor.com.ar`
- `AGENT_API_KEY`: el mismo valor de `server/.env`
- `WHATSAPP_PHONE_NUMBER_ID`: valor de Meta WhatsApp Cloud API

## Nodos

1. `WhatsApp Trigger`
   - Escucha mensajes entrantes y salientes.
   - Debe conservar el telefono/chat y el texto del mensaje.

2. `IF - Es #dale`
   - Continua solo si el mensaje enviado por el local contiene exactamente `#dale`.
   - Si el mensaje viene del cliente, no hace nada.

3. `Obtener conversacion reciente`
   - Recupera los ultimos mensajes del chat desde WhatsApp/n8n data store.
   - Debe incluir mensajes del cliente y del local.

4. `IA - Resumir pedido`
   - Usar `prompt-copiloto-dale.md`.
   - La salida debe ser un objeto `pedido_json`.
   - Antes de cerrar el JSON, consultar el menu real de Modo Sabor o cotizar items para obtener `producto_id` real.

5. `HTTP Request - Crear borrador`
   - Method: `POST`
   - URL: `{{$env.MODO_SABOR_API_URL}}/api/agente/copiloto/dale`
   - Headers:
     - `Content-Type`: `application/json`
     - `x-agent-key`: `{{$env.AGENT_API_KEY}}`
   - Body JSON:

```json
{
  "comando": "#dale",
  "telefono": "={{$json.telefono}}",
  "nombre": "={{$json.nombre || ''}}",
  "mensajes": "={{$json.mensajes}}",
  "pedido_json": "={{$json.pedido_json}}"
}
```

6. No conectar ningun nodo de respuesta al cliente.

## Resultado esperado

- El borrador aparece en `/admin/whatsapp-copiloto`.
- El operador revisa y toca `Confirmar pedido`.
- Recien ahi se crea el pedido real, suena la alarma y entra a cocina/delivery.

## Importante

- No usar `POST /api/agente/pedido` en este modo.
- No mandar mensajes automaticos al cliente.
- Si falta un dato, dejarlo en `notas` y crear el borrador igual cuando el pedido se entiende.
