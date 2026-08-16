# Auditoría: Modo Sabor contra Fudo

Agosto 2026. Investigación de Fudo con fuentes oficiales, auditoría del repo
verificando UI + endpoint + tabla antes de dar nada por hecho.

---

## 0. Qué cambió desde la primera auditoría

Re-auditado el 15/8/2026 contra la base y el código de hoy.

**Cerrado desde entonces**

|                                  | Estado                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| Propinas                         | ✅ hecho — columna, cobro, arqueo, reparto por mozo y ticket |
| Listas de precios                | ✅ hecho — pantalla propia, precio por canal                 |
| Arrastre táctil del menú del día | ✅ hecho — eventos de puntero, anda con el dedo              |
| Los 4 productos de prueba        | ✅ **borrados**: la carta bajó de 94 a 90 productos          |
| Duplicados viejos                | ✅ marcados `(duplicado)`                                    |
| Motor de IA unificado            | ✅ Codex — 12 pasos, con métricas y trazas                   |

**Correcciones a lo que dije antes**

- **Multisucursal:** puse "no existe". Es más matizado: **la tabla
  `sucursales` existe** con la sucursal principal cargada, pero **no hay ni una
  ruta ni una pantalla**. Es andamiaje, no funcionalidad. Sigue contando como
  🔴 pero el modelo de datos ya está pensado.
- **Offline:** puse "🟡 parcial". Es **🔴**. Verificado leyendo `sw-admin.js`:
  la línea 32 excluye `/api` del caché, y `api.js` rechaza al toque si
  `navigator.onLine` es falso. Sin internet la app abre y no hace nada.
- **Cierre parcial de venta:** decía "no verificado". **Verificado: no
  existe.** Los doce archivos que aparecían eran falsos positivos de "split"
  dentro de otras palabras.
- **Combos:** confirmado que no existen. La única coincidencia estaba en una
  descripción de `marketingService.js`.

**Huecos nuevos, que no había chequeado la primera vez**

| Función de Fudo              | Modo Sabor                | Verificación                                       |
| ---------------------------- | ------------------------- | -------------------------------------------------- |
| Reimprimir comanda           | ✅ existe                 | `POST /pedidos/:id/imprimir`                       |
| Anular venta                 | ✅ existe                 | estado `cancelado` + reversión de stock            |
| Devolución de plata          | 🟡 sólo una marca         | `pago_estado = 'devuelto'`, sin flujo de reintegro |
| Exportar a Excel             | 🟡 CSV desde el navegador | Fudo exporta Excel del servidor                    |
| Descuento por ítem           | 🔴 no existe              | sólo hay `pedidos.descuento`, del total            |
| Notas de crédito             | 🔴 no existe              | va con ARCA                                        |
| Cuenta corriente de clientes | 🔴 no existe              | confirmado, cero coincidencias                     |
| Venta por peso / balanza     | 🔴 no existe              | y no vale la pena copiarlo                         |
| Subcategorías de productos   | 🟡 parcial                | 3 menciones en backend, 1 en front                 |

**Las tablas vacías bajaron de 31 a 37 sobre 76.** Subieron en número absoluto
porque Codex agregó tablas nuevas —`agente_metricas`, el carrito de WhatsApp—,
pero **el carrito ya tiene datos**: alguien lo usó. Ese módulo dejó de ser
teórico.

**Todavía sin estrenar:** marketing (7 tablas), personal (9), cupones,
compras, reservas, campañas de WhatsApp. Sigue siendo el riesgo más grande del
sistema.

---

## 1. Resumen ejecutivo

Modo Sabor **no es un sistema incompleto que aspira a ser Fudo**. Es un sistema
con más superficie que Fudo en varias áreas —fidelización, gestión de personal,
delivery propio con app de repartidor, IA de WhatsApp que crea el pedido— y con
tres huecos duros que hoy le impiden reemplazarlo en un local argentino:
**facturación fiscal, listas de precios y multisucursal**.

Los números crudos:

|                     | Modo Sabor                  |
| ------------------- | --------------------------- |
| Rutas backend       | 27 archivos · 329 endpoints |
| Pantallas del panel | 42                          |
| Tablas en la base   | 74                          |
| Tests               | 47, todos verdes            |

El riesgo real no es la falta de funciones. Es que **hay mucho construido y poco
usado**: de 74 tablas, 31 están en cero. Módulos enteros —marketing, campañas,
liquidaciones de personal, cupones, carritos abandonados— existen de punta a
punta y nunca se ejecutaron en producción. Eso no es deuda técnica: es riesgo de
que el día que se enciendan aparezcan bugs como el que encontré esta semana en
Menú del día, donde la pantalla llamaba a un endpoint inexistente y nadie lo
notó porque nadie la usaba.

