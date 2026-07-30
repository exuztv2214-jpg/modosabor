# 🔍 AUDITORÍA COMPLETA DEL SISTEMA "MODO SABOR"

**Fecha de auditoría:** 2026-07-16 00:58 UTC-3  
**Proyecto:** exuz27/modosabor (branch: main)  
**Ubicación:** D:\Proyectos\modosabor1  
**Estado del repo:** 201 archivos modificados (dirty)

---

## 1. ESTRUCTURA DEL PROYECTO

```
modosabor1/
├── server/                    # Backend Node.js + SQLite
│   ├── index.js               # Entry point Express + Socket.IO
│   ├── db.js                  # Re-export de db/index.js
│   ├── db/
│   │   ├── index.js           # Conexión better-sqlite3 + WAL + FK
│   │   ├── schema.sql         # Schema completo (839 líneas)
│   │   ├── migrations.js      # Migraciones dinámicas + backfills
│   │   └── seed.js            # Seed inicial
│   ├── middleware/
│   │   ├── auth.js            # JWT auth middleware
│   │   ├── sanitize.js        # HTML escape + trim + null bytes
│   │   └── validate.js        # Zod validation helpers
│   ├── routes/                # 16 archivos de rutas API
│   ├── services/              # 5 servicios de negocio
│   ├── utils/                 # 25+ utilidades
│   ├── schemas/               # Zod schemas (login, pedido, producto)
│   ├── scripts/               # Seed menu, smoke tests, verify
│   ├── tests/                 # Tests básicos
│   ├── uploads/               # Archivos subidos (fotos, etc.)
│   ├── data/                  # Perfiles de Playwright (Facebook automation)
│   ├── .env                   # Variables de entorno (sensitive)
│   ├── .env.example           # Template de configuración
│   └── package.json           # 15 deps + 2 devDeps
│
├── client/                    # Frontend React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx            # Router con lazy loading
│   │   ├── main.jsx           # Entry point + Service Worker
│   │   ├── index.css          # Tailwind + custom tokens
│   │   ├── pages/             # 25+ páginas
│   │   ├── components/        # Componentes compartidos
│   │   ├── context/           # AuthContext + AppConfigContext
│   │   ├── hooks/             # useAuthenticatedSocket, useDarkMode
│   │   ├── lib/               # api.js, helpers, utilidades
│   │   ├── design-system/     # Button, Card, Input, Badge, etc.
│   │   └── image/             # Assets de perfil
│   ├── public/                # sw.js, manifest.json, icons
│   ├── vite.config.js         # Proxy + code splitting
│   ├── package.json           # 11 deps + 11 devDeps
│   └── dist/                  # Build de producción
│
├── package.json               # Root: scripts + concurrently
├── Dockerfile                 # Multi-stage build
├── railway.json               # Deploy Railway
├── render.yaml                # Deploy Render
├── README.md                  # Documentación
├── PLAN_DE_ACCION.md          # Plan de acción
├── .gitignore
├── .husky/                    # Git hooks
├── .launcher/                 # Logs del launcher
├── docs/                      # Documentación adicional
├── deploy/                    # Scripts de deploy
├── assets/branding/           # Branding assets
└── template_base/             # Templates base
```

---

## 2. BACKEND (Node.js + SQLite)

### 2.1 Archivos de rutas (`server/routes/`)

