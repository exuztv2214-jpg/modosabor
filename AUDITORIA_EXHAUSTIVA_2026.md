# 🔍 AUDITORÍA EXHAUSTIVA — MODO SABOR 1

**Fecha de auditoría:** 2026-08-04
**Proyecto:** exuz27/modosabor (branch: main)
**Ubicación:** D:\Proyectos\modosabor1
**Commit base:** HEAD (2 commits sobre main)
**Estado del working tree:** 270 archivos modificados, 2 archivos sin trackear en `server/services/`

---

## 0. Resumen ejecutivo

El proyecto es un **sistema integral de gestión para restaurantes** con arquitectura monorepo: backend Node.js/Express/SQLite + Socket.IO, frontend React/Vite/Tailwind + Capacitor (admin + rider PWA), y un agente de WhatsApp (n8n + bridge local).

El estado general es **maduro y funcional**, pero presenta **vulnerabilidades de seguridad críticas**, **archivos monstruo** que dificultan el mantenimiento, y **deuda técnica operativa** (working tree con 270 archivos sin commitear). La base de datos ya incorpora migraciones dinámicas, money conversion en centavos, RBAC y una state machine de pedidos bien diseñada. El CI/CD existe (GitHub Actions) pero está limitado a backend tests + Railway deploy.

### Clasificación general

| Categoría         | Estado                                                    |
| ----------------- | --------------------------------------------------------- |
| Arquitectura      | ✅ Sólida (monorepo, bien dividido)                       |
| Seguridad         | ⚠️ Crítico — credenciales en repo, sanitización agresiva  |
| Calidad de código | ⚠️ Mala — archivos monstruo, 270 archivos sin commitear   |
| Performance       | ⚠️ Media — N+1, sin cache, migrations en startup          |
| Testing           | ⚠️ Básico — 6 archivos, runner casero, sin frontend tests |
| DevOps/CI         | ⚠️ Parcial — CI solo backend, deploy solo Railway         |
| Documentación     | ✅ Buena — README, docs, bitácora, auditorías previas     |

---

## 1. Estructura del proyecto

