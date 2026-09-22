# Auditoría — Módulo: Modo Sabor Social

> Fecha: 2026-08-17  
> Auditor: Kimi  
> Versión revisada: HEAD del repo  

---

## Estado general: 🟡 FUNCIONAL PERO LIMITADO

El módulo tiene una **arquitectura sólida** (worker local con CDP, cola persistente en SQLite, lock tokens, modo prueba, logs trazables) pero la **implementación está acotada a Facebook Grupos y Páginas**. Faltan la mayoría de las capacidades del diseño de producto original, y hay áreas de riesgo operativo que deben atenderse antes de escalar su uso.

---

## 1. Lo que funciona ✅

| # | Funcionalidad | Evidencia | Calidad |
|---|--------------|-----------|---------|
| 1 | **Campañas con estados completos** | `social_campaigns` + `social_post_targets` con 9 estados: `draft`, `scheduled`, `queued`, `processing`, `published`, `requires_approval`, `ambiguous`, `failed`, `cancelled` | 🟢 Sólido |
| 2 | **Cola persistente con locks** | Cada destino se publica individualmente; el worker reclama con `lock_token` + `lock_hasta`; el scheduler recupera trabajos interrumpidos | 🟢 Muy bueno |
| 3 | **Worker local con Chrome/CDP** | `social-worker/index.js` usa `playwright-core` + `chromium.connectOverCDP`; no guarda cookies; no resuelve CAPTCHAs | 🟢 Bien diseñado |
| 4 | **Modo prueba obligatorio** | La UI fuerza `modo_prueba=true` por defecto; solo permite 1 destino manual; no se puede publicar a todos los grupos sin validar | 🟢 Excelente |
| 5 | **Sincronización de grupos Facebook** | El worker escanea `/groups/joined/` y devuelve grupos detectados al backend | 🟢 Funciona |
| 6 | **Health check del worker** | Endpoint `/social/worker/health-check` verifica Chrome + sesión Facebook + grupos | 🟢 Útil |
| 7 | **Logs de publicación detallados** | Tabla `social_publication_logs` con nivel, código, mensaje, detalle JSON, screenshot | 🟢 Completo |
| 8 | **Capturas ante fallo** | Si `SOCIAL_CAPTURE_FAILURE_SCREENSHOTS=1`, el worker sube screenshot al backend | 🟢 Bueno para debug |
| 9 | **Conjuntos de destinos** | Se pueden crear conjuntos reutilizables (`social_destination_sets` + `social_destination_set_items`) | 🟢 Funcional |
| 10 | **Scheduler de recuperación** | `socialScheduler.js` cada 30s: marca `ambiguous` los locks vencidos + pasa `scheduled` a `queued` | 🟢 Necesario |
| 11 | **Autenticación segura del worker** | `socialWorker.js` usa `crypto.timingSafeEqual` para validar `X-Social-Worker-Key` | 🟢 Seguro |
| 12 | **Test de seguridad E2E** | `socialE2eSafety.test.js` verifica estados `requires_approval`, `ambiguous`, modo prueba, retry limitado | 🟢 Presente |
| 13 | **UI completa en React** | `Social.jsx` con 5 pestañas: Inicio, Crear, Destinos, Campañas, Actividad | 🟢 Bien hecha |
| 14 | **Documentación de diseño** | `docs/MODO-SABOR-SOCIAL-DISENO.md` con navegación, composer, límites deliberados | 🟢 Existe |

---

## 2. Qué falta / problemas 🔴🟡

### 2.1 Riesgos operativos (🔴 Crítico / Alto)

| # | Problema | Impacto | Evidencia |
|---|----------|---------|-----------|
| 1 | **Solo Facebook funciona** | Instagram, Story, Reel están como `DESTINATION_TYPES` pero el worker solo soporta `facebook_group` y `facebook_page` | `social-worker/index.js:148` valida `!['facebook_group', 'facebook_page'].includes(...)` |
| 2 | **No hay eliminar/editar destinos** | Solo se pueden crear destinos y conjuntos; no hay forma de corregir un nombre, URL, o eliminar algo obsoleto | `social.js` no tiene `PUT /destinos/:id` ni `DELETE` |
| 3 | **No hay eliminar campañas** | Solo se pueden cancelar; no borrar. La base crece sin límite | Solo existe `cancelCampaign`; no `deleteCampaign` |
| 4 | **No hay duplicar campaña** | Cada publicación se arma desde cero; no se puede reusar una campaña exitosa | No existe endpoint ni UI |
| 5 | **Worker es Windows-only** | Depende de `.cmd` + Chrome local; no hay versión para Linux/macOS ni modo headless alternativo | `abrir-chrome-social.cmd`, `iniciar-worker.cmd` |
| 6 | **No hay fallback si no hay worker** | Si el worker no está corriendo, las campañas quedan en `queued` indefinidamente sin alertar | El scheduler solo recupera locks vencidos, no alerta de worker offline |
| 7 | **No hay notificaciones de fallo** | Si una campaña falla en todos los destinos, nadie se entera a menos que entre al panel | No hay WebSocket push, email, ni WhatsApp |