**La ventaja competitiva más grande no es una función: es que la IA de WhatsApp
crea el pedido dentro del sistema.** El agente de Fudo lo crea en la Tienda
Online. Es una diferencia de arquitectura, no de features.

---

## 2. Arquitectura

**Stack detectado**

| Capa                   | Tecnología                                     |
| ---------------------- | ---------------------------------------------- |
| Frontend panel         | React 18 + Vite 8 + Tailwind + React Router    |
| Estado                 | Context API (sin Redux/Zustand)                |
| Gráficos               | Recharts · Mapas: Leaflet                      |
| Backend                | Node + Express                                 |
| Base de datos          | **SQLite** (better-sqlite3, modo WAL)          |
| Tiempo real            | Socket.io                                      |
| WhatsApp               | Baileys (`@whiskeysockets/baileys` 7.0.0-rc14) |
| Transcripción de audio | Whisper local (faster-whisper, modelo `small`) |
| Apps móviles           | Capacitor (mozo-app + rider)                   |
| Push                   | Firebase Admin                                 |
| Auth                   | JWT + bcrypt + permisos por rol                |
| Automatización IA      | n8n (`agente-whatsapp/`)                       |
| Deploy                 | Railway, Dockerfile, volumen persistente       |

**Observación arquitectónica seria: SQLite.** Funciona bien para un local, y el
modo WAL le da concurrencia razonable. Pero es un archivo en un volumen: no hay
réplica, el backup es una copia de archivo, y multisucursal con SQLite no es
viable. Fudo es cloud multi-tenant. Si en algún momento hay dos locales, esto se
reescribe.

---

## 3. Módulos encontrados y su estado real

Verifiqué UI + endpoint + tabla. Que exista un botón no cuenta.

| Módulo                         | Estado                       | Evidencia                                                       |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------- |
| TPV / ventas mostrador         | ✅ implementado              | `pages/TPV.jsx`, 30 endpoints en `pedidos.js`                   |
| Pedidos                        | ✅ implementado              | 7 filas, eventos en `pedido_eventos`                            |
| Productos / categorías         | ✅ implementado              | 94 productos, 10 categorías                                     |
| Listas de opciones compartidas | ✅ implementado              | `opcion_listas` (4), `producto_opcion_listas` (21)              |
| Caja                           | ✅ implementado              | apertura, cierre, movimientos, ticket. 65 cierres reales        |
| KDS                            | ✅ implementado              | 6 estados, alarmas sonoras                                      |
| Mesas                          | ✅ implementado              | `pages/Mesas.jsx`                                               |
| **Reservas**                   | 🟡 **completo pero sin uso** | UI en Mesas.jsx + endpoints + tabla `mesa_reservas` **0 filas** |
| Delivery propio                | ✅ implementado              | `repartidores.js` 24 endpoints, tracking GPS                    |
| App de repartidor              | ✅ implementado              | Capacitor + geolocalización en background                       |
| App de mozo                    | ✅ implementado              | `mozo-app/` con Capacitor                                       |
| Web pública / carta            | ✅ implementado              | `WebPublica.jsx`                                                |
| Seguimiento de pedido          | ✅ implementado              | `SeguimientoPedido.jsx`                                         |
| IA WhatsApp                    | ✅ implementado              | Baileys + n8n + Whisper. 241 mensajes, 8 conversaciones         |
| Asistente IA del panel         | 🟡 parcial                   | `asistente.js` 6 endpoints, `auditoria_ia` 4 filas              |
| Inventario / insumos           | ✅ implementado              | 9 insumos, 140 recetas, 93 movimientos                          |
| Recetas y costos               | ✅ implementado              | `inventario_recetas` con 140 filas                              |
| Compras / proveedores          | 🟡 **backend sin uso**       | 3 endpoints, `inventario_compras` **0 filas**                   |
| Clientes / CRM                 | ✅ implementado              | 19 endpoints, 10 clientes                                       |
| Fidelización                   | 🟢 **superior a Fudo**       | niveles, puntos, `fidelizacion_niveles` (4)                     |
| Cupones                        | 🟡 **construido, cero uso**  | 6 endpoints, tabla **0 filas**                                  |
| Marketing / campañas           | 🟠 **7 tablas en cero**      | 35 endpoints, **todas las tablas vacías**                       |
| WhatsApp masivo                | 🟡 parcial                   | 25 endpoints, `wa_campanas` **0 filas**                         |
| Personal / RRHH                | 🟠 **9 tablas en cero**      | 37 endpoints. Sólo `personal` (4) tiene datos                   |
| Reportes                       | ✅ implementado              | `reportes.js` + `reportesDelivery.js`                           |
| Dashboard                      | ✅ implementado              | `DashboardModern.jsx`                                           |
| Usuarios y permisos            | ✅ implementado              | 4 usuarios, `requirePermission` en todas las rutas              |
| Auditoría                      | ✅ implementado              | 133 eventos registrados                                         |
| Impresión                      | ✅ implementado              | cola en tabla `impresiones` (11), por área                      |
| PWA / offline                  | 🟡 parcial                   | hay `sw.js` y `manifest.json`; falta verificar qué cachea       |
| **Facturación ARCA/AFIP**      | 🔴 **no existe**             | sin CAE, sin CUIT, sin comprobantes                             |
| **Listas de precios**          | 🔴 **no existe**             | cero coincidencias                                              |
| **Multisucursal**              | 🔴 **no existe**             | cero coincidencias                                              |
| **Propinas**                   | 🔴 **no existe**             | cero coincidencias en rutas y esquema                           |
| **Mermas / desperdicios**      | 🔴 **no existe**             | cero coincidencias                                              |
| **Cuentas corrientes**         | 🔴 **no existe**             | sólo 2 menciones sueltas en UI                                  |
| Integraciones PedidosYa/Rappi  | 🔴 no existe                 | —                                                               |