```
modosabor1/
├── server/                 # Backend: Express 4 + SQLite(WAL) + Socket.IO 4
│   ├── index.js            # Entry point (399 líneas) — config, middleware, health
│   ├── db.js → db/index.js # Conexión better-sqlite3 + migraciones + seed
│   ├── db/
│   │   ├── schema.sql      # 851 líneas — 40+ tablas
│   │   ├── migrations.js   # 963 líneas — 60+ ALTER TABLE dinámicos
│   │   └── seed.js
│   ├── routes/             # 22 archivos — archivos MUY grandes
│   │   ├── pedidos.js      # 1,199 líneas (auditoría) / 45.7KB (actual)
│   │   ├── clientes.js     # 994 líneas / 31.5KB
│   │   ├── personal.js     # 91,096 chars (~2700 líneas) ← MONSTRUO
│   │   ├── reportes.js     # ~700 líneas / 30.1KB
│   │   ├── configuracion.js# ~19,500 líneas ⚠️ POSIBLE INFLADO (auditoría dice 20,503)
│   │   ├── marketing.js    # ~450 líneas / 15.1KB
│   │   ├── inventario.js   # ~600 líneas / 26.7KB
│   │   ├── repartidores.js # ~430 líneas / 35.6KB
│   │   ├── fidelizacion.js # ~380 líneas / 20.6KB
│   │   ├── caja.js         # ~280 líneas / 12.6KB
│   │   └── ... (14 archivos más)
│   ├── services/           # 9 archivos — lógica de negocio
│   │   ├── pedidoService.js # 1,169 líneas ← monstruo
│   │   ├── marketingService.js # ~1,200 líneas ← monstruo
│   │   ├── personalService.js # ~770 líneas
│   │   ├── facebookPublisherService.js (Playwright)
│   │   ├── whatsappCopilotoService.js
│   │   ├── fidelizacionService.js
│   │   ├── direccionesEstructuradas.js ← NUEVO, sin trackear ⚠️
│   │   └── geocoding.js ← NUEVO, sin trackear ⚠️
│   ├── schemas/            # Zod schemas (login, pedido, producto)
│   ├── scripts/            # 12 archivos (seed, smoke, verify, export/import)
│   ├── tests/              # 6 archivos .test.js
│   ├── utils/              # 25+ utilidades
│   ├── middleware/         # auth, sanitize, validate
│   ├── .env                # ← NO trackeado (gitignore) ✅
│   ├── .env.example        # ← trackeado ✅
│   └── modosabor.db        # ← 0 bytes, artefacto stale ⚠️
├── client/                  # Frontend: React 18 + Vite 8 + Tailwind 3.4
│   ├── src/
│   │   ├── App.jsx         # 174 líneas — router con lazy loading
│   │   ├── 27 páginas (admin) + 5 públicas/rider
│   │   ├── components/     # Agrupados por funcionalidad (Clientes, TPV, rider, etc.)
│   │   ├── design-system/  # Button, Card, Input, Badge, etc.
│   │   ├── context/        # AuthContext, AppConfigContext
│   │   ├── hooks/          # useAuthenticatedSocket, useDarkMode
│   │   ├── lib/            # 21 archivos (api.js, socket.js, runtime.js, etc.)
│   │   └── styles/
│   ├── public/             # sw.js, manifesting, assets
│   ├── android/            # Capacitor 8 (app: com.modosabor.rider)
│   ├── ios/                # Capacitor 8
│   ├── vite.config.js      # 41 líneas — proxy + code splitting
│   ├── capacitor.config.json
│   ├── eslint.config.js    # ESM, React hooks, jsx-a11y
│   └── package.json        # 11 deps + 11 devDeps
├── agente-whatsapp/         # WhatsApp copiloto (n8n)
│   ├── README.md           # 4,652 chars — guía completa
│   ├── prompt-agente.md    # Prompt del agente IA
│   ├── prompt-copiloto-dale.md
│   ├── workflow-n8n.json   # Workflow n8n exportado
│   ├── .env.test           # ← NO trackeado, contiene token real ⚠️
│   └── puente-web/         # Bridge local WhatsApp Web.js
│       ├── server.js       # 19,851 chars
│       ├── .env            # ← NO trackeado ⚠️
│       ├── .env.example    # ← trackeado ✅
│       └── package.json
├── deploy/                  # Scripts PowerShell + configuraciones
│   ├── 11 archivos .ps1/.sh
│   ├── .env.production     # ← NO trackeado ⚠️ (contiene secrets reales)
│   ├── ecosystem.config.js (pm2)
│   ├── nginx.conf
│   └── railway-vars.bat    # ← NO trackeado (gitignore)
├── Dockerfile              # Multi-stage (builder + runtime) ✅
├── railway.json            # Deploy Railway ✅
├── render.yaml             # Deploy Render ✅
├── .github/workflows/ci.yml # CI/CD ✅ (limitado)
├── .husky/pre-commit       # lint-staged ✅
├── .claude/settings.local.json ← **GIT-TRACKED, contiene credenciales ⚠️🔴**
├── bitacora-claude.md     # Git-tracked — bitácora de desarrollo
├── AUDITORIA_MODOSABOR_COMPLETA.md ← Auditoría previa (2026-07-16)
├── AUDITORIA_TRACKING_COMPLETA.md ← Auditoría previa
├── PLAN_DE_ACCION.md      # Roadmap de 8 hitos
├── docs/                  # 10+ archivos de documentación
├── package.json           # Root: 28 scripts, 6 devDeps
└── .gitignore            # 42 líneas ✅
```

---

## 2. Seguridad 🔐

### 🔴 CRÍTICOS

#### 2.1. Credenciales de producción en `.claude/settings.local.json` (GIT-TRACKED)

**Estado:** `.claude/settings.local.json` está **trackeado en git** (`git ls-files` lo confirma) y contiene:

- **Email de admin de producción:** `admin@modosabor.com`
- **Password de producción:** `Huracan840921`
- URL de la API de Railway: `https://modosabor-api-production.up.railway.app`
- Cookies de sesión (`ry_cookies.txt`)

Estas credenciales están embebidas en los comandos `curl` del allow-list de Claude Code. Cualquiera con acceso al repositorio puede leer las credenciales de producción.

**Remedición inmediata:** Revertir `.claude/settings.local.json` del repositorio, hacerlo `.gitignore`ado, y **rotar** el password `admin@modosabor.com` en producción.

#### 2.2. JWT_SECRET por defecto en desarrollo local

El archivo `.env` local (no trackeado) **no define `JWT_SECRET`**. La aplicación cae en el valor hardcodeado `modosabor_jwt_2024` definido en `server/utils/authConfig.js:1`.

