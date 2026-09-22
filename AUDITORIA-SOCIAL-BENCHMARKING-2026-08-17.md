# Auditoría COMPLETA con Benchmarking — Módulo Modo Sabor Social

> Fecha: 2026-08-17  
> Auditor: Kimi  
> Benchmarking contra: Postiz, Mixpost, Social0, Bulkit.dev, Buffer, Later, Hootsuite  

---

## 1. Resumen Ejecutivo

**Modo Sabor Social** tiene una **arquitectura técnica sólida** (worker CDP, cola SQLite, locks, modo prueba) pero está **muy por debajo del estándar de mercado** en funcionalidades operativas. Comparado contra herramientas open-source como **Postiz** o **Mixpost**, el módulo actual cubre aproximadamente **25% de las capacidades esperadas** para un scheduler social profesional.

**Veredicto**: Para dejarlo "pro", hay que pasar de un "Facebook group poster básico" a un **"Social Media Manager integrado"** con calendario, multi-red real, IA, analytics y automatizaciones.

---

## 2. Benchmarking: Herramientas Reales Analizadas

Investigué **más de 15 herramientas reales** en el mercado. Estas son las más relevantes:

### 2.1 Herramientas Open Source / Self-Hosted

| Herramienta | Stack | Redes Soportadas | Features Clave | Precio |
|-------------|-------|-----------------|----------------|--------|
| **Postiz** | Next.js + NestJS + Prisma + PostgreSQL | 30+ (IG, FB, TikTok, X, LinkedIn, YouTube, Pinterest, Reddit, Discord, Telegram, WordPress...) | AI content generation, Canva-like editor, cross-posting, auto-post/like/comment, API, n8n node, self-host | Free (self-host) / $29 cloud |
| **Mixpost** | Laravel + PHP | 11 (FB, IG, X, LinkedIn, YouTube, TikTok, Pinterest, Mastodon, Bluesky, Threads, Google Business) | Calendario visual, analytics por plataforma, media library, AI composition, hashtag groups, post versions, approval workflows | $79 one-time (Pro) |
| **Social0** | Next.js + Postgres + Redis + Cloudflare | IG, TikTok, YouTube, X, LinkedIn, FB, Pinterest, Threads, Bluesky | API REST, MCP, CLI, OAuth multi-plataforma, Cloudflare deploy | Free (self-host) |
| **Bulkit.dev** | TypeScript/Node | LinkedIn, X, FB, IG, YouTube, TikTok | Workflow automation, AI-assisted hashtags, multi-channel, self-hosted | Free (open source) |
| **OPoster** | PHP/Self-hosted | Telegram, FB, IG, Twitter, VK, Odnoklassniki | Calendario, scheduling, image posts, one-command deploy | Free |

### 2.2 Herramientas Comerciales (referencia UX)

| Herramienta | Precio | Lo que hace mejor |
|-------------|--------|-------------------|
| **Buffer** | $6/canal/mes | UX simple, AI captions, clean UI |
| **Later** | $25+/mes | Visual calendar, grid preview, Instagram-first |
| **Hootsuite** | $99+/usuario/mes | 35+ redes, social listening, reporting enterprise |
| **Sprout Social** | $249+/mes | Smart Inbox, sentiment analysis, CRM-style |

### 2.3 Scripts Específicos de Facebook (GitHub)

| Script | Stack | Qué hace | Estado |
|--------|-------|----------|--------|
| **Facebook Auto Poster** | JavaScript/CSS | Smart delay engine, image upload, link preview, scheduling, campaign save/load | Activo (jun 2026) |
| **fb-group-auto-post** (ByamB4) | Python + Playwright | Multi-group posting, cookie session, groups.json config | Activo |
| **fb_poster** (paologlim) | Python | YAML config, token-based, queue system | Viejo pero funcional |
| **Python-Selenium-FB-poster** | Python + Selenium | Multi-group images + text, Chrome driver | Roto por UI update |

