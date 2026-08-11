# 🔍 AUDITORÍA EXHAUSTIVA — MODO SABOR

**Fecha:** 2026-08-07  
**Auditor:** Kimi Work  
**Proyecto:** D:\Proyectos\modosabor1  
**Alcance:** Módulo por módulo — Server, Client, Agente WhatsApp, Configuraciones, Seguridad, Calidad de Código

---

## 📋 Stack Tecnológico Identificado

| Capa              | Tecnología                                     | Versión    | Estado                    |
| ----------------- | ---------------------------------------------- | ---------- | ------------------------- |
| **Frontend**      | React + Vite                                   | 18.2 / 8.1 | ✅ Moderno                |
| **Estilos**       | Tailwind CSS                                   | 3.4        | ✅ Bien configurado       |
| **Móvil**         | Capacitor (Android/iOS)                        | 8.4        | ✅ Activo                 |
| **Backend**       | Node.js + Express                              | 4.22       | ✅ Estable                |
| **Base de datos** | SQLite (better-sqlite3)                        | 12.10      | ⚠️ Limitaciones           |
| **Tiempo real**   | Socket.IO                                      | 4.8        | ✅ Bien implementado      |
| **Auth**          | JWT + bcryptjs                                 | 9.0 / 2.4  | ✅ Seguro                 |
| **Validación**    | Zod                                            | 3.23       | ✅ Presente               |
| **Pagos**         | MercadoPago API                                | v1         | ✅ Integrado              |
| **IA**            | Multi-proveedor (Gemini, OpenAI, Claude, etc.) | —          | ✅ Muy bien diseñado      |
| **WhatsApp**      | Baileys + whatsapp-web.js                      | 7.0-rc14   | ⚠️ Mixto                  |
| **Deploy**        | Docker + Railway                               | —          | ✅ Preparado para Railway |

---

## 1️⃣ MÓDULO SERVER (Backend)

### Estructura general

- **25 rutas** organizadas por dominio (`auth`, `pedidos`, `productos`, `personal`, etc.)
- **14 servicios** con lógica de negocio separada
- **15 utilidades** para funciones transversales
- **Middleware** de auth, sanitización y validación con Zod

### ✅ Fortalezas del Server

- **Autenticación JWT robusta** con validación de secreto en producción (`authConfig.js:11-21`)
- **Rate limiting** implementado por ruta con `createRateLimiter` (`utils/rateLimit.js`)
- **Sanitización de inputs** con escape HTML y límite de 5000 chars (`middleware/sanitize.js`)
- **Validación con Zod** en puntos críticos (login, usuarios, pedidos, productos)
- **Manejo de errores SQLite** traducidos a mensajes amigables (`index.js:320-344`)
- **CSP con Helmet** configurado para producción (`index.js:162-179`)
- **Conversión de moneda** (pesos ↔ centavos) con protección de IDs (`utils/moneyConversion.js`)
- **Backup automático** con rotación de archivos (`utils/backupManager.js`)
- **Firma HMAC-SHA256** para propuestas del asistente con comparación en tiempo constante (`utils/firmaPropuesta.js:72-74`)
- **Socket.IO con rooms** por rol y pedido, evitando exposición global (`utils/socketRooms.js`)

### ⚠️ Riesgos del Server

**[Severidad: ALTA] SQL Injection parcial en consultas dinámicas**

- `server/utils/dataPackage.js:27`: `db.prepare(SELECT * FROM ${table})` — aunque `table` viene de una whitelist `BASE_TABLES`, la interpolación directa es riesgosa.
- `server/db/migrations.js:11-18`: `PRAGMA table_info(${table})` y `ALTER TABLE ${table}` — aquí `table` es hardcodeado, pero el patrón es peligroso.
- `server/routes/personal.js` (2696 líneas): El archivo es enorme y contiene lógica de queries dinámicas.
- `server/routes/reportes.js`, `server/routes/operacion.js`: Probable uso de concatenación en filtros dinámicos.

**[Severidad: ALTA] bcrypt con salt fijo (10 rounds)**

