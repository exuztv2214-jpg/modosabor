# SDD ledger — plan: D:\ModoSaborPromoStitch\docs\superpowers\plans\2026-10-05-modo-sabor-stitch-rebuild.md

Task 1: complete — isolated Node/Express backend created on port 3867 with a new session/data root; `npm run verify` passed.
Task 2: complete — Stitch shell, tokens, responsive navigation, and route views created; browser route smoke passed.
Task 3: complete — Inicio, QR modal, status SSE, health and explicit offline states implemented; HTTP and SSE checks passed.
Task 4: complete — Campaña, Contactos, Conversaciones, media/PDF upload hooks, refresh, empty states and dispatch guards implemented; desktop visual review passed.
Task 5: complete — Resultados, Configuración, hidden launcher, manifest and desktop shortcut created; launcher and final verification passed.

Ruling: use `D:\ModoSaborPromoStitch` as the isolated workspace instead of a Git worktree — the user explicitly requested a fresh standalone directory on D: and both prior projects remain untouched.
Ruling: keep the existing Node/Express/whatsapp-web.js backend contract and replace only root/session/port — the user wanted a new visual system without losing working WhatsApp behavior; cost if wrong: backend behavior still needs an end-to-end QR/user check.
Ruling: show dashes and recovery copy while disconnected — avoids inventing CRM metrics before WhatsApp data exists; cost if wrong: the first connected sync is required to populate the dashboard.
Ruling: retain a native browser frontend instead of adding React/Tailwind — the Stitch UI can be reproduced with the existing runtime and fewer moving parts; cost if wrong: a future component library may be useful if the app grows substantially.

Final review: self-review (no independent subagent used). Checked plan alignment, route coverage, isolation paths, no-send guards, responsive CSS, QR/SSE flow, launcher target, syntax, HTTP 200 responses, and browser console errors.

Follow-up complete: CRM detail now calls `/api/cliente-detalle`, uses `/fotos/<nombre>` when a profile photo exists, and preserves explicit empty states when there is no session data.

Follow-up complete: when `whatsapp-web.js` `getChats()` fails on an internal WhatsApp serialization error, sync reads each chat with a safe lightweight page query, skips only malformed chat models, and uses `getContacts()` only as a last resort. Runtime check: session `listo`, 513 unique chats synced, no messages sent.
Follow-up complete: Contactos now exposes an `Actualizar fotos` action backed by `/api/fotos` and live SSE feedback. The direct WhatsApp internal profile-picture path recovered 184 new photos; 390 of 513 contacts now have linked photos, with 123 still unavailable due privacy/data visibility.
Follow-up complete: reused the existing Kimi photo cache without modifying that project: copied 355 image files and linked 206 matching `@lid` records in the new CRM. Sample asset served with HTTP 200.
Follow-up complete: Contacts UX now renders every filtered record with scroll, makes profile photos circular, and provides searchable List/Tarjetas views with real contact metrics.
Follow-up complete: Contactos filters now work with live counts for Todos, Activos, Nuevos, Fríos and Excluidos/Pausados, including a clear empty-filter state.
Follow-up complete: contact detail now shows real tags, last message date, KPIs and a six-item activity timeline from `/api/cliente-detalle` for responses and sends, with an explicit empty state when there is no activity.
Follow-up complete: Conversaciones now loads real WhatsApp history through `/api/conversacion`, renders inbound/outbound bubbles and readable media labels, supports CRM classification, and sends direct replies through `/api/conversacion/mensaje` with validation.
Follow-up complete: Conversations now uses internal column scroll for the inbox and message history, keeping the three-column layout within the viewport instead of stretching the page.
Follow-up complete: Conversations now loads all 518 available WhatsApp chats through `/api/conversaciones`, includes linked circular photos in the chat list/header, and uses a WhatsApp-style green header, light chat background, compact rows and internal scrolling. `@lid` contacts show an explicit private WhatsApp identifier when the platform does not expose a phone number.
Follow-up complete: Conversations now adds instant local search by name/identifier/message and CRM-style filters for Todos, Pedidos, Consultas and Problemas without limiting the 518-chat list.
Follow-up complete: Conversations now listens to the existing SSE `respuesta` event, moves incoming chats to the top, updates the preview, shows unread counters per chat and refreshes unknown new chats without losing the selected view.
Follow-up complete: The conversation composer now accepts image/PDF/audio files up to 16 MB, renders a WhatsApp-style outgoing preview bubble with media, filename, size and caption, supports removing the pending attachment, and sends only after the explicit Enviar action through `/api/conversacion/adjunto`.
Follow-up complete: Incoming messages now receive automatic CRM states from the existing classifier (`pedido_probable`, `consulta`, `problema`, `baja` or `respondido`), persist their type/state, and publish that classification over SSE so chat filters update without fabricating states for chats with no readable history.