---

## 3. Qué HACE Modo Sabor Social (funcionalidades actuales)

### Backend (`server/`)

| # | Feature | Estado | Archivo |
|---|---------|--------|---------|
| 1 | Crear campaña con texto + multimedia | ✅ Funciona | `socialService.js:201-270` |
| 2 | Estados de campaña: draft, scheduled, queued, processing, published, failed, cancelled, requires_approval, ambiguous | ✅ Funciona | `socialService.js:5-15` |
| 3 | Destinos: Facebook Page, Facebook Group (solo estos dos funcionan) | 🟡 Parcial | `social-worker/index.js:148` |
| 4 | Conjuntos de destinos reutilizables | ✅ Funciona | `socialService.js:151-185` |
| 5 | Worker local con Chrome/CDP (Playwright) | ✅ Funciona | `social-worker/index.js` |
| 6 | Cola con lock tokens y reintentos (max 2) | ✅ Funciona | `socialService.js:384-438` |
| 7 | Scheduler de recuperación (30s) | ✅ Funciona | `socialScheduler.js` |
| 8 | Logs de publicación con nivel/código/detalle | ✅ Funciona | `socialService.js:55-79` |
| 9 | Capturas de pantalla ante fallo | ✅ Funciona | `social-worker/index.js:119-124` |
| 10 | Sincronización de grupos Facebook | ✅ Funciona | `social-worker/index.js:77-104` |
| 11 | Health check del worker | ✅ Funciona | `social-worker/index.js:54-75` |
| 12 | Autenticación del worker por clave segura | ✅ Funciona | `socialWorker.js:19-31` |
| 13 | Modo prueba (1 solo destino obligatorio) | ✅ Funciona | `socialService.js:219-224` |
| 14 | Cancelar campaña | ✅ Funciona | `socialService.js:336-352` |
| 15 | Reintentar fallidos manualmente | ✅ Funciona | `socialService.js:354-382` |
| 16 | Heartbeat del worker | ✅ Funciona | `socialService.js:579-599` |
| 17 | Media upload (imágenes/videos hasta 256MB) | ✅ Funciona | `social.js:14-30` |
| 18 | Plantillas (solo tabla, no integradas) | ⚪ Incompleto | `social.js:84-89` solo lista |

### Frontend (`client/src/pages/Social.jsx`)

| # | Feature | Estado |
|---|---------|--------|
| 1 | Dashboard con KPIs (grupos, en cola, errores, worker status) | ✅ |
| 2 | Crear publicación: nombre, texto, multimedia, programación | ✅ |
| 3 | Selección de destinos (checkbox) | ✅ |
| 4 | Vista de destinos (lista) | ✅ |
| 5 | Crear conjuntos | ✅ |
| 6 | Calendario de campañas (lista tabla, NO calendario visual) | 🟡 |
| 7 | Logs de actividad | ✅ |
| 8 | Reintentar fallidos desde la tabla | ✅ |

---

## 4. Qué NO HACE — Gap Analysis vs Mercado

### 4.1 Features que TODAS las herramientas del mercado tienen y ModoSabor NO

