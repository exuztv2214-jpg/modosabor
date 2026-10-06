# Reemplazo Masivos por Stitch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convertir `/masivos` en la entrada del panel Stitch y dejar una sola sesión local de WhatsApp.

**Architecture:** El frontend principal conserva la navegación y redirige `/masivos` a `VITE_MASIVOS_PANEL_URL`, con `127.0.0.1:3867` como fallback local. El lanzador principal arranca API, Vite y Stitch ocultos; la API principal se inicia con `WHATSAPP_DISABLE_STARTUP=1` para que solo Stitch controle WhatsApp. En Railway, Stitch requiere un servicio separado mientras no se migre su runtime al servidor principal.

**Tech Stack:** React/Vite, Python/Tkinter, Node/Express, `whatsapp-web.js`, scripts Node de verificación.

**Spec:** `docs/superpowers/specs/2026-10-05-reemplazo-masivos-stitch-design.md`

## Global Constraints

- No borrar datos ni sesiones.
- No enviar mensajes durante la verificación.
- El módulo React viejo queda fuera de la navegación, pero recuperable.
- No agregar dependencias.

## Review Focus

- Si `3867` ya está ocupado por otro proceso, el lanzador debe identificarlo y liberar solo ese proceso antes de iniciar Stitch.
- Si la API principal ya estaba levantada sin `WHATSAPP_DISABLE_STARTUP=1`, debe reiniciarse antes de declarar el sistema listo.
- Si Stitch no queda listo, el lanzador debe informar error sin abrir una pantalla rota.
- El acceso directo debe seguir ocultando las consolas.
- El backend principal y Vite deben conservar sus puertos y salud actuales.
- La publicación Railway no debe declararse lista sin desplegar Stitch y configurar `VITE_MASIVOS_PANEL_URL`.

### Task 1: Puente de navegación

**Files:**

- Create: `scripts/verify-masivos-cutover.cjs`
- Modify: `client/src/App.jsx:131-156`
- Backup: `.launcher/backups/WhatsAppMasivo-2026-10-05.jsx`

**Interfaces:**

- Produces: `/masivos` navegando a `http://127.0.0.1:3867`.

- [ ] **Step 1: Write the failing verification**

  Crear `scripts/verify-masivos-cutover.cjs` con asserts que exijan el marcador de redirección externo y que `MasivosPathRoutes` ya no renderice `<WhatsAppMasivo />`.

- [ ] **Step 2: Run it and verify RED**

  Run: `node scripts/verify-masivos-cutover.cjs`

  Expected: FAIL porque la ruta actual todavía renderiza `WhatsAppMasivo`.

- [ ] **Step 3: Back up and implement the bridge**

  Copiar el componente actual a `.launcher/backups/` y cambiar solo el índice de `/masivos` para navegar al panel Stitch mediante `window.location.replace`, mostrando un estado breve mientras cambia la URL.

- [ ] **Step 4: Run the verification and build**

  Run: `node scripts/verify-masivos-cutover.cjs` y `npm run build`

  Expected: ambos comandos terminan con código 0.

- [ ] **Step 5: Commit**

  Commit: `feat: route masivos to stitch panel`

### Task 2: Lanzador y sesión única

**Files:**

- Modify: `ModoSabor.pyw:35-80, 510-516, 589-616, 703-714, 791-849, 857-868, 882-900`
- Modify: `scripts/verify-masivos-cutover.cjs`

**Interfaces:**

- Consumes: `http://127.0.0.1:3867/api/status`.
- Produces: servicio Stitch rastreado, apagado seguro y API principal iniciada con `WHATSAPP_DISABLE_STARTUP=1`.

- [ ] **Step 1: Extend the failing verification**

  Agregar asserts para `STITCH_URL`, `PROMO_ROOT`, `WHATSAPP_DISABLE_STARTUP`, el servicio Stitch y el endpoint `/api/status`.

- [ ] **Step 2: Run it and verify RED**

  Run: `node scripts/verify-masivos-cutover.cjs`

  Expected: FAIL porque el lanzador todavía solo conoce API/Vite.

- [ ] **Step 3: Implement the minimum launcher changes**

  Agregar Stitch como tercer servicio, iniciar `D:\ModoSaborPromoStitch\server.js` oculto, validar `/api/status`, abrir el panel nuevo desde la acción correspondiente y pasar `WHATSAPP_DISABLE_STARTUP=1` al proceso API. Si la API existente no tiene el marcador de arranque nuevo, reiniciarla una vez.

- [ ] **Step 4: Run syntax and static verification**

  Run: `python -m py_compile ModoSabor.pyw` y `node scripts/verify-masivos-cutover.cjs`

  Expected: código 0 y todos los asserts pasan.

- [ ] **Step 5: Commit**

  Commit: `feat: launch stitch as canonical masivos panel`

### Task 3: Verificación end-to-end local

**Files:**

- Modify: `scripts/verify-masivos-cutover.cjs` only if a missing assertion is discovered.

**Interfaces:**

- Consumes: puertos 3001, 3867 y 5173.
- Produces: evidencia de salud y ausencia de envío real.

- [ ] **Step 1: Start/reload services through the launcher**

  Ejecutar el lanzador principal y esperar a que sus tres servicios figuren activos.

- [ ] **Step 2: Verify live endpoints**

  Run: `Invoke-WebRequest http://localhost:3001/api/health`, `Invoke-WebRequest http://127.0.0.1:3867/api/status` y `Invoke-WebRequest http://localhost:5173/masivos`.

  Expected: 200 en los tres; `/masivos` contiene la entrada del panel Stitch y no realiza ningún envío.

- [ ] **Step 3: Run project verification**

  Run: `npm run verify` en `D:\ModoSaborPromoStitch`.

  Expected: código 0.

- [ ] **Step 4: Record final evidence**

  Registrar los PIDs/puertos verificados y dejar explícito que no se envió ningún mensaje.
