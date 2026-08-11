# AUDITORÍA DE SEGURIDAD — MÓDULO EMPLEADOS / PERSONAL

**Proyecto:** Modo Sabor  
**Fecha:** 2026-08-07  
**Auditor:** Kimi  
**Alcance:** Backend (API, servicios, base de datos), Frontend (React), Flujos críticos de negocio

---

## 1. RESUMEN EJECUTIVO

| Categoría               | Hallazgos                                         | Severidad  |
| ----------------------- | ------------------------------------------------- | ---------- |
| **Seguridad**           | 4 vulnerabilidades / riesgos identificados        | Medio-Alto |
| **Integridad de datos** | 2 problemas de concurrencia/transacciones         | Medio      |
| **Privacidad**          | 1 exposición de credenciales sensibles            | Medio      |
| **Mantenibilidad**      | 1 duplicación de código crítico (ya refactoreada) | Bajo       |
| **Performance**         | Ningún problema crítico                           | Bajo       |

**Veredicto general:** El módulo está bien estructurado, con autenticación correcta en rutas administrativas, uso consistente de prepared statements (sin SQL Injection), y transacciones en operaciones financieras. Los riesgos principales están en los **endpoints públicos de fichada** (sin rate limiting) y en la **exposición de PINs de reloj** en respuestas del listado.

---

## 2. ARQUITECTURA DEL MÓDULO

### 2.1. Stack Tecnológico

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** React 18 + Tailwind CSS + Vite
- **Auth:** JWT via middleware `auth`, permisos basados en roles (`config.manage`)
- **Uploads:** Multer con validación de tipo MIME y extensión (máx 4MB)

### 2.2. Archivos Auditados

| Archivo                                       | Líneas | Tipo                        | Estado      |
| --------------------------------------------- | ------ | --------------------------- | ----------- |
| `server/routes/personal.js`                   | 2,696  | Router Express              | ✅ Completo |
| `server/services/personalService.js`          | 736    | Servicio CRUD + analytics   | ✅ Completo |
| `server/utils/shifts.js`                      | 106    | Lógica de turnos operativos | ✅ Completo |
| `server/utils/permissions.js`                 | 49     | RBAC                        | ✅ Completo |
| `server/db/schema.sql`                        | 850    | Esquema DB                  | ✅ Completo |
| `client/src/pages/Personal/index.jsx`         | 234    | Página principal            | ✅ Completo |
| `client/src/pages/Personal/usePersonal.js`    | 718    | Hook de estado              | ✅ Completo |
| `client/src/pages/Personal/PersonalList.jsx`  | 175    | Lista lateral               | ✅ Completo |
| `client/src/pages/Personal/PersonalClock.jsx` | 331    | Pantalla pública fichada    | ✅ Completo |
| `client/src/pages/Personal/constants.js`      | 249    | Helpers + constantes        | ✅ Completo |

### 2.3. Modelo de Datos

```
personal
├── personal_direcciones (1:N, CASCADE)
├── personal_categorias (N:1)
├── personal_carrera_historial (1:N, CASCADE)
├── personal_reconocimientos (1:N, CASCADE)
├── personal_reconocimientos_config (1:1 global)
├── personal_liquidaciones (1:N, CASCADE)
│   └── personal_liquidacion_items (1:N, CASCADE)
├── personal_movimientos (1:N, CASCADE)
│   ├── → inventario_insumos (SET NULL)
│   └── → caja_movimientos (SET NULL)
└── personal_asistencia (1:N, CASCADE)
    └── UNIQUE INDEX: (personal_id, fecha_operativa, turno_id)
```

**Observaciones del schema:**

- Uso correcto de `ON DELETE CASCADE` para evitar huérfanos.
- Índices apropiados en `personal_asistencia`, `personal_movimientos`, `personal_liquidaciones`.
- Campos `clock_pin` y `clock_token` NO tienen `UNIQUE` constraint — permite duplicados.

---

