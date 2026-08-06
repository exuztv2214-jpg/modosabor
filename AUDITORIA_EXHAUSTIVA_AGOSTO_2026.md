# 🔍 AUDITORÍA EXHAUSTIVA — MODO SABOR 1

**Fecha de auditoría:** 2026-08-06  
**Auditor:** Kimi (Claude Code / Kimi Work)  
**Proyecto:** exuz27/modosabor (branch: main)  
**Ubicación:** D:\Proyectos\modosabor1  
**Estado del repo:** 151 archivos modificados (working tree dirty)

---

## 0. Resumen Ejecutivo

**Modo Sabor** es un sistema integral de gestión para restaurantes con arquitectura monorepo: backend Node.js/Express/SQLite + Socket.IO, frontend React/Vite/Tailwind + Capacitor (admin + rider PWA), y un agente de WhatsApp (n8n + bridge local).

### Estado General

| Categoría         | Estado                                                    | Trend vs Jul-2026 |
| ----------------- | --------------------------------------------------------- | ----------------- |
| Arquitectura      | ✅ Sólida (monorepo, bien dividido)                       | → Estable         |
| Seguridad         | 🔴 Crítico — credenciales expuestas, sanitización rota    | ↓ Empeoró         |
| Calidad de código | 🟡 Regular — archivos monstruo persisten, 151 mods        | → Estable         |
| Performance       | 🟡 Media — N+1, sin cache, migrations en startup          | → Estable         |
| Testing           | 🔴 Básico — 6 archivos, runner casero, sin frontend tests | → Estable         |
| DevOps/CI         | 🟡 Parcial — CI solo backend, deploy solo Railway         | → Estable         |
| Documentación     | ✅ Buena — README, docs, bitácora, auditorías             | → Estable         |

### Cambios desde auditoría previa (2026-08-04)

- **Working tree reducido:** De 270 a 151 archivos modificados (se commitearon algunos cambios)
- **Archivos monstruo persisten:** `personal.js` (2,696 líneas), `marketingService.js` (1,699 líneas)
- **Nuevos servicios sin trackear:** `geocoding.js` (292 líneas), `direccionesEstructuradas.js` (343 líneas)
- **Credenciales siguen en `.claude/settings.local.json`** (GIT-TRACKED) — **CRÍTICO SIN RESOLVER**
- **Sanitización HTML sigue rota** — escapa `"` en TODOS los strings de entrada

---

## 1. Estructura del Proyecto