- En producción: el sistema **lanza un error** y se niende a iniciar (correcto).
- En desarrollo: usa el default silenciosamente. Si un desarrollador committea `.env` por error (o si el default se usa en alguna configuración), el JWT es predecible.

El `.env.example` tampoco documenta `JWT_SECRET` con un valor de ejemplo fuerte (usa `cambia-esta-clave-larga-y-segura`).

#### 2.3. Sanitización HTML en entrada rompe datos válidos

El middleware `server/middleware/sanitize.js` escapa `<`, `>`, `&`, `"` en **todos** los strings del body, excepto rutas en `SKIP_SANITIZE_PATHS` (`/api/agente`, `/api/configuracion/bulk`, `/api/pedidos/webhook/mercadopago`).

**Impacto:** URLs, JSONs, descripciones con comillas, enlaces de Google Maps, etc. llegan al frontend como `&quot;` en lugar de `"`. Esto **rompe funcionalidad** (auditoría previa lo documentó como 🔴 crítico). El sanitize intenta mitigar escapando JSONs reconocidos (items, variantes, extras, pagos, etc.) mediante `isJsonStringField`, pero es frágil — depende de que el campo empiece con `[` o `{` y sea parseable.

#### 2.4. Rate limiter en memoria (in-memory Map)

`server/utils/rateLimit.js` usa un `Map` en memoria:

- **Se pierde al reiniciar** el servidor.
- **No funciona en cluster o multi-instancia** (Railway/Render/Render pueden escalar).
- El `hits.size > 10000` limpieza es manual y puede explotarse.

### 🟡 MEDIOS

#### 2.5. Sin validación de archivo por contenido real

`server/utils/uploadValidation.js` valida por extensión y MIME type, pero **no hace análisis de contenido real** (magic bytes). Un atacante podría subir un archivo `.jpg` que en realidad es executable si el MIME se falsifica.

#### 2.6. CORS con múltiples orígenes dinámicos

`index.js:80-101` `buildAllowedOrigins()` concatena `CORS_ORIGINS`, `PUBLIC_APP_URL`, `PUBLIC_API_URL`, `FRONTEND_URL`, `BACKEND_URL`, `APP_URL`, `API_URL`, `RAILWAY_PUBLIC_DOMAIN`. Si **cualquiera** de estas env vars está comprometida o mal configurada, CORS queda abierto.

#### 2.7. Sin rate limiting por usuario en login

Solo hay rate limiting por IP (`loginRateLimit`). Un atacante detrás de una misma IP puede hacer brute-force sin límite por usuario/email.

#### 2.8. Cookie `auth_token` con `sameSite: 'none'` en producción

```js
// server/routes/auth.js:21-26
sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
```

Necesario para cross-origin (admin y web pública en dominios distintos), pero requiere `secure: true` y aumenta superficie de CSRF. Sin CSRF token, confía solo en SameSite.

#### 2.9. bcryptjs con 10 rounds

Aceptable, pero el PLAN_DE_ACCION sugiere 12+. Con 270 archivos modificados, verificar si se cambió.

#### 2.10. Sin 2FA/MFA

El sistema de auth es simple: JWT + bcrypt. No hay 2FA para administradores.

#### 2.11. `agente-whatsapp/.env.test` contiene token de WhatsApp Business real

No trackeado (gitignore `.env.*`), pero el token de acceso de larga duración (`EAAXKKqi2...`) está presente localmente. Si fue committeado accidentalmente en algún momento, requiere rotación.

#### 2.12. `deploy/.env.production` sin trackear contiene secrets reales

No trackeado (good), pero contiene: `JWT_SECRET=ms2026_xK9mN3pL7qR2tV5wY8zA4cF6hJ1eI0dGbQuPs`, `INITIAL_ADMIN_EMAIL=exuz27@gmail.com`, `INITIAL_ADMIN_PASSWORD=ModoSabor2026!`. Este archivo sirve como referencia del formato correcto.

### 🟢 LEVES

#### 2.13. Health check expone información de configuración

`GET /api/health` (`index.js:265-295`) expone si MercadoPago está configurado, URLs públicas, IP del servidor. Información que un atacante podría usar para fingerprinting.

#### 2.14. Archivo `server/modosabor.db` (0 bytes) en raíz de server

Artefacto stale/empty. El DB real vive en `server/data/modosabor.db`. Confuso y potencialmente peligroso si algo apunta al path equivocado.

---

## 3. Calidad de código y arquitectura 💻

### 🔴 Problemas críticos

#### 3.1. Working tree con 270 archivos modificados (sin commitear)