| Archivo            | Líneas | Qué hace                                                                                                              |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `auth.js`          | 215    | Login/logout con JWT en cookie, CRUD usuarios, cambio de contraseña, avatar                                           |
| `pedidos.js`       | 1,199  | CRUD pedidos, estado machine, mesas (mover/fusionar), reservas, impresiones, checkout MP, webhook MP, tracking        |
| `clientes.js`      | 994    | CRUD clientes, direcciones, segmentación (VIP/riesgo/perdido), campañas CRM, historial, fidelización                  |
| `repartidores.js`  | 524    | CRUD repartidores, asignación automática, panel rider (PIN), ubicación GPS, foto de entrega, notificación "llegando"  |
| `productos.js`     | 368    | CRUD productos, upload de imágenes, variantes, extras, stock directo/recipe                                           |
| `inventario.js`    | 942    | CRUD insumos, movimientos, recetas por categoría (pizzas, empanadas, milanesas, hamburguesas, papas), sync automático |
| `caja.js`          | 380    | Apertura/cierre caja, movimientos manuales, resumen por turno, ticket de cierre                                       |
| `fidelizacion.js`  | 611    | Config fidelización, niveles, puntos, sellos, canjes, club público, tarjeta fidelidad                                 |
| `configuracion.js` | 20,503 | Config general del negocio (bulk update), branding, módulos, impresión, delivery, pagos, avanzado                     |
| `reportes.js`      | 29,797 | Reportes de ventas, productos, clientes, personal, marketing, exportación                                             |
| `marketing.js`     | 15,090 | Promos, contenidos, campañas, calendario, atribuciones, publicador Facebook                                           |
| `personal.js`      | 91,096 | CRUD personal, asistencia, liquidaciones, movimientos, objetivos, reconocimientos, carrera                            |
| `cupones.js`       | 9,101  | CRUD cupones, validación, usos por cliente                                                                            |
| `operacion.js`     | 22,049 | Turnos operativos, menú del día, cierre automático, auditoría                                                         |
| `compras.js`       | 3,714  | Compras de inventario, items por compra                                                                               |
| `categorias.js`    | 4,906  | CRUD categorías, iconos, colores, orden                                                                               |

### 2.2 Middleware

| Archivo       | Qué hace                                                                                                            | Estado  |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| `auth.js`     | JWT desde cookie o header Bearer, verifica usuario activo en DB                                                     | ✅ Bien |
| `sanitize.js` | Trim, escape HTML entities, limita 5000 chars, bloquea null bytes. Skip para `/api/configuracion/bulk` y webhook MP | ✅ Bien |
| `validate.js` | Zod validation para body, params, query                                                                             | ✅ Bien |

### 2.3 Utilidades clave (`server/utils/`)

| Archivo                    | Qué hace                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `socketRooms.js`           | Seguridad Socket.IO: rooms por rol, pedido, repartidor. Tokens de tracking en memoria + DB fallback. Emite solo a interesados |
| `pedidoStateMachine.js`    | Máquina de estados de pedidos con validaciones de transición y permisos por rol                                               |
| `deliveryAssignment.js`    | Auto-asignación de repartidores, asignación manual, sincronización con personal                                               |
| `deliveryZones.js`         | Zonas de delivery con keywords, costos, tiempos estimados                                                                     |
| `deliveryEta.js`           | Cálculo de ETA dinámico basado en ubicación del repartidor                                                                    |
| `deliveryNotifications.js` | Notificación "llegando" cuando repartidor está a <150m                                                                        |
| `inventory.js`             | Aplicación/reversión de stock por recetas o stock directo                                                                     |
| `paymentStatus.js`         | Normalización de métodos de pago y estados de pago                                                                            |
| `mercadoPago.js`           | Integración con MercadoPago (preference, payment, webhook)                                                                    |
| `rateLimit.js`             | Rate limiter en memoria (Map) por IP                                                                                          |
| `backupManager.js`         | Backups automáticos de SQLite                                                                                                 |
| `printTemplates.js`        | Templates HTML para tickets, comandas, precuentas, cierre de caja                                                             |
| `loyalty.js`               | Recálculo de stats de clientes                                                                                                |
| `geocode.js`               | Geocodificación de direcciones de clientes                                                                                    |
| `permissions.js`           | RBAC: admin, caja, cocina, delivery                                                                                           |

---

## 3. FRONTEND (React + Vite + Tailwind)

### 3.1 Páginas (`client/src/pages/`)

