# Puente WhatsApp Web - Modo Sabor

Este puente sirve para el modo que necesita el local ahora:

- El cliente escribe por WhatsApp.
- El operador responde manualmente desde WhatsApp.
- Cuando el pedido ya esta claro, el operador escribe `dale` en WhatsApp.
- El boton `Mandar al copiloto` queda solo como respaldo manual.
- El puente junta la conversacion reciente, busca productos reales del catalogo y crea un borrador en `/admin/whatsapp-copiloto`.
- Si mas adelante conectamos n8n/IA, mejora la interpretacion de pedidos complejos, pero para pedidos claros ya puede operar directo.
- El pedido real se crea recien cuando el operador confirma el borrador en el sistema.

## Por que este puente

La API oficial de WhatsApp Business es mas estable, pero esta pensada para operar WhatsApp desde la API. Para leer tambien lo que responde el operador desde el WhatsApp normal, este puente usa WhatsApp Web.

Es ideal para probar rapido. Para produccion seria conviene tenerlo siempre abierto en la PC del local o en un equipo fijo.

## Instalacion

Desde la raiz del proyecto:

```powershell
cd D:\Proyectos\modosabor1
npm run whatsapp:bridge:install
```

Crear el archivo de configuracion:

```powershell
Copy-Item agente-whatsapp\puente-web\.env.example agente-whatsapp\puente-web\.env
notepad agente-whatsapp\puente-web\.env
```

Configurar:

```env
PORT=3035
BRIDGE_OPERATOR_KEY=dale
BRIDGE_OPERATOR_KEYS="dale,#dale"
BRIDGE_AUTO_ON_OPERATOR_KEY=true
BRIDGE_DELETE_OPERATOR_KEY=false
BRIDGE_HEADLESS=false
N8N_COPILOTO_WEBHOOK_URL=
N8N_COPILOTO_SECRET=un-secreto-simple
MODO_SABOR_API_URL=https://modosabor.com.ar
AGENT_API_KEY=la-clave-del-server-env
```

Para probar sin n8n, se deja `N8N_COPILOTO_WEBHOOK_URL` vacio. En ese modo el puente crea borradores directos buscando productos por nombre en la conversacion.

## Ejecutar

```powershell
npm run whatsapp:bridge
```

Abrir:

```text
http://localhost:3035
```

Escanear el QR con WhatsApp del local.

## Uso diario

1. Abrir el puente.
2. Confirmar que diga `Conectado`.
3. Atender WhatsApp normalmente.
4. Cuando el pedido esta claro, escribir `dale` en el WhatsApp del cliente.
5. Revisar `/admin/whatsapp-copiloto`.
6. Confirmar o descartar el borrador.

## Importante

- El puente detecta `dale` automaticamente. Tambien acepta `#dale`.
- Si pones `BRIDGE_DELETE_OPERATOR_KEY=true`, el puente intenta borrar el `dale` del chat despues de detectarlo. No es 100% garantizado porque depende de WhatsApp Web.
- El boton `Mandar al copiloto` queda como respaldo si algun dia no queres escribir la palabra clave.
- No responde automaticamente al cliente.
- No crea pedidos definitivos sin revision.
- Si WhatsApp Web cierra sesion, hay que volver a escanear QR.