| # | Feature | Por qué es importante | Referencia (Postiz/Mixpost/Buffer) |
|---|---------|----------------------|-----------------------------------|
| 1 | **Calendario visual mensual/semanal** | Planificar contenido a primera vista; drag & drop | Mixpost, Later, Buffer, Postiz |
| 2 | **Editar/eliminar destinos** | Gestión operativa básica; corregir URLs, nombres, eliminar obsoletos | TODAS |
| 3 | **Eliminar/duplicar campañas** | Reutilizar contenido exitoso; limpiar borradores | TODAS |
| 4 | **Preview por plataforma** | Ver cómo queda el post en FB vs IG antes de publicar | Buffer, Later, Postiz |
| 5 | **Personalización de texto por red** | Texto corto para X, largo para FB, hashtags para IG | Mixpost (post versions), Postiz |
| 6 | **Analytics/engagement** (likes, comentarios, alcance) | Saber qué funciona; ROI del esfuerzo | TODAS tienen analytics |
| 7 | **Multi-red REAL** (Instagram, TikTok, X, LinkedIn, YouTube) | Publicar donde está la gente, no solo FB | Postiz: 30+, Mixpost: 11, Social0: 9 |
| 8 | **Queue/cola inteligente** (best time to post, slots) | Maximizar engagement posteando en horarios óptimos | Buffer SmartSchedule, Later |
| 9 | **AI para generar texto** | El mozo no es copywriter; la IA escribe promos atractivas | Postiz AI, Buffer AI, Vista Social |
| 10 | **AI para generar imágenes** | Crear flyers de promo sin diseñador | Postiz image gen, Canva |
| 11 | **Automatizaciones** (RSS, menú del día auto, promos recurrentes) | "Set and forget"; ahorra horas semanales | Postiz RSS, SocialBee evergreen |
| 12 | **Approval workflow** | El dueño revisa antes de que se publique | Mixpost, Hootsuite, Sprout |
| 13 | **Bulk scheduling** (subir 10 posts de una) | Planificar toda la semana en 10 minutos | Buffer, Later, Postiz |
| 14 | **Evergreen content recycling** | Reusar posts top automáticamente | SocialBee, Publer |
| 15 | **Team collaboration** (comentarios, asignaciones, roles) | Varias personas crean contenido | TODAS |
| 16 | **Inbox unificado** (respuestas, mentions, DMs) | No perder interacciones | Sprout, Hootsuite, Postiz |
| 17 | **Hashtag suggestions / grupos** | Maximizar descubrimiento | Later, Buffer, Vista Social |
| 18 | **Link preview customization** | Controlar cómo se ve el link en FB | Buffer, Hootsuite |
| 19 | **White-label / branding** | El local ve su marca, no la de un tercero | Mixpost, Sendible |
| 20 | **Exportar reportes PDF** | Mostrar resultados al dueño | Sprout, Hootsuite, Metricool |

### 4.2 Features que las herramientas "pro" tienen y podríamos considerar

| # | Feature | Herramienta referencia |
|---|---------|----------------------|
| 1 | **Competitor analysis** (qué publican los competidores) | Metricool |
| 2 | **Social listening** (menciones de la marca) | Hootsuite Insights, Sprout |
| 3 | **Influencer discovery** | AspireIQ, Grin |
| 4 | **UTM tracking automático** | Buffer, Hootsuite |
| 5 | **A/B testing de posts** | Meta Ads Manager, Sprout |
| 6 | **Auto-respuestas / chatbot en redes** | ManyChat, Postiz |

---

## 5. Plan de Implementación Completo

### Fase 1: Fundamentos (Semana 1-2) — Cerrar huecos críticos

| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 1.1 | **Editar/eliminar destinos y conjuntos** | 4h | 🔴 Alto |
| 1.2 | **Eliminar/duplicar campañas** | 3h | 🔴 Alto |
| 1.3 | **Alerta de worker offline** (badge rojo en UI + log) | 2h | 🔴 Alto |
| 1.4 | **Rate limiting: delay 30s entre publicaciones** | 1h | 🟡 Medio |
| 1.5 | **Paginación + búsqueda en campañas** | 3h | 🟡 Medio |
| 1.6 | **Tests unitarios de socialService** | 1 día | 🟡 Medio |

### Fase 2: UX Pro (Semana 3-4) — Calendario y preview

| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 2.1 | **Calendario visual mensual** (react-calendar o similar) | 2 días | 🔴 Alto |
| 2.2 | **Preview del post por plataforma** (cómo se vería en FB) | 1 día | 🟡 Medio |
| 2.3 | **Plantillas activas** (seleccionar al crear campaña) | 4h | 🟡 Medio |
| 2.4 | **Bulk upload de imágenes** (arrastrar múltiples) | 3h | 🟡 Medio |
| 2.5 | **Mejorar UI del composer** (tabs por paso, más espaciado) | 1 día | 🟡 Medio |

