# Plan de Acción — Modo Sabor

> Auditoría técnica y de estética realizada el 26 de junio de 2026.
> Este documento ordena las mejoras, correcciones y agregados para llevar el sistema a un nivel profesional, priorizando la estética y la experiencia de usuario.

---

## 0. Filosofía de trabajo

- **Mínima interrupción operativa:** cada cambio grande debe poder desactivarse o revertirse rápido.
- **Estética primero, estabilidad siempre:** el pulido visual es prioritario, pero nunca a costa de romper funcionalidad.
- **De lo general a lo particular:** primero el design system, luego los módulos.
- **Medir antes de optimizar:** agregar métricas básicas antes de reemplazar SQLite o agregar caché.

---

## 1. Hito 1 — Fundamentos profesionales (Semanas 1-2)

### Objetivo

Dejar el proyecto en una base sólida para que cualquier cambio futuro sea seguro y predecible.

### Tareas

| #   | Tarea                                 | Archivos / áreas afectados                          | Criterio de éxito                                                                            |
| --- | ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1.1 | Crear `README.md` raíz                | `/README.md`                                        | Instalación, variables de entorno, comandos, arquitectura y deploy documentados.             |
| 1.2 | Configurar ESLint + Prettier + Husky  | `client/`, `server/`, `.husky/`                     | `npm run lint` y `npm run format` corren sin errores; pre-commit formatea.                   |
| 1.3 | Eliminar código muerto                | `client/src/pages/Dashboard.jsx`, imports huérfanos | Build pasa; no hay archivos sin usar.                                                        |
| 1.4 | Corregir dependencias del servidor    | `server/package.json`                               | `playwright-core` en devDependencies; `dotenv` versión corregida.                            |
| 1.5 | Reducir `console.log` en producción   | Todo `server/` y `client/src/`                      | Quedan logs estructurados o mensajes controlados; no se filtran errores técnicos al usuario. |
| 1.6 | Agregar Helmet y headers de seguridad | `server/index.js`                                   | Headers `X-Content-Type-Options`, `X-Frame-Options`, CSP básico, HSTS opcional.              |
| 1.7 | Rate limiting global                  | `server/index.js`, `server/utils/rateLimit.js`      | Protección contra abuso en endpoints públicos y privados.                                    |
| 1.8 | Health check y métricas mínimas       | `server/index.js`                                   | Endpoint `/api/health` enriquecido con uptime y versión.                                     |
| 1.9 | Validar build y verificaciones        | Todo                                                | `npm run build`, `npm run verify:core`, `npm run verify:operacion` pasan OK.                 |

### Entregable

Proyecto con base profesional: lint, formato, seguridad básica y documentación.

---

## 2. Hito 2 — Design System y estética coherente (Semanas 2-4)

### Objetivo

Unificar la interfaz, eliminar inconsistencias visuales y darle al sistema una identidad premium.

### Tareas

| #    | Tarea                                     | Archivos / áreas afectados                              | Criterio de éxito                                                               |
| ---- | ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2.1  | Definir tokens de diseño                  | `client/tailwind.config.js`, `client/src/index.css`     | Colores, sombras, radios, espaciados y tipografía como tokens semánticos.       |
| 2.2  | Crear componentes base del design system  | `client/src/design-system/`                             | Button, Input, Select, Modal, Card, Badge, EmptyState, Skeleton, Toast.         |
| 2.3  | Reemplazar colores hardcodeados           | Todo `client/src/`                                      | No queda `#5D87FF` ni colores sueltos; todo usa tokens.                         |
| 2.4  | Estandarizar copys y tono de voz          | Todo `client/src/pages/admin`                           | Un solo tono por módulo; sin mayúsculas encorsetadas abusivas; textos claros.   |
| 2.5  | Mejorar estados vacíos y loaders          | `client/src/pages/*`                                    | Skeletons en dashboard, tablas y listados; empty states ilustrados.             |
| 2.6  | Agregar micro-interacciones               | `client/src/main.jsx`, páginas                          | Transiciones de página con Framer Motion; hovers y feedback táctil.             |
| 2.7  | Modo oscuro para TPV/KDS                  | `client/src/pages/TPV.jsx`, `client/src/pages/KDS.jsx`  | Toggle interno que no afecte el resto del admin.                                |
| 2.8  | Breadcrumbs y títulos de página dinámicos | `client/src/components/Layout.jsx`, `client/index.html` | Cada ruta tiene breadcrumb y `<title>` descriptivo.                             |
| 2.9  | Tooltips y ayuda contextual               | Componentes con iconos solitarios                       | Todos los iconos de acción tienen `title` o tooltip.                            |
| 2.10 | Revisión de accesibilidad básica          | Todo el admin                                           | Contraste válido, `aria-label` en iconos, foco visible, modales con focus trap. |