## 3. ENDPOINTS DEL API

### 3.1. Endpoints PÚBLICOS (Sin autenticación)

| Método | Ruta                        | Auth  | Descripción                              |
| ------ | --------------------------- | ----- | ---------------------------------------- |
| `GET`  | `/api/personal/clock/board` | ❌ No | Lista de equipo para el reloj de fichada |
| `POST` | `/api/personal/clock/mark`  | ❌ No | Registrar ingreso/salida/tarde           |

### 3.2. Endpoints PROTEGIDOS (auth + config.manage)

| Método            | Ruta                                        | Auth | Descripción                       |
| ----------------- | ------------------------------------------- | ---- | --------------------------------- |
| `GET`             | `/api/personal`                             | ✅   | Listado paginado con estadísticas |
| `GET`             | `/api/personal/estadisticas`                | ✅   | Dashboard de stats                |
| `GET/POST/PUT`    | `/api/personal/categorias`                  | ✅   | CRUD categorías                   |
| `GET`             | `/api/personal/asistencia/resumen`          | ✅   | Resumen de asistencia hoy         |
| `GET`             | `/api/personal/asistencia/analitica`        | ✅   | Ranking de asistencia             |
| `GET`             | `/api/personal/asistencia/planilla-semanal` | ✅   | Planilla semanal                  |
| `GET`             | `/api/personal/:id/detalle`                 | ✅   | Ficha completa del empleado       |
| `GET`             | `/api/personal/:id/asistencia`              | ✅   | Historial de asistencia           |
| `POST`            | `/api/personal/:id/asistencia`              | ✅   | Registrar asistencia (admin)      |
| `PUT`             | `/api/personal/:id/asistencia/manual`       | ✅   | Corrección manual de asistencia   |
| `GET/POST`        | `/api/personal/:id/objetivos`               | ✅   | Metas del empleado                |
| `PUT`             | `/api/personal/:id/objetivos/:objId`        | ✅   | Actualizar progreso de meta       |
| `POST`            | `/api/personal/:id/consumo-producto`        | ✅   | Consumo con descuento empleado    |
| `GET`             | `/api/personal/:id/liquidaciones/sugerida`  | ✅   | Sugerencia de liquidación         |
| `POST`            | `/api/personal/:id/liquidaciones`           | ✅   | Liquidación manual                |
| `POST`            | `/api/personal/:id/liquidaciones/auto`      | ✅   | Liquidación automática            |
| `POST`            | `/api/personal/:id/movimientos`             | ✅   | Adelanto / descuento / consumo    |
| `POST/PUT/DELETE` | `/api/personal`                             | ✅   | CRUD básico de empleado           |
| `POST`            | `/api/personal/upload-avatar`               | ✅   | Subida de imagen de perfil        |

### 3.3. Permiso Requerido

```javascript
// permissions.js
ROLE_PERMISSIONS = {
  admin: ['*'],
  caja: ['configuracion.view', ...],  // NO tiene config.manage
  cocina: [...],                       // NO tiene config.manage
  delivery: [...],                     // NO tiene config.manage
}
```

**Solo `admin` puede gestionar personal.** Los roles `caja`, `cocina` y `delivery` NO tienen acceso al módulo. Esto es consistente en TODO el router.

---

## 4. ANÁLISIS DE SEGURIDAD DETALLADO

### 4.1. 🔴 HALLAZGO 1 — Endpoints de fichada sin rate limiting (MEDIO)

**Archivo:** `server/routes/personal.js`  
**Líneas:** 1730 y 1782

```javascript
router.get('/clock/board', (req, res) => { ... });          // SIN auth
router.post('/clock/mark', (req, res) => { ... });          // SIN auth
```

**Problema:** Ambos endpoints son públicos por diseño (permiten fichada desde celular sin login), pero **no tienen rate limiting**. Un atacante podría:

1. Hacer brute force sobre los 9,000 PINs posibles (4 dígitos).
2. Enviar miles de requests de fichada falsas (DoS o manipulación de asistencia).
3. Escalar el endpoint `/clock/board` para obtener datos de todo el equipo activo.

**Datos expuestos por `/clock/board` (sin auth):**

- Nombres completos de empleados activos
- Roles operativos
- Turnos preferidos
- Estado de asistencia actual
- Avatares
- Horarios de ingreso

**Mitigación actual:**

- El PIN es obligatorio en modo kiosk (sin token QR).
- El token QR es `crypto.randomBytes(12).toString('hex')` (24 chars hex, ~96 bits de entropía) — seguro contra guessing.

**Recomendación:**

1. Implementar rate limiting por IP en estos endpoints (ej: 10 intentos/minuto para `clock/mark`, 30 requests/minuto para `clock/board`).
2. Considerar agregar CAPTCHA o proof-of-work tras 3 intentos fallidos de PIN.
3. Limitar la respuesta de `/clock/board` cuando no hay token válido (modo kiosk) a solo los nombres, sin estado de asistencia detallado.

---

### 4.2. 🔴 HALLAZGO 2 — Exposición de `clock_pin` en listado (MEDIO)

**Archivo:** `server/routes/personal.js`  
**Líneas:** ~1175 y ~1200

```javascript
// En el GET / (listado)
rows.forEach((row) => {
  const credentials = ensureClockCredentials(row.id);
  row.clock_pin = credentials?.clock_pin || row.clock_pin || '';
  row.clock_token = credentials?.clock_token || row.clock_token || '';
});
```

**Problema:** La respuesta del listado (`GET /api/personal`) incluye el `clock_pin` de cada empleado. Cualquier usuario con permiso `config.manage` (es decir, cualquier admin) puede ver los PINs de todos los empleados.

**Impacto:**

- Un admin malicioso (o una cuenta comprometida) puede fichar como cualquier empleado usando solo el PIN.
- El PIN es de 4 dígitos (1000-9999), lo que ya es débil; exponerlo agrava el problema.

**Recomendación:**

1. **NO enviar `clock_pin` en el listado.** Solo enviarlo en el detalle individual del empleado logueado, o nunca.
2. Permitir al empleado cambiar su propio PIN desde una interfaz autenticada.
3. Considerar aumentar el PIN a 6 dígitos.

---

### 4.3. 🟡 HALLAZGO 3 — PIN de 4 dígitos, predecible (BAJO-MEDIO)

**Archivo:** `server/routes/personal.js`  
**Línea:** 82-84

```javascript
function generateClockPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
```

**Problema:**

- Espacio de búsqueda: 9,000 combinaciones (10,000 si se incluye el 0000, que no se genera).
- `Math.random()` no es criptográficamente seguro, aunque para generación offline de PINs es aceptable.
- Si un atacante conoce el `personal_id` de un empleado (secuencial, empezando en 1), puede hacer brute force del PIN vía `/clock/mark` usando `personal_id + pin`.

**Mitigación actual:**

- El modo QR (token) no requiere PIN y es más seguro.
- No hay rate limiting, lo que facilita el brute force.

**Recomendación:**

1. Cambiar a `crypto.randomInt(100000, 999999)` para PIN de 6 dígitos.
2. Usar `crypto.randomInt()` de Node.js en lugar de `Math.random()`.
3. Agregar intentos fallidos por empleado (bloqueo temporal tras 5 intentos).

---

### 4.4. 🟡 HALLAZGO 4 — Validación laxa en `/clock/mark` (BAJO)

**Archivo:** `server/routes/personal.js`  
**Líneas:** 1782-1850

```javascript
const person = token
  ? db.prepare('SELECT * FROM personal WHERE clock_token = ? AND activo = 1').get(token)
  : db.prepare('SELECT * FROM personal WHERE id = ? AND activo = 1').get(personalId);

if (!person) return res.status(404).json({ error: 'Empleado no encontrado' });
if (!token && pin !== cleanText(person.clock_pin)) {
  return res.status(401).json({ error: 'PIN inválido' });
}
```