### Fase 3: Inteligencia (Semana 5-6) — IA y automatización

| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 3.1 | **Botón "Generar texto con IA"** en el composer | 1 día | 🔴 Alto |
| 3.2 | **Botón "Mejorar texto"** (más vendedor, emojis, hashtags) | 4h | 🔴 Alto |
| 3.3 | **Generador de flyers con IA** (texto → imagen promo) | 2 días | 🔴 Alto |
| 3.4 | **Automatización: publicar menú del día a la hora X** | 1 día | 🟡 Medio |
| 3.5 | **Automatización: reusar post top cada X días** | 1 día | 🟡 Medio |

### Fase 4: Multi-Red (Semana 7-8) — Expandir plataformas

| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 4.1 | **Instagram Feed** (via Facebook Graph API, ya que FB e IG comparten token) | 2 días | 🔴 Alto |
| 4.2 | **WhatsApp Status** (como destino de difusión) | 1 día | 🟡 Medio |
| 4.3 | **Preparar arquitectura para TikTok, X, LinkedIn** (tablas, destinos, OAuth) | 2 días | ⚪ Bajo (futuro) |

### Fase 5: Analytics (Semana 9-10) — Métricas y reporting

| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 5.1 | **Dashboard de analytics**: publicaciones por día, éxito/fallo por destino | 2 días | 🟡 Medio |
| 5.2 | **Engagement tracking** (likes, comentarios, shares si la API lo permite) | 2 días | ⚪ Bajo |
| 5.3 | **Reporte PDF semanal/mensual** de actividad social | 1 día | ⚪ Bajo |

---

## 6. Scripts/Herramientas que Podemos Adaptar

### 6.1 De Postiz (open source, MIT license)

**Qué podemos copiar/aprender:**
- **Arquitectura de workers**: Usan Redis + BullMQ para la cola. Nosotros usamos SQLite; es más simple pero no escala. Podríamos migrar a Redis si crecemos.
- **OAuth flow multi-plataforma**: Tienen integraciones con 30+ redes con OAuth estándar. Podemos copiar el patrón para Instagram/TikTok.
- **AI content generation**: Integran OpenAI/Ollama para generar posts. Podemos usar el mismo patrón.
- **Canva-like editor**: Tienen un editor visual integrado. Complejo de replicar; mejor integrar Canva embed.

**Link**: https://github.com/gitroomhq/postiz

### 6.2 De Mixpost (open source, MIT license)

**Qué podemos copiar/aprender:**
- **Calendario visual**: Laravel + Vue con drag & drop. Podemos adaptar la lógica a React.
- **Post versions** (texto diferente por red): Patrón simple de `personalizaciones` JSON que ya tenemos en la DB pero no usamos.
- **Approval workflows**: Estado intermedio `requires_approval` antes de `published`.
- **Hashtag groups**: Guardar grupos de hashtags reutilizables.

**Link**: https://github.com/inovector/mixpost

### 6.3 De Facebook Auto Poster (GitHub)

**Qué podemos copiar/aprender:**
- **Smart delay engine**: Delay configurable entre publicaciones para evitar bloqueos.
- **Campaign save/load**: Guardar campañas como templates reutilizables.
- **Link preview**: Extraer metadata de URLs para mostrar preview.

**Link**: https://github.com/topics/auto-poster

### 6.4 De Social0 (open source)

**Qué podemos copiar/aprender:**
- **API REST + MCP**: Exponer nuestro social como API para que otros módulos (como el Asistente IA) puedan crear posts.
- **CLI**: Permitir crear posts desde línea de comandos.
- **Cloudflare Workers**: Si queremos escalar el worker a la nube.

