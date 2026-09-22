# Correcciones de la auditoría — 16/09/2026

## Implementado localmente

- Atención humana: Caja y administrador acceden a `/admin/atencion-whatsapp`, con conversaciones, mensajes, tomar/devolver a Chispita y respuesta manual. Actualización automática, paginación, estado de pausa y conservación del borrador ante fallo de envío. Avisos y menú apuntan a esta pantalla.
- Permisos: `whatsapp.attend` permite únicamente leer conversaciones, tomar/devolver y responder. Caja no recibe permisos de campañas, configuración, QR ni conexión/desconexión. Sus respuestas requieren una conversación existente; administrador conserva su capacidad anterior.
- Verificaciones HTTP autónomas: crean base y catálogo ficticios desde cero; ya no copian ni necesitan la base operativa.
- Pruebas Mozo/WhatsApp: crean su propio producto simple. No eliminan variantes obligatorias de los productos existentes.
- Aislamiento: arranque de WhatsApp, scheduler social y Firebase deshabilitados en estas verificaciones; preload bloquea HTTP, fetch y sockets externos, permitiendo loopback.
- CI: prueba nueva de permisos HTTP incluida. La dependencia `socket.io-client` ahora pertenece al backend de pruebas y no se busca en `client/node_modules`, inexistente en ese job.

## Evidencia ejecutada

- `npm --prefix server test`: 131 archivos aprobados, 0 fallidos.
- `npm run lint`: cliente y servidor sin errores.
- `npm run build`: compilación aprobada.
- `verify:core`, `verify:operacion`, `verify:mozo`, `verify:whatsapp`, `verify:asistente`, `verify:backup`, `verify:whatsapp-attention`: aprobados con datos ficticios.
- `node server/scripts/verify-whatsapp-attention-ui.js`: Edge headless con build real y API ficticia. Comprueba acceso de Caja, tomar/devolver, mensajes nuevos sin recargar, conservación del borrador al fallar, un envío simulado exitoso, ausencia de errores de página y ajuste móvil.
- Instalación de dependencia de pruebas: npm informó 0 vulnerabilidades. No se ejecutó `audit fix` ni se actualizaron indiscriminadamente dependencias.

Los mensajes de geocodificación bloqueada durante las verificaciones son esperados: confirman que la prueba no accede al proveedor externo. Estas comprobaciones no prueban entrega real por WhatsApp ni disponibilidad de Gemini.

## Pendiente fuera de estos cambios

No se hizo commit, push ni deploy. La CI remota debe ejecutarse con estos archivos y la versión productiva debe recibir el conjunto completo.

Persisten las validaciones operativas señaladas en la auditoría anterior: sesión WhatsApp en la instalación elegida, recorrido real texto/audio/pedido, configuración y prueba de pagos externos, impresión física, dispositivos Rider/Mozo y recuperación integral de respaldo. El estado de Railway de la auditoría del 15/09 no se volvió a consultar en esta corrección.

No se mezclaron bases local/productiva, no se cambiaron credenciales, no se enviaron mensajes reales ni se publicaron campañas. No se borraron backups ni documentos preexistentes.