Follow-up complete: Contact detail and contact-card WhatsApp actions now open the panel's internal conversation for the exact selected identifier, including private `@lid` IDs, instead of opening a generic `wa.me` page; this is navigation only and does not send messages.
Verification: `npm run verify`, `node --check public/app.js`, `node --check server.js`, fresh browser load, and clicking the real contact action reached the internal conversation with its WhatsApp history and message composer. No message was sent.
Follow-up complete: Conversation refresh now incorporates chat IDs missing from the CRM without overwriting existing contact enrichment; the campaign audience cards now use real enriched segment counts instead of the demo cap/placeholders.
Verification: after panel restart, `/api/conversaciones` reported 518 chats and the CRM increased from 513 to 518; browser reload showed 518 contacts, 23 active, 496 new, 0 cold, and 518 enabled. `npm run verify` and syntax checks passed. No message was sent.
Follow-up complete: Resultados now reads `/api/estadisticas`, shows real campaign/send/read/response totals and recent daily activity, and removes the decorative fake chart values. Direct chat replies now require an explicit confirmation naming the destination and message or attachment before calling the send endpoint.
Verification: `npm run verify`, syntax checks, and browser review of Resultados passed; live data rendered 0 campaigns, 0 sent, 1 read, and 23 unique responses from the existing local records. No message was sent.
Follow-up complete: The Stitch desktop shortcut now launches `wscript.exe` explicitly with the project VBS; the VBS checks `/api/status`, reuses an active panel, starts `node.exe` hidden only when needed, waits for readiness, and then opens the browser without PowerShell.
Verification: shortcut target/arguments/icon were read back from the real `.lnk`; direct `wscript.exe launch-hidden.vbs` exited cleanly and `/api/status` returned HTTP 200 with WhatsApp ready. `npm run verify` and syntax checks passed.
Follow-up complete: Inicio now reuses the real CRM segment counts used by Campaña: enabled contacts, active contacts, new contacts and cold contacts. It no longer presents the full base as “active” or leaves new contacts as a hardcoded dash.
Verification: `npm run verify`, syntax checks and browser reload passed; the live base remains 518 contacts with 23 active, 496 new and 0 cold. No message was sent.
Follow-up complete: Modal close buttons now work because the modal body no longer stops propagation before the delegated close handler. Campaign tabs, CRM filters and preview quick replies now have explicit safe actions; quick replies only show a local simulation toast.
Verification: `npm run verify`, both Node syntax checks, browser tests for Contact modal Cancelar/X, QR modal X, campaign tab, preview reply and CRM filter navigation passed. Static audit found 66 button tags and 0 without an action, route or setting handler. No message was sent.
Follow-up complete: Contact synchronization now merges the WhatsApp result with previous CRM/history records instead of replacing `clientes.json`. Manual/imported contacts are marked as CRM-origin, missing historical records are retained, writes are atomic, and the backup runs before replacement.
Verification: `npm run verify`, `node --check server.js`, `node --check public/app.js`, panel restart, live `/api/status` (`listo`), live `/api/listar` refresh, unchanged 513-contact count, new backup creation, and clean sync log. No message was sent.