**Link**: https://github.com/Abhishek-B-R/social0-selfhost

---

## 7. Decisión Arquitectónica: ¿Seguir con CDP o migrar a APIs oficiales?

| Enfoque | Pros | Cons | Recomendación |
|---------|------|------|---------------|
| **CDP/Playwright** (actual) | No necesita aprobación de app, funciona con cualquier cuenta, barato | Fragilidad ante cambios de UI, requiere Chrome abierto, no escala, riesgo de bloqueo | ✅ Mantener para Facebook Grupos |
| **Facebook Graph API** | Oficial, estable, scalable, analytics | Requiere Business Verification, app review, token que vence | ✅ Migrar para Facebook Pages e Instagram |
| **Instagram Basic Display API** | Oficial para IG | Solo lectura, no publicación | ❌ No sirve |
| **Instagram Graph API** | Publicación a IG via FB | Requiere FB Business + app review | ✅ Usar para Instagram |

**Recomendación híbrida**:
- **Facebook Grupos**: Seguir con CDP/Playwright (no hay API oficial para publicar en grupos como miembro)
- **Facebook Pages**: Migrar a Graph API (más estable, mejor analytics)
- **Instagram Feed**: Graph API (mismo token que FB Page)
- **Futuro (TikTok, X, LinkedIn)**: APIs oficiales con OAuth

---

## 8. Presupuesto de Esfuerzo Total

| Fase | Tiempo estimado | Costo aprox (dev junior $15/h) |
|------|-----------------|--------------------------------|
| Fase 1: Fundamentos | 3 días | ~$360 |
| Fase 2: UX Pro | 5 días | ~$600 |
| Fase 3: Inteligencia | 6 días | ~$720 |
| Fase 4: Multi-Red | 5 días | ~$600 |
| Fase 5: Analytics | 5 días | ~$600 |
| **TOTAL** | **~24 días hábiles** (5 semanas) | **~$2.880** |

---

## 9. Top 10 Priorizado para Empezar

Si solo se pueden hacer 10 tareas, estas son las de mayor impacto/precio:

| # | Tarea | Esfuerzo | Impacto |
|---|-------|----------|---------|
| 1 | Calendario visual mensual | 2 días | 🔴 Transforma la UX |
| 2 | Generar texto con IA en composer | 1 día | 🔴 Diferenciador |
| 3 | Editar/eliminar destinos | 4h | 🔴 Operativo crítico |
| 4 | Alerta de worker offline | 2h | 🔴 Evita silencios |
| 5 | Duplicar/eliminar campañas | 3h | 🟡 Ahorra tiempo |
| 6 | Instagram Feed via Graph API | 2 días | 🔴 Expande alcance |
| 7 | Rate limiting entre posts | 1h | 🟡 Protege cuenta |
| 8 | Preview del post antes de publicar | 1 día | 🟡 Reduce errores |
| 9 | Plantillas activas | 4h | 🟡 Acelera creación |
| 10 | Automatización menú del día | 1 día | 🟡 Ahorra recurrente |

---

## 10. Conclusión

**Modo Sabor Social NO es un módulo malo**, pero es un **MVP acotado a Facebook** en un mercado donde los usuarios esperan:
1. **Calendario visual** (Later lo hace mejor que nadie)
2. **Multi-red** (Postiz soporta 30+)
3. **IA** (Buffer y Postiz la tienen built-in)
4. **Analytics** (sin esto, es publicar a ciegas)

**La decisión clave**: ¿Queremos que ModoSabor Social sea un "Facebook poster útil" o un **"Social Media Manager completo"**?

- Si es **poster útil**: 1 semana de trabajo (Fase 1 + calendario) y listo.
- Si es **manager completo**: 5 semanas (todas las fases) pero compite con Buffer/Later.

> Recomendación: Ir por el **manager completo** pero en fases. Empezar con el Top 10 y validar con uso real antes de invertir en analytics avanzados.