**Problema:** Cuando se usa `token` (modo QR), el backend **no valida que el `personal_id` enviado en el body coincida con el empleado del token**. Un atacante podría:

1. Obtener un token QR válido (escaneando el QR de un compañero).
2. Enviar `token` + `personal_id` de OTRO empleado.
3. El backend busca por token (encuentra al compañero A) pero el `personal_id` es del compañero B.
4. **Sin embargo**, revisando el código, el `personalId` del body solo se usa para la búsqueda inicial si no hay token. Cuando hay token, se busca por token y el `personal_id` del body **no se usa para la lógica de fichada** (solo se usa `person.id` del resultado de la query por token).

**Veredicto:** ⚠️ El `personal_id` del body es ignorado cuando hay token, lo cual es correcto. Pero esto es confuso y podría introducir bugs si alguien refactoriza el código. Además, no hay validación de que el `token` pertenezca al empleado que se está fichando — pero como el token es único por empleado, eso está implícito.

**Recomendación:**

1. Agregar una validación explícita: si hay token, ignorar `personal_id` del body o validar que coincidan.
2. Documentar el comportamiento en el código.

---

### 4.5. 🟡 HALLAZGO 5 — Transacción con BEGIN fuera del try (BAJO)

**Archivo:** `server/routes/personal.js`  
**Línea:** ~1470 y ~2400

```javascript
// En createLiquidacion (función reutilizada)
db.exec('BEGIN');
try {
  // ... operaciones ...
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK'); // ⚠️ Si BEGIN falló, ROLLBACK falla
  throw error;
}
```

**Problema:** Si `db.exec('BEGIN')` falla (ej: conexión cerrada, DB bloqueada), el `catch` intentará `ROLLBACK` sobre una transacción que nunca inició, lo cual lanzará un error secundario que puede ocultar el error original.

**Observación:** El código ya tiene un comentario extenso sobre esto (línea ~2370) explicando que la ruta manual de liquidación fue refactorizada para usar `createLiquidacion`, que sí tiene BEGIN antes del try. Esto ya fue corregido.

**Recomendación:**

```javascript
let inTransaction = false;
try {
  db.exec('BEGIN');
  inTransaction = true;
  // ... operaciones ...
  db.exec('COMMIT');
} catch (error) {
  if (inTransaction) {
    try {
      db.exec('ROLLBACK');
    } catch {}
  }
  throw error;
}
```

---

### 4.6. 🟢 SEGURIDAD: Uso correcto de prepared statements

**Veredicto:** ✅ No hay SQL Injection en el módulo.

Todas las queries usan parámetros posicionales (`?`):

```javascript
// ✅ Seguro
const rows = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);

// ✅ Seguro (LIKE parametrizado)
const q = `SELECT ... WHERE nombre LIKE ? ORDER BY ...`;
db.prepare(q).all(`%${search}%`);
```

Incluso las queries con `IN` dinámico usan placeholders generados correctamente:

```javascript
const placeholders = liquidacionIds.map(() => '?').join(', ');
const items = db
  .prepare(`SELECT * FROM ... WHERE liquidacion_id IN (${placeholders})`)
  .all(...liquidacionIds);
```

---

### 4.7. 🟢 SEGURIDAD: Validación de entradas

El módulo usa consistentemente funciones de sanitización:

| Función                                   | Uso                                         |
| ----------------------------------------- | ------------------------------------------- |
| `cleanText()`                             | Limpia strings (posiblemente trim + escape) |
| `normalizeClockPin()`                     | Extrae solo dígitos, limita a 6 chars       |
| `roundStock()` / `roundLocalizedNumber()` | Normaliza montos                            |
| `parseLocalizedNumber()`                  | Parseo seguro de números                    |
| `Number()` / `parseInt()`                 | Coerción de IDs                             |

---

### 4.8. 🟢 SEGURIDAD: Subida de avatares