Follow-up complete: Campaign preview now uses a closer WhatsApp layout with status bar, business header, verified identity, encryption notice, media bubble, quick replies, composer and local no-send disclaimer.
Follow-up complete: Contacts now supports multi-selection in list/cards, select-visible, clear selection, safe campaign exclusion, temporary pause, and reusable saved sending groups.
Follow-up complete: Saved groups can be selected as a campaign audience, reused from the campaign builder, and removed without deleting contacts. The group API validates names and numbers and persists JSON locally.
Verification: `npm run verify`, `node --check public/app.js`, `node --check server.js`, read-only API checks for status/config/clients/CRM/health, and browser DOM/screenshot checks passed. Preview exposed one real phone layout; Contacts exposed 513 checkboxes, internal list scroll and the group toolbar. No message was sent.
Follow-up complete: Excluded and paused contacts are now hidden from the operational Todos/Nuevos/Fríos views, remain recoverable under Excluidos/Pausados, and can be reactivated in bulk through `/api/reactivar-contactos` without deleting their history.
Verification: restarted the panel to load the backend route, `npm run verify`, syntax checks, and a harmless reactivation request for a nonexistent test number returned HTTP success without changing the 513-contact count. No campaign or test message was sent.
Follow-up complete: Contactos now supports a visual manual-add modal and CSV/VCF import. Imports accept common name/phone columns or vCard `FN`/`TEL`, normalize numbers, deduplicate by WhatsApp ID, preserve existing names/history, and create an automatic backup before a real change.
Verification: `npm run verify`, syntax checks, valid no-op manual/import API requests, invalid-import HTTP 400, unchanged 513-contact count, and browser verification of the Add Contact modal passed. No message was sent.
Follow-up complete: Reused the old Kimi delivery assets without editing that project: `public/assets/logo.png` is now the configurable WhatsApp business logo and `public/assets/promo.png` is the campaign preview fallback.
Follow-up complete: Campaign preview now renders a WhatsApp-style phone with linked delivery logo, business identity, media, message variables, timestamp, checks and an explicit no-send disclaimer.
Follow-up complete: Configuración was expanded into editable sections for identity, logo, pacing, limits, retries, protections, warming, batches, schedule, no-send days, rotating messages and daily target; all are serialized through `/api/config`.
Verification: `npm run verify`, `node --check public/app.js`, `node --check server.js`, HTTP 200 for the panel/assets, and browser review of Campaña/Configuración passed. No WhatsApp message was sent.
Follow-up complete: Improved Campaign multimedia spacing so attachment cards and the upload action have clear vertical separation without changing the upload behavior.
Follow-up complete: The Consultas filter now includes only chats actually classified as `consulta`; unclassified chats remain visible in Todos instead of inflating the consultation count.
Follow-up complete: Added a Nuevos / sin clasificar filter with its count, keeping the WhatsApp inbox categories explicit while new messages wait for automatic classification.
Follow-up complete: Panel hardening now removes public Railway/domain origins from the default CORS allowlist; only loopback/dev origins and explicit `ORIGENES_PANEL` values remain. JSON state writes use a temporary file and replacement, and local session/media/log folders are ignored by Git.
Follow-up complete: Configuración now loads `/api/config`, renders real delay/limits/schedule switches, and persists changes through the existing POST endpoint. Campaign actions now prepare a review plan first; simulation and real execution require separate explicit buttons with the server confirmation token.
Follow-up complete: CRM classification now persists per chat in `data/chat-estados.json`, so chats using `@lid` no longer lose manual state because they have no response ID.
Follow-up complete: Campaign preparation now persists the editor text through `/api/mensaje` before creating a plan; the live preview uses that text, and the action label now says “Preparar y revisar envío” instead of implying immediate dispatch.
Follow-up complete: Removed misleading visible latency/battery/cold-data placeholders from the Inicio presentation where no backend value exists; the header now shows configured batch size and the warming state is derived from `/api/status`.
Follow-up complete: Incoming messages now receive automatic CRM states from the existing classifier (`pedido_probable`, `consulta`, `problema`, `baja` or `respondido`), persist their type/state, and publish that classification over SSE so chat filters update without fabricating states for chats with no readable history.

## Correcciones de auditoría — 2026-10-08

Se corrigieron los diez problemas comprobados en la auditoría del estado real:

- Teléfono y LID comparten exclusiones, pausas, grupos, etiquetas, historial y reintentos. La audiencia se deduplica al leer contactos, incluso después de importar el teléfono de un LID; se conserva la fecha más reciente de conversación.
- El motor vuelve a comprobar BAJA y pausa antes de cada envío, reintento y adjunto; Detener interrumpe las esperas y evita iniciar otro mensaje.
- La confirmación verifica audiencia, destinatarios, configuración, plantillas, etiquetas y archivos adjuntos. Si el plan cambió, devuelve 409 y exige prepararlo nuevamente.
- Las respuestas tardías de conversaciones no reemplazan el chat seleccionado. Refrescar, cargar plantillas o terminar de guardar no sobrescribe texto editado durante la petición.
- El reemplazo JSON conserva el archivo original si falla el rename; sincronizar conserva los contactos históricos ausentes de la lectura nueva.
- El programador respeta el bloqueo por salud roja y el registro de cupo conserva toda la ventana configurada.