| Página                  | Estado       | Descripción                                                                |
| ----------------------- | ------------ | -------------------------------------------------------------------------- |
| `WebPublica.jsx`        | ✅ Funcional | Menú público, carrito, checkout, cupones, geolocalización, tracking        |
| `ClubFidelidad.jsx`     | ✅ Funcional | Página pública de fidelización, tarjeta, stats                             |
| `Login.jsx`             | ✅ Funcional | Login con redirección post-auth                                            |
| `DashboardModern.jsx`   | ✅ Funcional | Dashboard con gráficos Recharts, métricas, acciones rápidas                |
| `TPV.jsx`               | ✅ Funcional | Punto de venta con catálogo, carrito, cliente, pagos, pedidos estacionados |
| `Pedidos.jsx`           | ✅ Funcional | Lista de pedidos, filtros, estados                                         |
| `Productos.jsx`         | ✅ Funcional | Grid de productos, formulario, variantes, extras, stock                    |
| `Inventario.jsx`        | ✅ Funcional | Insumos, movimientos, recetas, ajustes                                     |
| `Compras.jsx`           | ⚠️ Básico    | Compras de inventario                                                      |
| `Categorias.jsx`        | ✅ Funcional | CRUD categorías                                                            |
| `Clientes.jsx`          | ✅ Funcional | CRUD clientes, direcciones, timeline, segmentación                         |
| `Delivery.jsx`          | ✅ Funcional | Panel de repartidores, asignación, tracking en vivo                        |
| `KDS.jsx`               | ✅ Funcional | Kitchen Display System - pedidos en preparación                            |
| `Mesas.jsx`             | ✅ Funcional | Reservas, pedidos por mesa, precuenta, mover/fusionar                      |
| `Caja.jsx`              | ✅ Funcional | Apertura/cierre, movimientos, resumen                                      |
| `Usuarios.jsx`          | ✅ Funcional | CRUD usuarios, roles                                                       |
| `Reportes.jsx`          | ✅ Funcional | Reportes varios con gráficos                                               |
| `MarketingDigital.jsx`  | ⚠️ Parcial   | Campañas, promos, calendario, publicador Facebook                          |
| `Configuracion.jsx`     | ✅ Funcional | Config general con tabs por sección                                        |
| `Cupones.jsx`           | ✅ Funcional | CRUD cupones                                                               |
| `Fidelizacion.jsx`      | ✅ Funcional | Config, niveles, puntos, sellos                                            |
| `Auditoria.jsx`         | ✅ Funcional | Eventos de auditoría                                                       |
| `Cuenta.jsx`            | ✅ Funcional | Perfil de usuario                                                          |
| `Personal.jsx`          | ✅ Funcional | CRUD personal, asistencia, liquidaciones, objetivos                        |
| `PersonalClock.jsx`     | ✅ Funcional | Reloj de fichaje público para personal                                     |
| `SeguimientoPedido.jsx` | ✅ Funcional | Tracking público de pedido con mapa                                        |
| `RiderPanel.jsx`        | ✅ Funcional | Panel del repartidor (pedidos, ubicación, entrega)                         |
| `Operacion.jsx`         | ✅ Funcional | Turnos, menú del día, cierre automático                                    |

### 3.2 Componentes compartidos

| Componente                          | Qué hace                                      |
| ----------------------------------- | --------------------------------------------- |
| `Layout.jsx`                        | Layout con sidebar moderno                    |
| `Sidebar.jsx` / `SidebarModern.jsx` | Navegación lateral con permisos               |
| `PrivateRoute.jsx`                  | Guard de rutas por permisos + módulos activos |
| `AppErrorBoundary.jsx`              | Error boundary global                         |
| `AppConfigWarning.jsx`              | Alerta si faltan configs críticas             |
| `GlobalOrderAlerts.jsx`             | Alertas de pedidos nuevos                     |
| `LiveTrackingMap.jsx`               | Mapa de tracking en vivo                      |
| `RiderRouteMap.jsx`                 | Ruta del repartidor                           |
| `ActionDialog.jsx`                  | Diálogo de acciones genérico                  |

### 3.3 Design System (`client/src/design-system/`)

Badge, Button, Card, DarkModeToggle, EmptyState, Input, LoadingScreen, PageHeader, PageTransition, Skeleton, Tooltip, tokens.js

### 3.4 Hooks

| Hook                        | Qué hace                          |
| --------------------------- | --------------------------------- |
| `useAuthenticatedSocket.js` | Socket.IO con auth automático     |
| `useDarkMode.js`            | Toggle dark mode con localStorage |

### 3.5 Librerías cliente (`client/src/lib/`)

| Archivo                | Qué hace                                      |
| ---------------------- | --------------------------------------------- |
| `api.js`               | Axios instance con interceptor 401 → redirect |
| `socket.js`            | Socket.IO client                              |
| `runtime.js`           | API_BASE_URL dinámico                         |
| `paymentStatus.js`     | Helpers de estado de pago                     |
| `pedidoForm.js`        | Builders de payload de pedido                 |
| `permissions.js`       | RBAC en cliente                               |
| `publicUrls.js`        | URLs públicas                                 |
| `webPublicaHelpers.js` | Helpers de la web pública                     |

---

## 4. BASE DE DATOS (SQLite + better-sqlite3)

### 4.1 Tablas principales (42+ tablas)