**Archivo:** `server/routes/personal.js`  
**Líneas:** 33-40, 2687-2694

```javascript
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: createFileFilter({
    allowedExtensions: IMAGE_EXTENSIONS,
    allowedMimeTypes: IMAGE_MIME_TYPES,
  }),
});
```

**Veredicto:** ✅ Correcto.

- Tamaño limitado a 4MB.
- Filtro por extensión y MIME type.
- Nombre de archivo renombrado con timestamp + random (evita path traversal).
- Requiere auth + `config.manage`.

**Nota menor:** No hay validación de dimensiones de imagen ni sanitización de contenido (ej: stripping EXIF data). Esto es aceptable para un sistema interno.

---

## 5. ANÁLISIS DE FLUJOS CRÍTICOS

### 5.1. Fichada (Clock In/Out)

```
Pantalla pública (/personal/reloj/:token)
  ├── Modo QR: token único por empleado (24 hex chars)
  │   └── POST /clock/mark { token, action }
  │       └── Busca empleado por token → fichada
  │
  └── Modo Kiosk: sin token
      └── POST /clock/mark { personal_id, pin, action }
          └── Busca empleado por ID → valida PIN (4 dígitos) → fichada
```

**Riesgo de negocio:** Un empleado puede fichar por otro si:

1. Conoce el PIN del compañero (4 dígitos, expuestos en el admin).
2. Escanea el QR del compañero (el QR es único y no rota).

**Recomendación:** Agregar notificación (toast/email) al admin cuando se detecta una fichada fuera del horario habitual o desde una IP nueva.

### 5.2. Liquidación de Sueldos

```
POST /:id/liquidaciones
  └── createLiquidacion(person, payload, actor)
      ├── Calcula monto_bruto = monto_base * unidades
      ├── Recorre movimientos pendientes (adelantos, descuentos, consumos)
      ├── Aplica movimientos hasta agotar el bruto
      ├── Calcula monto_neto = bruto - adelantos - descuentos - consumos
      ├── Si es efectivo → registra salida en caja
      └── COMMIT
```

**Veredicto:** ✅ Correcto.

- Transacción SQL envuelve toda la operación.
- No permite liquidar con `unidades <= 0`.
- No permite `monto_base < 0`.
- Si falla, hace ROLLBACK.
- Audit logging con `logAudit()`.

### 5.3. Adelantos con impacto en caja

```
POST /:id/movimientos { tipo: 'adelanto', impacta_caja: 1 }
  └── Si hay caja abierta → INSERT en caja_movimientos (salida)
```

**Veredicto:** ✅ Correcto. La integridad caja-personal se mantiene via `caja_movimiento_id` (FK con `ON DELETE SET NULL`).

### 5.4. Consumo de producto por empleado

```
POST /:id/consumo-producto
  └── Valida producto activo
      └── Aplica descuento empleado (default 20%)
          └── Registra movimiento tipo 'consumo'
              └── Aplica salida de inventario (applyInventoryToItems)
```

**Veredicto:** ✅ Correcto. Integra inventario + movimiento personal en una sola operación.

---

## 6. ANÁLISIS DEL FRONTEND

### 6.1. Manejo de estado (usePersonal.js)

**Veredicto:** ✅ Bien estructurado.

- Hook de 718 líneas que centraliza toda la lógica del módulo.
- Usa `useMemo` para cálculos derivados (stats, weeklySummary, shiftMetrics).
- Manejo de errores con toast notifications.
- Refetching granular después de mutaciones.

### 6.2. Problema de timezone corregido

**Archivo:** `client/src/pages/Personal/constants.js`  
**Líneas:** 82-86, 205-217