- `server/routes/auth.js:160`: `bcrypt.hashSync(password, 10)` — el salt round está hardcodeado. No es crítico pero dificulta ajustes de seguridad futuros.
- `server/index.js:384`: Reset de admin con `bcrypt.hashSync(password, 10)`.

**[Severidad: MEDIA] Falta de validación de archivos subidos en algunas rutas**

- `server/routes/personal.js:25-40`: El upload de avatares usa `multer` con filtro de extensión, pero no hay verificación de contenido mágico (magic bytes).
- `server/index.js:210`: `express.static(uploadsDir)` sirve cualquier archivo sin verificación de ownership.

**[Severidad: MEDIA] Cookie `sameSite: 'none'` en producción**

- `server/routes/auth.js:24`: `sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'` — con `sameSite: 'none'` se requiere `secure: true` que sí está, pero la combinación expone a CSRF si hay vulnerabilidades de CORS.

**[Severidad: MEDIA] Tracking tokens en memoria (Map) con reinicio = pérdida**

- `server/utils/socketRooms.js:30`: `const trackingTokens = new Map();` — si el servidor reinicia, los tokens de tracking en memoria se pierden. Hay fallback a DB, pero con overhead.

**[Severidad: BAJA] `io.on('connection', () => {})` vacío**

- `server/index.js:353`: Evento de conexión sin manejo. No es un riesgo pero es código muerto.

**[Severidad: BAJA] Console.log en producción en puente WhatsApp**

- `agente-whatsapp/puente-web/server.js:97`: `console.log([${entry.at}] ${type}, detail);` — el logger del servidor principal sí filtra, pero el puente no.

---

## 2️⃣ MÓDULO CLIENT (Frontend)

### Estructura general

- **Aplicación React 18** con Vite, Tailwind CSS, React Router 6
- **Lazy loading** de páginas del panel admin (`App.jsx:36-69`)
- **Web pública** cargada directamente (no lazy) para performance
- **PWA** con manifiesto y service worker implícito
- **App nativa** con Capacitor (Android/iOS)

### ✅ Fortalezas del Client

- **Lazy loading inteligente** separando `tiempo-real`, `charts`, `react-vendor` (`vite.config.js:17-53`)
- **Offline detection** en el interceptor de Axios (`lib/api.js:11-19`)
- **Error boundary** global (`AppErrorBoundary.jsx`)
- **Contextos separados** para auth y configuración (`AuthContext.jsx`, `AppConfigContext.jsx`)
- **Permisos granulares** por ruta con `PrivateRoute` (`PrivateRoute.jsx`)
- **Cache de config en sessionStorage** con fallback graceful (`AppConfigContext.jsx:14-17`)
- **Diseño system** con tokens de color consistentes (`tailwind.config.js`)

### ⚠️ Riesgos del Client

**[Severidad: MEDIA] XSS potencial por sanitización insuficiente**

- El frontend NO sanitiza datos antes de renderizar. Aunque React escapa por defecto, el uso de `dangerouslySetInnerHTML` o innerHTML en componentes de impresión podría ser riesgoso.
- `server/utils/printTemplates.js` genera HTML que podría incluir datos sin escapar.

**[Severidad: MEDIA] `sourcemap: false` en build**

- `client/vite.config.js:14`: `sourcemap: false` — dificulta debugging en producción. No es un riesgo de seguridad directo pero afecta mantenibilidad.

**[Severidad: BAJA] Hardcodeo de URLs en desarrollo**

- `client/vite.config.js:8-11`: Proxy a `localhost:3001` — correcto para dev, pero no hay validación de `import.meta.env` en runtime.

---

## 3️⃣ MÓDULO AGENTE WHATSAPP

### Estructura

- **Puente web** (`agente-whatsapp/puente-web/server.js`): Express + `whatsapp-web.js` (Puppeteer)
- **WhatsApp Masivo** (`server/routes/whatsappMasivo.js`): Baileys (protocolo nativo)
- **Copiloto** (`server/services/whatsappCopilotoService.js`): Integración con n8n o directa