Verificación local: `npm --prefix masivos run verify` pasó las comprobaciones existentes y 18 regresiones nuevas; `npm --prefix server test` pasó 145 archivos, 0 fallados, con base temporal y dependencias ya instaladas en el checkout principal. Pasaron `node scripts/verify-masivos-cutover.cjs`, las comprobaciones de sintaxis y `git diff --check`. El CI ahora incluye la verificación de Masivos y del proxy.

Alcance: cambios en este worktree; no se desplegó ni se enviaron mensajes reales. Las pruebas del motor usan WhatsApp simulado y archivos temporales. Pendientes de verificar: sesión real de WhatsApp, comportamiento visual en navegador y ejecución del CI remoto.

## Mejoras de Masivos — 2026-10-08

- Contactos comparte tarjetas, bordes, colores y controles con el resto del panel; filtros y acciones de selección se adaptan al móvil.
- Las confirmaciones y los formularios breves usan modales del panel, con Cancelar, cierre con Escape y restauración del foco. Incluye envío, prueba, exclusión, pausa, reactivación, eliminación de adjuntos y cambio de logo.
- Configuración permite subir el logo y guardar nombre/foto del usuario del panel. Se aceptan PNG/JPG/WebP hasta 2 MB; los perfiles se separan por el usuario autenticado del proxy. El acceso local directo conserva un perfil local.
- El bloqueo por turno persiste en disco y deduplica teléfono/LID, incluso si la relación se descubre durante una campaña. La noche conserva la fecha en que empezó; fuera de los turnos configurados se aplica un bloqueo diario. El arranque local comparte conexión y token con el sistema; si está configurado el backend y faltan horarios sincronizados se impide preparar/enviar/programar campañas hasta cargarlos.
- Confirmar no puede enviar un plan reemplazado durante el modal, y guardar un perfil no borra ediciones nuevas hechas mientras responde la petición.

Verificación: `npm --prefix masivos run verify` pasó sus comprobaciones y 30 regresiones; `npm --prefix server test` pasó 146 archivos, 0 fallados. Cutover estático, sintaxis JavaScript/Python y `git diff --check` correctos. Revisión independiente final sin nuevos P1/P2. Navegador aislado con contactos ficticios: foto/nombre persistentes después de recargar, logo guardado tras modal, cancelar pausa conserva habilitados, Escape cierra y móvil de 390 px sin desbordamiento horizontal. Consola sin errores en la comprobación.

Pendiente: botones interactivos reales, documentados en `../botones-interactivos.md`; la biblioteca QR actual no los admite. Se necesita definir/conectar la cuenta Business Platform y sus plantillas. No se reinició el entorno operativo, no se desplegó, ni se enviaron mensajes reales. El launcher y la sesión de WhatsApp reales siguen sin verificación en ejecución.

## Publicación y auditoría posterior — 2026-10-08

Commit de código `8f91551`, publicado en `main` de `exuztv2214-jpg/modosabor`. CI remota `37838824571` correcta. Railway: API `031e09a0-6ccb-41ec-89e8-b8c953ad870c` y Masivos `d9685a80-666d-47c0-925d-b3ad303d42f2`, ambos SUCCESS. Se respaldaron SQLite y datos operativos antes de publicar.

Verificación real después de publicar: sesión WhatsApp `listo`, 574 contactos, 507 chats almacenados, horarios sincronizados y bloqueo por turno habilitado. Hashes de contactos/exclusiones/pausas/configuración conservados; código remoto coincidente; SQLite con integridad `ok`. Seis pantallas revisadas en Chrome autenticado, cancelación de modal sin guardar y sin errores de consola observados. No se enviaron mensajes ni se cambiaron ajustes operativos.

Bitácora de publicación: [../BITACORA.md](../BITACORA.md). Auditoría completa del módulo y sus integraciones: [../../../AUDITORIA-MASIVOS-POSTDEPLOY-2026-10-08.md](../../../AUDITORIA-MASIVOS-POSTDEPLOY-2026-10-08.md), con 14 hallazgos pendientes y propuestas priorizadas. No confundir la sesión conectada con una prueba de entrega real. Botones Business Platform y ejecución del launcher Windows permanecen sin verificación operativa.
