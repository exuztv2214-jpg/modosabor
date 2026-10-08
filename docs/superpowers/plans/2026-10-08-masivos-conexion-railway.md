# Masivos: conexión de WhatsApp en Railway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincular una cuenta de WhatsApp en Railway una vez, persistir la sesión y cargar sus contactos en el panel Masivos.

**Architecture:** El módulo de conexión se apoya en `/api/status` como fuente de verdad, SSE como actualización inmediata y el volumen `/app/data` para guardar la autenticación de WhatsApp. El navegador muestra una sola transición: QR, vinculado y sincronizando.

**Tech Stack:** Node.js, Express, whatsapp-web.js, EventSource, Railway Volume.

**Spec:** Evidencia de producción del 2026-10-08: la sesión anterior se guardaba fuera del volumen y la lista de chats podía ser vacía aunque existieran contactos.

## Global Constraints

- No exponer tokens ni rutas internas en la interfaz.
- No iniciar campañas ni enviar mensajes durante la verificación.
- Validar la producción contra Railway, no sólo el entorno local.

## Review Focus

- El QR debe cambiar a `listo` después de escanearlo.
- La sesión debe sobrevivir a un reinicio del servicio.
- Una lista de chats vacía debe caer a `getContacts()`.
- El origen `https://www.modosabor.com.ar` debe poder iniciar sincronización.
- La pantalla debe recibir el resultado y mostrar la cantidad de contactos.

### Task 1: Verificación de conexión y persistencia

**Files:**

- Modify: `masivos/server.js`
- Test: `masivos/scripts/verify.js`

**Interface:** `GET /api/status` informa `whatsapp` y QR; `MASIVOS_SESSION_DIR` define el directorio persistente de `LocalAuth`.

- [ ] Escanear el QR vigente en `www.modosabor.com.ar/masivos`.
- [ ] Confirmar desde Railway que `/api/status` informa `whatsapp: listo`.
- [ ] Reiniciar una vez el servicio y confirmar que conserva `whatsapp: listo` sin un nuevo QR.

### Task 2: Sincronización de contactos

**Files:**

- Modify: `masivos/public/app.js`
- Test: `masivos/scripts/verify.js`

**Interface:** `POST /api/listar` comienza la carga y el evento SSE `lista` concluye con `total`.

- [ ] Iniciar la sincronización sólo después de que la sesión quede `listo`.
- [ ] Confirmar desde Railway que `/api/clientes` devuelve más de cero contactos.
- [ ] Recargar el panel y comprobar que muestra el total real.
