# 🔍 Auditoría Exhaustiva — ModoSabor

**Fecha de auditoría:** 2026-08-06  
**Auditor:** Kimi Work  
**Scope:** Full-stack audit (cliente React, servidor Node.js/Express, app Python, infraestructura)

---

## ✅ Fortalezas

- **Stack moderno y bien estructurado:** React 18 + Vite + Tailwind CSS en el frontend; Express 4 + better-sqlite3 en el backend. El uso de SQLite con WAL mode, foreign keys y busy timeout muestra que alguien pensó en concurrencia básica.
- **Autenticación JWT robusta:** Bcrypt para hashes, cookies `httpOnly`/`secure`/`sameSite`, y un `getJwtSecret()` que **se niega a iniciar en producción** si se usa el default (`server/utils/authConfig.js:11-19`). Eso evita deploys descuidados con secret inseguro.
- **Rate limiting presente:** Login limitado a 20 intentos/15min (`server/routes/auth.js:15-19`), checkout público limitado a 30 pedidos/10min (`server/routes/pedidos.js:65-69`), y API general a 180 req/min. No es perfecto (ver riesgos), pero existe.
- **CSP con Helmet:** Configurado con directivas explícitas, incluyendo `upgradeInsecureRequests` en producción (`server/index.js:162-179`).
- **Sanitización de inputs:** Middleware dedicado (`server/middleware/sanitize.js`) que escapa HTML, previene null bytes y limita strings a 5000 chars.
- **Sistema de permisos por rol:** `ROLE_PERMISSIONS` claramente definido con `requirePermission()` middleware (`server/utils/permissions.js`).
- **Auditoría de eventos:** Toda acción sensible (pagos, cambios de estado, configuración) se loguea en `auditoria_eventos`.
- **Manejo de errores SQLite específico:** Unique constraint, foreign key, not null y check constraint tienen mensajes amigables (`server/index.js:313-337`).
- **Conversión de moneda segura:** `pesosToCents` / `centsToPesos` con `isMoneyKey` para evitar corromper IDs (`server/index.js:42-74`).
- **Lazy loading en frontend:** La web pública no carga el bundle del panel admin (`client/src/App.jsx:34-69`).
- **CI/CD funcional:** GitHub Actions con test, lint y build (`.github/workflows/ci.yml`).
- **Launcher Python funcional:** `ModoSabor.pyw` gestiona arranque/apagado de servicios con monitoreo de puertos y cleanup de procesos zombie.
- **Backups automáticos:** `startAutomaticBackups()` en startup + backup de seguridad antes de cualquier restore/reset/import.

---

## ⚠️ Debilidades / Riesgos

### 🔴 Alta Severidad

1. **Rate limiter en memoria (no escalable y fácil de evadir)**
   - `server/utils/rateLimit.js:10-42` usa un `Map` en memoria. En producción con múltiples instancias (Railway/Render pueden escalar) o reinicios frecuentes, el rate limiting se anula. Un atacante puede reiniciar conexiones para resetear su contador.
   - Además, no hay rate limiting por **email específico** en login: un atacante puede hacer fuerza bruta contra una misma cuenta distribuyendo requests por IPs distintas.

2. **bcrypt síncrono bloquea el event loop**
   - `server/routes/auth.js:32`, `:40`, `:156`, `:160`, `:190`, `:191`, `:208`, `:212` usan `bcrypt.compareSync()` y `bcrypt.hashSync()`. En Node.js esto bloquea el event loop para **todos los requests** mientras se hashea. Con un cost factor de 10, cada hash toma ~50-100ms. Bajo carga, esto degrada la API entera.

3. **SQL Injection potencial en `fechaLocal()`**
   - `server/routes/pedidos.js:233`, `:237` y `server/routes/configuracion.js:329`, `:334` interpolan `fechaLocal('creado_en')` directamente en el SQL string. Si `fechaLocal` alguna vez recibe input no sanitizado de `req.query`, es SQLi directo.

4. **JWT sin invalidación ni refresh tokens**
   - `server/routes/auth.js:22-26`: las cookies duran 7 días. El logout solo borra la cookie del navegador (`res.clearCookie`), pero el token sigue siendo válido por 7 días. Si alguien roba un token, no hay forma de revocarlo sin cambiar `JWT_SECRET` global.
   - No hay mecanismo de refresh token ni blacklist.

5. **CSP permite `'unsafe-inline'` en scripts**
   - `server/index.js:164`: `scriptSrc: ["'self'", "'unsafe-inline'"]`. Esto anula gran parte del beneficio del CSP contra XSS. Si un atacante inyecta un `<script>`, el navegador lo ejecutará.