| Tabla                        | Propósito                                            |
| ---------------------------- | ---------------------------------------------------- |
| `usuarios`                   | Usuarios del sistema (admin, caja, cocina, delivery) |
| `configuracion`              | Key-value store de configuración                     |
| `categorias`                 | Categorías de productos                              |
| `productos`                  | Productos con variantes, extras, stock               |
| `clientes`                   | Clientes con fidelización, niveles, sellos           |
| `cliente_direcciones`        | Direcciones múltiples por cliente                    |
| `pedidos`                    | Pedidos con estado, pago, delivery, tracking         |
| `pedido_items`               | Items de pedido (normalizado, no JSON)               |
| `repartidores`               | Repartidores con ubicación, PIN, zona                |
| `inventario_insumos`         | Insumos con stock, rubro, unidad                     |
| `inventario_recetas`         | Recetas de productos (insumos por condición)         |
| `inventario_movimientos`     | Movimientos de stock                                 |
| `inventario_compras`         | Compras de insumos                                   |
| `inventario_compra_items`    | Items de compra                                      |
| `cierres_caja`               | Aperturas y cierres de caja                          |
| `caja_movimientos`           | Movimientos manuales de caja                         |
| `personal`                   | Empleados con rol, turno, sueldo                     |
| `personal_asistencia`        | Fichajes de asistencia                               |
| `personal_liquidaciones`     | Liquidaciones de sueldo                              |
| `personal_movimientos`       | Adelantos, descuentos, consumos                      |
| `personal_objetivos`         | Objetivos por turno                                  |
| `personal_reconocimientos`   | Puntos de reconocimiento                             |
| `personal_categorias`        | Categorías de personal (carrera)                     |
| `personal_carrera_historial` | Historial de cambios de categoría                    |
| `personal_direcciones`       | Direcciones del personal                             |
| `cupones`                    | Cupones de descuento                                 |
| `cupones_usados`             | Usos de cupones por cliente                          |
| `marketing_promos`           | Promociones de marketing                             |
| `marketing_campanas`         | Campañas de marketing                                |
| `marketing_contenidos`       | Contenidos para redes                                |
| `marketing_calendario`       | Calendario de publicaciones                          |
| `marketing_atribuciones`     | Atribución de ventas a campañas                      |
| `marketing_publicador_*`     | Publicador automático (Facebook)                     |
| `fidelizacion_config`        | Config del club de fidelidad                         |
| `puntos_transacciones`       | Transacciones de puntos                              |
| `fidelizacion_niveles`       | Niveles de fidelización                              |
| `cliente_niveles_historial`  | Historial de cambios de nivel                        |
| `carritos_abandonados`       | Carritos abandonados                                 |
| `mesa_reservas`              | Reservas de mesas                                    |
| `impresiones`                | Jobs de impresión                                    |
| `whatsapp_*`                 | Conversaciones, mensajes, pedidos borrador           |
| `mercadopago_eventos`        | Log de eventos MP                                    |
| `auditoria_eventos`          | Log de auditoría                                     |
| `crm_campanas_historial`     | Historial de campañas CRM                            |
| `repartidor_ubicaciones_log` | Log GPS de repartidores                              |
| `notificaciones_envios`      | Notificaciones de entrega                            |
| `menu_dia_historial`         | Historial de menú del día                            |

### 4.2 Índices

**Índices definidos:** 35+ índices incluyendo:

- `idx_pedidos_fecha`, `idx_pedidos_estado`, `idx_pedidos_cliente`
- `idx_pedido_items_pedido`, `idx_pedido_items_producto`
- `idx_caja_mov_cierre`
- `idx_cupones_codigo`, `idx_cupones_activo`
- `idx_puntos_cliente`, `idx_puntos_expiracion`
- `idx_repartidor_ubicaciones_rep`, `idx_repartidor_ubicaciones_pedido`
- `idx_marketing_campanas_tracking_slug` (UNIQUE)
- `idx_clientes_codigo_tarjeta` (UNIQUE)
- `idx_repartidores_personal_id` (UNIQUE)
- `idx_whatsapp_mensajes_message_id` (UNIQUE parcial)

### 4.3 Migraciones dinámicas

El archivo `migrations.js` maneja:

- **60+ columnas** agregadas dinámicamente (ALTER TABLE ADD COLUMN)
- Backfill de códigos de tarjeta fidelización
- Backfill de menú del día
- Normalización de `disponible_para_venta`
- Normalización de turnos del personal
- Normalización de estados de pago
- Backfill de `pedido_items` desde JSON
- Migración de direcciones legacy a `cliente_direcciones`
- Migración de columnas REAL → INTEGER (cents) para dinero
- Eliminación de configs obsoletas (AI, WhatsApp bot)