```
modosabor1/
├── server/                  # Backend: Express 4 + SQLite(WAL) + Socket.IO 4
│   ├── index.js             # Entry point (399 líneas) — config, middleware, health
│   ├── db/                  # Conexión + migraciones + seed
│   │   ├── schema.sql       # 851 líneas — 40+ tablas
│   │   ├── migrations.js    # 963 líneas — 60+ ALTER TABLE dinámicos
│   │   └── seed.js
│   ├── routes/              # 22 archivos — archivos MUY grandes
│   │   ├── personal.js      # 2,696 líneas ← MONSTRUO #1
│   │   ├── pedidos.js       # 1,398 líneas
│   │   ├── repartidores.js  # 1,076 líneas
│   │   ├── clientes.js      # 994 líneas
│   │   ├── operacion.js     # 973 líneas
│   │   ├── reportes.js      # 968 líneas
│   │   ├── inventario.js    # 942 líneas
│   │   ├── configuracion.js # 795 líneas
│   │   ├── fidelizacion.js  # 646 líneas
│   │   └── ... (14 archivos más)
│   ├── services/            # 9 archivos — lógica de negocio
│   │   ├── marketingService.js  # 1,699 líneas ← MONSTRUO #2
│   │   ├── pedidoService.js     # 1,169 líneas
│   │   ├── personalService.js   # 736 líneas
│   │   ├── fidelizacionService.js # 592 líneas
│   │   ├── direccionesEstructuradas.js # 343 líneas ← NUEVO, sin trackear
│   │   └── geocoding.js         # 292 líneas ← NUEVO, sin trackear
│   ├── schemas/             # Zod schemas (login, pedido, producto)
│   ├── scripts/             # 12 archivos (seed, smoke, verify, export/import)
│   ├── tests/               # 6 archivos .test.js + runner casero
│   ├── utils/               # 25+ utilidades
│   ├── middleware/          # auth, sanitize, validate
│   └── .env                 # NO trackeado ✅
│
├── client/                  # Frontend: React 18 + Vite 8 + Tailwind 3.4
│   ├── src/
│   │   ├── App.jsx          # 174 líneas — router con lazy loading
│   │   ├── 27+ páginas (admin) + 5 públicas/rider
│   │   ├── components/      # Agrupados por funcionalidad
│   │   ├── design-system/   # Button, Card, Input, Badge, etc.
│   │   ├── context/         # AuthContext, AppConfigContext
│   │   ├── hooks/           # useAuthenticatedSocket, useDarkMode
│   │   └── lib/             # 21 archivos (api.js, socket.js, runtime.js)
│   ├── public/              # sw.js, manifest, assets
│   ├── android/             # Capacitor 8 (com.modosabor.rider)
│   ├── ios/                 # Capacitor 8
│   └── vite.config.js       # Proxy + code splitting
│
├── agente-whatsapp/         # WhatsApp copiloto (n8n)
│   ├── README.md            # Guía completa
│   ├── prompt-agente.md
│   ├── workflow-n8n.json
│   └── puente-web/          # Bridge local WhatsApp Web.js
│
├── deploy/                  # Scripts PowerShell + configuraciones
├── docs/                    # 10+ archivos de documentación
├── .github/workflows/ci.yml # CI/CD (limitado)
├── .claude/settings.local.json  # ← GIT-TRACKED, CONTIENE CREDENCIALES 🔴
├── bitacora-claude.md       # Bitácora de desarrollo (2,394 líneas)
├── AUDITORIA_EXHAUSTIVA_2026.md
├── AUDITORIA_MODOSABOR_COMPLETA.md
├── PLAN_DE_ACCION.md
└── README.md
```

### Archivos más grandes (monstruos)

| Archivo                               | Líneas | Bytes  | Estado    |
| ------------------------------------- | ------ | ------ | --------- |
| `server/routes/personal.js`           | 2,696  | ~91 KB | Committed |
| `server/services/marketingService.js` | 1,699  | ~52 KB | Committed |
| `server/routes/pedidos.js`            | 1,398  | ~46 KB | Modified  |
| `server/services/pedidoService.js`    | 1,169  | ~37 KB | Committed |
| `server/routes/repartidores.js`       | 1,076  | ~36 KB | Committed |
| `server/routes/clientes.js`           | 994    | ~31 KB | Committed |
| `server/routes/operacion.js`          | 973    | ~33 KB | Committed |
| `server/routes/reportes.js`           | 968    | ~30 KB | Committed |
| `server/routes/inventario.js`         | 942    | ~27 KB | Committed |
| `server/routes/configuracion.js`      | 795    | ~24 KB | Committed |

---

## 2. Seguridad 🔐

### 🔴 CRÍTICOS (REQUIEREN ACCIÓN INMEDIATA)

#### 2.1. Credenciales de producción en `.claude/settings.local.json` (GIT-TRACKED)

**Estado:** ARCHIVO AÚN ESTÁ EN EL REPOSITORIO. No se resolvió desde la auditoría anterior.

- **Email de admin de producción:** `admin@modosabor.com`
- **Password de producción:** `Huracan840921`
- **URL de API Railway:** `https://modosabor-api-production.up.railway.app`
- **Cookies de sesión** embebidas en comandos `curl`

**Impacto:** Cualquiera con acceso al repo tiene credenciales de producción.

**Acción requerida:**

1. `git rm --cached .claude/settings.local.json`
2. Añadir `.claude/settings.local.json` a `.gitignore`
3. **Rotar password** `admin@modosabor.com` en producción INMEDIATAMENTE
4. Forzar logout de todas las sesiones activas

#### 2.2. Sanitización HTML rompe datos válidos

`server/middleware/sanitize.js:58` escapa `"` → `&quot;` en **todos** los strings del body.