### Entregable

Interfaz visualmente coherente, profesional y con mejor UX inmediata.

---

## 3. Hito 3 — Refactor frontend: dividir monolitos (Semanas 4-6)

### Objetivo

Reducir la deuda técnica de los archivos enormes para que el mantenimiento sea sostenible.

### Tareas

| #   | Tarea                         | Archivos / áreas afectados                                              | Criterio de éxito                                                                                                    |
| --- | ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Dividir `WebPublica.jsx`      | `client/src/pages/WebPublica.jsx` → `client/src/components/WebPublica/` | Componentes: Hero, TrustBands, CategoryGrid, ProductCard, ProductModal, CartDrawer, CheckoutForm, OrderConfirmation. |
| 3.2 | Dividir `DashboardModern.jsx` | `client/src/components/Dashboard/`                                      | Widgets reutilizables: MetricCard, QuickAction, StockAlert, SalesChart, PaymentChart, PersonalPulse.                 |
| 3.3 | Dividir `TPV.jsx`             | `client/src/components/TPV/` ya existe; completar                       | Lógica de catálogo, carrito, pagos y checkout separada.                                                              |
| 3.4 | Dividir `Pedidos.jsx`         | `client/src/components/Pedidos/`                                        | Filtros, tabla, detalle, timeline de estados, acciones.                                                              |
| 3.5 | Dividir `Productos.jsx`       | `client/src/components/Productos/`                                      | Formulario, lista, variantes, extras, imágenes.                                                                      |
| 3.6 | Crear hooks reutilizables     | `client/src/hooks/`                                                     | `useApi`, `useDebounce`, `useLocalStorage`, `useNotification`.                                                       |
| 3.7 | Centralizar constantes        | `client/src/lib/constants.js`                                           | Métodos de pago, estados de pedido, roles, métodos de envío.                                                         |

### Entregable

Frontend modularizado, más fácil de testear, revisar y escalar.

---

## 4. Hito 4 — Web pública premium (Semanas 5-7)

### Objetivo

Convertir la web pública en una vitrina de ventas que transmita confianza y calidad.

### Tareas

| #   | Tarea                         | Archivos / áreas afectados                                 | Criterio de éxito                                                                  |
| --- | ----------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 4.1 | Hero administrable            | `client/src/components/WebPublica/Hero.jsx`, configuración | 3-5 presets visuales seleccionables desde Configuración.                           |
| 4.2 | Bloques de confianza          | `client/src/components/WebPublica/TrustBands.jsx`          | "Por qué pedir acá", "Pedí en 3 pasos", reseñas/valoraciones.                      |
| 4.3 | Vitrina de promos y combos    | `client/src/components/WebPublica/PromosSection.jsx`       | Carrusel o grid de promociones destacadas.                                         |
| 4.4 | Galería de productos mejorada | `ProductCard`                                              | Placeholder con color de categoría; badges claros; imágenes WebP con lazy loading. |
| 4.5 | Checkout optimizado           | `CartDrawer`, `CheckoutForm`                               | Pasos claros, resumen visible, validación en tiempo real.                          |
| 4.6 | SEO y redes sociales          | `client/index.html`, web pública                           | Meta tags dinámicos, Open Graph, Schema.org Restaurant.                            |
| 4.7 | Responsive mobile-first       | `WebPublica`                                               | Excelente experiencia en celular; botones táctiles grandes.                        |
| 4.8 | Tema de colores por negocio   | Configuración → Web Pública                                | Color primario y acento personalizables.                                           |