### 2.2 Features faltantes del diseño (🟡 Medio)

| # | Feature del diseño | Estado actual | Archivo de diseño |
|---|-------------------|---------------|-------------------|
| 1 | **Calendario mensual/semanal** | No existe; solo lista de campañas en tabla | `MODO-SABOR-SOCIAL-DISENO.md:97-99` |
| 2 | **IA en el composer** (Generar, Mejorar, Más vendedor, Emojis, Hashtags) | No implementado | `MODO-SABOR-SOCIAL-DISENO.md:62` |
| 3 | **Personalización por red** (texto diferente para Facebook vs Instagram vs Story) | Tabla `personalizaciones` existe como JSON pero la UI no lo usa | `MODO-SABOR-SOCIAL-DISENO.md:70-72` |
| 4 | **Preview antes de publicar** | No existe pantalla de revisión | `MODO-SABOR-SOCIAL-DISENO.md:67-68` |
| 5 | **Automatizaciones** (publicar menú del día automáticamente, etc.) | No existe | `MODO-SABOR-SOCIAL-DISENO.md:29` |
| 6 | **Métricas de engagement** (likes, comentarios, alcance) | No existe tabla ni endpoint | `MODO-SABOR-SOCIAL-DISENO.md:30` |
| 7 | **Plantillas activas** | Tabla `social_templates` existe pero la UI no las usa al crear campaña | `social.js:84-89` solo las lista |
| 8 | **Búsqueda/filtro en campañas** | Lista plana sin paginación ni filtros | `Social.jsx:478-523` |
| 9 | **Paginación real** | Queries con `LIMIT` pero sin `OFFSET` | `socialService.js:302-313` |
| 10 | **Estadísticas del worker** | Solo último heartbeat; no hay gráfico de latencia ni éxito/fallo por hora | `dashboard()` solo devuelve contadores |

### 2.3 Deuda técnica (🟡 Medio)

| # | Problema | Detalle |
|---|----------|---------|
| 1 | **Test solo de seguridad E2E** | No hay tests unitarios de `socialService.js`; el único test (`socialE2eSafety.test.js`) verifica strings en el código fuente | `server/tests/utils/socialE2eSafety.test.js` |
| 2 | **Rate limiting ausente** | Podría saturar Facebook si se encolan muchas campañas | No hay delay entre publicaciones ni throttle |
| 3 | **Sin manejo de 2FA/checkpoint** | Si Facebook pide verificación, el worker frena y reporta, pero no hay flujo para "esperar a que el operador resuelva y reintentar" | Solo devuelve `SESSION_EXPIRED` |
| 4 | **Videos no probados** | El filtro de `multer` acepta `video/mp4` y `video/quicktime`, pero el worker no tiene lógica específica para subir videos a Facebook | `social.js:25` vs `social-worker/index.js:164-168` |
| 5 | **social_accounts desconectada** | La tabla existe y el JOIN la referencia, pero no hay UI ni endpoints para gestionar cuentas | `socialService.js:114-121` hace LEFT JOIN pero no hay CRUD de cuentas |
| 6 | **No hay sanitización de texto para Facebook** | El texto se manda tal cual; no hay escape de caracteres problemáticos ni limitación de hashtags | `composer.fill(item.texto \|\| '')` directo |

### 2.4 Bugs potenciales (⚠️)