**Impacto confirmado:**

- URLs con comillas llegan como `&quot;` al frontend
- JSONs stringificados con comillas se corrompen
- Descripciones de productos, direcciones, nombres se muestran con `&quot;`
- Enlaces de Google Maps, mensajes de WhatsApp, contenido de marketing se rompen

**El `isJsonStringField` (líneas 16-42) es una mitigación frágil:**

- Solo reconoce 6 keys (`items`, `variantes`, `extras`, `pagos`, `split_payments`, `metodos_pago`)
- Campos JSON anidados, configuraciones, descripciones con formato no se salvan
- Depende de que el string empiece con `[` o `{` y sea parseable

**Acción requerida:**

- **Opción A (recomendada):** Eliminar el escape de `"` del middleware. Escapar HTML solo en salida (capa de presentación), nunca en entrada.
- **Opción B (mitigación rápida):** Ampliar `JSON_STRING_KEYS` a todos los campos que puedan contener JSON, y agregar validación de que no se escapen strings que parezcan URLs.

#### 2.3. JWT_SECRET por defecto en desarrollo

`server/utils/authConfig.js:1` define `DEFAULT_JWT_SECRET = 'modosabor_jwt_2024'`.

- En producción: lanza error si no está configurado ✅
- En desarrollo: usa el default silenciosamente ⚠️

**Riesgo:** Si un desarrollador copia `.env.example` sin cambiar `JWT_SECRET`, o si el default se filtra a producción accidentalmente, los tokens son predecibles.

#### 2.4. Rate limiter en memoria (Map) — Sin persistencia ni límite real

`server/utils/rateLimit.js`:

- Usa `Map` en memoria → **se pierde al reiniciar**
- No funciona en cluster/multi-instancia (Railway/Render pueden escalar)
- `hits.size > 10000` limpieza es manual y reactiva
- Bajo ataque DDoS, el Map puede crecer indefinidamente antes de llegar a 10,000

#### 2.5. Archivos sin trackear requeridos por código modificado

`server/routes/pedidos.js` (working tree) requiere `../services/geocoding`.
`server/services/pedidoService.js` requiere `./direccionesEstructuradas`.

Ambos son **archivos nuevos no commiteados**. Si alguien clona el repo y corre el working tree, falla por módulos faltantes.

### 🟡 MEDIOS

#### 2.6. Sin rate limiting por usuario en login

Solo hay rate limiting por IP (`loginRateLimit` en `auth.js`). Un atacante detrás de una misma IP (NAT, proxy, VPN) puede hacer brute-force sin límite por email.

#### 2.7. Cookie `auth_token` con `sameSite: 'none'` en producción

```js
// server/routes/auth.js
sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
```

Necesario para cross-origin (admin y web pública en dominios distintos), pero:

- Requiere `secure: true` (se verifica en auth.js ✅)
- Aumenta superficie de CSRF
- No hay CSRF token adicional

#### 2.8. bcryptjs con 10 rounds

Aceptable pero el PLAN_DE_ACCION sugiere 12+. Costo de cómputo bajo para producción 2026.

#### 2.9. Sin 2FA/MFA

Sistema de auth simple: JWT + bcrypt. No hay 2FA para administradores con acceso a caja, personal, configuración.

#### 2.10. CORS con múltiples orígenes dinámicos

`index.js:80-101` concatena 8+ variables de entorno en `buildAllowedOrigins()`. Si cualquiera está comprometida o mal configurada, CORS queda abierto.

### 🟢 LEVES

#### 2.11. Health check expone información de configuración

`GET /api/health` (`index.js:265-295`) expone:

- Si MercadoPago está configurado
- URLs públicas
- Si son HTTPS
- Si están en red privada

Información útil para fingerprinting de un atacante.

#### 2.12. Archivo `server/modosabor.db` (0 bytes) en raíz

Artefacto stale/empty. El DB real vive en `server/data/modosabor.db`. Confuso.

---

## 3. Calidad de Código y Arquitectura 💻

### 🔴 Problemas Críticos

#### 3.1. Archivos monstruo — Difíciles de mantener, testear y revisar