```
$ git diff --name-only HEAD | Measure-Object -Line
270
```

El working tree tiene cambios no comiteados en `client/` y `server/` (routes, services, utils, db, schemas, scripts). Incluye un refactor masivo (150 archivos cambiados con 17,406 inserciones y 18,289 borraduras según el diff anterior). **Riesgo operativo:** no se puede hacer `git stash` sin perder 270 archivos de trabajo, y los cambios no están revisados en un PR.

#### 3.2. Archivos monstruo en routes y services

| Archivo                               | Tamaño       | Líneas aprox.                  |
| ------------------------------------- | ------------ | ------------------------------ |
| `server/routes/personal.js`           | 86,050 bytes | ~2,700                         |
| `server/services/marketingService.js` | 52,465 bytes | ~1,500                         |
| `server/services/pedidoService.js`    | 36,882 bytes | ~1,169                         |
| `server/routes/pedidos.js`            | 45,728 bytes | ~1,199                         |
| `server/routes/clientes.js`           | 31,469 bytes | ~994                           |
| `server/routes/configuracion.js`      | 23,087 bytes | ~?,503 (auditoría dice 20,503) |
| `server/routes/reportes.js`           | 30,127 bytes | ~700+                          |
| `server/routes/repartidores.js`       | 35,574 bytes | ~430                           |
| `server/routes/fidelizacion.js`       | 20,602 bytes | ~611                           |
| `server/routes/inventario.js`         | 26,686 bytes | ~942                           |

Estos archivos mezclan routing, lógica de negocio, queries SQL, eventos de auditoría y notificaciones Socket.IO. Dificultan testing, revisión y mantenimiento.

#### 3.3. Dos implementaciones de geocoding coexistiendo

- `server/utils/geocode.js` (trackeado) — usa Nominatim, función `geocodeClienteDireccion`
- `server/services/geocoding.js` (NO trackeado, nuevo) — función `geocodificarPedido`

`pedidos.js` (trabajo sin commitear) requiere `geocoding.js`, mientras `pedidoService.js` requiere `geocode.js`. **Hay dos sistemas de geocoding duplicados.** Necesita consolidación.

#### 3.4. Uncommitted files required by tracked code

`server/routes/pedidos.js` (modificado, working tree) requiere `../services/geocoding` y `server/services/pedidoService.js` requiere `./direccionesEstructuradas`. Ambos son archivos **sin trackear**. El HEAD committed `pedidos.js` no tiene estos requires (verificado con `git show HEAD:server/routes/pedidos.js`), así que el committed code es consistente, pero el working tree depende de archivos no commiteados.

### 🟡 Problemas medios

#### 3.5. Custom test runner (no Jest/Mocha)

`server/tests/run.js` es un runner casero:

```js
require(testFile); // ejecuta el archivo, que llama a .run()
```

- No soporta `beforeEach/afterEach`, mocking, ni reportes estructurados.
- 6 archivos de test cubren: sanitize, rateLimit, paymentStatus, pedidoItems, pedidoSchema, whatsappCopiloto.
- **No hay tests de integración** (auditoría previa planifica server/tests/integration/).
- **No hay tests de frontend** en todo el proyecto.

#### 3.6. CI no corre tests de frontend ni verificaciones

`.github/workflows/ci.yml`:

- Job `test`: corre `npm ci && npm test` en `server/` (6 test files)
- Job `build`: corre `npm run build` en `client/` (solo build, no lint, no tests)
- Job `deploy`: Railway deploy con `RAILWAY_TOKEN`

Falta: lint en client, tests de frontend, `verify:core`/`verify:operacion`, deploy a Render/DonWeb.

#### 3.7. Sin dependabot

El PLAN_DE_ACCION (Hito 6.7) planea `dependabot.yml` pero **no existe**. No hay actualizaciones automáticas de dependencias.

#### 3.8. Husky pre-commit solo formatea

`.husky/pre-commit` ejecuta `npx lint-staged`, que corre `prettier --write` en archivos modificados. No corre lint ni tests. No hay protección de ramas en GitHub.

#### 3.9. `package.json` root no tiene dependencias reales

El root `package.json` solo tiene devDependencies (eslint, husky, prettier, lint-staged). No hay dependencias de runtime. Los scripts usan `npm --prefix` para delegar. Funciona pero es frágil (si `concurrently` falla, todo el `dev` se rompe).

#### 3.10. Inconsistencia en naming de servicios