**Código muerto / abandonado detectado:**

- 4 productos de prueba `ASISTENTE_TEST_*` **activos y vendibles a $1.000**
- Duplicados: `Canelones` ×2, `Suprema napolitana`, `Wok de verduras con pollo`
- Dos pantallas de Menú del día: la nueva y el panel dentro de Operación
- 31 de 74 tablas en cero

---

## 4. Fudo: investigación

Todo lo de esta sección sale de fuentes oficiales de Fudo, citadas al final.

**Aclaración importante:** buscando "Fudo API" aparece `fudosecurity.com` con
documentación de "Fudo Enterprise". **Es otra empresa** (gestión de accesos
privilegiados). La API del Fudo gastronómico está en `dev.fu.do/api`.

### Modelo comercial (agosto 2026, Argentina)

| Plan          | Precio/mes  | Incluye                                                     |
| ------------- | ----------- | ----------------------------------------------------------- |
| Inicial       | $22.500     | mostrador, caja, comandas, descuentos, Carta QR             |
| Avanzado      | $43.900     | + inventario, recetas, clientes, proveedores, reportes      |
| Pro           | $69.500     | + múltiples cajas, listas de precios, inventario valorizado |
| Multisucursal | a consultar | + métricas consolidadas, permisos por sucursal              |

**Módulos aparte:** Gestión de Mesas $8.500 · Facturación Electrónica $13.500 ·
Delivery Apps $19.500 · **Recepcionista IA $55.000**.

Un local con mesas, facturación, delivery e IA paga **$166.000/mes**.

### Lo que Fudo tiene

**POS:** mostrador, mesas, Carta QR con pedido, modificadores y adicionales,
combos, favoritos, **múltiples listas de precios** (Pro), cierre parcial de
ventas, múltiples medios de pago, múltiples turnos, etiquetas, **venta por peso
con balanza**, venta y factura por comensal, control de propinas.

**Caja:** arqueos, **arqueo ciego**, movimientos, múltiples cajas, cajas por
usuario, PIN de autorización por mozo.

**Cocina:** KDS con tiempos de preparación configurables, discriminación "a
tiempo / demorado / muy demorado", alertas sonoras, **aviso al camarero cuando
la orden está lista**.

**Stock:** productos e ingredientes, subingredientes, recetas, fichas técnicas,
**control de mermas y desperdicios**, **conteo de inventario físico**,
**inventario valorizado**, notificaciones por falta, prohibición de vender sin
stock, importación masiva.

**Gastos y finanzas:** categorías, actualización automática de costos y stock,
**estado de resultados**, **flujo de caja**, **carga de facturas por foto**,
control de vencimientos.

**Clientes/proveedores:** base de datos, **cuentas corrientes en ambos lados**,
descuentos automáticos por cliente, importación masiva.

**Delivery:** integración con **PedidosYa, Rappi y Uber Eats**, asignación de
repartidores, 3 estados, tiempo estimado, verificación del último pedido,
**repartidores externos de Rapiboy** a demanda.

**Tienda Online Plus:** diseño personalizable, chatbot WhatsApp, cupones,
listas de precios propias, seguimiento en vivo, **integración con Meta Ads**,
traslado de tasas de servicio, campañas de WhatsApp _(anunciado como próximamente)_.

**IA — lo que es real hoy:**

