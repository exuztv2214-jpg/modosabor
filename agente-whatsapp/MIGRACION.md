# Migración al motor único de IA

## Qué quedó construido

- `server/services/motorAgente.js`: bucle común de herramientas para panel y WhatsApp.
- `server/services/registroHerramientas.js`: catálogo único, permisos y perfiles `cliente` y `dueño`.
- `server/services/carritoWhatsapp.js`: borrador editable por item y confirmación transaccional.
- `server/services/memoriaConversacion.js`: memoria por teléfono, corte por inactividad y resumen persistido.
- `server/services/agenteWhatsapp.js`: contexto de cliente, turno, memoria y política para el perfil cliente.
- `agente-whatsapp/politica-conversacional.md`: forma de hablar de Chispita.
- `server/tests/agente/correrConversaciones.js`: evaluación separada de 40 conversaciones.
- `agente-whatsapp/n8n/workflow-9-tools.generated.json`: workflow de respaldo con las nueve herramientas.

## Motor canónico actual

El backend propio es el único motor conversacional operativo. Ahí viven las
reglas, la memoria, las herramientas, el carrito y la idempotencia. NVIDIA es
el proveedor principal y Gemini es el respaldo del proveedor; no son dos
motores de negocio diferentes.

Para probarlo, mantener encendida **Configuración → WhatsApp → Atención con
IA**, escribir desde un número controlado y comprobar que el pedido exista en
el panel antes de considerar confirmada la conversación.

## Estado de n8n

n8n queda archivado como referencia histórica. No participa del camino normal
de atención y no debe reactivarse en paralelo: dos motores escuchando la misma
conversación pueden duplicar respuestas o pedidos.

## Tareas manuales pendientes

- Ejecutar la batería real con `node server/tests/agente/correrConversaciones.js` cuando haya cuota disponible. Esa prueba usa el modelo real, tarda y consume tokens; no forma parte de `tests/run.js`.

## Retiro futuro de n8n

Los archivos de n8n no se borran todavía. El orden seguro es:

1. Mantener deshabilitado el workflow viejo.
2. Conservar sus exportaciones sin credenciales dentro de Git.
3. Observar el motor propio durante 30 días reales.
4. Recién entonces eliminar rutas, scripts y tablas que no tengan historial útil.

Los exports históricos son el camino de vuelta ante una falla y deben conservarse durante la observación.