`direccionesEstructuradas.js` vs `direcciones.js` (route) vs `clienteAddresses.js` (util). Nombres en español, inglés y portugués mezclados.

### 🟢 Aspectos positivos

#### 3.11. Money conversion middleware bien diseñado

`server/utils/moneyConversion.js` (125 líneas) convierte pesos→centavos en requests y centavos→pesos en responses, con listas de exclusión (`EXCLUDED_KEYS`) y reconocimiento por patrón de nombre. Maneja casos edge como `digitales`, `gananciaOperativa`, etc. Muy sólido.

#### 3.12. State machine de pedidos con RBAC

`server/utils/pedidoStateMachine.js` (236 líneas) valida transiciones de estados con permisos por rol (admin, caja, cocina, delivery). Ej: solo delivery puede marcar "en camino", requiere PIN/foto de entrega antes de "entregado".

#### 3.13. Socket.IO con rooms seguras

`server/utils/socketRooms.js` (348 líneas) implementa:

- Auth por cookie JWT en handshake
- Rooms por rol, pedido, repartidor
- Tokens de tracking en memoria + fallback a DB
- Separación de datos públicos (tracking) vs admin (full) vs rider (asignado)

#### 3.14. Zod schemas + validation middleware

`server/middleware/validate.js` (48 líneas) con `validateBody`, `validateParams`, `validateQuery`. Schemas en `server/schemas/index.js` (119 líneas) cubren login, pedido, producto.

---

## 4. Performance ⚡

### 🔴 Críticos (confirmados auditando código)

#### 4.1. Recálculo de stats de clientes en cada request

`server/routes/clientes.js` llama `recalculateAllClientes(db)` (de `utils/loyalty.js`) en:

- `GET /api/clientes` (listado)
- `GET /api/clientes/segmentos`

Esto hace un `GROUP BY` completo sobre todos los pedidos en **cada request**. Con miles de clientes/pedidos, es un cuello de botella N+1 masivo.

#### 4.2. Migrations en cada startup

`server/db/index.js` llama `runMigrations(db)` en cada arranque. Las migraciones incluyen backfills con `LIMIT 20000` (`backfillPedidoItems` en `pedidoItems.js`). Puede causar downtime de varios segundos en bases grandes.

#### 4.3. Queries N+1 en decoración de productos

`server/utils/systemClient.js` → `decorateProductsWithInventory(db, rows)` ejecuta queries por producto individual (N+1). Afecta `/api/agente/menu`, `/api/agente/producto/:id`.

#### 4.4. Búsqueda de clientes por teléfono sin índice

`findClienteByPhone` en `systemClient.js:993` hace:

```sql
SELECT * FROM clientes
WHERE REPLACE(REPLACE(REPLACE(telefono, ' ', ''), '+', ''), '-', '') LIKE ?
```

Esto **no puede usar índices** (función sobre la columna). Trae todos los clientes y filtra. Con muchos clientes, es lineal.

### 🟡 Medios

#### 4.5. Sin cache de configuración

`getConfigMap(db)` en `mercadoPago.js:3-10` lee **toda** la tabla `configuracion` en cada llamada. Es llamada por casi cada endpoint. Debería cachearse (Redis o in-memory con TTL).

#### 4.6. Geocodificación síncrona bloqueante

`pedidoService.js:775` hace `await geocodeClienteDireccion()` durante la creación del pedido, bloqueando el request hasta recibir respuesta de Nominatim (8s timeout).

#### 4.7. Rate limiter Map sin límite de memoria real

El cleanup en `rateLimit.js:34` solo corre cuando `hits.size > 10000`. Bajo ataque DDoS, el Map puede crecer mucho antes de ese límite.

---

## 5. Frontend 🎨

### Arquitectura

- **React 18** + **Vite 8** + **Tailwind 3.4** + **React Router 6**
- **Capacitor 8** para apps nativas (Android + iOS)
- **Lazy loading** con `React.Suspense` en `App.jsx`
- **Code splitting** por vendor chunks (charts, date-utils, react-vendor, app-vendor)
- **Service workers** separados para admin y rider

### 📱 Client mobile (Capacitor)

| Archivo                             | Notas                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `client/capacitor.config.json`      | appId `com.modosabor.rider`, webDir `dist`, background geolocation + splash |
| `client/android/`                   | Proyecto Android nativo con assets Capacitor                                |
| `client/ios/App/`                   | Proyecto iOS nativo                                                         |
| `client/public/manifest-rider.json` | PWA manifest para rider                                                     |
| `client/public/manifest.json`       | PWA manifest para admin                                                     |

