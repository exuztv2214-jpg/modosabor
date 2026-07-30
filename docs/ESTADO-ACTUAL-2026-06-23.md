# Estado actual - 2026-06-23

## Estado general

El sistema quedo orientado a dos experiencias separadas:

- `Modo Sabor - Sistema` como PWA principal para instalar en la PC del negocio.
- `Modo Sabor - Repartidores` como PWA dedicada para el celular del delivery.

## Correcciones aplicadas hoy

### Caja, turnos y personal

- Se agregó lógica operativa real para caja por turno:
  - validación del turno operativo al entrar en turno
  - cierre automático de cajas viejas o desfasadas
  - `fecha_operativa` y `turno_id` persistidos en cada caja
- El TPV ahora exige caja abierta manual del turno vigente antes de vender.
- Si se intenta vender fuera de turno, el sistema ahora bloquea la operación.
- La asignación automática de riders ya filtra por turno preferido del personal vinculado:
  - `Mathias Gonzalez` en mañana
  - `Cristian Galvan` e `Ivan Lopez` en noche
- Se agregó base nueva para gestión de personal:
  - asistencia por turno
  - metas / objetivos
  - descuento empleado
  - consumo interno de productos terminados descontando stock real
- Se agregó analítica de asistencia por rango y ranking interno de puntualidad/asistencia.
- Se agregó premio automático por puntualidad y por metas cumplidas.
- Se corrigió el canje de reconocimientos para que no falle por el tipo guardado en la tabla.
- `Personal.jsx` ahora incluye panel de turnos, asistencia, metas y consumos.
- `Personal.jsx` ahora suma además:
  - planilla semanal de asistencia
  - resumen laboral por período
  - acceso directo al reloj del personal
  - PIN y link individual de fichada por empleado
- Se agregó la pantalla pública de fichada:
  - `/personal/reloj`
  - `/personal/reloj/:token`
- Los empleados ya pueden marcar ingreso/salida desde el mismo celular del local:
  - modo compartido con PIN
  - modo individual por link/QR
- Se agregó sugerencia automática de liquidación según:
  - frecuencia de pago
  - período desde último pago
  - días realmente trabajados por asistencia
- Se documentó esta pasada en:
  - `docs/BITACORA-TURNOS-Y-PERSONAL-2026-06-23.md`

### PWA principal

- `client/public/manifest.json` ya no apunta al rider.
- La app principal ahora instala con `start_url` en `/admin/dashboard`.
- Se dejo `display_override` para mejorar la experiencia en escritorio.
- `Layout.jsx` suma boton `Instalar sistema` cuando Chrome/Edge ofrece la instalacion.

### Interfaz clara

- Se elimino la infraestructura general de modo oscuro del frontend:
  - `ThemeProvider`
  - `ThemeContext`
  - toggle visual en sidebar
  - overrides globales `.dark`
- `PersonalClock.jsx` quedo reconstruido en estilo claro.
- `ClubFidelidad.jsx` paso a esquema claro.
- `WebPublica.jsx` se ajusto en sus zonas mas visibles a un look claro:
  - header
  - hero
  - promos
  - menu del dia
  - footer
- `SeccionWebPublica.jsx` ahora muestra preview claro dentro de configuracion.
- `DashboardModern.jsx` ahora maneja mejor los fallos de carga:
  - estado vacío elegante si el tablero no responde
  - aviso de actualización parcial cuando falla un refresh
  - botón de reintento sin tener que recargar toda la app
- Las alertas internas de stock dentro del dashboard pasaron a tarjeta clara legible.
- El botón de subida de imágenes de la web pública quedó alineado al look claro del resto de configuración.
- En esta continuidad se limpiaron restos visuales oscuros en pantallas muy usadas:
  - botón principal de movimientos en `Caja`
  - ficha del rider y botón de acceso en `Delivery`
  - CTAs de `SeguimientoPedido`
  - avisos y acciones del `PersonalClock`
- Se reforzó además `Personal` con una lectura más ejecutiva del turno:
  - presentes
  - tardanzas
  - ausentes
  - mejor puntualidad del rango analizado
- La planilla semanal de `Personal` también quedó más gerencial:
  - resumen semanal por empleado
  - mejor asistencia de la semana
  - mejor puntualidad de la semana
  - tardanzas y ausencias semanales visibles arriba