| Archivo               | Líneas | Responsabilidades mezcladas                             |
| --------------------- | ------ | ------------------------------------------------------- |
| `personal.js`         | 2,696  | CRUD, asistencia, liquidaciones, movimientos, objetivos |
| `marketingService.js` | 1,699  | Promos, campañas, calendario, atribuciones, Facebook    |
| `pedidos.js`          | 1,398  | CRUD, estados, mesas, reservas, MP, webhook, tracking   |
| `pedidoService.js`    | 1,169  | Creación, validación, cálculos, notificaciones, geocod. |
| `repartidores.js`     | 1,076  | CRUD, asignación, GPS, PIN, foto, notificaciones        |

Estos archivos mezclan:

- Routing Express
- Queries SQL directas
- Lógica de negocio
- Eventos Socket.IO
- Llamadas a servicios externos
- Validaciones
- Notificaciones

**Consecuencias:**

- Un cambio en una funcionalidad requiere entender todo el archivo
- Revisión de código es imposible (2,696 líneas en un PR)
- Testing unitario es prácticamente imposible
- Bugs en una funcionalidad pueden afectar otras no relacionadas

#### 3.2. Dos implementaciones de geocoding coexisten

| Archivo                        | Estado       | Función                   | Usado por          |
| ------------------------------ | ------------ | ------------------------- | ------------------ |
| `server/utils/geocode.js`      | Trackeado    | `geocodeClienteDireccion` | `pedidoService.js` |
| `server/services/geocoding.js` | Sin trackear | `geocodificarPedido`      | `pedidos.js` (WT)  |

**Duplicación de funcionalidad:** Ambos geocodifican direcciones usando Nominatim.
**Riesgo:** El código working tree usa el nuevo, el committed usa el viejo. Inconsistencia.

#### 3.3. Working tree con 151 archivos modificados

```
$ git diff --name-only HEAD | wc -l
151
```

La mayoría son assets de Android (splash screens, icons) pero también hay:

- `client/src/App.jsx`
- `client/src/components/Configuracion/*.jsx` (8 archivos)
- `client/src/components/rider/*.jsx` (8 archivos)
- `client/src/pages/*.jsx`
- `server/routes/pedidos.js` (depende de `geocoding.js` sin trackear)

**Riesgo:** Cambios no revisados en un PR. Si se pierde el working tree, se pierde trabajo.

### 🟡 Problemas Medios

#### 3.4. Custom test runner (no Jest/Mocha/Vitest)

`server/tests/run.js` (42 líneas):

```js
require(testFile); // ejecuta el archivo, que llama a .run()
```

- No soporta `beforeEach/afterEach`, mocking, spies
- No soporta cobertura de código
- No soporta watch mode
- 6 archivos de test, ~52 líneas promedio
- **Sin tests de integración**
- **Sin tests de frontend**

#### 3.5. CI/CD limitado

`.github/workflows/ci.yml`:

- ✅ Test backend (6 unit tests)
- ✅ Build frontend
- ✅ Deploy Railway
- ❌ **Sin lint de frontend**
- ❌ **Sin tests de frontend**
- ❌ **Sin `verify:core` / `verify:operacion`**
- ❌ **Sin deploy a DonWeb** (script PowerShell manual)
- ❌ **Sin deploy a Render** (tiene `render.yaml` pero no workflow)

#### 3.6. Husky pre-commit solo formatea

`.husky/pre-commit` ejecuta `npx lint-staged` → `prettier --write`.

- No corre lint
- No corre tests
- No hay protección de ramas en GitHub

#### 3.7. Sin dependabot

No hay `.github/dependabot.yml`. Dependencias sin actualizar automáticamente.

### 🟢 Aspectos Positivos

#### 3.8. Money conversion middleware bien diseñado

`server/utils/moneyConversion.js` (125 líneas):

- Convierte pesos→centavos en requests
- Convierte centavos→pesos en responses
- Listas de exclusión (`EXCLUDED_KEYS`) para IDs, códigos, etc.
- Reconocimiento por patrón de nombre
- Maneja casos edge: `digitales`, `gananciaOperativa`, etc.

