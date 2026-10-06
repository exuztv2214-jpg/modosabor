# Modo Sabor Stitch Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new local Modo Sabor operations app in `D:\ModoSaborPromoStitch` whose desktop UI follows the supplied Google Stitch screens in layout, density, hierarchy, and interaction.

**Architecture:** Keep one small Node/Express process and a dependency-free browser frontend. Reuse the proven WhatsApp/API behavior by copying only the backend contract into the new project, with a new port, data directory, and WhatsApp session directory. The UI uses a single shell with route-driven views and native browser controls; no frontend framework or new dependency is required for the first working version.

**Tech Stack:** Node.js, Express, `whatsapp-web.js`, vanilla HTML/CSS/JavaScript, native `fetch`, Server-Sent Events, Node `assert` smoke checks.

**Spec:** `D:\ModoSaborPromoStitch\docs\superpowers\specs\2026-10-05-modo-sabor-stitch-design.md`

## Global Constraints

- Keep `D:\ModoSaborPromoPro` and `C:\Users\Exuz\Documents\kimi\Workspaces\masivos` untouched.
- Do not copy WhatsApp sessions, caches, personal data, or existing JSON data into the new project.
- New panel listens on a separate local port and uses a separate session folder.
- Do not send messages during development or visual verification.
- Use Stitch as structure, not only as a color palette: fixed dark sidebar, operational topbar, dense cards, CRM, campaign studio, and three-column inbox.
- Show explicit empty/offline states instead of invented live metrics when WhatsApp is not connected.
- Keep the desktop/tablet two-column structure and provide a usable mobile bottom navigation.

## Review Focus

- Offline or first-run WhatsApp state must render without fake connected metrics; test the shell with `/api/status` unavailable.
- A long contact name/message must truncate or wrap without moving the action controls; test the CRM and inbox fixtures.
- Campaign controls must not dispatch accidentally; test that preview, simulation, test, and real-send paths remain distinct.
- QR reconnection must update the visible connection card without a page reload; test the SSE/status adapter.
- Mobile width must preserve access to the main action and navigation; test at 390px viewport width.

### Task 1: Isolated backend contract

**Files:**

- Create: `D:\ModoSaborPromoStitch\package.json`
- Create: `D:\ModoSaborPromoStitch\server.js`
- Create: `D:\ModoSaborPromoStitch\config.js`
- Create: `D:\ModoSaborPromoStitch\session-utils.js`
- Create: `D:\ModoSaborPromoStitch\mensaje.txt`
- Create: `D:\ModoSaborPromoStitch\scripts\verify.js`
- Test: `D:\ModoSaborPromoStitch\scripts\verify.js`

**Interfaces:**

- Produces the existing API surface (`/api/status`, `/api/clientes`, `/api/crm`, `/api/cliente-detalle`, `/api/segmentos`, `/api/campanas`, `/api/estadisticas`, `/api/fotos`, `/api/imagen`, `/api/pdf`, `/api/preparar-envio`, `/api/enviar-prueba`, `/api/enviar`, `/api/pausar`, `/api/reanudar`, `/api/detener`, `/api/logs`, and SSE events).
- Uses `PORT=3867` by default, `D:\ModoSaborPromoStitch\sesion` for WhatsApp auth, and `D:\ModoSaborPromoStitch\data` for new local state.

- [ ] **Step 1: Add the failing isolation test** asserting package scripts, port, data paths, and session path do not point at either old project.
- [ ] **Step 2: Run `node scripts/verify.js` and confirm it fails before backend files exist.**
- [ ] **Step 3: Copy the proven backend implementation and adjust only root paths, port, startup script, and session identity.** Do not copy old `data`, `logs`, `sesion`, or cache contents.
- [ ] **Step 4: Run `npm install` and `node scripts/verify.js`; expect the isolation and API-shape checks to pass.**

### Task 2: Stitch shell and visual foundation

**Files:**

- Create: `D:\ModoSaborPromoStitch\public\index.html`
- Create: `D:\ModoSaborPromoStitch\public\styles.css`
- Create: `D:\ModoSaborPromoStitch\public\app.js`
- Create: `D:\ModoSaborPromoStitch\public\assets\logo.png`
- Create: `D:\ModoSaborPromoStitch\public\manifest.webmanifest`

**Interfaces:**

