# n8n local para el agente de WhatsApp

Esta instalacion deja n8n en la PC del local, sin una suscripcion de n8n. La
automatizacion consulta los datos reales de Modo Sabor mediante las rutas
`/api/agente`; nunca calcula precios por su cuenta.

## Arranque

1. Iniciar Docker Desktop.
2. Copiar `.env.example` como `.env` y completar sus valores.
3. Desde esta carpeta ejecutar `docker compose up -d`.
4. Abrir `http://localhost:5678` y crear la cuenta inicial de n8n.
5. Ejecutar `node build-agent-workflow.js` e importar
   `workflow-agent.generated.json`.

Cuando n8n corre en Docker y Modo Sabor en esta misma PC, configurar
`MODO_SABOR_API_URL=http://host.docker.internal:3001`. Así las herramientas
del agente usan la API local sin publicar la clave.

## Credencial NVIDIA

En n8n crear una credencial **OpenAI API** con:

- API key: `NVIDIA_API_KEY`.
- Base URL: `https://integrate.api.nvidia.com/v1`.

En el nodo de chat elegir el modelo `z-ai/glm-5.2`, que es el modelo NVIDIA
actualmente usado por Modo Sabor. La credencial debe ser de tipo OpenAI y usar
`https://integrate.api.nvidia.com/v1` como Base URL.
Esta API usa el formato compatible con OpenAI, por lo que no necesita un nodo
propietario de NVIDIA.

## Etapas de activación

1. Probar preguntas de menu, cotizacion y envio dentro de n8n.
2. Vincular el número una sola vez desde **Configuración → WhatsApp**.
3. Mantener apagados Atención con IA y WhatsApp masivo mientras se prueba el
   estado de la conexión.
4. Activar Atención con IA con un número controlado y revisar errores, precios
   y audios reales.
5. Recién después habilitarla para clientes, manteniendo la derivación a una
   persona para reclamos, pagos o pedidos ambiguos.

La sesión de WhatsApp pertenece al Gateway del backend; n8n no abre otra
conexión ni genera otro QR.