---

## 5. CONFIGURACIÓN

### 5.1 Variables de entorno (`server/.env.example`)

```
PORT=3001
NODE_ENV=production
JWT_SECRET=cambia-esta-clave-larga-y-segura
INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=admin@tudominio.com
INITIAL_ADMIN_PASSWORD=cambia-esta-clave-inicial
CORS_ORIGINS=...
PUBLIC_APP_URL=https://tu-dominio.com
PUBLIC_API_URL=https://tu-dominio.com
DATA_DIR=/data
UPLOADS_DIR=/data/uploads
BACKUPS_DIR=/data/backups
DB_FILE=/data/modosabor.db
```

### 5.2 Configuración en DB (`configuracion`)

Más de 50 claves configurables:

- `negocio_nombre`, `negocio_direccion`, `negocio_telefono`
- `public_app_url`, `public_api_url`
- `modulo_*_activo` (TPV, KDS, Delivery, Mesas, Inventario, etc.)
- `delivery_zonas`, `costo_envio_base`, `tiempo_delivery`
- `mercadopago_token`
- `impresion_*` (copias, formato, área)
- `turnos_negocio` (JSON de turnos operativos)
- `crm_*` (mensajes, cupones, días de inactividad)
- `rider_app_*` (configuración del panel de riders)

### 5.3 Frontend

- **Vite** con proxy a `localhost:3001`
- **Tailwind CSS 3.4** con custom tokens
- **Code splitting** por vendor (charts, date-utils, react-vendor, app-vendor)
- **Service Workers** separados para admin (`sw-admin.js`) y rider (`sw-rider.js`)

---

## 6. FUNCIONALIDADES IMPLEMENTADAS

### 6.1 ✅ Completas y funcionales

| Funcionalidad            | Descripción                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TPV (Punto de Venta)** | Catálogo, carrito, variantes, extras, cliente, múltiples métodos de pago, pedidos estacionados                                                                            |
| **Pedidos**              | CRUD completo, máquina de estados, impresión de tickets/comandas, tracking                                                                                                |
| **Delivery**             | Zonas con keywords, costos, tiempos. Asignación automática/manual de repartidores. Tracking GPS en vivo. PIN de entrega. Foto de entrega. Notificación "llegando" (<150m) |
| **Caja**                 | Apertura/cierre por turno, movimientos manuales, resumen detallado, ticket de cierre                                                                                      |
| **KDS**                  | Kitchen Display System con estados de preparación                                                                                                                         |
| **Mesas**                | Reservas, pedidos por mesa, precuenta, mover mesa, fusionar mesas, dividir pedido                                                                                         |
| **Productos**            | CRUD, variantes, extras, imágenes, stock directo/recipe                                                                                                                   |
| **Inventario**           | Insumos, movimientos, recetas por categoría (pizzas, empanadas, milanesas, hamburguesas, papas), ajustes automáticos por venta                                            |
| **Clientes**             | CRUD, múltiples direcciones, segmentación (VIP/riesgo/perdido), timeline, campañas CRM                                                                                    |
| **Fidelización**         | Puntos por compra, sellos, niveles (Bronce/Plata/Oro/Platino), canjes, club público, tarjeta fidelidad                                                                    |
| **Cupones**              | Descuento porcentaje/fijo, límites de uso, mínimo de compra, validación por cliente                                                                                       |
| **Personal**             | CRUD, asistencia, liquidaciones, adelantos, descuentos, objetivos, reconocimientos, carrera                                                                               |
| **Marketing**            | Promos, campañas, calendario, atribución de ventas, publicador Facebook (Playwright)                                                                                      |
| **MercadoPago**          | Checkout, webhook, sync de pagos, preference                                                                                                                              |
| **Web Pública**          | Menú completo, carrito, checkout, geolocalización, cupones, tracking público                                                                                              |
| **Auditoría**            | Log de eventos por módulo, actor, entidad                                                                                                                                 |
| **Backups**              | Backups automáticos de SQLite                                                                                                                                             |
| **Seguridad**            | JWT en httpOnly cookie, CORS, Helmet CSP, rate limiting, sanitización de inputs, RBAC                                                                                     |