### ✅ Fortalezas

- **Doble estrategia**: Baileys para masivo (sin navegador) y whatsapp-web.js para copiloto (con navegador)
- **Historial de chats** persistente en JSON (`puente-web/server.js:60-91`)
- **Normalización de teléfonos** (`services/whatsappMasivo/telefono.js`)
- **Límites de envío** con ventanas deslizantes (`whatsappMasivo/motor.js`)

### ⚠️ Riesgos

**[Severidad: ALTA] CORS abierto en puente web**

- `agente-whatsapp/puente-web/server.js:35`: `app.use(cors());` — sin restricción de origen. Cualquier sitio puede pegarle al puente.

**[Severidad: ALTA] Sin autenticación en endpoints del puente**

- `agente-whatsapp/puente-web/server.js:499-565`: `/api/status`, `/api/qr`, `/api/chats`, `/api/test-disparo` — todos públicos. Un atacante puede leer QR, ver chats, y disparar mensajes de prueba.

**[Severidad: MEDIA] Claves hardcodeadas por defecto**

- `agente-whatsapp/puente-web/server.js:12-13`: `OPERATOR_KEY = 'dale'` — aunque es un trigger de operador, el default es predecible.
- `agente-whatsapp/puente-web/server.js:24`: `N8N_SECRET` puede estar vacío.

**[Severidad: MEDIA] `fs.writeFileSync` sin manejo de errores**

- `agente-whatsapp/puente-web/server.js:90`: `fs.writeFileSync(historyFile, ...)` — puede fallar silenciosamente en permisos.

**[Severidad: BAJA] Puppeteer args inseguros**

- `agente-whatsapp/puente-web/server.js:373`: `args: ['--no-sandbox', '--disable-setuid-sandbox']` — necesario para Docker pero reduce seguridad del sandbox.

---

## 4️⃣ CONFIGURACIONES Y DEPLOY

### ✅ Fortalezas

- **Dockerfile** multi-stage bien estructurado (`Dockerfile:1-40`)
- **nginx.conf** con proxy a API, uploads, WebSocket y SPA fallback (`deploy/nginx.conf`)
- **PM2 ecosystem** para producción (`deploy/ecosystem.config.js`)
- **Configuración Railway** con Dockerfile y volumen persistente
- **Variables de entorno** documentadas en `.env.example`

### ⚠️ Riesgos

**[Severidad: ALTA] `deploy/.env.production` expuesto**

- `deploy/.env.production` existe en el repositorio. Aunque no se pudo leer (sensible), su presencia en git es un riesgo si contiene secretos reales.

**[Severidad: ALTA] `modosabor-deploy.zip` (340 MB) en repo**

- `deploy/modosabor-deploy.zip` (340,375,105 bytes) — artefacto binario enorme en git. Hace que clones sean lentos y la historia de git crezca sin control.

**[Severidad: ALTA] `node_modules` en raíz del proyecto**

- `node_modules` aparece en `ls -la` — probablemente no está en `.gitignore` correctamente o fue comiteado accidentalmente. Esto es grave para el tamaño del repo.

**[Severidad: BAJA] `.tmp*`, `.codex*`, `.claude*` directorios en repo**

- Múltiples directorios de herramientas AI (`.agents`, `.claude`, `.codex`, `.tmp-previews`) están en el repo. Son basura de desarrollo que no debería versionarse.

---

## 5️⃣ SEGURIDAD GLOBAL

### ✅ Controles Activos

| Control            | Implementación                       | Estado             |
| ------------------ | ------------------------------------ | ------------------ |
| Auth JWT           | Cookies httpOnly + secure + sameSite | ✅                 |
| Rate limiting      | Por IP y por usuario                 | ✅                 |
| CSP                | Helmet con directivas explícitas     | ✅                 |
| CORS               | Validador de origen con whitelist    | ✅                 |
| Sanitización       | Escape HTML en inputs                | ✅                 |
| Validación         | Zod en body/params/query             | ✅                 |
| SQL params         | Prepared statements (en su mayoría)  | ⚠️ Parcial         |
| File upload        | Filtro de extensión + tamaño         | ⚠️ Sin magic bytes |
| Backup automático  | SQLite VACUUM con rotación           | ✅                 |
| Logs estructurados | JSON con timestamp y nivel           | ✅                 |