- **Agente de Ventas por WhatsApp**: responde 24/7, toma pedidos, **envía link
  de pago**, informa estado. Personalizable (mensaje de bienvenida, tono,
  horarios, números a ignorar).
- **Carga de menú asistida**: mandás foto o PDF y _el equipo de Fudo_ lo deja
  listo usando IA. **No es autoservicio.**
- **Recepcionista IA** ($55.000/mes): consultas + reservas por WhatsApp, hasta
  72 horas mensuales automatizadas.

**IA — lo que Fudo anuncia como PRÓXIMAMENTE (no existe):**

- Copiloto ("¿cuánto vendí el finde?", gráficos al instante)
- Agente de Reservas · Agente de Stock · Agente de Compras · Agente de Marketing
- Reservas dentro del agente de ventas
- Campañas de WhatsApp

**Facturación:** impresoras fiscales EPSON y Hasar, factura electrónica por
webservices de ARCA, notas de crédito.

### Lo que Fudo NO tiene

- **Programa de puntos/niveles nativo.** Lo resuelve con integraciones de
  terceros (Novity, Tienda de Puntos).
- **App propia de repartidor con GPS.** Asigna repartidores, pero no hay app de
  tracking propia; terceriza logística con Rapiboy.
- **Menú del día por día de la semana.** No aparece en ninguna documentación
  oficial. Lo más cercano son horarios de disponibilidad por franja y ocultar
  productos sin stock.
- **Gestión de personal / liquidación de sueldos.**
- **Reservas fuera del módulo pago** de $55.000/mes.

---

## 5. Matriz Fudo vs Modo Sabor

Leyenda: ✅ igual o mejor · 🟢 ventaja nuestra · 🟡 parcial · 🟠 rediseñar · 🔴 nos falta · ⚪ ninguno