#### 3.9. State machine de pedidos con RBAC

`server/utils/pedidoStateMachine.js` (236 líneas):

- Validaciones de transición de estados
- Permisos por rol (admin, caja, cocina, delivery)
- Requiere PIN/foto de entrega antes de "entregado"

#### 3.10. Socket.IO con rooms seguras

`server/utils/socketRooms.js` (348 líneas):

- Auth por cookie JWT en handshake
- Rooms por rol, pedido, repartidor
- Tokens de tracking en memoria + fallback a DB
- Separación de datos: público (tracking) vs admin (full) vs rider (asignado)

#### 3.11. Zod schemas + validation middleware

`server/middleware/validate.js` (48 líneas) con `validateBody`, `validateParams`, `validateQuery`.
Schemas en `server/schemas/index.js` (119 líneas).

---

## 4. Performance ⚡

### 🔴 Críticos

#### 4.1. Recálculo de stats de clientes en cada request

`server/routes/clientes.js` llama `recalculateAllClientes(db)` en:

- `GET /api/clientes` (listado)
- `GET /api/clientes/segmentos`

Hace un `GROUP BY` completo sobre **todos los pedidos** en **cada request**.

**Impacto:** Con 1,000+ clientes y 10,000+ pedidos, cada request de listado de clientes recalcula todo.

#### 4.2. Migrations en cada startup

`server/db/index.js` llama `runMigrations(db)` en cada arranque:

- Backfill de `pedido_items` con `LIMIT 20000`
- 60+ `ALTER TABLE ADD COLUMN`
- Múltiples backfills de normalización

**Impacto:** Puede causar downtime de varios segundos en bases grandes.

#### 4.3. Queries N+1 en decoración de productos

`server/utils/systemClient.js` → `decorateProductsWithInventory(db, rows)` ejecuta queries por producto individual.

Afecta:

- `/api/agente/menu`
- `/api/agente/producto/:id`
- `/api/productos` (en algunos casos)

#### 4.4. Búsqueda de clientes por teléfono sin índice

```sql
SELECT * FROM clientes
WHERE REPLACE(REPLACE(REPLACE(telefono, ' ', ''), '+', ''), '-', '') LIKE ?
```

Función sobre la columna = **no usa índice**. Trae todos los clientes y filtra en JS.

#### 4.5. Geocodificación síncrona bloqueante

`pedidoService.js` hace `await geocodeClienteDireccion()` durante la creación del pedido.

- Bloquea el request HTTP
- Timeout de 8s a Nominatim
- Si Nominatim está lento, el cliente espera

### 🟡 Medios

#### 4.6. Sin cache de configuración

`getConfigMap(db)` en `mercadoPago.js` lee **toda** la tabla `configuracion` en cada llamada.

- Llamado por casi cada endpoint
- ~50+ rows, pero leídas miles de veces por minuto

#### 4.7. Rate limiter Map sin límite de memoria real

Cleanup solo cuando `hits.size > 10000`. Bajo ataque DDoS, puede crecer mucho antes.

#### 4.8. Socket.IO emite a room `authenticated` completa

`emitNuevoPedido` emite a todos los clientes autenticados. Con muchos admins conectados, es un broadcast masivo.

---

## 5. Frontend 🎨

### Arquitectura

- React 18 + Vite 8 + Tailwind 3.4 + React Router 6
- Capacitor 8 para apps nativas (Android + iOS)
- Lazy loading con `React.Suspense` en `App.jsx`
- Code splitting por vendor chunks

### 🟡 Hallazgos

#### 5.1. Sin tests de frontend

No hay archivos `.test.jsx` ni `.spec.jsx` en `client/src/`.

#### 5.2. `VITE_API_URL` no configurado en dev

`runtime.js` usa `import.meta.env.VITE_API_URL`. En dev usa proxy Vite. En native app usa hardcodeado `https://modosabor-api-production.up.railway.app`.

#### 5.3. CI no corre lint de frontend

Job `build` solo hace `npm run build`, no `npm run lint`.

#### 5.4. Toast duration de 3000ms