### ⚠️ Vectores de Ataque Identificados

1. **SQL Injection en migraciones y dataPackage** — aunque el riesgo real es bajo (no entra input de usuario directo), el patrón de interpolación de strings en SQL es una mala práctica que puede propagarse.

2. **CSRF vía CORS + sameSite:none** — si un atacante consigue que un admin visite una página maliciosa, las cookies con `sameSite: 'none'` se envían en cross-site requests.

3. **Exposición de puente WhatsApp** — sin auth ni CORS restrictivo, es un proxy abierto a WhatsApp.

4. **Path traversal en uploads** — `uploadPublicPathToFile` en `storagePaths.js:75-82` usa `path.join(uploadsDir, relative)` donde `relative` viene de `path.basename(normalized)`. `path.basename` previene `../` pero no hay validación de que el archivo exista ni de ownership.

5. **JWT_SECRET por defecto en dev** — `authConfig.js:1`: `DEFAULT_JWT_SECRET = 'modosabor_jwt_2024'` — en dev se usa si no hay env var, lo cual es aceptable pero débil.

---

## 6️⃣ CALIDAD DE CÓDIGO Y ARQUITECTURA

### ✅ Fortalezas Arquitectónicas

- **Separación clara** entre routes, services, utils y middleware
- **Máquina de estados** para pedidos (`utils/pedidoStateMachine.js`)
- **Servicio de pedidos** con hidratación y gestión de inventario (`services/pedidoService.js`)
- **Multi-proveedor IA** con adaptadores por familia (`services/iaProveedor.js`) — excelente diseño
- **Sistema de firmas** para propuestas del asistente — muy seguro
- **Backfills y migraciones** automáticas en startup — facilita evolución sin downtime

### ⚠️ Problemas de Calidad

**[Severidad: ALTA] God files**

- `server/routes/personal.js`: **2696 líneas** — contiene lógica de asistencia, liquidaciones, movimientos, reconocimientos, reloj, analíticas. Debería dividirse en múltiples routers.
- `server/routes/pedidos.js`: **1467 líneas** — maneja pedidos, mesas, reservas, pagos, MercadoPago, geocoding, tracking, impresiones.
- `server/db/migrations.js`: **1146 líneas** — mezcla migraciones de schema, backfills, seed de datos, y lógica de negocio.

**[Severidad: MEDIA] Acoplamiento entre capas**

- Las rutas acceden directamente a `db` en lugar de usar un repository pattern.
- Los servicios acceden a `req.app.get('io')` directamente — acoplamiento con Express.

**[Severidad: MEDIA] Código comentado/dead code**

- `server/routes/pedidos.js:937`: `if (pedido.estado !== synced.pedido.estado) { }` — bloque vacío
- `server/routes/pedidos.js:838`: Similar bloque vacío
- Múltiples `console.log` dispersos en scripts de utilidad

**[Severidad: BAJA] Inconsistencia en uso de `fechaLocal`**

- Algunas queries usan `fechaLocal('creado_en')` (`pedidos.js:233`) mientras otras usan `datetime(creado_en)` o la columna directamente. Esto puede causar inconsistencias en zonas horarias.

---

## 7️⃣ TESTS

### Estado actual

- `server/tests/run.js`: Runner custom muy básico
- 12 archivos de test en `server/tests/utils/`
- No se detectó framework de testing (Jest, Mocha, Vitest)
- Tests son `require()` directo, sin `describe`/`it` estándar

### ⚠️ Riesgos