### 6.2 ⚠️ Funcionan pero necesitan mejora

| Funcionalidad                       | Problema                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Marketing / Publicador Facebook** | Usa Playwright con perfiles de Chrome. Puede ser frágil ante cambios de Facebook. Campañas automáticas desactivadas (410) |
| **WhatsApp**                        | Tablas existen pero el bot AI fue removido. Solo queda estructura legacy                                                  |
| **Geocodificación**                 | Usa servicio externo (probablemente Nominatim). Sin fallback si falla                                                     |
| **Service Workers**                 | Separados para admin y rider, pero puede haber conflictos de scope en desarrollo                                          |

### 6.3 ❌ Rotos o incompletos

| Funcionalidad                  | Problema                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| **Campañas automáticas**       | Endpoints devuelven 410 "removidas del sistema"                 |
| **Notificaciones automáticas** | Endpoints devuelven 410 "removidas del sistema"                 |
| **WhatsApp bot AI**            | Configs obsoletas eliminadas en migración. Tablas quedan vacías |
| **Menú del día**               | Tabla existe pero la UI de gestión es básica                    |
| **Carritos abandonados**       | Tabla existe pero no hay lógica de recuperación activa          |

---

## 7. PROBLEMAS DE SEGURIDAD

### 7.1 🔴 Críticos

| Problema                                      | Severidad  | Detalle                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JWT_SECRET en .env.example**                | 🔴 CRÍTICO | El ejemplo muestra `JWT_SECRET=cambia-esta-clave-larga-y-segura`. Si alguien copia sin cambiar, es trivial                                                                                                                                                  |
| **Contraseña inicial en .env.example**        | 🔴 CRÍTICO | `INITIAL_ADMIN_PASSWORD=cambia-esta-clave-inicial` - mismo riesgo                                                                                                                                                                                           |
| **Sanitización HTML escapa todo**             | 🔴 CRÍTICO | El middleware `sanitize.js` escapa `<`, `>`, `&`, `"` en TODOS los strings del body. Esto rompe URLs, JSONs, y cualquier contenido que necesite esos caracteres. Solo se salvan `/api/configuracion/bulk` y webhook MP                                      |
| **No hay prepared statements en todos lados** | 🔴 CRÍTICO | Algunas queries usan interpolación de strings (ej: `WHERE id IN (${placeholders})`) pero los placeholders son seguros. Sin embargo, hay lugares con concatenación directa como en `migrations.js` `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}` |
| **bcryptjs con 10 rounds**                    | 🟡 MEDIO   | Es aceptable pero lento. Considerar 12+ para producción                                                                                                                                                                                                     |

### 7.2 🟡 Medios

| Problema                                              | Severidad | Detalle                                                                                                    |
| ----------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| **Rate limiter en memoria**                           | 🟡 MEDIO  | Se pierde al reiniciar el servidor. No funciona en cluster/multi-instancia                                 |
| **Tracking tokens en memoria**                        | 🟡 MEDIO  | Se pierden al reiniciar, aunque hay fallback a DB                                                          |
| **No hay validación de archivo subido por tipo real** | 🟡 MEDIO  | Multer valida por extensión y MIME type, pero no hace análisis de contenido real                           |
| **CORS permite múltiples orígenes dinámicos**         | 🟡 MEDIO  | `buildAllowedOrigins()` concatena muchas variables de env. Si alguna está comprometida, CORS queda abierto |
| **No hay rate limiting en login por usuario**         | 🟡 MEDIO  | Solo hay rate limiting por IP (`loginRateLimit`)                                                           |
| **Cookie auth_token sin SameSite strict**             | 🟡 MEDIO  | Usa `sameSite: 'none'` en producción (para cross-origin). Con `secure: true` es aceptable pero riesgoso    |
| **No hay 2FA**                                        | 🟡 MEDIO  | Sistema de autenticación simple, sin MFA                                                                   |

### 7.3 🟢 Leves

| Problema                                   | Detalle                                                        |
| ------------------------------------------ | -------------------------------------------------------------- |
| **Logs de errores con stack trace en dev** | Correcto, pero asegurar que en prod no se filtre               |
| **Información de DB en health check**      | El endpoint `/api/health` expone si MP está configurado y URLs |

---

## 8. PROBLEMAS DE PERFORMANCE

### 8.1 🔴 Críticos