### 🟡 Hallazgos frontend

#### 5.1. Toast duration de 3000ms

`App.jsx:66`: `<Toaster position="top-right" toastOptions={{ duration: 3000 }}>`. Para errores importantes, 3 segundos puede ser insuficiente. PLAN_DE_ACCION ya lo documenta.

#### 5.2. `VITE_API_URL` no configurado en dev

`runtime.js:3`: `import.meta.env.VITE_API_URL` debe estar configurado. En dev usa proxy Vite (`http://localhost:3001`). En native app usa `https://modosabor-api-production.up.railway.app` (hardcodeado como default). Funciona pero es frágil.

#### 5.3. Sin tests de frontend

No hay archivos `.test.jsx` ni `.spec.jsx` en `client/src/`. El PLAN_DE_ACCION (Hito 6.3) planea tests con Vitest, pero no está implementado.

#### 5.4. `.github/workflows/ci.yml` no corre lint de frontend

El job `build` solo hace `npm run build`, no `npm run lint`. El job `test` es solo backend.

---

## 6. DevOps & CI/CD 🚀

### CI/CD (`.github/workflows/ci.yml`)

| Job      | Qué hace                                  | Cobertura          |
| -------- | ----------------------------------------- | ------------------ |
| `test`   | `npm ci` + `npm test` en server/          | 6 unit tests       |
| `build`  | `npm ci` + `npm run build` en client/     | Build solo         |
| `deploy` | Railway deploy con `RAILWAY_TOKEN` secret | Push a main/master |

**Falta:**

- Lint en client CI
- `verify:core` / `verify:operacion` en CI
- Deploy a Render (usa `render.yaml` pero no hay workflow)
- Deploy a DonWeb (scripts PowerShell, manual)
- Frontend tests en CI

### Dockerfile

Multi-stage (builder + runtime), `node:20-bookworm-slim`:

- Builder: instala deps de server + client, build de client
- Runtime: instala deps de server (omit=dev), copia build de client
- EXPOSE 3001, CMD `npm --prefix server start`
- **`.dockerignore`** excluye `.env`, `server/.env`, `*.db`, `node_modules`, docs, assets ✅

### Deploy DonWeb

- PowerShell scripts en `deploy/`
- pm2 (`ecosystem.config.js`) + nginx (`nginx.conf`)
- IP del VPS: `136.248.108.127` (de `.env.production`)
- DNS en Cloudflare (nube gris para n8n, para evitar problemas de certificado)
- n8n en Docker con volumen `n8n_data` preservado

### 📦 Archivos de build/deploy en working tree

- `deploy/modosabor-deploy.zip` (gitignored)
- `deploy/modosabor-donweb.tgz` (gitignored)
- `.tmp/backup-completo.tar.gz` — **177 MB** (backup de emergencia, gitignored, pero consume espacio)
- `.tmp/modosabor-railway-import.sqlite` + WAL/SHM — datos de importación

---

## 7. Testing 🧪

### Estado actual

```
server/tests/
├── run.js                          # Custom runner (42 líneas)
└── utils/
    ├── paymentStatus.test.js       # 3,900 bytes
    ├── pedidoItems.test.js         # 982 bytes
    ├── pedidoSchema.test.js        # 1,533 bytes
    ├── rateLimit.test.js           # 1,825 bytes
    ├── sanitize.test.js            # 1,850 bytes
    └── whatsappCopiloto.test.js    # 528 bytes
```

- **Runner casero**: `node tests/run.js` — requiere cada archivo `.test.js` y ejecuta `run()` dentro.
- **6 archivos**, 52 líneas + test por archivo en promedio.
- **Cobertura**: sanitize, rateLimit, paymentStatus, pedidoItems, pedidoSchema, whatsappCopiloto.
- **Sin tests de integración** (planeados en Hito 6.2).
- **Sin tests de frontend**.
- **Sin framework de testing** (no Jest, no Vitest, no Mocha).
- **Sin assertions de fallo real** — si un `assert` falla, el runner captura el error y sigue.

### Verificaciones (scripts)

- `server/scripts/smoke-test.js` — smoke test básico
- `server/scripts/verify-core.js` — verifica auth, pedidos, caja
- `server/scripts/verify-operacion.js` — verifica turnos, cierre, operación

### ⚠️ `test-tracking-result.json` indica test roto