6. **Webhook de MercadoPago sin validación de firma**
   - `server/routes/pedidos.js:170-211`: el webhook acepta cualquier notificación de MP sin verificar la firma/signature del payload. Un atacante puede enviar requests falsos a `/api/pedidos/webhook/mercadopago` para marcar pedidos como pagados.

7. **Playwright en dependencias de producción**
   - `server/package.json:27`: `"playwright-core": "^1.62.1"` está en `dependencies`. Playwright es un navegador headless, no debería estar en producción a menos que se use para scraping. Incrementa el attack surface y el tamaño del build.

### 🟡 Media Severidad

8. **Hardcoded URL de producción en el cliente**
   - `client/src/lib/runtime.js:7`: `NATIVE_DEFAULT_API_URL = 'https://modosabor-api-production.up.railway.app'`. Si alguien forkea el repo y construye la app nativa, apuntará a tu API de producción sin saberlo.

9. **Socket.IO sin Redis adapter**
   - `server/utils/socketRooms.js:13`: `trackingTokens` se almacenan en un `Map` en memoria. Si el servidor se reinicia, los tokens en memoria se pierden (hay fallback a DB, pero con degradación de performance). En escenarios multi-instancia, los rooms de Socket.IO no se sincronizan.

10. **Uploads servidos públicamente sin autenticación**
    - `server/index.js:212`: `app.use('/uploads', express.static(uploadsDir));`. Cualquiera que adivine o conozca un nombre de archivo puede acceder directamente a imágenes de productos, logos, etc.

11. **Helmet sin configuración explícita de X-Frame-Options ni HSTS**
    - Aunque Helmet pone defaults razonables, no se configura `hsts` explícitamente ni `frameguard`. El CSP tiene `frameSrc` pero no `X-Frame-Options`.

12. **Falta de HTTPS enforcement**
    - No hay middleware que redirija HTTP → HTTPS en producción. Depende completamente de la plataforma (Railway/Render).

13. **Console.log vacío en socket connection**
    - `server/index.js:346`: `io.on('connection', () => {});` es un no-op pero indica que faltan logs de conexión/desconexión para debugging de sockets.

14. **Schema SQL con índice duplicado**
    - `server/db/schema.sql:835` y `:837` definen `idx_repartidor_ubicaciones_pedido` dos veces.

15. **Directorios corruptos/basura en el repo**
    - `D:Proyectosmodosabor1clientsrcpagesInventario` y `D:Proyectosmodosabor1clientsrcpagesProductos` son directorios con nombres de path malformados (probablemente de algún script o AI que escapó). Contaminan el repo.
    - `.agents`, `.claude`, `.codex`, `.codex-logs`, `.tmp`, `.tmp-runtime` contienen artefactos de asistentes AI anteriores.

16. **Archivos de auditoría acumulados en raíz**
    - `AUDITORIA_EXHAUSTIVA_2026.md`, `AUDITORIA_EXHAUSTIVA_AGOSTO_2026.md`, `AUDITORIA_MEJORAS_MODOSABOR.md`, `AUDITORIA_MODOSABOR_COMPLETA.md`, `AUDITORIA_TRACKING_COMPLETA.md`, `DEPLOY-AHORA.md`, `PROMPT-CODEX-TPV.md`, `PROMPT-DEPLOY-2.md`, `analisis-web-publica.md`, `bitacora-claude.md`. Son 10+ archivos de documentación que deberían estar en `docs/` o en una wiki.

17. **Dockerfile no óptimo**
    - `Dockerfile:28-30`: instala `python3 make g++` en la imagen runtime. Estos solo se necesitan para compilar better-sqlite3 durante `npm ci`, no en runtime.
    - No tiene `HEALTHCHECK` definido.

18. **Falta de tests de integración y E2E**
    - Solo hay 7 tests unitarios en `server/tests/utils/` y 1 test en cliente. No hay tests de rutas API, tests de flujo de pedidos, ni tests E2E con Playwright.

19. **Inconsistencia CJS vs ESM**
    - Cliente usa `"type": "module"` (ESM) pero servidor usa CommonJS (`require`). No es crítico, pero dificulta compartir código entre cliente y servidor.

### 🟢 Baja Severidad

20. **Falta de documentación de API (Swagger/OpenAPI)**
    - No hay especificación de endpoints.

21. **`render.yaml` con line endings CRLF**
    - El archivo tiene line endings de Windows (`\r\n`), lo cual puede causar problemas en sistemas Unix.

22. **`client/vite.config.js:14`: `sourcemap: false`**
    - En producción esto es correcto, pero dificulta el debugging de errores en producción.

