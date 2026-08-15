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

## Cómo probar el motor propio

1. Abrir **Configuración → WhatsApp**.
2. Mantener encendida **Atención con IA**.
3. Encender **Motor de IA propio (experimental)**.
4. Probar primero con un número controlado y revisar que el pedido aparezca realmente en el panel.

El interruptor nace apagado. Activarlo no borra ni modifica n8n.

## Cómo volver atrás

Apagar **Motor de IA propio (experimental)**. El siguiente mensaje vuelve a pasar por el webhook de n8n configurado. No hace falta reiniciar ni volver a vincular WhatsApp.

## Tareas manuales pendientes

- Importar en n8n `agente-whatsapp/n8n/workflow-9-tools.generated.json` si se quiere actualizar también el camino de respaldo. Las herramientas añadidas son `menu-dia`, `pedido-actual` y `derivar`.
- Ejecutar la batería real con `node server/tests/agente/correrConversaciones.js` cuando haya cuota disponible. Esa prueba usa el modelo real, tarda y consume tokens; no forma parte de `tests/run.js`.

## Retiro futuro de n8n

No se borra nada durante esta migración. Cuando el motor propio esté probado, el orden seguro es:

1. Deshabilitar el workflow viejo.
2. Archivar sus exportaciones y credenciales.
3. Observar el motor propio durante 30 días.
4. Recién entonces decidir si se borra.

Los exports históricos son el camino de vuelta ante una falla y deben conservarse durante la observación.