### Entregable

Web pública que parece un producto SaaS de primer nivel.

---

## 5. Hito 5 — Backend robusto (Semanas 6-9)

### Objetivo

Mejorar la mantenibilidad, seguridad y escalabilidad del backend sin reescribirlo.

### Tareas

| #   | Tarea                                 | Archivos / áreas afectados                                | Criterio de éxito                                                      |
| --- | ------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| 5.1 | Migraciones SQL versionadas           | `server/migrations/`, reemplazar `ensureColumn`           | `db.js` solo crea conexión; esquema controlado por migraciones.        |
| 5.2 | Dividir `db.js`                       | `server/db.js`                                            | Conexión pura; tablas y seed en migraciones.                           |
| 5.3 | Validación de inputs con Zod          | `server/routes/*`                                         | Cada endpoint valida y sanitiza entradas.                              |
| 5.4 | Manejo de errores unificado           | `server/middleware/errorHandler.js`                       | Nunca se expone error técnico al cliente; errores logueados.           |
| 5.5 | Logger estructurado                   | `server/utils/logger.js`                                  | Reemplaza `console.log` por `pino` o similar; niveles info/warn/error. |
| 5.6 | Mover JWT a httpOnly cookies (futuro) | `server/routes/auth.js`, `client/src/lib/api.js`          | Evaluación de impacto; si se implementa, protege contra XSS.           |
| 5.7 | Paginación en listados                | `server/routes/pedidos.js`, `clientes.js`, `productos.js` | Todos los listados soportan `page` + `limit`.                          |
| 5.8 | Rate limiting por usuario             | `server/utils/rateLimit.js`                               | Límites diferenciados para anónimos, usuarios y admin.                 |
| 5.9 | Documentar API                        | `server/docs/openapi.yaml` o Swagger                      | Endpoints principales documentados.                                    |

### Entregable

Backend más seguro, predecible y fácil de mantener.

---

## 6. Hito 6 — Testing y calidad (Semanas 8-10)

### Objetivo

Garantizar que los cambios no rompan funcionalidad crítica.

### Tareas

| #   | Tarea                    | Archivos / áreas afectados     | Criterio de éxito                                                                                             |
| --- | ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 6.1 | Tests unitarios backend  | `server/**/*.test.js`          | Cubrir `utils/inventory.js`, `utils/paymentStatus.js`, `utils/permissions.js`, `utils/pedidoStateMachine.js`. |
| 6.2 | Tests de integración API | `server/tests/integration/`    | Auth, creación de pedido, cierre de caja, inventario.                                                         |
| 6.3 | Tests unitarios frontend | `client/src/**/*.test.jsx`     | Componentes del design system y hooks reutilizables.                                                          |
| 6.4 | Smoke tests ampliados    | `server/scripts/smoke-test.js` | Flujo completo: login → producto → pedido → caja.                                                             |
| 6.5 | Cobertura mínima         | `package.json` scripts         | 60% de cobertura en utils y design system.                                                                    |
| 6.6 | CI/CD con GitHub Actions | `.github/workflows/ci.yml`     | Lint, test y build en cada PR.                                                                                |
| 6.7 | Dependabot               | `.github/dependabot.yml`       | Actualizaciones automáticas de dependencias.                                                                  |

### Entregable

Pipeline de calidad que corre en cada cambio.

---

## 7. Hito 7 — Funcionalidades premium (Semanas 10-14)

### Objetivo

Agregar valor de producto que justifique un posicionamiento profesional/pago.

### Tareas