23. **Launcher Python no firma/valida ejecutables**
    - `ModoSabor.pyw:597`: `executable = shutil.which(args[0]) or args[0]`. No valida que `node.exe` sea el binario legítimo.

24. **Falta de `retry-after` en rate limiter general**
    - `server/utils/rateLimit.js:30`: solo envía `Retry-After` cuando se excede el límite.

---

## 🔧 Recomendaciones Priorizadas

### 1. Crítico — Reemplazar bcrypt síncrono por async

- **Archivo:** `server/routes/auth.js`
- **Acción:** Cambiar `bcrypt.compareSync()` → `await bcrypt.compare()` y `bcrypt.hashSync()` → `await bcrypt.hash()`.

### 2. Crítico — Agregar validación de firma al webhook de MercadoPago

- **Archivo:** `server/routes/pedidos.js:170-211`
- **Acción:** Implementar verificación de la firma del webhook usando el secret de MP, o validar que el request provenga de IPs conocidas de MP.

### 3. Crítico — Remover Playwright de dependencias de producción

- **Archivo:** `server/package.json:27`
- **Acción:** Mover `playwright-core` a `devDependencies`.

### 4. Importante — Implementar rate limiting distribuido (Redis)

- **Archivo:** `server/utils/rateLimit.js`
- **Acción:** Reemplazar el `Map` en memoria por Redis o un store que persista entre reinicios.

### 5. Importante — Agregar invalidación de JWT (refresh tokens o blacklist)

- **Archivo:** `server/routes/auth.js`, `server/utils/authConfig.js`
- **Acción:** Implementar refresh tokens almacenados en DB o una tabla `jwt_blacklist`.

### 6. Importante — Fortalecer CSP

- **Archivo:** `server/index.js:162-179`
- **Acción:** Eliminar `'unsafe-inline'` de `scriptSrc`. Agregar `X-Frame-Options: DENY`.

### 7. Importante — Sanitizar `fechaLocal()` contra SQL Injection

- **Archivo:** `server/utils/fechaLocal.js`
- **Acción:** Verificar que `fechaLocal()` solo acepte nombres de columnas whitelisteados.

### 8. Importante — Limpiar repo de directorios/artefactos basura

- **Acción:** Eliminar directorios corruptos (`D:Proyectosmodosabor1clientsrcpagesInventario`, etc.), artefactos AI (`.agents`, `.claude`, `.codex`), y mover archivos de auditoría a `docs/auditorias/`.

### 9. Importante — Optimizar Dockerfile

- **Archivo:** `Dockerfile`
- **Acción:** No instalar `python3 make g++` en la stage `runtime`. Agregar `HEALTHCHECK`.

### 10. Mejora — Agregar tests de integración para rutas críticas

- **Archivo:** Nuevo `server/tests/integration/`
- **Acción:** Tests para login/logout, CRUD de productos, flujo completo de pedido, webhook de MP con mocks.

### 11. Mejora — Documentar API con OpenAPI/Swagger

- **Acción:** Generar especificación OpenAPI 3.0 de los endpoints principales.

### 12. Mejora — Agregar HSTS y HTTPS redirect

- **Archivo:** `server/index.js`
- **Acción:** Si `NODE_ENV === 'production'`, agregar middleware que fuerce HTTPS.

### 13. Mejora — Proteger `/uploads` con autenticación opcional

- **Archivo:** `server/index.js:212`
- **Acción:** Considerar servir uploads solo a usuarios autenticados, o agregar hash aleatorio a los nombres de archivo.

---

## 📋 Resumen Ejecutivo

**Veredicto:** ModoSabor es un sistema **funcional y con buenas prácticas de base**, pero tiene **riesgos de seguridad operativa** que deben atenderse antes de escalar o exponer a más usuarios. El stack es moderno, la arquitectura es razonable para un negocio de tamaño pequeño-mediano, y hay evidencia de iteración cuidadosa (la conversión de moneda, el sistema de tracking tokens, los backups automáticos).

**Los tres problemas más críticos son:**

1. **bcrypt síncrono** que bloquea el event loop
2. **Rate limiter en memoria** que no escala
3. **Webhook de MercadoPago** sin validación de firma

Bajo carga real de un fin de semana con muchos pedidos, el servidor puede degradarse o, peor, aceptar pagos falsificados.

**El siguiente paso más importante** es hacer que `bcrypt` sea asíncrono y agregar un store distribuido para rate limiting (incluso SQLite serviría). Con esas dos correcciones, el sistema pasa de "funciona pero es frágil" a "resiliente para producción".

---

_Generado por Kimi Work — Auditoría de código completa_