`App.jsx`: `<Toaster position="top-right" toastOptions={{ duration: 3000 }}>`.
Para errores importantes, 3 segundos puede ser insuficiente.

---

## 6. Base de Datos 🗄️

### Schema (`server/db/schema.sql` — 851 líneas)

- 40+ tablas
- SQLite en modo **WAL** (`PRAGMA journal_mode = WAL`) ✅
- Foreign keys ON ✅
- 35+ índices definidos

### Migraciones (`server/db/migrations.js` — 963 líneas)

- 60+ columnas agregadas dinámicamente via `ensureColumn`/`hasColumn`
- Backfills: tarjetas fidelización, menú del día, `disponible_para_venta`, turnos, estados de pago, `pedido_items` desde JSON, direcciones legacy, dinero REAL→INTEGER
- **No hay tabla de versión de schema** — se ejecutan en cada startup
- `ensureColumn` usa interpolación de strings en DDL (riesgo bajo porque valores son hardcodeados)

### Money conversion (centavos)

Implementado globalmente con `moneyConversion.js`. Muy sólido.

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

- 6 archivos de test
- Runner casero sin framework
- Sin tests de integración
- Sin tests de frontend
- Sin cobertura de código

### Scripts de verificación

- `server/scripts/smoke-test.js` — smoke test básico
- `server/scripts/verify-core.js` — verifica auth, pedidos, caja
- `server/scripts/verify-operacion.js` — verifica turnos, cierre

### `test-tracking-result.json` — Test roto

```
@test-tracking-e2e.js@
^
Unterminated regexp literal
```

Test e2e que no compila en Node 24.

---

## 8. Funcionalidades — Estado Detallado

| Funcionalidad              | Estado | Tests | CI  | Docs | Notas                            |
| -------------------------- | ------ | ----- | --- | ---- | -------------------------------- |
| Auth JWT + RBAC            | ✅     | 🟡    | ❌  | ✅   | Cookie httpOnly, roles, permisos |
| TPV                        | ✅     | ❌    | ❌  | ✅   | Completo con estacionamiento     |
| Pedidos + State Machine    | ✅     | ❌    | ❌  | ✅   | Estados con permisos             |
| Delivery + GPS + Tracking  | ✅     | ❌    | ❌  | ✅   | Tracking en vivo, PIN, foto      |
| KDS                        | ✅     | ❌    | ❌  | ✅   | Kitchen display                  |
| Caja (apertura/cierre)     | ✅     | ❌    | ❌  | ✅   | Por turno, resumen               |
| Inventario + Recetas       | ✅     | ❌    | ❌  | ✅   | Sync por categoría               |
| Fidelización + Niveles     | ✅     | 🟡    | ❌  | ✅   | Puntos, sellos, club público     |
| Marketing + Facebook       | ⚠️     | ❌    | ❌  | ✅   | Publicador Playwright frágil     |
| WhatsApp Copiloto          | ✅     | 🟡    | ❌  | ✅   | n8n + bridge local               |
| Web Pública                | ✅     | ❌    | ❌  | ✅   | Menú, carrito, checkout          |
| Rider App (native)         | ✅     | ❌    | ❌  | ✅   | Capacitor Android/iOS            |
| Backups                    | ✅     | ❌    | ❌  | ✅   | Automáticos SQLite               |
| Auditoría                  | ✅     | ❌    | ❌  | ✅   | Log completo                     |
| Personal + Asistencia      | ✅     | ❌    | ❌  | ✅   | 2,696 líneas en un archivo       |
| Cupones                    | ✅     | ❌    | ❌  | ✅   | Validación completa              |
| Mesas + Reservas           | ✅     | ❌    | ❌  | ✅   | Mover, fusionar, dividir         |
| Impresiones                | ✅     | ❌    | ❌  | ✅   | Tickets, comandas, precuentas    |
| MercadoPago                | ✅     | ❌    | ❌  | ✅   | Checkout, webhook, sync          |
| Menú del día               | ⚠️     | ❌    | ❌  | ✅   | Tabla existe, UI básica          |
| Carritos abandonados       | ⚠️     | ❌    | ❌  | ✅   | Tabla existe, sin lógica activa  |
| Campañas automáticas       | ❌     | ❌    | ❌  | ✅   | Devuelven 410                    |
| Notificaciones automáticas | ❌     | ❌    | ❌  | ✅   | Devuelven 410                    |

