# Bitácora — Motor único de IA

**Fecha:** 15 de agosto de 2026  
**Sistema:** Modo Sabor  
**Estado:** Publicado, apagado por defecto y listo para prueba controlada.

## Qué se publicó

Se subió a `main` el motor común de IA para el asistente del panel y la atención por WhatsApp.

- Motor de herramientas común con límite de vueltas y auditoría por paso.
- Registro único de herramientas, permisos y perfiles de cliente/dueño.
- Carrito conversacional de WhatsApp: agregar, modificar y quitar ítems con precios validados por el servidor.
- Confirmación de pedidos transaccional e idempotente: un reintento no puede duplicar una venta.
- Memoria por teléfono, resumen persistente, corte por inactividad y agrupación de mensajes partidos.
- Política conversacional de Chispita separada del código.
- Métricas de atención: latencia, tokens, herramientas, errores, derivaciones y trazas recientes.
- Dictado por audio en el asistente del panel.
- Workflow de n8n con nueve herramientas generado como respaldo, sin importarlo ni alterar el flujo actual.

## Protección y compatibilidad

- Se corrigió el endpoint que podía consultar la ficha de otro cliente desde una conversación.
- El motor propio de WhatsApp inicia desactivado (`whatsapp_motor_propio = 0`).
- Con el interruptor apagado, los mensajes siguen pasando por el workflow de n8n existente.
- No se eliminó código, workflow ni exportación histórica de n8n.
- No se versionaron bases SQLite, credenciales ni el PDF de la carta.

## Validaciones realizadas

- Suite del servidor: 66 archivos de prueba aprobados, 0 fallados.
- Verificación de rutas: 332 rutas registradas; 148 llamadas literales sin rutas rotas.
- Compilación de producción del cliente: correcta.
- Verificación de formato Git: sin errores.
- Producción: `https://modosabor.com.ar/api/health` respondió HTTP 200, base de datos y URLs públicas operativas.

## Estado de Git

- Publicado en `main`: `c682845f` a `3abd3a5f`.
- Se hicieron 13 commits locales, luego publicados.
- Los cambios de otros módulos que ya estaban en el worktree no se tocaron ni se incluyeron.

## Próximo control operativo

1. En **Configuración → WhatsApp**, dejar activa la atención con IA y encender **Motor de IA propio (experimental)**.
2. Probar desde un número controlado: menú, carta, variantes, cambios de pedido, confirmación, audio y derivación a persona.
3. Verificar que el pedido creado aparezca una única vez en TPV/KDS e inspeccionar métricas y trazas.
4. Ejecutar, con cuota disponible, la batería de conversaciones reales:

   ```powershell
   node server/tests/agente/correrConversaciones.js
   ```

5. Importar el workflow de nueve herramientas en n8n únicamente si se desea actualizar también el camino de respaldo.
6. Tras 30 días estables, decidir si n8n se conserva o se retira siguiendo la guía de migración.

## Nota

La activación del motor propio no requiere reiniciar ni volver a escanear el QR de WhatsApp. Para volver atrás, se apaga el interruptor y el siguiente mensaje vuelve al flujo n8n.