| Problema                                           | Severidad  | Detalle                                                                                                                                                                                         |
| -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recálculo de stats de clientes en cada request** | 🔴 CRÍTICO | `clientes.js` llama `recalculateAllClientes(db)` en `GET /` y `GET /segmentos`. Esto hace un `GROUP BY` completo sobre pedidos en CADA request. Con muchos clientes/pedidos, esto es N+1 masivo |
| **Migrations.js ejecuta en cada inicio**           | 🔴 CRÍTICO | Las migraciones corren en cada startup. El backfill de `pedido_items` con `limit: 20000` puede tardar segundos                                                                                  |
| **Queries sin índice compuesto**                   | 🔴 CRÍTICO | `pedidos` tiene índices por `creado_en` y `estado` separados, pero faltan índices compuestos como `(estado, creado_en)` para queries frecuentes de "pedidos activos"                            |
| **No hay paginación en algunos endpoints**         | 🔴 CRÍTICO | `GET /api/pedidos` tiene paginación, pero `GET /api/pedidos/activos` no. Si hay miles de pedidos activos, esto es un problema                                                                   |
| **Socket.IO emite a todos los autenticados**       | 🔴 CRÍTICO | `emitNuevoPedido` emite a la room `authenticated` completa. Con muchos clientes conectados, esto es un broadcast masivo                                                                         |

### 8.2 🟡 Medios

| Problema                                           | Detalle                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **SQLite en modo WAL**                             | ✅ Bien para concurrencia de lectura, pero escrituras siguen siendo serializadas                        |
| **No hay caché de configuración**                  | `getConfigMap()` lee de DB en cada llamada. Debería cachearse                                           |
| **Decoración de productos con inventario**         | `decorateProductsWithInventory` ejecuta queries por producto (N+1 potencial)                            |
| **Rate limiter Map sin límite de memoria**         | `hits.size > 10000` limpia, pero puede crecer rápido bajo ataque                                        |
| **Geocodificación síncrona en creación de pedido** | `buildPedidoPayload` hace `await geocodeClienteDireccion()` bloqueando la creación del pedido           |
| **Búsqueda de clientes por teléfono**              | `findClienteByPhone` trae TODOS los clientes y hace `.find()` en JS. Sin índice de teléfono normalizado |

### 8.3 🟢 Leves

| Problema                                 | Detalle                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| **JSON parse en cada lectura de pedido** | `items` se guarda como JSON string. Se parsea en cada `hydratePedido` |
| **Normalización de teléfono en JS**      | Debería hacerse en DB con índice                                      |

---

## 9. PROBLEMAS DE UX/UI

### 9.1 🔴 Críticos

| Problema                                           | Severidad  | Detalle                                                                                                                                         |
| -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sanitización HTML rompe contenido**              | 🔴 CRÍTICO | El middleware escapa `"` en TODOS los strings, incluyendo URLs, JSONs, descripciones. Esto hace que el frontend reciba `&quot;` en lugar de `"` |
| **No hay manejo de errores de red en Web Pública** | 🔴 CRÍTICO | Si el backend está caído, la web pública muestra error genérico sin retry automático                                                            |
| **Lazy loading sin prefetch**                      | 🟡 MEDIO   | Las páginas se cargan bajo demanda. La primera navegación puede ser lenta                                                                       |

### 9.2 🟡 Medios

| Problema                                             | Detalle                                                 |
| ---------------------------------------------------- | ------------------------------------------------------- |
| **No hay skeleton screens en todas las páginas**     | Solo algunas usan el componente Skeleton                |
| **Formularios sin validación visual en tiempo real** | La validación es solo al submit                         |
| **No hay indicador de carga en acciones de socket**  | Las actualizaciones por Socket.IO no muestran loading   |
| **Dark mode toggle no persiste bien**                | Puede haber flash de light mode en carga                |
| **Service Worker scope puede conflictuar**           | Admin y rider usan SW diferentes pero comparten dominio |
| **No hay offline mode**                              | PWA básica sin cache de datos                           |

### 9.3 🟢 Leves

| Problema                                           | Detalle                                                 |
| -------------------------------------------------- | ------------------------------------------------------- |
| **Toasts de 3 segundos pueden ser cortos**         | Para errores importantes, deberían durar más            |
| **No hay animaciones de transición entre páginas** | PageTransition existe pero no se usa en todas las rutas |
| **Iconos de Lucide pesan ~300KB**                  | Considerar tree-shaking más agresivo                    |

---

## 10. TABLA RESUMEN DE ESTADO

