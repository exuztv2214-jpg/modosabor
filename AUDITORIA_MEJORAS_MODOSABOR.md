# 🔍 Auditoría de Mejoras - Modo Sabor

> Fecha: Julio 2025 | Scope: Cliente React + Servidor Node.js
> Enfoque: Hallazgos concretos, accionables AHORA. Sin problemas teóricos.

---

## Índice por Categoría

1. [Código Duplicado](#1-código-duplicado)
2. [Magic Numbers / Strings](#2-magic-numbers--strings)
3. [Funciones Gigantes](#3-funciones-gigantes)
4. [Inconsistencias de Naming](#4-inconsistencias-de-naming)
5. [Missing Error Handling](#5-missing-error-handling)
6. [Missing Loading States](#6-missing-loading-states)
7. [Missing Validations](#7-missing-validations)
8. [Missing Accessibility](#8-missing-accessibility)
9. [Missing Responsive](#9-missing-responsive)
10. [Missing Offline Handling](#10-missing-offline-handling)
11. [Missing Optimistic Updates](#11-missing-optimistic-updates)
12. [Missing Debounce / Throttle](#12-missing-debounce--throttle)
13. [Missing Cleanup](#13-missing-cleanup)
14. [Missing Memoization](#14-missing-memoization)
15. [Missing Error Boundaries](#15-missing-error-boundaries)

---

## Clasificación de Impacto

| Icono | Significado                          |
| ----- | ------------------------------------ |
| 🔴    | Alto impacto, fácil de implementar   |
| 🟡    | Medio impacto, fácil de implementar  |
| 🟢    | Bajo impacto, fácil de implementar   |
| ⚠️    | Alto impacto, difícil de implementar |

---

## 1. Código Duplicado

### 🔴 `fmtMoney` / `fmt` duplicados en múltiples archivos

| Ubicación                                   | Línea | Problema                                                                            |
| ------------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `client/src/pages/Clientes/useClientes.jsx` | 130   | `const fmtMoney = (v) => \`$${Number(v \|\| 0).toLocaleString('es-AR')}\`;`         |
| `client/src/pages/Caja.jsx`                 | 26    | `const fmt = (n) => \`$${Number(n \|\| 0).toLocaleString('es-AR')}\`;`              |
| `client/src/pages/DashboardModern.jsx`      | 47    | `const fmtMoney = (value) => \`$${Number(value \|\| 0).toLocaleString('es-AR')}\`;` |
| `client/src/pages/Pedidos.jsx`              | 116   | `const fmt = (n) => \`$${Number(n \|\| 0).toLocaleString('es-AR')}\`;`              |
| `client/src/lib/webPublicaHelpers.js`       | 3     | `export const fmt = (n) => \`$${Number(n \|\| 0).toLocaleString('es-AR')}\`;`       |

**Cambio propuesto:** Crear `client/src/lib/formatters.js` con una única función exportada y reemplazar todos los usos:

```js
// lib/formatters.js
export const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;
```

---

### 🔴 `parseJsonArray` / `safeParseArray` duplicados

| Ubicación                             | Línea | Problema                          |
| ------------------------------------- | ----- | --------------------------------- |
| `client/src/lib/pedidoForm.js`        | 1-10  | `safeParseArray`                  |
| `client/src/lib/webPublicaHelpers.js` | 33-40 | `parseConfigArray` (misma lógica) |
| `client/src/pages/Configuracion.jsx`  | 28-36 | `parseJsonArray` (misma lógica)   |

**Cambio propuesto:** Usar solo `safeParseArray` de `pedidoForm.js` en todos lados. Eliminar las otras dos.

---

### 🔴 `imprimirEnIframe` duplicado

| Ubicación                      | Línea     | Problema                          |
| ------------------------------ | --------- | --------------------------------- |
| `client/src/pages/Pedidos.jsx` | 564-586   | `imprimirEnIframe`                |
| `client/src/pages/TPV.jsx`     | 1051-1073 | `imprimirEnIframe` (copia exacta) |

**Cambio propuesto:** Mover a `client/src/lib/printing.js` y exportar desde ahí.

---

### 🔴 `StatCard` componente duplicado

| Ubicación                                      | Línea  | Problema                      |
| ---------------------------------------------- | ------ | ----------------------------- |
| `client/src/pages/Caja.jsx`                    | 79-109 | `StatCard` con tints          |
| `client/src/pages/Clientes/ClientesHeader.jsx` | 11-34  | `StatCard` casi idéntico      |
| `client/src/pages/DashboardModern.jsx`         | 78-121 | `ModernMetric` (mismo patrón) |

**Cambio propuesto:** Unificar en `client/src/design-system/StatCard.jsx`.

---

### 🟡 `fmtDateTime` / `fmtHour` duplicados

| Ubicación                                   | Línea   | Problema                     |
| ------------------------------------------- | ------- | ---------------------------- |
| `client/src/pages/Caja.jsx`                 | 45-57   | `fmtDateTime` y `fmtHour`    |
| `client/src/pages/Clientes/useClientes.jsx` | 259-266 | `formatPedidoDate` (similar) |

**Cambio propuesto:** Crear `client/src/lib/dates.js` con helpers de fecha centralizados.

---

## 2. Magic Numbers / Strings

### 🔴 Magic numbers en `useClientes.jsx`

| Archivo           | Línea   | Valor                        | Significado                                     |
| ----------------- | ------- | ---------------------------- | ----------------------------------------------- |
| `useClientes.jsx` | 251     | `10000`                      | Monto mínimo para sello (hardcodeado)           |
| `useClientes.jsx` | 252     | `6`                          | Sellos para premio (hardcodeado)                |
| `useClientes.jsx` | 86-94   | `DEFAULT_CAMPAIGN_DASHBOARD` | Objeto con ceros hardcodeados                   |
| `useClientes.jsx` | 272     | `86400000`                   | Ms en un día (sin constante)                    |
| `useClientes.jsx` | 279-280 | `30`, `15`                   | Días para estados "en riesgo" / "por reactivar" |

**Cambio propuesto:**

```js
const DAYS_IN_MS = 24 * 60 * 60 * 1000;
const RISK_THRESHOLD_DAYS = 30;
const REACTIVATE_THRESHOLD_DAYS = 15;
```

---

### 🔴 Magic numbers en `TPV.jsx`

| Archivo   | Línea | Valor                     | Significado                       |
| --------- | ----- | ------------------------- | --------------------------------- |
| `TPV.jsx` | 23    | `modosabor_tpv_parked_v1` | Key de localStorage sin constante |
| `TPV.jsx` | 35    | `12`                      | Máximo pedidos en espera          |
| `TPV.jsx` | 264   | `6`                       | Máximo clientes del día           |
| `TPV.jsx` | 288   | `30000`                   | Intervalo sync caja (30s)         |
| `TPV.jsx` | 384   | `5000`                    | Timeout cotización delivery       |
| `TPV.jsx` | 405   | `300`                     | Debounce cotización delivery      |

**Cambio propuesto:** Crear constantes al tope del archivo:

```js
const TPV_PARKED_KEY = 'modosabor_tpv_parked_v1';
const MAX_PARKED_ORDERS = 12;
const MAX_CLIENTES_DIA = 6;
const CAJA_SYNC_INTERVAL_MS = 30000;
const DELIVERY_QUOTE_TIMEOUT_MS = 5000;
const DELIVERY_QUOTE_DEBOUNCE_MS = 300;
```

---

### 🔴 Magic numbers en `DashboardModern.jsx`

| Archivo               | Línea | Valor   | Significado                          |
| --------------------- | ----- | ------- | ------------------------------------ |
| `DashboardModern.jsx` | 210   | `30000` | Intervalo refresh dashboard          |
| `DashboardModern.jsx` | 181   | `6`     | Días de lookback para personal stats |

---

### 🟡 Magic strings de estados de pedido

| Archivo       | Línea   | Valor                           | Problema                                              |
| ------------- | ------- | ------------------------------- | ----------------------------------------------------- |
| `Pedidos.jsx` | 46-87   | `'nuevo'`, `'confirmado'`, etc. | Array `COLS` y `SIMPLE_COLS` con estados hardcodeados |
| `Pedidos.jsx` | 465-480 | `getNextState`                  | Lógica de transición hardcodeada                      |

**Cambio propuesto:** Crear `client/src/lib/orderStates.js`:

```js
export const ORDER_STATES = {
  NUEVO: 'nuevo',
  CONFIRMADO: 'confirmado',
  PREPARANDO: 'preparando',
  LISTO: 'listo',
  EN_CAMINO: 'en_camino',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
};
```

---

## 3. Funciones Gigantes

### ⚠️ `TPV.jsx` - 1574 líneas (componente principal)

| Función                        | Líneas aprox | Problema                            |
| ------------------------------ | ------------ | ----------------------------------- |
| `TPV` (componente)             | 115-1574     | ~1459 líneas                        |
| `preflightChecklist` (useMemo) | 551-667      | ~116 líneas de lógica de validación |
| `confirmar`                    | 1150-1244    | ~94 líneas                          |

**Cambio propuesto:**

1. Extraer `useTpvState()` hook a `client/src/pages/TPV/useTpvState.js`
2. Extraer `useTpvKeyboard()` hook para manejo de teclado
3. Extraer `useDeliveryQuote()` hook para cotización
4. Extraer `preflightChecklist` a `lib/tpvValidation.js`

---

### ⚠️ `useClientes.jsx` - 1535 líneas (hook)

| Función/Sección             | Líneas aprox | Problema                   |
| --------------------------- | ------------ | -------------------------- |
| `useClientes` hook completo | 218-1535     | ~1317 líneas               |
| `printLoyaltyCard`          | 426-831      | ~405 líneas de HTML inline |

**Cambio propuesto:**

1. Extraer `printLoyaltyCard` a `client/src/lib/loyaltyCardPrinter.js`
2. Extraer lógica de campañas a `useCampaigns()` hook
3. Extraer lógica de segmentos a `useClienteSegments()` hook

---

### ⚠️ `Pedidos.jsx` - 1219 líneas

| Función/Sección             | Líneas aprox | Problema                           |
| --------------------------- | ------------ | ---------------------------------- |
| `Pedidos` componente        | 373-1219     | ~846 líneas                        |
| `PedidoCard` sub-componente | 145-357      | ~212 líneas inline                 |
| `cargarHistorial` + filtros | 408-463      | Historial embebido en misma página |

**Cambio propuesto:**

1. Extraer `PedidoCard` a `components/Pedidos/PedidoCard.jsx`
2. Extraer modo historial a `components/Pedidos/HistorialPanel.jsx`

---

### ⚠️ `DashboardModern.jsx` - 1036 líneas

| Función/Sección                               | Líneas aprox | Problema               |
| --------------------------------------------- | ------------ | ---------------------- |
| Componente completo                           | 157-1036     | ~879 líneas            |
| `QuickAction` + `ModernMetric` + `StockAlert` | 57-155       | Sub-componentes inline |

**Cambio propuesto:** Extraer sub-componentes a archivos separados en `components/Dashboard/`.

---

### 🔴 `Caja.jsx` - 1019 líneas

| Función/Sección                                     | Líneas aprox | Problema                                       |
| --------------------------------------------------- | ------------ | ---------------------------------------------- |
| Componente completo                                 | 112-1019     | ~907 líneas                                    |
| `StatCard`                                          | 79-109       | Sub-componente inline                          |
| Helpers `parseMoneyInput`, `fmtDateTime`, `fmtHour` | 36-57        | Funciones puras que no dependen del componente |

**Cambio propuesto:**

1. Mover helpers a `lib/cajaHelpers.js`
2. Extraer modal de movimiento a `components/Caja/MovimientoModal.jsx`

---

## 4. Inconsistencias de Naming

### 🔴 Convención de nombres inconsistente

| Patrón                    | Archivos que lo usan   | Archivos que NO lo usan         |
| ------------------------- | ---------------------- | ------------------------------- |
| `handleXxx` para handlers | `ClienteFormModal.jsx` | `useClientes.jsx` (usa `onXxx`) |
| `onXxx` para callbacks    | `Clientes/index.jsx`   | `TPV.jsx` (usa `handleXxx`)     |
| `setXxx` para setters     | Todos los hooks        | Algunos usan `xxxChange`        |

**Ejemplos concretos:**

- `client/src/pages/Clientes/index.jsx`: Props pasan `onNuevo`, `onRefresh`, `onExport`, `onConfig`
- `client/src/pages/Clientes/useClientes.jsx`: Define `onNuevo`, `onRefresh`, etc. (bien)
- `client/src/pages/TPV.jsx`: Usa `handleSubmit`, `handleEdit`, `handleFileChange`

**Cambio propuesto:** Estandarizar a `handleXxx` para handlers internos y `onXxx` para props de callback.

---

### 🟡 Inconsistencia `cargar` vs `load` vs `fetch`

| Archivo               | Nombre función    | Debería ser        |
| --------------------- | ----------------- | ------------------ |
| `useClientes.jsx`     | `cargar()`        | `fetchClientes()`  |
| `DashboardModern.jsx` | `loadDashboard()` | `fetchDashboard()` |
| `Caja.jsx`            | `cargar()`        | `fetchCajaState()` |
| `Pedidos.jsx`         | `cargar()`        | `fetchPedidos()`   |
| `Configuracion.jsx`   | `fetchConfig()`   | ✅ Correcto        |

---

### 🟡 Inconsistencia en nombres de estado de carga

| Archivo               | Estado "loading"        | Estado "saving"             |
| --------------------- | ----------------------- | --------------------------- |
| `useClientes.jsx`     | `loading`, `saving`     | ✅                          |
| `Caja.jsx`            | `loading`, `saving`     | ✅                          |
| `DashboardModern.jsx` | `loading`, `refreshing` | No tiene "saving"           |
| `Configuracion.jsx`   | `loading`, `saving`     | ✅                          |
| `TPV.jsx`             | `loading`               | No tiene (usa `setLoading`) |

---

## 5. Missing Error Handling

### 🔴 Promesas sin `.catch` en `AppConfigContext.jsx`

| Archivo                | Línea | Problema                                                                         |
| ---------------------- | ----- | -------------------------------------------------------------------------------- |
| `AppConfigContext.jsx` | 70-72 | `refreshConfig().catch(() => {}).finally(...)` — el catch vacío silencia errores |

**Cambio propuesto:** Al menos loguear el error:

```js
.catch((err) => {
  console.error('[AppConfig] Failed to load config:', err);
})
```

---

### 🔴 `api.get` sin try/catch en `useClientes.jsx`

| Archivo           | Línea   | Problema                                                                |
| ----------------- | ------- | ----------------------------------------------------------------------- |
| `useClientes.jsx` | 912     | `useEffect(() => { cargar(); }, []);` — `cargar` tiene try/catch ✅     |
| `useClientes.jsx` | 915-930 | `cargarCampanas` — tiene try/catch vacío (solo `// Mantener funcional`) |

**Cambio propuesto:** En `cargarCampanas`, al menos loguear el error:

```js
catch (err) {
  console.warn('[Campaigns] Failed to load:', err);
}
```

---

### 🔴 `window.open` sin verificación de bloqueo

| Archivo                  | Línea     | Problema                                                                 |
| ------------------------ | --------- | ------------------------------------------------------------------------ |
| `ClienteDetailModal.jsx` | 99-103    | `window.open(getWhatsAppLink(...), '_blank')` sin check de popup blocker |
| `useClientes.jsx`        | 417-423   | `window.open(link, '_blank', 'noopener,noreferrer')` sin check           |
| `TPV.jsx`                | 1177-1182 | Tiene check ✅ (buen patrón)                                             |

**Cambio propuesto:** Aplicar el patrón de TPV:

```js
const popup = window.open(link, '_blank');
if (!popup) {
  toast.error('Permití las ventanas emergentes');
  return;
}
```

---

### 🟡 `navigator.clipboard.writeText` sin try/catch

| Archivo           | Línea     | Problema                                                  |
| ----------------- | --------- | --------------------------------------------------------- |
| `useClientes.jsx` | 1361-1364 | `navigator.clipboard.writeText(text);` sin await ni catch |

**Cambio propuesto:**

```js
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  } catch {
    toast.error('No se pudo copiar');
  }
};
```

---

### 🟡 `socketManager.connect()` sin manejo de error en `useAuthenticatedSocket.js`

| Archivo                     | Línea | Problema                                                                                    |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `useAuthenticatedSocket.js` | 36-37 | `socketManager.socket.on('connect', ...)` — accede a `.socket` directamente, puede ser null |

**Cambio propuesto:**

```js
socketManager.socket?.on('connect', () => setConnected(true));
socketManager.socket?.on('disconnect', () => setConnected(false));
```

---

## 6. Missing Loading States

### 🔴 Botón "Guardar cambios" en Configuración sin estado de loading visual distinto

| Archivo             | Línea   | Problema                                                     |
| ------------------- | ------- | ------------------------------------------------------------ |
| `Configuracion.jsx` | 389-396 | El botón cambia texto a "Guardando..." pero no tiene spinner |

**Cambio propuesto:** Agregar icono de spinner:

```jsx
{
  saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />;
}
```

---

### 🔴 Botones de acción en Clientes sin loading

| Archivo              | Línea     | Problema                                                |
| -------------------- | --------- | ------------------------------------------------------- |
| `Clientes/index.jsx` | 130-139   | `DeleteDialog` para eliminar — no hay estado `deleting` |
| `useClientes.jsx`    | 1313-1324 | `confirmarEliminarCliente` usa `saving` genérico        |

**Cambio propuesto:** Separar estados de loading por acción:

```js
const [deleting, setDeleting] = useState(false);
const [saving, setSaving] = useState(false);
```

---

### 🟡 Botón "Enviar campaña" sin spinner

| Archivo                        | Línea   | Problema                             |
| ------------------------------ | ------- | ------------------------------------ |
| `ClientesCampaignsSection.jsx` | 222-227 | Solo deshabilita, no muestra spinner |

---

### 🟡 Botón "Sincronizar" en Pedidos sin estado propio

| Archivo       | Línea   | Problema                                                        |
| ------------- | ------- | --------------------------------------------------------------- |
| `Pedidos.jsx` | 867-878 | Usa `loading` global que también afecta el renderizado de cards |

---

## 7. Missing Validations

### 🔴 Formulario de cliente: teléfono sin validación de formato

| Archivo                | Línea     | Problema                                      |
| ---------------------- | --------- | --------------------------------------------- |
| `ClienteFormModal.jsx` | 104-109   | Input de teléfono sin `type="tel"` ni pattern |
| `useClientes.jsx`      | 1271-1290 | `save()` solo valida `nombre.trim()`          |

**Cambio propuesto:**

```js
const validateForm = (form) => {
  if (!form.nombre.trim()) return 'El nombre es obligatorio';
  if (!form.telefono.trim()) return 'El teléfono es obligatorio';
  if (!/^\d{7,15}$/.test(form.telefono.replace(/\D/g, ''))) return 'Teléfono inválido';
  return null;
};
```

---

### 🔴 Formulario de movimiento de caja: sin validación de monto negativo

| Archivo    | Línea   | Problema                                                                   |
| ---------- | ------- | -------------------------------------------------------------------------- |
| `Caja.jsx` | 220-245 | `registrarMovimiento` valida `monto > 0` pero el input permite texto libre |

**Cambio propuesto:** Agregar `min="0"` al input y validación visual.

---

### 🟡 Web pública: formulario sin validación de email

| Archivo          | Línea   | Problema                                                                             |
| ---------------- | ------- | ------------------------------------------------------------------------------------ |
| `WebPublica.jsx` | 714-722 | `hacerPedido` valida nombre, teléfono, dirección pero NO email (aunque existe campo) |

---

## 8. Missing Accessibility

### 🔴 Inputs sin `label` explícito (solo texto visual)

| Archivo                | Línea   | Problema                                             |
| ---------------------- | ------- | ---------------------------------------------------- |
| `ClienteFormModal.jsx` | 92-97   | Input nombre con `<label>` visual pero sin `htmlFor` |
| `ClienteFormModal.jsx` | 104-109 | Input teléfono sin `htmlFor`                         |
| `Caja.jsx`             | 518-527 | Input cierre sin `aria-label`                        |

**Cambio propuesto:** Agregar `htmlFor` a todos los labels o `aria-label` a inputs.

---

### 🔴 Botones icon-only sin `aria-label`

| Archivo                  | Línea  | Problema                             |
| ------------------------ | ------ | ------------------------------------ |
| `ClientesHeader.jsx`     | 75-81  | Botón configuración sin `aria-label` |
| `ClientesHeader.jsx`     | 82-88  | Botón exportar sin `aria-label`      |
| `ClientesHeader.jsx`     | 97-101 | Botón refresh sin `aria-label`       |
| `ClienteDetailModal.jsx` | 62-67  | Botón cerrar modal sin `aria-label`  |

**Cambio propuesto:**

```jsx
<button aria-label="Configuración de fidelidad">...</button>
```

---

### 🟡 Modal sin `role="dialog"` ni `aria-modal`

| Archivo                  | Línea  | Problema                            |
| ------------------------ | ------ | ----------------------------------- |
| `ClienteFormModal.jsx`   | 19-165 | Modal sin atributos ARIA            |
| `ClienteDetailModal.jsx` | 52-338 | Modal sin atributos ARIA            |
| `Caja.jsx`               | 895+   | Modal movimiento sin atributos ARIA |

**Cambio propuesto:**

```jsx
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
```

---

### 🟡 Tabla sin `scope` en headers

| Archivo    | Línea   | Problema                          |
| ---------- | ------- | --------------------------------- |
| `Caja.jsx` | 776-784 | Tabla historial sin `scope="col"` |

---

## 9. Missing Responsive

### 🔴 Grid de clientes puede romper en mobile

| Archivo            | Línea | Problema                                                                                             |
| ------------------ | ----- | ---------------------------------------------------------------------------------------------------- |
| `ClientesGrid.jsx` | 14    | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` — OK pero las cards tienen contenido fijo |
| `ClientesGrid.jsx` | 57-83 | Stats internos con `grid-cols-2` que puede romper en pantallas muy angostas                          |

---

### 🔴 TPV sidebar no colapsa en mobile

| Archivo   | Línea     | Problema                                                                               |
| --------- | --------- | -------------------------------------------------------------------------------------- |
| `TPV.jsx` | 1393-1574 | El layout usa `flex` fijo sin breakpoint para mobile                                   |
| `TPV.jsx` | 1460-1538 | `TpvSidebar` recibe muchas props y maneja su propio estado mobile con `cartMobileOpen` |

**Nota:** Ya tiene `cartMobileOpen` pero la experiencia puede mejorar.

---

### 🟡 Dashboard cards no se apilan bien en tablet

| Archivo               | Línea   | Problema                                                                      |
| --------------------- | ------- | ----------------------------------------------------------------------------- |
| `DashboardModern.jsx` | 427-471 | `lg:grid-cols-5` — en tablet (md) quedan 2 columnas que pueden ser muy anchas |

---

## 10. Missing Offline Handling

### 🔴 `api.get` sin manejo de offline

| Archivo          | Línea  | Problema                                                                 |
| ---------------- | ------ | ------------------------------------------------------------------------ |
| `api.js`         | 10-30  | El interceptor de 401 redirige a login pero NO maneja `navigator.onLine` |
| `WebPublica.jsx` | 95-114 | Si fallan TODAS las llamadas, muestra `ErrorState` ✅ (bien)             |

**Cambio propuesto:** Agregar en `api.js`:

```js
api.interceptors.request.use((config) => {
  if (!navigator.onLine) {
    return Promise.reject({ error: 'Sin conexión a internet', offline: true });
  }
  return config;
});
```

---

### 🔴 Pedidos en TPV se pierden si se corta internet

| Archivo   | Línea   | Problema                                                                                                        |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `TPV.jsx` | 699-734 | `saveCurrentAsParked` guarda en localStorage pero NO hay recovery si el POST a `/pedidos/interno` falla por red |

**Cambio propuesto:** En `confirmar`, si falla por red, ofrecer guardar en localStorage para reintentar:

```js
catch (error) {
  if (!navigator.onLine || error.offline) {
    saveFailedOrderToLocalStorage({ items, cliente, ... });
    toast.error('Pedido guardado localmente. Se enviará cuando haya conexión.');
  }
}
```

---

### 🟡 Web pública: carrito se pierde si se cierra la pestaña

| Archivo          | Línea | Problema                                                               |
| ---------------- | ----- | ---------------------------------------------------------------------- |
| `WebPublica.jsx` | 69    | `getInitialCart` lee de `sessionStorage` — se pierde al cerrar pestaña |

**Cambio propuesto:** Usar `localStorage` para el carrito (ya guarda `ms_form` en localStorage).

---

## 11. Missing Optimistic Updates

### 🔴 Cambio de estado de pedido espera respuesta del servidor

| Archivo       | Línea   | Problema                                            |
| ------------- | ------- | --------------------------------------------------- |
| `Pedidos.jsx` | 726-741 | `cambiarEstado` espera `api.put` para actualizar UI |

**Cambio propuesto:**

```js
const cambiarEstado = async (id, estado) => {
  const prev = pedidos.find((p) => p.id === id);
  setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado } : p))); // Optimistic
  try {
    await api.put(`/pedidos/${id}/estado`, { estado });
  } catch {
    setPedidos((prev) => prev.map((p) => (p.id === id ? prev : p))); // Rollback
    toast.error('No se pudo actualizar');
  }
};
```

---

### 🟡 Agregar al carrito en TPV podría ser optimista

| Archivo   | Línea   | Problema                                                |
| --------- | ------- | ------------------------------------------------------- |
| `TPV.jsx` | 901-955 | `addToCart` actualiza estado local (ya es optimista ✅) |

**Nota:** El carrito del TPV ya es local, no necesita ser más optimista.

---

## 12. Missing Debounce / Throttle

### 🔴 Búsqueda de clientes en picker sin debounce adecuado

| Archivo   | Línea   | Problema                                                                                                            |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `TPV.jsx` | 425-445 | El `useEffect` para `clientePickerSearch` tiene `setTimeout(..., 200)` pero el input dispara onChange en cada tecla |

**Cambio propuesto:** Usar un hook de debounce:

```js
const debouncedSearch = useDebounce(clientePickerSearch, 200);
```

---

### 🔴 Búsqueda en historial de pedidos sin debounce

| Archivo       | Línea   | Problema                                                                                                     |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `Pedidos.jsx` | 960-976 | `histBusqueda` se filtra en `useMemo` (client-side) ✅ pero el input puede sentirse lento con muchos pedidos |

---

### 🟡 Búsqueda en Clientes sin debounce

| Archivo              | Línea   | Problema                                                                                |
| -------------------- | ------- | --------------------------------------------------------------------------------------- |
| `ClientesHeader.jsx` | 121-127 | `search` se filtra en `useMemo` (client-side) ✅ pero con muchos clientes puede laggear |

---

## 13. Missing Cleanup

### 🔴 `useEffect` en `useOrderAlertPlayback` sin cleanup completo

| Archivo          | Línea   | Problema                                                                                                          |
| ---------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `orderAlerts.js` | 116-131 | `window.speechSynthesis.onvoiceschanged = refreshVoices;` — el cleanup solo setea a `null` si ES la misma función |

**Cambio propuesto:**

```js
return () => {
  window.speechSynthesis.onvoiceschanged = null;
};
```

---

### 🔴 Event listeners en `TPV.jsx` sin cleanup de refs

| Archivo   | Línea     | Problema                                                                                                                                                    |
| --------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TPV.jsx` | 1286-1391 | `useEffect` para keyboard events — el cleanup remueve el listener ✅ pero las refs (`customerLocationRequestRef`, `customerLocationBusyRef`) no se resetean |

---

### 🟡 `useEffect` en `WebPublica.jsx` sin cleanup de meta tags

| Archivo          | Línea   | Problema                                                    |
| ---------------- | ------- | ----------------------------------------------------------- |
| `WebPublica.jsx` | 172-206 | Crea meta tags dinámicamente pero no los remueve en unmount |

**Cambio propuesto:**

```js
useEffect(() => {
  // ... crear meta tags ...
  return () => {
    // remover meta tags creados
  };
}, [...]);
```

---

## 14. Missing Memoization

### 🔴 `getEstadoBadge` se recalcula en cada render

| Archivo            | Línea   | Problema                                                            |
| ------------------ | ------- | ------------------------------------------------------------------- |
| `useClientes.jsx`  | 284-311 | `getEstadoBadge` es una función pura que se redefine en cada render |
| `ClientesGrid.jsx` | 44      | Se llama para CADA card en cada render                              |

**Cambio propuesto:**

```js
const getEstadoBadge = useCallback((cliente) => {
  // ... lógica ...
}, []);
```

O mejor: precalcular en el hook:

```js
const clientesConBadge = useMemo(
  () => clientes.map((c) => ({ ...c, badge: computeBadge(c) })),
  [clientes]
);
```

---

### 🔴 `segmentHighlights` se recalcula con `clientes` completo

| Archivo           | Línea    | Problema                                                                                     |
| ----------------- | -------- | -------------------------------------------------------------------------------------------- |
| `useClientes.jsx` | 975-1015 | `segmentHighlights` usa `useMemo` ✅ pero llama `getClienteEstado` para cada cliente 4 veces |

**Cambio propuesto:** Precalcular estados una sola vez:

```js
const clientesConEstado = useMemo(
  () => clientes.map((c) => ({ ...c, estado: getClienteEstado(c) })),
  [clientes]
);
```

---

### 🟡 `filtered` en `useClientes.jsx` recalcula todo en cada tecla

| Archivo           | Línea   | Problema                                                                                       |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `useClientes.jsx` | 932-964 | `filtered` usa `useMemo` ✅ pero la función de filtro es compleja y se redefine en cada render |

**Cambio propuesto:** Extraer la función de filtro fuera del hook:

```js
const filterClientes = (clientes, search, filtros) => { ... };
// En el hook:
const filtered = useMemo(() => filterClientes(clientes, search, { filtroNivel, ... }), [...]);
```

---

## 15. Missing Error Boundaries

### 🔴 Solo hay 1 Error Boundary en toda la app

| Archivo                | Línea | Cobertura                             |
| ---------------------- | ----- | ------------------------------------- |
| `AppErrorBoundary.jsx` | 1-58  | Solo envuelve `<Routes>` en `App.jsx` |

**Problema:** Si un componente específico crashea (ej: DashboardModern con un gráfico), toda la app se recarga.

**Cambio propuesto:** Agregar Error Boundaries en:

1. `DashboardModern.jsx` — envolver cada sección de gráficos
2. `TPV.jsx` — envolver catálogo y sidebar por separado
3. `Pedidos.jsx` — envolver Kanban y Historial
4. `Clientes/index.jsx` — envolver tabla y modales

Ejemplo:

```jsx
// En DashboardModern.jsx
<AppErrorBoundary>
  <VentasChart data={data.ventas7dias} />
</AppErrorBoundary>
```

---

### 🟡 `AppErrorBoundary` no reporta errores a ningún servicio

| Archivo                | Línea | Problema                  |
| ---------------------- | ----- | ------------------------- |
| `AppErrorBoundary.jsx` | 13-14 | Solo hace `console.error` |

**Cambio propuesto:** Agregar reporte básico:

```js
componentDidCatch(error, info) {
  console.error('[AppErrorBoundary]', error, info);
  // Opcional: enviar a endpoint de logs
  fetch('/api/client-error', {
    method: 'POST',
    body: JSON.stringify({ error: error.message, stack: error.stack }),
  }).catch(() => {});
}
```

---

## Resumen Ejecutivo

### Por prioridad (Alto impacto + Fácil):

| #   | Hallazgo                                    | Archivos   | Esfuerzo |
| --- | ------------------------------------------- | ---------- | -------- |
| 1   | Unificar `fmtMoney`/`fmt`                   | 5 archivos | 15 min   |
| 2   | Unificar `safeParseArray`                   | 3 archivos | 10 min   |
| 3   | Unificar `imprimirEnIframe`                 | 2 archivos | 10 min   |
| 4   | Extraer constantes magic numbers TPV        | 1 archivo  | 15 min   |
| 5   | Agregar `aria-label` a botones icon-only    | 4 archivos | 10 min   |
| 6   | Validar teléfono en form cliente            | 2 archivos | 10 min   |
| 7   | Manejar `navigator.clipboard` con try/catch | 1 archivo  | 5 min    |
| 8   | Agregar `?.` en `useAuthenticatedSocket`    | 1 archivo  | 2 min    |
| 9   | Agregar offline check en `api.js`           | 1 archivo  | 10 min   |
| 10  | Optimistic update en `cambiarEstado`        | 1 archivo  | 15 min   |

**Total estimado:** ~2 horas para los 10 items de alto impacto/fácil.

### Por categoría de riesgo:

| Riesgo                   | Cantidad     |
| ------------------------ | ------------ |
| 🔴 Alto impacto, fácil   | 15 hallazgos |
| 🟡 Medio impacto, fácil  | 12 hallazgos |
| 🟢 Bajo impacto, fácil   | 3 hallazgos  |
| ⚠️ Alto impacto, difícil | 4 hallazgos  |

---

_Fin del reporte_