```
@test-tracking-e2e.js@
^
Unterminated regexp literal
SyntaxError: Invalid or unexpected token
Node.js v24.15.0
```

Hay un test e2e (`test-tracking-e2e.js`) que **no compila** en Node 24. Está referenciado pero broken. El archivo no aparece en `server/tests/` ni en el working tree — podría estar en `.tmp/` o fue borrado.

---

## 8. Base de datos 🗄️

### Schema (`server/db/schema.sql` — 851 líneas)

- 40+ tablas: usuarios, configuracion, pedidos, pedido*items, clientes, productos, categorias, inventario*_, repartidores, personal\__, cierres*caja, caja_movimientos, marketing*_, fidelizacion\__, cupones*, auditoria*eventos, whatsapp**, etc.
- SQLite en modo **WAL** (`PRAGMA journal_mode = WAL`) con `busy_timeout = 5000` ✅
- **Foreign keys ON** ✅
- 35+ índices definidos (ver auditoría previa)

### Migraciones (`server/db/migrations.js` — 963 líneas)

- **60+ columnas** agregadas dinámicamente via `ensureColumn`/`hasColumn`
- Backfills: código de tarjeta fidelización, menú del día, `disponible_para_venta`, turnos, estados de pago, `pedido_items` desde JSON, direcciones legacy, dinero REAL→INTEGER (cents)
- `ensureColumn` usa `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}` — **interpolación de strings** en DDL. No es SQL injection (valores son hardcodeados en migraciones), pero es un patrón riesgoso.
- Las migraciones **se ejecutan en cada startup** (no hay tabla de versión de schema).

### Money conversion (centavos)

- `moneyConversion.js` middleware global convierte `pesos→cents` en requests y `cents→pesos` en responses.
- `pedidoItems.js` tiene `scaleMoneyTreeToStorage` / `scalePedidoItemsToStorage` para items normalizados.
- Muy bien implementado con listas de exclusión.

---

## 9. Tabla de estado general

| Funcionalidad             | Código    | Tests   | CI      | Docs      |
| ------------------------- | --------- | ------- | ------- | --------- |
| Auth JWT + RBAC           | ✅        | parcial | ❌ lint | ✅        |
| TPV                       | ✅        | ❌      | ❌      | ✅ README |
| Pedidos + State Machine   | ✅        | ❌      | ❌      | ✅        |
| Delivery + GPS + Tracking | ✅        | ❌      | ❌      | ✅        |
| KDS                       | ✅        | ❌      | ❌      | ✅        |
| Caja (apertura/cierre)    | ✅        | ❌      | ❌      | ✅        |
| Inventario + Recetas      | ✅        | ❌      | ❌      | ✅        |
| Fidelización + Niveles    | ✅        | parcial | ❌      | ✅        |
| Marketing + Facebook      | ⚠️ frágil | ❌      | ❌      | ✅        |
| WhatsApp Copiloto         | ✅        | parcial | ❌      | ✅        |
| Web Pública               | ✅        | ❌      | ❌      | ✅        |
| Rider App (native)        | ✅        | ❌      | ❌      | ✅ docs   |
| Backups                   | ✅        | ❌      | ❌      | ✅        |
| Auditoría                 | ✅        | ❌      | ❌      | ✅        |

---

## 10. Prioridades de remediación

### Inmediatas (🔴 crítico — requerimiento de seguridad)

1. **Revisar si `.claude/settings.local.json` está en el repo remoto** y **rotar** las credenciales `admin@modosabor.com` / `Huracan840921` de producción. Añadir a `.gitignore`.
2. **Commitear o revertir los 270 archivos modificados** del working tree. El estado actual es peligroso (cambios no revisados, dependencias de archivos sin trackear).
3. **Resolver la duplicación de geocoding** (`utils/geocode.js` vs `services/geocoding.js`). Consolidar en uno solo.
4. **Forzar `JWT_SECRET` largo en dev** también (no solo en prod). Al menos advertir en startup si usa el default.

### Corto plazo (1-2 semanas)

5. **Reemplazar sanitize.js** — escapar HTML solo en salida (capa de presentación), no en entrada. Usar Zod para validación de entrada.
6. **Migrar rate limiter a Redis o almacenamiento persistente** (o al menos documentar la limitación).
7. **Agendar cache de configuración** (`getConfigMap` → cache con TTL de 30s).
8. **Commitear los archivos nuevos** (`geocoding.js`, `direccionesEstructuradas.js`) o hacer rollback si no son necesarios.