| # | Problema | Línea | Riesgo |
|---|----------|-------|--------|
| 1 | **Ambigüedad no se reintenta automáticamente** | `socialService.js:373-374` | Si Facebook no confirma, queda en `ambiguous` para siempre a menos que alguien lo revise manualmente. Esto es *deliberado* según el diseño, pero puede generar acumulación. |
| 2 | **Screenshot puede quedar en tmp sin borrar** | `social-worker/index.js:121` | Si `uploadScreenshot` falla, el `fs.unlink` en `finally` solo corre si llega ahí; si hay excepción antes, queda en `/tmp` |
| 3 | **No hay validación de URL de destino** | `socialService.js:136` | Se acepta cualquier string como `url`; podría inyectarse una URL maliciosa que redirija |
| 4 | **Falta `ON CONFLICT` en `social_accounts`** | `migrations.js:1592-1603` | La tabla no tiene UNIQUE constraint en `(provider, identificador_externo)` a diferencia de `social_destinations` |

---

## 3. Propuesta de mejora

### 3.1 Tabla de tareas priorizadas

| # | Tarea | Esfuerzo | Prioridad | Impacto |
|---|-------|----------|-----------|---------|
| 1 | **Agregar editar/eliminar destinos y conjuntos** | 4 horas | 🔴 Alta | Operativo crítico |
| 2 | **Agregar eliminar/duplicar campaña** | 3 horas | 🔴 Alta | UX diaria |
| 3 | **Alerta cuando worker está offline > 5 min** | 2 horas | 🔴 Alta | Evita campañas encoladas al pedo |
| 4 | **Rate limiting: delay 30s entre publicaciones** | 1 hora | 🟡 Media | Reduce riesgo de bloqueo |
| 5 | **IA en composer: botón "Generar texto"** | 1 día | 🟡 Media | Diferenciador vs competencia |
| 6 | **Calendario mensual de campañas** | 1 día | 🟡 Media | Mejora planeación |
| 7 | **Soporte básico de Instagram (solo feed)** | 2 días | 🟡 Media | Expande alcance |
| 8 | **Tests unitarios de socialService.js** | 1 día | 🟡 Media | Reduce regresiones |
| 9 | **Métricas: likes/comentarios por campaña** | 2 días | ⚪ Baja | Análisis de ROI |
| 10 | **Automatización: publicar menú del día a la hora X** | 2 días | ⚪ Baja | Ahorra tiempo recurrente |
| 11 | **Worker multiplataforma (Linux/macOS scripts)** | 1 día | ⚪ Baja | Portabilidad |
| 12 | **Notificación WhatsApp/email ante fallo masivo** | 4 horas | ⚪ Baja | Operación pasiva |

### 3.2 Top 3 recomendado para implementar HOY

1. **Editar/eliminar destinos** (4h) — Sin esto, cada vez que cambia un grupo hay que tocar la base a mano.
2. **Alerta de worker offline** (2h) — Una campaña programada para las 20:00 que nunca se ejecuta porque el worker no está es peor que no tenerla.
3. **Rate limiting** (1h) — Protege la cuenta de Facebook de un bloqueo por exceso de publicaciones.

---

## 4. Métricas del módulo

| Métrica | Valor |
|---------|-------|
| Archivos del módulo | 13 |
| Líneas de backend (routes + services + scheduler + worker routes) | 905 |
| Líneas de frontend (Social.jsx) | 549 |
| Líneas del worker local | 301 |
| Tablas de base de datos | 10 |
| Tests | 1 (E2E de seguridad, basado en strings) |
| Permiso requerido | `marketing.view` / `marketing.edit` |
| Ruta en el panel | `/admin/social` |
| Ruta del menú | Clientes → Modo Sabor Social |

---

## 5. Veredicto

**Modo Sabor Social es un módulo bien arquitectado con una base técnica sólida**, pero está en una **fase de MVP acotado a Facebook**. La decisión de usar un worker local con CDP en lugar de la API oficial de Facebook es inteligente para un local pequeño (evita revisiones de app, permisos, tokens), pero introduce una dependencia operativa: **el Chrome del local debe estar abierto y con sesión iniciada**.

**Para dejarlo "pro"**, el camino es:
1. Cerrar los huecos operativos (editar/eliminar, alertas, rate limit).
2. Agregar IA en el composer para que escriban menos.
3. Expandir a Instagram feed como segundo destino real.
4. Automatizar lo repetitivo (menú del día, promos recurrentes).

> El riesgo más grande HOY es que publiquen a 20 grupos, falle el worker, y nadie se entere hasta el día siguiente.