- `Personal` ahora suma además una lectura operativa más inteligente por empleado:
  - alertas automáticas por tardanzas repetidas
  - alertas por ausencias
  - aviso cuando descuentos/consumos superan demasiado el bruto
  - recomendación ejecutiva antes de confirmar la liquidación
- También se alinearon con el look claro:
  - botón de fullscreen en `TPV`
  - modales de selección de cliente y variantes del TPV
  - botones principales de menú del día y acceso a reportes en `Operación`

### Rider app

- Se creo `client/public/manifest-rider.json` para separar la instalacion del rider.
- `RiderPanel.jsx` cambia el manifest activo mientras el rider esta abierto.
- La vista rider ahora detecta si ya corre en modo app instalada.
- Se agrego advertencia de GPS atrasado para evitar tracking "congelado".
- Se dejo ayuda visible para instalarla desde Android/iPhone.
- `SeccionRider.jsx` ya sube el logo por configuracion y no por productos.
- `SeccionRider.jsx` ahora muestra acceso directo a `/rider` y copia del link.

### Service worker

- `client/public/sw.js` paso a `v2`.
- Cachea shell de `admin`, `rider`, `index`, `404` y ambos manifests.
- Si se pierde la red durante navegacion, intenta devolver `index.html`.

### Orden y despliegue

- `.gitignore` ahora ignora:
  - `.launcher/`
  - `.tmp/`
  - `server/*.db`
  - `deploy/modosabor-donweb.tgz`
- Se agregaron:
  - `deploy/package-donweb.ps1`
  - `deploy/deploy-donweb.ps1`

### Seguridad operativa de UX

- Se creó `client/src/components/ActionDialog.jsx` para reemplazar confirmaciones pobres del navegador.
- `Configuracion.jsx` ahora usa diálogo propio para:
  - restaurar backups
  - resetear datos operativos
- `Delivery.jsx` ahora usa diálogo propio para:
  - eliminar riders
  - confirmar entregas con PIN
- También se migraron acciones sensibles en:
  - `Productos`
  - `Clientes`
  - `Categorias`
  - `Personal`
  - `KDS`
  - `Cupones`
  - `Fidelizacion`
  - `MarketingDigital`
- Pendiente menor:
  - `client/src/components/Marketing/PublicadorFacebookPanel.jsx`

### Delivery más profesional

- `Delivery.jsx` muestra mejor el estado del GPS de cada rider:
  - GPS fresco
  - GPS demorado
  - GPS atrasado
  - sin GPS
- El resumen superior del módulo ahora incluye riders ocupados y GPS a revisar.
- La carga de avatar del rider ya no depende del upload de productos.
- Cada pedido delivery ahora expone mejor:
  - zona
  - ETA
  - estado del GPS en viaje
  - acceso directo a ruta en Google Maps
- El resumen superior del centro de delivery quedó más ejecutivo:
  - pedidos sin rider
  - pedidos listos
  - pedidos en viaje
  - riders disponibles
  - GPS a revisar
- Se dejó más coherente el set visual del módulo con botones primarios claros.
- `Delivery.jsx` ahora suma un bloque `Radar de calle`:
  - selector rápido de pedidos activos
  - mapa embebido del destino del pedido seleccionado
  - resumen operativo del viaje
  - panel lateral de riders activos con GPS, carga y accesos rápidos
- Esto deja el despacho más visual sin caer en una interfaz oscura ni confusa.

### Operación más clara

- `server/routes/operacion.js` ahora cuenta riders con GPS atrasado.
- `Operacion.jsx` muestra ese dato dentro del acceso rápido a delivery.
- `DashboardModern.jsx` suma un panel `Salud del sistema` con lectura rápida de stock, riders, backups, impresión y menú del día.
- `Operacion.jsx` ahora tiene gestor real de `Menú del día de hoy`:
  - biblioteca base de platos reutilizable
  - selector `sale hoy` para activar solo lo del día
  - edición diaria de precio, stock, descripción y destacado
  - botón `Copiar ayer` para no recargar todo manualmente
  - alta rápida de plato eventual para un menú puntual

### Web pública más premium

- `WebPublica.jsx` suma una banda comercial nueva entre promos y menú:
  - bloque `Por qué pedir acá`
  - bloque `Pedí en 3 pasos`
- Esa capa mejora la confianza del cliente antes de entrar de lleno al menú.
- El contenido usa datos reales del estado actual:
  - tiempo estimado según tipo de entrega
  - soporte por WhatsApp
  - pedido directo sin intermediarios

