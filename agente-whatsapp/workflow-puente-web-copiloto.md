# Workflow n8n para Puente WhatsApp Web

Este flujo recibe el contexto desde `agente-whatsapp/puente-web` y crea un borrador en Modo Sabor.

## Entrada del webhook

El puente llama a `N8N_COPILOTO_WEBHOOK_URL` con:

```json
{
  "comando": "#dale",
  "origen": "whatsapp-web-bridge-ui",
  "chat_id": "549381...",
  "telefono": "381...",
  "nombre": "Nombre del chat",
  "mensajes": [
    {
      "from_me": false,
      "telefono": "381...",
      "nombre": "Cliente",
      "texto": "hola quiero una smash simple",
      "enviado_en": "2026-07-24T04:00:00.000Z"
    }
  ]
}
```

Si configuraste `N8N_COPILOTO_SECRET`, el puente agrega el header:

```text
x-bridge-secret: <secreto>
```

## Variables n8n

- `MODO_SABOR_API_URL`: `https://modosabor.com.ar`
- `AGENT_API_KEY`: igual que en `server/.env`
- `BRIDGE_SECRET`: mismo valor que `N8N_COPILOTO_SECRET`, si lo usas

## Nodos

1. `Webhook - Copiloto puente`
   - Method: `POST`
   - Path: `modosabor-copiloto-dale`

2. `IF - Validar secreto`
   - Si usas secreto, comparar:
     - `{{$headers["x-bridge-secret"]}}`
     - con `{{$env.BRIDGE_SECRET}}`
   - Si no coincide, responder `401`.

3. `HTTP Request - Menu`
   - Method: `GET`
   - URL: `{{$env.MODO_SABOR_API_URL}}/api/agente/menu`
   - Header:
     - `x-agent-key`: `{{$env.AGENT_API_KEY}}`

4. `IA - Armar pedido_json`
   - System prompt: usar `prompt-copiloto-dale.md`.
   - Entrada: mensajes del webhook + menu real del nodo anterior.
   - Salida obligatoria:

```json
{
  "cliente_nombre": "",
  "cliente_telefono": "",
  "cliente_direccion": "",
  "tipo_entrega": "delivery",
  "metodo_pago": "efectivo",
  "notas": "",
  "items": [
    {
      "producto_id": 40,
      "cantidad": 1,
      "variantes": {},
      "extras": [],
      "descripcion": "Smash Simple"
    }
  ]
}
```

5. `HTTP Request - Crear borrador`
   - Method: `POST`
   - URL: `{{$env.MODO_SABOR_API_URL}}/api/agente/copiloto/dale`
   - Headers:
     - `Content-Type`: `application/json`
     - `x-agent-key`: `{{$env.AGENT_API_KEY}}`
   - Body:

```json
{
  "comando": "#dale",
  "telefono": "={{$json.telefono}}",
  "nombre": "={{$json.nombre}}",
  "mensajes": "={{$json.mensajes}}",
  "pedido_json": "={{$json.pedido_json}}"
}
```

6. `Respond to Webhook`
   - Status: `200`
   - Body:

```json
{
  "ok": true,
  "message": "Borrador enviado a Modo Sabor"
}
```

## Regla clave

n8n no debe mandar WhatsApp al cliente. Solo transforma la conversacion en un borrador del sistema.