### Mediano plazo (1-2 meses)

9. **Dividir archivos monstruo**: `personal.js`, `configuracion.js`, `reportes.js`, `marketingService.js`, `pedidoService.js`.
10. **Implementar tests de integración** (Jest + supertest) y tests de frontend (Vitest).
11. **Agregar índices compuestos**: `(estado, creado_en)` en pedidos, índice funcional o columna normalizada para teléfono de clientes.
12. **Implementar Redis** para: rate limiting, tracking tokens, cache de config, sessions.
13. **CI/CD mejorado**: lint en client, tests de frontend, verify:core en CI, deploy a Render/DonWeb.
14. **Dependabot** configurado.

### Largo plazo

15. **Evaluar migración de SQLite a PostgreSQL** para write scalability (WAL ayuda pero writes son serializados).
16. **2FA para administradores**.
17. **Sentry/error tracking** en prod.
18. **Modo offline para TPV** (IndexedDB) — PLAN_DE_ACCION Hito 7.6.

---

## 11. Archivos de interés (paths)

| Área                      | File                                  | Líneas |
| ------------------------- | ------------------------------------- | ------ |
| Entry point               | `server/index.js`                     | 399    |
| DB conexión + migraciones | `server/db/index.js`                  | 34     |
| Schema                    | `server/db/schema.sql`                | 851    |
| Migraciones               | `server/db/migrations.js`             | 963    |
| Auth middleware           | `server/middleware/auth.js`           | 29     |
| Sanitize middleware       | `server/middleware/sanitize.js`       | 95     |
| Rate limiter              | `server/utils/rateLimit.js`           | 47     |
| Permissions (RBAC)        | `server/utils/permissions.js`         | 49     |
| Money conversion          | `server/utils/moneyConversion.js`     | 125    |
| Pedido state machine      | `server/utils/pedidoStateMachine.js`  | 236    |
| Socket security           | `server/utils/socketRooms.js`         | 348    |
| MercadoPago               | `server/utils/mercadoPago.js`         | 68     |
| Logger                    | `server/utils/logger.js`              | 36     |
| Audit                     | `server/utils/audit.js`               | 68     |
| Upload validation         | `server/utils/uploadValidation.js`    | 73     |
| Auth route                | `server/routes/auth.js`               | 224    |
| Pedido service            | `server/services/pedidoService.js`    | 1,169  |
| Marketing service         | `server/services/marketingService.js` | ~1,500 |
| System client             | `server/utils/systemClient.js`        | 1,187  |
| Inventory                 | `server/utils/inventory.js`           | 659    |
| Backup manager            | `server/utils/backupManager.js`       | ~293   |
| Storage paths             | `server/utils/storagePaths.js`        | 94     |
| Auth config               | `server/utils/authConfig.js`          | 28     |
| Test runner               | `server/tests/run.js`                 | 42     |
| CI workflow               | `.github/workflows/ci.yml`            | 70     |
| Root package.json         | `package.json`                        | 46     |
| Server package.json       | `server/package.json`                 | 34     |
| Client package.json       | `client/package.json`                 | 66     |
| Root README               | `README.md`                           | 209    |

---

## 12. Conclusión

**Modo Sabor** es un sistema **muy completo y funcional** con arquitectura sólida (Express + SQLite WAL + Socket.IO + React + Capacitor). Las funcionalidades están bien integradas: TPV, delivery con GPS/tracking, KDS, caja, inventario, fidelización, marketing, WhatsApp copiloto.

Los **puntos críticos** a abordar son:

1. **Seguridad:** credenciales del `.claude/settings.local.json` en el repo + sanitización agresiva que rompe datos + JWT_SECRET default.
2. **Deuda técnica:** working tree con 270 archivos sin commitear + archivos monstruo de miles de líneas.
3. **Testing:** solo 6 archivos de test unitarios caseros, sin tests de integración ni frontend.
4. **Performance:** recálculo de stats por request, sin cache de config, queries N+1, migrations en startup.

El **PLAN_DE_ACCION.md** y las **auditorías previas** (`AUDITORIA_MODOSABOR_COMPLETA.md`, `AUDITORIA_TRACKING_COMPLETA.md`) documentan bien el estado. La implementación está **parcialmente avanzada en hitos 1-3** (fundamentos, design system, refactor), pero **pendiente** hitos 6-8 (testing, funcionalidades premium, DevOps/monitoreo).

_ Fin del informe de auditoría _