| #   | Tarea                             | Descripción                                                  | Criterio de éxito                                           |
| --- | --------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| 7.1 | Impresión automática por área     | `server/utils/printTemplates.js`, KDS                        | Comandas se encolan por área (cocina, caja, bar).           |
| 7.2 | Notificaciones push               | Service worker, backend                                      | Alertas de nuevos pedidos incluso con la app cerrada.       |
| 7.3 | Reservas de mesas                 | `server/routes/mesas.js`, `client/src/pages/Mesas.jsx`       | Calendario de reservas con confirmación.                    |
| 7.4 | Heatmap de delivery               | `client/src/pages/Delivery.jsx`, `server/routes/reportes.js` | Mapa de calor de demoras por zona/horario.                  |
| 7.5 | Campañas automáticas de WhatsApp  | `server/services/marketingService.js`                        | Recordatorios a clientes inactivos y cumpleaños.            |
| 7.6 | Modo offline TPV                  | `client/src/pages/TPV.jsx`, IndexedDB                        | Guardar ventas offline y sincronizar al recuperar conexión. |
| 7.7 | Dashboard de clima/estacionalidad | `client/src/pages/Reportes.jsx`                              | Predicción simple de demanda por día/hora.                  |
| 7.8 | Multi-sucursal (evaluación)       | Arquitectura                                                 | Documento de viabilidad; no implementar aún.                |

### Entregable

Producto con funcionalidades diferenciales claras.

---

## 8. Hito 8 — DevOps y monitoreo (Semanas 12-14)

### Objetivo

Tener deploys confiables y visibilidad de la salud del sistema en producción.

### Tareas

| #   | Tarea                 | Archivos / áreas afectados               | Criterio de éxito                          |
| --- | --------------------- | ---------------------------------------- | ------------------------------------------ |
| 8.1 | GitHub Actions deploy | `.github/workflows/deploy.yml`           | Deploy automático a Railway/Render/DonWeb. |
| 8.2 | Sentry o alternativa  | `client/src/main.jsx`, `server/index.js` | Errores en producción trackeados.          |
| 8.3 | Backup off-site       | `server/utils/backupManager.js`          | Backups automáticos a S3/Drive.            |
| 8.4 | Métricas de negocio   | `server/routes/reportes.js`              | KPIs operativos diarios/semanales.         |
| 8.5 | Alertas de salud      | Health check                             | Notificación si el health check falla.     |

### Entregable

Sistema productivo monitoreado y con deploy continuo.

---

## 9. Roadmap visual

```
Semana:  1  2  3  4  5  6  7  8  9  10 11 12 13 14
Hito 1   ████████
Hito 2      ████████████████
Hito 3         ████████████████
Hito 4            ████████████████
Hito 5               ████████████████████
Hito 6                  ████████████████████
Hito 7                     ████████████████████████
Hito 8                                    ████████████████
```

> Los hitos 2-5 pueden solaparse parcialmente. Los hitos 6-8 dependen de tener el código modularizado.

---

## 10. Checklist de validación final

Antes de dar por terminada cualquier fase:

- [ ] `npm run lint` pasa sin errores.
- [ ] `npm run build` genera el build correctamente.
- [ ] `npm run verify:core` pasa OK.
- [ ] `npm run verify:operacion` pasa OK.
- [ ] La web pública se ve bien en mobile y desktop.
- [ ] No quedan `console.log` de debug en código de producción.
- [ ] No se exponen errores técnicos al usuario final.
- [ ] El diff del PR es revisable (menos de 500 líneas si es posible).

---

## 11. Próximo paso recomendado

Empezar por el **Hito 1** (fundamentos) y luego saltar directo a las tareas de mayor impacto visual del **Hito 2**:

1. Configurar ESLint + Prettier.
2. Crear el design system base.
3. Reemplazar colores hardcodeados por tokens.
4. Mejorar skeletons y empty states.

Esto solo ya hará que el sistema se sienta mucho más pro sin tocar lógica de negocio.

---

_Documento generado automáticamente a partir de la auditoría del proyecto._