| Funcionalidad                  | Estado | Notas                            |
| ------------------------------ | ------ | -------------------------------- |
| **Autenticación JWT + RBAC**   | ✅     | Cookie httpOnly, roles, permisos |
| **TPV (Punto de Venta)**       | ✅     | Completo con estacionamiento     |
| **Pedidos + Estados**          | ✅     | State machine con permisos       |
| **Delivery + Zonas**           | ✅     | Keywords, costos, tiempos        |
| **Repartidores + GPS**         | ✅     | Tracking en vivo, PIN, foto      |
| **Caja (Apertura/Cierre)**     | ✅     | Por turno, resumen detallado     |
| **KDS**                        | ✅     | Kitchen display                  |
| **Mesas + Reservas**           | ✅     | Mover, fusionar, dividir         |
| **Productos + Variantess**     | ✅     | Stock directo/recipe             |
| **Inventario + Recetas**       | ✅     | Sync por categoría               |
| **Clientes + Direcciones**     | ✅     | Múltiples direcciones            |
| **Fidelización + Niveles**     | ✅     | Puntos, sellos, club público     |
| **Cupones**                    | ✅     | Validación completa              |
| **Personal + Asistencia**      | ✅     | Liquidaciones, objetivos         |
| **Marketing + Campañas**       | ⚠️     | Publicador Facebook frágil       |
| **MercadoPago**                | ✅     | Checkout, webhook, sync          |
| **Web Pública**                | ✅     | Menú, carrito, checkout          |
| **Tracking de pedidos**        | ✅     | Público con token                |
| **Panel de Rider**             | ✅     | Pedidos, ubicación, entrega      |
| **Reloj de fichaje**           | ✅     | Público para personal            |
| **Auditoría**                  | ✅     | Log completo                     |
| **Backups automáticos**        | ✅     | SQLite                           |
| **Impresiones**                | ✅     | Tickets, comandas, precuentas    |
| **WhatsApp Bot**               | ❌     | Removido del sistema             |
| **Campañas automáticas**       | ❌     | Devuelven 410                    |
| **Notificaciones automáticas** | ❌     | Devuelven 410                    |
| **Carritos abandonados**       | ⚠️     | Tabla existe, sin lógica activa  |
| **Menú del día**               | ⚠️     | Tabla existe, UI básica          |
| **Seguridad general**          | ⚠️     | Ver sección 7                    |
| **Performance queries**        | ⚠️     | Ver sección 8                    |
| **UX/UI**                      | ⚠️     | Ver sección 9                    |

---

## 11. RESUMEN EJECUTIVO

### Fortalezas

- **Arquitectura sólida**: Express + SQLite (WAL) + Socket.IO, bien estructurado
- **Feature-rich**: TPV, Delivery, KDS, Caja, Inventario, Fidelización, Personal, Marketing — todo integrado
- **Seguridad consciente**: JWT, CORS, Helmet, rate limiting, sanitización, RBAC
- **Real-time**: Socket.IO con rooms seguras, tracking de pedidos en vivo
- **Mobile-first**: Web pública responsive, panel de rider optimizado
- **Migrations robustas**: Manejo elegante de evolución de schema

### Debilidades críticas

1. **Sanitización HTML agresiva** rompe datos válidos (URLs, JSONs)
2. **Recálculo de stats en cada request** de clientes es un cuello de botella
3. **Migrations en cada startup** con backfill pesado puede causar downtime
4. **JWT_SECRET por defecto** en .env.example es un riesgo de seguridad
5. **Rate limiter en memoria** no escala ni persiste
6. **Queries N+1** en decoración de productos y búsqueda de clientes

### Recomendaciones prioritarias

1. **Arreglar sanitización**: Escapar HTML solo en salida a frontend, no en entrada a API
2. **Cachear stats de clientes**: Recalcular con cron/job, no en cada request
3. **Optimizar migrations**: Marcar versión de schema, no re-ejecutar backfills
4. **Cambiar JWT_SECRET**: Forzar longitud mínima en startup
5. **Agregar índices compuestos**: `(estado, creado_en)` en pedidos, `(telefono_normalizado)` en clientes
6. **Implementar Redis**: Para rate limiting, tracking tokens, y cache de config
7. **Agregar paginación**: A todos los endpoints que listan sin límite
8. **Revisar Playwright**: El publicador de Facebook es frágil, considerar API oficial

---

_Fin del informe de auditoría_