- **Cobertura baja**: Solo utils tienen tests. Las rutas, servicios, y lógica de negocio crítica NO tienen tests.
- **Sin tests de integración**: No hay tests de API, ni de socket, ni de flujo end-to-end.
- **Sin tests del frontend**: No se encontró ningún test en `client/`.
- **Runner custom frágil**: `server/tests/run.js:29-35` — un error en un test no da stack trace completo.

---

## 🔧 RECOMENDACIONES PRIORIZADAS

### 🔴 CRÍTICO — Arreglar inmediatamente

1. **Cerrar CORS del puente WhatsApp** (`agente-whatsapp/puente-web/server.js:35`)

   ```js
   app.use(cors({ origin: process.env.BRIDGE_ALLOWED_ORIGIN || 'http://localhost:5173' }));
   ```

2. **Agregar autenticación al puente WhatsApp** — mínimo un `x-api-key` en headers para todos los endpoints `/api/*`.

3. **Eliminar artefactos binarios del repo** — `deploy/modosabor-deploy.zip`, `node_modules`, directorios `.tmp*`, `.codex*`. Usar `.gitignore` y `git filter-branch` para limpiar historia.

4. **Auditar todas las queries con interpolación** — Reemplazar `db.prepare(SELECT * FROM ${table})` en `dataPackage.js`, `backupManager.js`, `migrations.js` con queries parametrizadas o validación estricta de whitelist.

### 🟠 IMPORTANTE — Arreglar esta semana

5. **Dividir god files** — Separar `personal.js` en `personal.routes.js`, `attendance.service.js`, `liquidation.service.js`, etc. Igual con `pedidos.js` y `migrations.js`.

6. **Agregar tests de integración** — Usar Vitest o Jest para testear al menos:
   - Flujo de login/logout
   - CRUD de pedidos
   - Webhook de MercadoPago
   - Rate limiting

7. **Verificar magic bytes en uploads** — En `uploadValidation.js`, agregar verificación de firma de archivo (JPEG empieza con `FF D8`, PNG con `89 50`, etc.)

8. **Documentar el esquema de base de datos** — `schema.sql` existe pero las migraciones en `migrations.js` son la fuente de verdad real. Mantener ambos sincronizados.

9. **Revisar `sameSite: 'none'`** — Evaluar si `sameSite: 'lax'` es suficiente para el dominio del negocio. `'none'` + `secure` es correcto para cross-subdomain pero expone a CSRF.

### 🟡 MEJORA — Nice to have

10. **Agregar health check de DB** en `/api/health` ya existe pero no verifica integridad de tablas críticas.

11. **Implementar paginación consistente** — Algunas rutas devuelven 200+ registros sin paginación (`clientes.js`, `productos.js`).

12. **Migrar a un ORM o query builder** — Considerar Drizzle o Prisma para reducir riesgo de SQL injection y mejorar type safety.

13. **Agregar métricas de performance** — Response times, query slow logs, memory usage.

14. **Documentar la API** — Swagger/OpenAPI para los 25 routers existentes.

---

## 📋 RESUMEN EJECUTIVO

**Modo Sabor es un sistema robusto y bien pensado para la operación de un restaurante real.** La arquitectura de multi-proveedor IA, la máquina de estados de pedidos, y el sistema de firmas para el asistente demuestran un nivel de madurez inusual para un proyecto de este tamaño. La separación entre rutas públicas y el panel admin, el lazy loading del frontend, y las múltiples opciones de deploy muestran que el equipo entiende las necesidades del negocio.

**El mayor riesgo actual es la seguridad del puente WhatsApp** (CORS abierto + sin auth), seguido de cerca por la presencia de artefactos binarios y `node_modules` en el repositorio Git. A nivel de código, la deuda técnica principal son los "god files" (`personal.js`, `pedidos.js`, `migrations.js`) que dificultan el mantenimiento y aumentan el riesgo de regresiones. La cobertura de tests es insuficiente para la criticidad del sistema (maneja pagos reales, pedidos, inventario y nómina).

**El próximo mejor paso es:** cerrar los agujeros de seguridad del puente WhatsApp y limpiar el repositorio de artefactos binarios, mientras se inicia la refactorización modular del backend.