| Funcionalidad                | Fudo                        | Modo Sabor                   | Est. | Prior.      | Dific.       | Recomendación                |
| ---------------------------- | --------------------------- | ---------------------------- | ---- | ----------- | ------------ | ---------------------------- |
| POS mostrador                | completo                    | completo                     | ✅   | —           | —            | mantener                     |
| Mesas                        | módulo $8.500               | completo                     | ✅   | —           | —            | ventaja de costo             |
| KDS                          | completo + aviso a mozo     | completo                     | ✅   | —           | —            | falta aviso al mozo          |
| Caja / arqueo                | completo                    | completo                     | ✅   | —           | —            | falta arqueo ciego           |
| Arqueo ciego                 | sí                          | no                           | 🔴   | media       | baja         | agregar                      |
| Múltiples cajas              | Pro                         | no                           | 🔴   | baja        | media        | sólo si crece                |
| Propinas                     | sí                          | **sí, con reparto por mozo** | ✅   | —           | —            | hecho 15/8                   |
| Cierre parcial de venta      | sí                          | **verificado: no existe**    | 🔴   | **alta**    | media        | **es lo que sigue**          |
| Listas de precios            | Pro                         | **sí, por canal**            | ✅   | —           | —            | hecho 15/8                   |
| Modificadores/adicionales    | sí                          | sí + **listas compartidas**  | 🟢   | —           | —            | ventaja real                 |
| Combos                       | sí                          | no                           | 🔴   | media       | media        | agregar                      |
| Venta por peso (balanza)     | sí                          | no                           | ⚪   | baja        | alta         | no aplica                    |
| Carta QR                     | sí                          | web pública                  | ✅   | —           | —            | falta pedir desde QR         |
| Pedido desde mesa por QR     | sí                          | no                           | 🔴   | media       | media        | evaluar                      |
| Tienda online                | sí                          | sí                           | ✅   | —           | —            | —                            |
| Pagos online / MercadoPago   | sí                          | parcial                      | 🟡   | alta        | media        | completar                    |
| Delivery propio              | básico                      | **completo + GPS**           | 🟢   | —           | —            | **ventaja fuerte**           |
| App repartidor               | **no tiene**                | sí, Capacitor                | 🟢   | —           | —            | **ventaja fuerte**           |
| Integración PedidosYa/Rappi  | sí ($19.500)                | no                           | 🔴   | media       | alta         | evaluar según negocio        |
| IA WhatsApp toma pedidos     | sí, → Tienda Online         | sí, **→ sistema**            | 🟢   | —           | —            | **ventaja arquitectónica**   |
| IA transcribe audios         | no documentado              | **sí, Whisper local**        | 🟢   | —           | —            | **ventaja real**             |
| IA reservas                  | próximamente                | no                           | ⚪   | baja        | media        | oportunidad                  |
| Copiloto del dueño           | **próximamente**            | parcial                      | 🟡   | **alta**    | media        | **ganarles de mano**         |
| Carga de menú por foto       | asistida por equipo         | no                           | 🔴   | media       | media        | automatizable                |
| Stock productos/ingredientes | completo                    | completo                     | ✅   | —           | —            | —                            |
| Recetas / fichas técnicas    | completo                    | completo                     | ✅   | —           | —            | —                            |
| Mermas y desperdicios        | sí                          | **no**                       | 🔴   | media       | baja         | agregar                      |
| Conteo de inventario físico  | sí                          | **verificado: no existe**    | 🔴   | media       | media        | agregar                      |
| Inventario valorizado        | Pro                         | no                           | 🔴   | media       | media        | agregar                      |
| Compras / proveedores        | completo                    | **backend sin uso**          | 🟡   | alta        | baja         | **activar lo hecho**         |
| Cuentas corrientes           | clientes y proveedores      | **no**                       | 🔴   | media       | media        | agregar                      |
| Estado de resultados         | sí                          | no                           | 🔴   | alta        | media        | agregar                      |
| Flujo de caja                | Pro                         | no                           | 🔴   | media       | media        | agregar                      |
| Factura por foto             | sí                          | no                           | 🔴   | baja        | alta         | no prioritario               |
| CRM clientes                 | básico                      | completo                     | ✅   | —           | —            | —                            |
| Fidelización puntos/niveles  | **integración de terceros** | **nativo**                   | 🟢   | —           | —            | **ventaja fuerte**           |
| Cupones                      | Tienda Plus                 | sí, **sin uso**              | 🟡   | media       | baja         | activar                      |
| Campañas WhatsApp            | **próximamente**            | sí, **sin uso**              | 🟢   | alta        | baja         | **activar ya**               |
| Menú del día por día         | **no documentado**          | sí, pantalla propia          | 🟢   | —           | —            | **ventaja fuerte**           |
| Reservas                     | módulo $55.000              | **hecho, sin uso**           | 🟢   | media       | **baja**     | **activar**                  |
| Facturación ARCA             | módulo $13.500              | **no**                       | 🔴   | **crítica** | **alta**     | **bloqueante legal**         |
| Impresión por sector         | sí                          | sí, con cola                 | ✅   | —           | —            | —                            |
| Impresoras fiscales          | sí                          | no                           | 🔴   | alta        | alta         | va con ARCA                  |
| Reportes                     | 5 familias                  | ventas + delivery            | 🟡   | alta        | media        | ampliar                      |
| Dashboard KPIs               | sí                          | sí                           | ✅   | —           | —            | —                            |
| Usuarios y roles             | sí + PIN mozo               | sí, granular                 | ✅   | —           | —            | falta PIN                    |
| Auditoría de cambios         | no documentado              | **133 eventos**              | 🟢   | —           | —            | ventaja                      |
| Multisucursal                | plan dedicado               | sólo la tabla                | 🔴   | baja        | **muy alta** | sólo si abre otro local      |
| API pública                  | sí (dev.fu.do/api)          | no documentada               | 🟡   | baja        | baja         | documentar                   |
| Offline                      | no documentado              | **no funciona**              | 🔴   | **alta**    | alta         | **sin internet no se vende** |
| Personal / RRHH              | **no tiene**                | 37 endpoints, sin uso        | 🟢   | —           | —            | ventaja dormida              |

---

## 6. Funcionalidades faltantes

### 🔴 Críticas (bloquean reemplazar a Fudo)

1. **Facturación electrónica ARCA/AFIP.** Sin esto no se puede facturar legal.
   Es el único bloqueante duro.
2. **Listas de precios.** Precio distinto en salón, delivery y apps. Hoy hay un
   solo precio por producto.
3. **Propinas.** No existe en el esquema. En un local con mozos es diario.
4. **Cierre parcial de venta / dividir la cuenta.** Mesa de seis que paga por
   separado. Hoy no se puede.

### 🟠 Importantes

5. Estado de resultados y flujo de caja
6. Mermas y desperdicios
7. Cuentas corrientes de clientes y proveedores
8. Combos
9. Arqueo ciego
10. Inventario valorizado
11. Aviso al mozo cuando la comanda está lista
12. PIN de autorización por mozo
13. Reportes de productos, stock, compras y gastos

### ⚪ Opcionales

14. Pedido desde la mesa por QR
15. Integración PedidosYa / Rappi / Uber Eats
16. Múltiples cajas
17. API pública documentada

### ❌ Que NO vale la pena copiar

- **Venta por peso con balanza.** No aplica a este negocio.
- **Multisucursal.** Con SQLite no es viable y no hay segundo local. Sería
  reescribir la persistencia entera por algo hipotético.
- **Integración con Meta Ads.** Complejidad alta, valor dudoso para un local de
  Monteros.
- **Repartidores tercerizados (Rapiboy).** No opera en Tucumán y ya hay
  repartidores propios con app.
- **Módulo Delivery Apps a $19.500.** Sólo sirve si se vende por PedidosYa; si
  el negocio va por WhatsApp propio, es pagar por no depender de nadie.
- **Importación masiva de productos.** Con 94 productos, se carga a mano.

---

## 7. Funcionalidades parciales (lo peligroso)

Esto es lo que más riesgo tiene: **existe, parece terminado, y nunca se probó
en producción.**

| Módulo               | Endpoints | Filas             | Riesgo                                     |
| -------------------- | --------- | ----------------- | ------------------------------------------ |
| Marketing / campañas | 35        | **0 en 7 tablas** | alto                                       |
| Personal / RRHH      | 37        | **0 en 9 tablas** | alto                                       |
| WhatsApp masivo      | 25        | 0 campañas        | alto                                       |
| Cupones              | 6         | 0                 | medio                                      |
| Compras              | 3         | 0                 | medio                                      |
| Reservas             | sí        | 0                 | **bajo — está listo, sólo hay que usarlo** |
| Carritos abandonados | —         | 0                 | medio                                      |

**Precedente concreto:** la pantalla de Menú del día llamaba a
`PUT /operacion/menu-dia`, una ruta que no existe —el backend sólo tiene POST—.
Compilaba, pasaba el lint, se veía perfecta y no guardaba nada. Nadie lo detectó
porque nadie la usaba. Ya está arreglado y quedó
`server/scripts/verificarRutasDelCliente.js` comparando las 153 llamadas del
cliente contra las 329 rutas del servidor.

**Todo módulo sin uso hay que asumirlo roto hasta probarlo.**

---

## 8. Problemas de UX

| Flujo                     | Problema                                                                                | Cómo lo resuelve Fudo             |
| ------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| Menú del día              | Dos pantallas para lo mismo                                                             | Una sola                          |
| Arrastrar en Menú del día | **No verificado; sin `dataTransfer.setData()` falla en Firefox y no funciona al tacto** | —                                 |
| Cobrar una mesa           | Sin cierre parcial: o se cobra todo o nada                                              | Cierre parcial nativo             |
| Mozo                      | App propia                                                                              | App móvil + PIN por mozo          |
| Cocina                    | KDS avisa en pantalla                                                                   | **Notifica al mozo directamente** |
| Caja                      | Sin arqueo ciego: el cajero ve lo que debería haber                                     | Arqueo ciego                      |
| Alta de producto          | Formulario largo                                                                        | Carga asistida por IA desde foto  |

**Nota honesta sobre táctil:** el arrastre nativo de HTML5 no funciona con el
dedo. Si el menú del día se carga desde un celular en el local, hoy no anda.

---

## 9. Problemas técnicos

1. **SQLite como base de producción.** Un archivo en un volumen. Sin réplica,
   backup por copia, multisucursal imposible.
2. **31 de 74 tablas vacías.** Superficie de código sin ejercitar.
3. **4 productos de prueba activos** vendibles a $1.000 — la IA los puede vender.
4. **Bases de n8n con credenciales** sueltas en la raíz. Ya tapadas en
   `.gitignore`, pero hubo una filtración previa en el historial.
5. **Whisper local.** Corre en la máquina de Hernán, no en Railway. Si esa
   máquina se apaga, los audios dejan de transcribirse.
6. **Sin PIN por mozo.** Cualquiera con sesión toca cualquier mesa.
7. **115 llamadas API armadas con plantillas** que el verificador no puede
   chequear.
8. **Offline sin verificar.** Hay `sw.js` pero no confirmé qué cachea ni qué
   pasa si se corta internet en medio de una venta.

---

## 10. Ventajas nuestras

1. **La IA crea el pedido en el sistema, no en una tienda online.** El agente de
   Fudo empuja a la Tienda Online y manda link de pago. Acá el pedido entra
   directo, suena la alarma, se imprime la comanda. Es una diferencia de
   arquitectura y es la ventaja más difícil de copiar.
2. **Transcripción de audios con Whisper local.** Los clientes mandan audios;
   Fudo no documenta esto en ningún lado.
3. **Fidelización nativa con puntos y niveles.** Fudo lo terceriza.
4. **App de repartidor propia con GPS en background.** Fudo no tiene; terceriza
   con Rapiboy.
5. **Menú del día como concepto de primera clase.** Fudo no lo tiene documentado.
   Para un local con menú diario esto es el corazón del negocio.
6. **Listas de opciones compartidas.** Se cargan una vez y se asignan a muchos
   platos. Fudo tiene modificadores por producto.
7. **Auditoría de cambios** con 133 eventos registrados.
8. **Gestión de personal completa.** Fudo no tiene RRHH.
9. **Reservas ya construidas** — lo que Fudo cobra $55.000/mes.
10. **Costo cero de licencia** contra $166.000/mes de un Fudo completo.

---

## 11. Ideas para superar a Fudo

La estrategia no es alcanzarlos en features. Es **ganarles donde ya anunciaron
que van pero todavía no llegaron**.

Fudo publicó como "próximamente": Copiloto del dueño, Agente de Stock, Agente de
Compras, Agente de Marketing, Agente de Reservas y campañas de WhatsApp.

**Modo Sabor ya tiene construida la infraestructura de cuatro de esos seis.**
Marketing, campañas de WhatsApp, compras y reservas existen y están sin usar.
No hay que construirlos: hay que encenderlos y probarlos.

Esa es la jugada más rentable de todo este informe.

---

## 12. IA propuesta

### Copiloto del dueño (Fudo lo anunció, no lo lanzó)

Preguntar en castellano y que conteste con datos reales:

> "¿cuánto vendimos hoy?" · "¿cuál fue el plato más rentable del mes?"
> "¿qué insumos tengo que comprar mañana?" · "¿qué empleado anuló esa venta?"

Y que **ejecute**, con confirmación previa:

> "subí 10% las hamburguesas" · "desactivá la costeleta hasta mañana"
> "armá el menú de mañana igual al del jueves pasado" · "pausá el delivery"

Ya hay base: `asistente.js` con 6 endpoints y `asistenteHerramientas.js`.

### IA de cocina — predicción de producción

Con 41.969 mensajes de historial se puede predecir cuántas porciones preparar
por día de semana. **Este dato no lo tiene Fudo porque no guarda las
conversaciones de WhatsApp.**

### IA de stock

Predecir compras cruzando historial, día de semana, feriados y promociones.

### IA de marketing

Detectar clientes inactivos, frecuentes, VIP y en riesgo, y armar la campaña.
Las tablas de segmentación ya existen y están vacías.

### IA de WhatsApp — cerrar el círculo

Hoy: interpreta, cotiza, arma el pedido, lo crea, suena la alarma, imprime.
Falta: **asignar el repartidor automáticamente** e informar el tiempo real.

---

## 13. Roadmap

### Fase 1 — Crítico (bloqueantes)

| Tarea                                   | Impacto           | Compl.   | Toca                  |
| --------------------------------------- | ----------------- | -------- | --------------------- |
| Borrar los 4 productos de prueba        | alto              | trivial  | script listo          |
| Arreglar el arrastre (setData + táctil) | alto              | baja     | `MenuDelDia.jsx`      |
| Verificar qué pasa offline              | alto              | media    | `sw.js`               |
| Facturación ARCA                        | **crítico legal** | **alta** | módulo nuevo + tablas |

### Fase 2 — Operación

Listas de precios · propinas · cierre parcial de cuenta · arqueo ciego · PIN por
mozo · aviso al mozo desde el KDS.

### Fase 3 — Ventas

Combos · pedido desde mesa por QR · completar MercadoPago · reportes de
productos, stock y compras.

### Fase 4 — CRM

**Activar reservas** (ya construido) · activar cupones · cuentas corrientes ·
segmentación de clientes.

### Fase 5 — Automatización

**Activar campañas de WhatsApp** (ya construido, Fudo no lo lanzó) · carritos
abandonados · recuperación de inactivos · estado de resultados.

### Fase 6 — IA

Copiloto del dueño · predicción de producción · predicción de compras ·
asignación automática de repartidor.

---

## 14. TOP 20 — actualizado el 15/8/2026

Tachado lo que ya está hecho. Reordenado según lo que queda.

**Cerrado**

~~1. Borrar los 4 productos de prueba~~ · ~~2. Arrastre táctil~~ ·
~~3. Propinas~~ · ~~4. Listas de precios~~ · ~~5. Sacar los duplicados~~

**Lo que queda, por orden**