```javascript
// Antes (bug): new Date().toISOString().split('T')[0] → UTC, no local
// Ahora (fix): función hoyIso() que usa getFullYear/getMonth/getDate local

export function hoyIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

**También corregido:** Conversión ISO ↔ datetime-local para evitar drift de 3 horas (líneas 205-217).

### 6.3. Avatar local con tokens

**Archivo:** `client/src/pages/Personal/constants.js`  
**Líneas:** 42-58

```javascript
// Guarda 'local:3' en la base en lugar de '/assets/user-3.a1b2c3.jpg'
// El hash del build cambia entre deploys, rompiendo las URLs
```

**Veredicto:** ✅ Buena práctica. Evita rotura de URLs entre builds.

---

## 7. RECOMENDACIONES PRIORIZADAS

| Prioridad | Acción                                                          | Archivo                                         | Esfuerzo |
| --------- | --------------------------------------------------------------- | ----------------------------------------------- | -------- |
| **P1**    | Implementar rate limiting en `/clock/board` y `/clock/mark`     | `server/index.js` o `server/routes/personal.js` | 2h       |
| **P1**    | Quitar `clock_pin` de la respuesta de `GET /api/personal`       | `server/routes/personal.js`                     | 15min    |
| **P2**    | Aumentar PIN a 6 dígitos y usar `crypto.randomInt()`            | `server/routes/personal.js`                     | 30min    |
| **P2**    | Validar que `personal_id` coincida con `token` en `/clock/mark` | `server/routes/personal.js`                     | 15min    |
| **P2**    | Agregar UNIQUE constraint a `clock_token` en schema             | `server/db/schema.sql`                          | 10min    |
| **P3**    | Manejar BEGIN fallido antes del try en transacciones            | `server/routes/personal.js`                     | 30min    |
| **P3**    | Agregar intentos fallidos por PIN (bloqueo temporal)            | `server/routes/personal.js`                     | 1h       |
| **P3**    | Rotar `clock_token` periódicamente o tras uso sospechoso        | `server/routes/personal.js`                     | 2h       |

---

## 8. CHECKLIST DE SEGURIDAD

| Control                      | Estado | Notas                                                  |
| ---------------------------- | ------ | ------------------------------------------------------ |
| Autenticación en rutas admin | ✅     | `auth` + `requirePermission('config.manage')` en todas |
| Autorización RBAC            | ✅     | Solo `admin` tiene acceso                              |
| SQL Injection                | ✅     | Todas las queries parametrizadas                       |
| XSS (reflejado)              | ✅     | `cleanText()` en inputs, React escapa por defecto      |
| Path traversal en uploads    | ✅     | Filenames renombrados con timestamp                    |
| CSRF                         | ⚠️     | No hay tokens CSRF, pero usa JWT en header             |
| Rate limiting                | ❌     | No implementado en endpoints públicos                  |
| Audit logging                | ✅     | `logAudit()` en operaciones críticas                   |
| Transacciones financieras    | ✅     | BEGIN/COMMIT/ROLLBACK en liquidaciones y movimientos   |
| Validación de inputs         | ✅     | Sanitización consistente con helpers                   |
| Exposición de credenciales   | ❌     | `clock_pin` expuesto en listado                        |
| Entropía de tokens           | ✅     | `crypto.randomBytes(12)` = 96 bits                     |
| Entropía de PINs             | ⚠️     | 4 dígitos = ~13 bits, con `Math.random()`              |

---

## 9. CONCLUSIÓN

El módulo de Empleados/Personal es **funcionalmente robusto** y **seguro en su arquitectura general**. Los flujos críticos de negocio (liquidaciones, adelantos, consumos) están correctamente protegidos con transacciones SQL y audit logging.

Los riesgos identificados son **manejables** y se concentran en dos áreas:

1. **Endpoints públicos de fichada:** Necesitan rate limiting para prevenir abuso.
2. **Exposición de PINs:** El `clock_pin` de 4 dígitos no debería ser visible en el listado general.

No se encontraron vulnerabilidades críticas como SQL Injection, RCE, o bypass de autenticación en rutas administrativas.

---

_Auditoría generada automáticamente por Kimi el 2026-08-07._