---

## 9. Prioridades de Remediación

### 🔴 Inmediatas (hoy)

| #   | Problema                                      | Acción                                                   |
| --- | --------------------------------------------- | -------------------------------------------------------- |
| 1   | Credenciales en `.claude/settings.local.json` | `git rm --cached`, añadir a `.gitignore`, rotar password |
| 2   | Sanitización HTML rompe datos                 | Eliminar escape de `"` en entrada o ampliar mitigación   |
| 3   | Archivos sin trackear requeridos              | Commitear `geocoding.js` y `direccionesEstructuradas.js` |

### 🟡 Corto plazo (esta semana)

| #   | Problema                           | Acción                                                  |
| --- | ---------------------------------- | ------------------------------------------------------- |
| 4   | 151 archivos modificados           | Commitear o revertir cambios del working tree           |
| 5   | Duplicación de geocoding           | Consolidar `utils/geocode.js` y `services/geocoding.js` |
| 6   | Recálculo de stats en cada request | Cachear en DB o recalcular con job periódico            |
| 7   | Migrations en cada startup         | Agregar tabla de versión de schema                      |
| 8   | Rate limiter en memoria            | Documentar limitación o migrar a Redis                  |

### 🟢 Mediano plazo (1-2 meses)

| #   | Problema               | Acción                                            |
| --- | ---------------------- | ------------------------------------------------- |
| 9   | Archivos monstruo      | Dividir en controllers + services + repositories  |
| 10  | Tests de integración   | Implementar Jest/Vitest + supertest               |
| 11  | Tests de frontend      | Vitest + React Testing Library                    |
| 12  | Índices compuestos     | `(estado, creado_en)` en pedidos                  |
| 13  | Teléfono normalizado   | Agregar columna `telefono_normalizado` con índice |
| 14  | Cache de configuración | In-memory con TTL de 30s                          |
| 15  | CI/CD mejorado         | Lint client, verify scripts, deploy DonWeb/Render |
| 16  | Dependabot             | Configurar `.github/dependabot.yml`               |

### 📅 Largo plazo

| #   | Problema                 | Acción                             |
| --- | ------------------------ | ---------------------------------- |
| 17  | Evaluar PostgreSQL       | Para write scalability             |
| 18  | 2FA para administradores | TOTP o SMS                         |
| 19  | Sentry/error tracking    | Monitoreo de errores en producción |
| 20  | Modo offline para TPV    | IndexedDB + sync                   |

---

## 10. Conclusión

**Modo Sabor** es un sistema **muy completo y funcional** con arquitectura sólida. Las funcionalidades están bien integradas y el código muestra buenas prácticas en varias áreas (money conversion, state machine, socket security).

### Los 3 problemas más críticos ahora:

1. **🔴 Seguridad:** `.claude/settings.local.json` contiene credenciales de producción y está trackeado en git. **Esto es una brecha de seguridad activa.**
2. **🔴 Sanitización:** El middleware de sanitización escapa comillas en TODOS los strings, rompiendo URLs, JSONs, descripciones y contenido de marketing.
3. **🟡 Deuda técnica:** 151 archivos modificados sin commitear, archivos monstruo de miles de líneas, y dos implementaciones de geocoding duplicadas.

### Recomendación inmediata:

1. **Hoy:** Resolver credenciales en repo y sanitización HTML.
2. **Esta semana:** Commitear/revertir working tree, consolidar geocoding.
3. **Este mes:** Empezar a dividir archivos monstruo y agregar tests de integración.

El **PLAN_DE_ACCION.md** documenta bien el roadmap. Los hitos 1-3 (fundamentos, design system, refactor) están parcialmente avanzados. Los hitos 6-8 (testing, funcionalidades premium, DevOps) están pendientes.

---

_Fin del informe de auditoría exhaustiva — 2026-08-06_
