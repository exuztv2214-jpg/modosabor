# Plan — hardening operativo Modo Sabor

## Estado

Implementación inline en `D:\ModoSaborPromoStitch` (proyecto independiente, sin repositorio Git).

## Ledger

- [x] Seguridad local y persistencia segura
- [x] Configuración real
- [x] Campaña con revisión y ejecución explícitas
- [x] Clasificación CRM persistente por chat
- [x] Verificación final y bitácora

## Tarea 1 — Seguridad local y persistencia segura

Prueba primero: ampliar `scripts/verify.js` para exigir orígenes locales por defecto, sin dominios públicos hardcodeados, y escritura JSON temporal antes del reemplazo.

Implementar el middleware local-only por defecto y una escritura JSON atómica mínima. Añadir `.gitignore` para sesión, fotos, logs y overrides locales sin borrar datos existentes.

Verificar: `npm run verify`, `node --check server.js`, GET de `/api/status`.

## Tarea 2 — Configuración real

Prueba primero: exigir carga de `/api/config`, campos identificables y POST real desde la acción de guardar.

Renderizar los valores actuales, conectar interruptores simples y guardar sólo campos ya soportados por el backend.

Verificar: `npm run verify`, `node --check public/app.js`, GET de `/api/config`.

## Tarea 3 — Campaña con revisión explícita

Prueba primero: exigir estado de plan, preparación, acción de simulacro y acción de ejecución con token.

Separar preparación de ejecución en la UI. La preparación muestra resumen y el botón de envío real sólo aparece después de preparar; no se pulsa durante la verificación.

Verificar: `npm run verify`, sintaxis y que el backend siga rechazando tokens inválidos.

## Tarea 4 — CRM persistente por chat

Prueba primero: exigir archivo de estados de chat, lectura por `id`/`numero` y POST que acepte ambos.

Evitar el no-op actual para chats `@lid`, manteniendo el archivo existente de CRM para contactos con ID.

Verificar: `npm run verify`, sintaxis y una lectura controlada del archivo de estados sin enviar mensajes.

## Tarea 5 — Cierre

Actualizar `docs/superpowers/progress.md` sólo con cambios comprobados. Ejecutar verificaciones finales y reportar límites reales: Cloud API, importador y prueba de envío siguen requiriendo una decisión o acción del usuario.