### Reportes más ejecutivos

- `server/routes/reportes.js` ahora expone en reportes premium:
  - clientes VIP
  - stock crítico
- `Reportes.jsx` agrega:
  - alertas ejecutivas rápidas
  - radar ejecutivo con clientes VIP y stock a revisar
- `Reportes.jsx` además ya integra una primera lectura de personal:
  - dotación activa
  - asistencia promedio
  - puntualidad promedio
  - ranking resumido del equipo
  - cumpleaños y reconocimientos visibles
- Esto deja más a mano decisiones comerciales y operativas sin salir del módulo.

## Auditoria funcional enfocada

### Stock compartido

Se validó que las bases compartidas sigan el modelo correcto:

- pizzas: `recipe`
- hamburguesas: `recipe`
- milanesas: `recipe`
- empanadas: `direct`
- papas: `direct`

Y desde `Operacion.jsx` quedó disponible la sincronización manual de bases compartidas.

### Menú del día sin recarga completa

El menú del día dejó de depender de crear productos nuevos todos los días.

- Los platos base del menú quedan guardados en una biblioteca.
- Cada jornada solo se marca qué platos `salen hoy`.
- La web pública muestra únicamente los platos del día que estén activos.
- Se conserva snapshot diario en `menu_dia_historial` para poder repetir el armado.

### Delivery

- La base actual de autoasignacion sigue contemplando al unico rider activo aunque este ocupado, para no bloquear ventas cuando hay un solo delivery por turno.
- El rider ya tiene navegación a domicilio, WhatsApp, PIN de entrega y tracking en vivo.

### Correccion operativa real detectada hoy

- Se corrigio un bug en `server/utils/inventory.js`:
  - al aplicar inventario a un pedido se devolvia `plan` sin existir
  - eso rompia la creacion de pedidos con `plan is not defined`
- Luego del fix, la validacion operativa volvió a pasar completa.
- Se corrigió además `server/scripts/verify-operacion.js` para convivir bien con la lógica nueva de caja por turnos:
  - si la prueba corre fuera de horario, prepara un turno/caja temporal de verificación
  - ejecuta la venta TPV real
  - limpia ese contexto al finalizar
- Con eso ya no hay choque entre la regla “hay que estar en turno para vender” y la verificación automática.

### Fidelización lista para QR

- Se agregó una ficha pública en:
  - `/club`
  - `/club/:codigo`
- Sirve para clientes que compran por WhatsApp, mostrador o web pública.
- El cliente puede completar su ficha desde un QR impreso.
- El sistema intenta reconocerlo por teléfono antes de crear un cliente nuevo.
- Si ya estaba cargado, actualiza la misma ficha en vez de duplicarlo.
- Si se escanea una tarjeta individual, también se puede vincular por `codigo_tarjeta`.
- Desde `Fidelizacion.jsx` ahora se puede:
  - copiar el enlace general del club
  - copiar enlaces individuales por cliente/tarjeta
  - usar eso para imprimir tarjetas o stickers con QR

### Limpieza hecha

- Se eliminaron archivos que no aportaban a la operación:
  - logs viejos dentro de `server/`
  - scripts manuales de prueba/inspección que ya no forman parte del flujo real

## Pendientes fuertes para siguiente pasada

1. Terminar el último remanente de confirmaciones en `PublicadorFacebookPanel.jsx`.
2. Agregar checklist visual aún más detallado de PWA/impresion/tracking dentro de `Operacion`.
3. Llevar el radar de delivery a una capa todavía más fuerte:
   - seguimiento histórico por rider
   - heatmap de demora por zonas
   - alertas visuales de pedidos frenados
4. Completar una rutina de deploy local -> DonWeb totalmente automatizada con variables del VPS ya definidas.
5. Completar el premium final de la web pública:
   - hero administrable con más presets
   - bloques de confianza / beneficios
   - mejor vitrina para promos y combos
6. Llevar la analítica de personal y fidelización a reportes ejecutivos.
7. Agregar un mapa operativo real en delivery para despacho visual.
8. Afinar campañas automáticas sobre clientes VIP / en riesgo desde reportes o CRM.

## Validacion recomendada despues de estos cambios

- `npm run build`
- `npm run verify:core`
- `npm run verify:operacion`

En esta pasada volvieron a pasar OK.