| #   | Qué                                    | Por qué                                                                                                                                     |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Facturación ARCA/AFIP**              | único bloqueante legal. Y desde el 1/8/2026 el CAE en tiempo real es obligatorio para responsables inscriptos: si lo sos, ya estás en falta |
| 2   | **Que se pueda vender sin internet**   | verificado: hoy la app abre y no hace nada. Se corta la luz y no cobrás                                                                     |
| 3   | **Probar los módulos sin uso**         | 37 tablas en cero. El caso de Menú del día —una pantalla que no guardaba y nadie lo notó— es el patrón, no la excepción                     |
| 4   | **Cierre parcial / dividir la cuenta** | verificado que no existe. Mesa de seis que paga por separado, hoy imposible                                                                 |
| 5   | **Activar reservas**                   | ya construido; Fudo cobra $55.000/mes por el módulo que las incluye                                                                         |
| 6   | **Activar campañas de WhatsApp**       | ya construido; Fudo lo tiene como "próximamente"                                                                                            |
| 7   | **Copiloto del dueño**                 | Fudo lo anunció y no lo lanzó. El motor de Codex ya está                                                                                    |
| 8   | Estado de resultados                   | saber si el negocio gana plata                                                                                                              |
| 9   | Aviso al mozo desde el KDS             | Fudo lo tiene, ahorra viajes a la cocina                                                                                                    |
| 10  | Mermas y desperdicios                  | plata que se pierde sin registro                                                                                                            |
| 11  | Arqueo ciego                           | verificado que no existe. Hoy el cajero ve lo que debería haber                                                                             |
| 12  | Reportes de productos y stock          | hoy sólo ventas y delivery                                                                                                                  |
| 13  | Activar compras y proveedores          | backend hecho, cero uso                                                                                                                     |
| 14  | Combos                                 | verificado que no existen                                                                                                                   |
| 15  | PIN por mozo                           | control real sobre quién toca qué mesa                                                                                                      |
| 16  | Cuentas corrientes de clientes         | verificado que no existe                                                                                                                    |
| 17  | Conteo de inventario físico            | verificado que no existe                                                                                                                    |
| 18  | Descuento por ítem                     | hoy sólo se descuenta del total                                                                                                             |
| 19  | Devolución de plata de verdad          | hoy es sólo una marca en `pago_estado`                                                                                                      |
| 20  | Predicción de producción con el backup | dato único que Fudo no tiene                                                                                                                |

**Fuera de la lista, a propósito:** multisucursal (la tabla existe pero con
SQLite no es viable y no hay segundo local), venta por peso, integración con
PedidosYa, notas de crédito (van con ARCA) y Meta Ads.

---

## 15. Conclusión

Modo Sabor está más cerca de superar a Fudo de lo que parece, pero por un motivo
incómodo: **buena parte de lo que le falta ya está construido y apagado.**

Tres frases para resumir:

1. **Un bloqueante real:** sin facturación ARCA no se reemplaza a Fudo en un
   local argentino. Todo lo demás es preferencia; esto es ley.
2. **La ventaja es la arquitectura, no la lista de features.** La IA crea el
   pedido adentro del sistema. Fudo empuja a una tienda online. Eso no se copia
   en un sprint.
3. **El mayor riesgo no es lo que falta sino lo que sobra.** 31 tablas en cero y
   una pantalla que no guardaba sin que nadie lo notara. Antes de agregar,
   probar lo que ya está.

---

## Fuentes

Todas consultadas en agosto de 2026.

- [Funcionalidades de Fudo](https://fu.do/es-ar/funcionalidades/) — inventario oficial de módulos
- [Precios y planes](https://fu.do/es-ar/precios/) — planes, módulos y precios AR
- [Agentes IA de Fudo](https://lp.fu.do/agentes-ia) — qué existe y qué es "próximamente"
- [Centro de Ayuda](https://soporte.fu.do) — documentación operativa
- [Configuración de modalidad de ventas y horarios](https://soporte.fu.do/es/articles/11732163-configuracion-de-modalidad-de-ventas-y-horarios)
- [Productos sin disponibilidad en Tienda Online](https://soporte.fu.do/es/articles/11732153-configuracion-de-productos-sin-disponibilidad-en-tienda-online)
- [Programar pedidos](https://soporte.fu.do/docs/to-programar-pedidos)
- [API de propósito general](https://soporte.fu.do/docs/api-gral) · [dev.fu.do/api](https://dev.fu.do/api)
- [Clientes](https://soporte.fu.do/es/articles/11730960-clientes)
- [Fudo en Google Play](https://play.google.com/store/apps/details?id=do.fu.app) · [App Store](https://apps.apple.com/ar/app/fudo-software-gastron%C3%B3mico/id1137158486)
- [Integración Fudo + Novity](https://novityapp.com/blog/integracion-fudo-latam) — fidelización por terceros

**Advertencia:** `fudosecurity.com` **no es Fudo gastronómico** — es otra empresa
de seguridad informática. No usé nada de esa fuente.

**Límites de esta auditoría:** no tengo cuenta de Fudo, así que todo lo suyo sale
de documentación pública, no de uso real. Y del lado nuestro leí la base local,
no la de producción.