- `app.js` exposes route views for `inicio`, `campana`, `contactos`, `conversaciones`, `resultados`, and `configuracion`.
- `styles.css` defines the Stitch tokens: `#181B1F` navigation, `#F9F9FF` canvas, coral `#E03B24`, forest green `#16A34A`, Plus Jakarta Sans/Inter, 8pt spacing, 12–16px cards, and desktop 260px sidebar.

- [ ] **Step 1: Add a browser smoke assertion for sidebar labels `01. Inicio` through `06. Configuración`, topbar actions `Escanear QR`, `Actualizar Contactos`, `Nueva Campaña`, and the mobile navigation hook.**
- [ ] **Step 2: Build the shell with semantic landmarks, visible focus states, and a single active navigation state.**
- [ ] **Step 3: Add responsive CSS for desktop, collapsed tablet, and 390px mobile without third-party CSS.**
- [ ] **Step 4: Run the browser smoke check and inspect a screenshot at 1440px and 390px.**

### Task 3: Inicio / Centro Operativo

**Files:**

- Modify: `D:\ModoSaborPromoStitch\public\app.js`
- Modify: `D:\ModoSaborPromoStitch\public\styles.css`

**Interfaces:**

- Consumes the backend status, health, statistics, campaigns, events, and QR endpoints through one small API adapter.
- Produces `renderInicio(state)` with the Stitch composition: connection card, suggested action, four metric cards, shortcut bar, active campaign, line health, and system activity.

- [ ] **Step 1: Add fixture-based assertions for offline status, connected status, and empty metrics.**
- [ ] **Step 2: Implement the status adapter and explicit offline/QR/connected states.**
- [ ] **Step 3: Implement the two-column Inicio layout and quick actions; QR opens a visual dialog and refresh triggers the real endpoint.**
- [ ] **Step 4: Verify no send endpoint is called by initial render or visual checks.**

### Task 4: Campaña, Contactos, and Conversaciones

**Files:**

- Modify: `D:\ModoSaborPromoStitch\public\app.js`
- Modify: `D:\ModoSaborPromoStitch\public\styles.css`

**Interfaces:**

- `renderCampana(state)` provides message variables, attachments, audience cards, safety checklist, phone preview, simulation, and separated dispatch actions.
- `renderContactos(state)` provides filters, dense table, contact detail drawer, and refresh/import actions.
- `renderConversaciones(state)` provides folder rail, live incoming list, and right-hand conversation detail.

- [ ] **Step 1: Add fixture assertions for long text, no contacts, no conversations, and a disabled dispatch when the WhatsApp session is offline.**
- [ ] **Step 2: Implement the campaign studio with Stitch step rail and native file/date inputs; wire simulation/test/dispatch to different endpoints.**
- [ ] **Step 3: Implement CRM table plus detail drawer with the existing contact endpoints and explicit empty states.**
- [ ] **Step 4: Implement the three-column inbox and live refresh adapter without inventing message history.**
- [ ] **Step 5: Verify visual hierarchy and actions at desktop and mobile widths.**

### Task 5: Results, Configuración, launcher, and verification

**Files:**

- Modify: `D:\ModoSaborPromoStitch\public\app.js`
- Modify: `D:\ModoSaborPromoStitch\public\styles.css`
- Create: `D:\ModoSaborPromoStitch\launch-hidden.vbs`
- Create: `D:\ModoSaborPromoStitch\launcher.ps1`
- Create: `D:\ModoSaborPromoStitch\public\desktop.ico`
- Modify: `D:\ModoSaborPromoStitch\package.json`
- Modify: `D:\ModoSaborPromoStitch\scripts\verify.js`

**Interfaces:**

- Results and configuration consume existing reporting/configuration endpoints and preserve user-facing terms in Spanish.
- Launcher starts Node hidden and opens the local browser without leaving a PowerShell window visible.

- [ ] **Step 1: Add assertions for settings persistence, results empty state, launcher target, and no console menu.**
- [ ] **Step 2: Implement Results and Configuración with safe confirmation around destructive or dispatch actions.**
- [ ] **Step 3: Implement the hidden launcher and desktop icon target for the new project only.**
- [ ] **Step 4: Run `node scripts/verify.js`, start the panel, check `/api/status`, and capture each route at desktop/mobile widths.**
- [ ] **Step 5: Confirm no real send occurred and report any remaining unverified WhatsApp behavior until the user scans the QR.**