## Nota tecnica

SQLite puede devolver `database is locked` si se lanzan verificaciones contra la misma base exactamente al mismo tiempo. En esta pasada:

- `build` OK
- `verify:operacion` OK
- `verify:core` OK

La validación quedó limpia al rerun secuencial.

## Deploy DonWeb

- Se agregó `deploy/validate-donweb.ps1`
- Se agregó `docs/DEPLOY-DONWEB-RAPIDO.md`
- `package.json` ahora expone:
  - `npm run package:donweb`
  - `npm run deploy:donweb`
  - `npm run deploy:donweb:check`

## Extensión premium de personal y tablero

- `Personal.jsx` ahora permite corregir asistencia manual directamente desde la planilla semanal:
  - seleccionar empleado
  - tocar un día
  - ajustar estado, ingreso, salida y turno
  - guardar corrección sin depender del turno operativo actual
- Se agregó el endpoint `PUT /api/personal/:id/asistencia/manual` para edición administrativa por fecha operativa.
- `DashboardModern.jsx` suma un bloque nuevo de “Pulso del equipo” con:
  - equipo activo
  - tardanzas a mirar
  - ausencias recientes
  - mejor desempeño semanal
- `Reportes.jsx` suma lectura ejecutiva de personal con:
  - conteo de tardanzas en riesgo
  - conteo de ausencias a revisar
  - mejor desempeño del rango

## Validación de esta extensión

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK

## Pulido premium adicional

- Se activaron `future flags` de React Router en `client/src/App.jsx` para empezar a limpiar warnings de navegación de la base actual.
- Se normalizó la navegación lateral:
  - `Catálogo`
  - `Gestión`
  - `Configuración`
  - `Mesas / Salón`
  - fallback de localidad `Administración`
- Se eliminaron remanentes oscuros en vistas de gestión:
  - botón `EDITAR` en detalle de clientes
  - acciones principales y overlays del módulo `Categorias`
  - paleta completa del módulo `Cupones` migrada a la línea azul principal del sistema

## Estado técnico actual de la pasada

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK
- El chequeo interactivo del dashboard confirmó navegación y layout principal correctos.

## Pulido premium extra de admin claro

- Se reforzó otra capa visual para que el admin quede más coherente con el estilo claro:
  - `Configuración` pasó sus CTAs principales a la línea azul del sistema
  - `SeccionGeneral` mejoró títulos, acentos, foco y botones de subida de logo/favicon
  - `SeccionAvanzado` dejó textos más prolijos y consistente la línea visual de backups
  - `Productos` recibió limpieza fuerte de:
    - acentos y copys
    - focos de formularios
    - overlays
    - botones de variantes/extras
    - estados de selección
    - hover de acciones
  - `Delivery` suavizó overlays oscuros de modales para no sentirse como modo oscuro
  - `SidebarModern` y `Layout` corrigieron rótulos:
    - `Categorías`
    - `Fidelización`
    - `Configuración`
    - `Auditoría`
    - `Mesas / Salón`

## Validación posterior a este pulido

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK

## Terminación premium adicional de operación y CRM

- Se limpió la última capa visible de UI vieja para sostener el admin claro:
  - `Inventario` dejó sus sincronizaciones masivas en color principal azul
  - `Caja` corrigió acentos, mensajes de vacío y overlay de modal
  - `Clientes` corrigió copys de fidelización, tarjeta, direcciones y overlays
  - `Dashboard` terminó de alinear badges y títulos con la línea visual actual
- Resultado de esta pasada:
  - menos remanentes oscuros
  - mejor consistencia visual en operación, CRM y stock
  - textos más prolijos para uso diario real

## Validación de esta pasada

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK

## Cierre extra de terminación visual premium

- Se completó otra ronda de limpieza sobre módulos muy visibles del uso diario:
  - `Cuenta`: overlay del selector de avatar más liviano y claro
  - `Categorías`: modal, textos, acentos y vacíos más prolijos
  - `Pedidos`: modal de historial con overlay claro y CTA principal en azul del sistema
  - `Web pública` dentro de configuración: copys corregidos y mejor consistencia editorial
  - `TPV Sidebar`: placeholders y botón GPS con mejor redacción
  - `SeccionDelivery`, `SeccionPagos` y `SeccionRider`: limpieza fina de títulos, descripciones y textos operativos

## Validación posterior a este cierre

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK
