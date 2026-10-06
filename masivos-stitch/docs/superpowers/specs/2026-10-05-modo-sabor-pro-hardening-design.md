# Modo Sabor — hardening y operación real

## Objetivo

Convertir el panel visual en una herramienta operativa honesta: la configuración debe guardar, una campaña debe pasar por revisión explícita antes de enviar, y la clasificación del inbox debe persistir por chat aunque WhatsApp use identificadores `@lid`.

## Límites de seguridad

- El servidor queda local-only por defecto; no se mantienen orígenes públicos hardcodeados.
- Las pruebas no disparan campañas ni mensajes reales.
- El envío real sólo queda disponible detrás de una segunda acción visible del operador, usando el token de preparación existente.
- La solución no promete evitar bloqueos de WhatsApp; el uso de la API oficial sigue siendo el camino de producción.

## Diseño mínimo

1. Reducir la superficie de origen del middleware a loopback y orígenes explícitos por `ORIGENES_PANEL`.
2. Cargar `/api/config` al iniciar y enviar los valores editables al endpoint existente.
3. Separar “preparar”, “simular” y “ejecutar” en campaña. Preparar nunca envía.
4. Guardar clasificación por clave de chat en `data/chat-estados.json`, con `id` real cuando exista y `numero` como fallback.
5. Mantener la UI actual y corregir sólo los falsos no-op y datos inventados que bloquean la operación.

## Fuera de alcance de este bloque

Importador Excel/VCF completo, base SQLite, autenticación multiusuario y migración a WhatsApp Cloud API. Se agregan después de estabilizar este contrato local.
