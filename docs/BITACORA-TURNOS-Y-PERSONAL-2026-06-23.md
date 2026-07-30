# Bitácora - turnos, caja y personal - 2026-06-23

## Objetivo de esta pasada

Ordenar la operación diaria de Modo Sabor en dos frentes:

1. Caja y turnos sin errores, con apertura automática por turno.
2. Gestión real de personal para asistencia, metas, pagos y consumos internos.

## Cambios aplicados

### Caja y turnos

- La caja ahora usa `turno_id`, `turno_nombre` y `fecha_operativa`.
- Se agregó apertura automática de caja al entrar en un turno activo.
- Se agregó cierre automático de cajas viejas o desfasadas cuando cambia el turno.
- La caja autoabierta queda marcada con `auto_abierta = 1`.
- Si el TPV intenta vender dentro de turno y no hay caja, el sistema la abre solo.
- Si el TPV intenta vender fuera de turno, ahora bloquea la venta con mensaje claro.
- Se validó el caso real de una caja vieja abierta desde el `2026-06-15`: quedó cerrada automáticamente y se abrió la del turno actual.

### Riders por turno

- El autoasignado de delivery ahora respeta el turno real del personal vinculado.
- `Mathias Gonzalez` quedó normalizado para `manana`.
- `Cristian Galvan` e `Ivan Lopez` quedaron normalizados para `noche`.
- Si en el turno solo hay un rider válido, el sistema igual lo toma aunque figure ocupado, para no bloquear el flujo cuando hay un único delivery activo.

### Personal

- Se agregaron tablas nuevas:
  - `personal_asistencia`
  - `personal_objetivos`
- Se agregó `descuento_empleado_pct` en `personal` con default `20`.
- Se ampliaron los movimientos de personal para soportar:
  - `producto_id`
  - `producto_nombre`
  - `cantidad_producto`
  - `precio_lista`
  - `descuento_empleado_pct`
- Ahora se puede registrar consumo interno de productos terminados con descuento de empleado y con descuento real de stock.
- Las metas del personal ya quedan persistidas y se pueden consultar por empleado.
- Se agregó analítica de asistencia por rango:
  - porcentaje de asistencia
  - porcentaje de puntualidad
  - ranking del equipo
- La asistencia puntual ahora puede otorgar puntos automáticos.
- Las metas cumplidas ahora pueden disparar premio automático en puntos.
- Se corrigió el registro de canje de reconocimientos para que no choque con el tipo guardado en SQLite.

### Interfaz

- `Caja` ahora muestra:
  - turno operativo actual
  - fecha operativa
  - bandera de caja autoabierta
- `Personal` suma vista de:
  - turnos y asistencia
  - equipo del turno actual
  - metas y premios
  - consumo de productos con descuento de empleado
  - planilla semanal del equipo
  - resumen laboral estimado
  - accesos de fichada por PIN/link

### Fichada desde celular del local

- Se agregó una pantalla pública de reloj del personal:
  - `/personal/reloj`
  - `/personal/reloj/:token`
- El flujo pensado para el celular que usa el negocio es:
  - el empleado toca su nombre
  - ingresa su PIN
  - marca ingreso, salida o llegada tarde
- También quedó lista la variante individual por link/QR usando `clock_token`.
- Cada empleado ahora puede tener:
  - `clock_pin`
  - `clock_token`
- Desde la ficha del empleado se puede copiar:
  - PIN
  - link individual de fichada

### Liquidación más automática

- Se agregó cálculo sugerido de liquidación por empleado tomando:
  - período desde la última liquidación
  - frecuencia de pago
  - jornadas realmente trabajadas según asistencia
- La liquidación automática usa esos datos y descuenta adelantos, descuentos y consumos pendientes.

## Validaciones ejecutadas

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK
- carga backend de:
  - `server/db`
  - `server/routes/caja`
  - `server/routes/personal`
  - `server/services/pedidoService`
  - OK

## Estado real validado en la base local

- Turnos del negocio:
  - mañana: `10:00 -> 14:30`
  - noche: `20:30 -> 01:30`
- Personal delivery:
  - `Mathias Gonzalez` -> `manana`
  - `Cristian Galvan` -> `noche`
  - `Ivan Lopez` -> `noche`
- Caja actual:
  - autoabierta para `Turno manana`
  - fecha operativa `2026-06-23`

## Pendientes naturales para la próxima pasada

1. Llevar parte de la analítica de personal al módulo general de reportes.
2. Agregar edición de metas ya creadas sin depender solo de “marcar cumplido”.
3. Sumar alertas de faltas repetidas y premios por racha.
4. Afinar todavía más el desglose de consumos internos dentro de liquidaciones.

## Nota de continuidad visual y operativa

- Se siguió limpiando el frontend para evitar remanentes oscuros en módulos nuevos.
- `PersonalClock` quedó como base clara para la fichada desde el celular del local.
- El criterio actual para próximos pasos de personal queda así:
  1. planilla semanal más fuerte
  2. fichada robusta por PIN / QR
  3. liquidación por período
  4. resumen premium por empleado con asistencia, premios, consumos y saldo

## Contexto de continuidad para la próxima pasada premium

- Ya se reforzó la lectura ejecutiva general del sistema en dashboard y reportes.
- Lo próximo más natural para personal es llevar al módulo de reportes:
  - asistencia
  - puntualidad
  - metas
  - premios
  - consumos internos
- Así personal deja de depender solo de la ficha individual y gana visión gerencial semanal.

## Extensión aplicada en la misma jornada: fidelización por QR

- Se agregó una ficha pública de fidelización para escaneo:
  - `/club`
  - `/club/:codigo`
- El objetivo es que clientes de WhatsApp puedan completar su ficha sin pasar por admin.
- La vinculación se hace primero por teléfono normalizado para reaprovechar clientes ya existentes.
- Si además llega un `codigo_tarjeta`, el sistema evita mezclar dos clientes distintos y responde conflicto si detecta una unión riesgosa.
- `Fidelizacion.jsx` ahora permite copiar:
  - enlace general del club
  - enlace individual por cliente
- Esto deja lista la base para imprimir tarjetas con QR y sumar sellos/puntos sobre la misma ficha real del cliente.

## Extensión posterior de continuidad operativa

- Se reforzó el módulo `Delivery` con un radar visual claro:
  - pedidos activos seleccionables
  - mapa del destino
  - resumen del viaje
  - panel rápido de riders en calle
- Se ajustó `verify-operacion` para que respete la nueva lógica de caja por turnos sin romper la verificación:
  - prepara turno/caja temporal si se ejecuta fuera de horario
  - crea el pedido interno TPV
  - restaura el contexto de prueba al finalizar
- Resultado:
  - `npm run build` OK
  - `npm run verify:core` OK
  - `npm run verify:operacion` OK
- Se hizo además una pasada extra de limpieza visual clara:
  - `PersonalClock` muestra mejor cuando no hay turno activo
  - `Caja` dejó de tener botón principal oscuro
  - `Delivery` y `SeguimientoPedido` quedaron más alineados al look claro general
- Se mejoró además la lectura gerencial dentro de `Personal`:
  - mini tablero de turno con presentes, tardanzas y ausentes
  - mejor puntualidad visible sin entrar a cada ficha
  - botones críticos ya alineados al esquema claro
- La planilla semanal quedó un paso más cerca de tablero real:
  - métricas semanales arriba
  - resumen por empleado dentro de cada fila
  - mejor asistencia y mejor puntualidad visibles sin navegar por detalle
- Se agregó una capa de lectura inteligente para cada ficha:
  - alertas operativas por ausencias o tardanzas repetidas
  - señal cuando el pendiente ya pesa demasiado sobre la liquidación
  - recomendación ejecutiva antes de confirmar pago
  - ratio de descuentos sobre bruto, valor por jornada y promedio de tardanza
- Y en la misma continuidad:
  - `TPV` dejó el botón de fullscreen en color primario
  - los modales del TPV pasaron a overlay más suave y claro
  - `Operación` dejó coherentes sus accesos fuertes de menú del día y reportes
- Nota operativa:
  - en esta pasada el backend local no estaba levantado al correr `verify:core`
  - se relanzó el server local
  - luego `build`, `verify:core` y `verify:operacion` volvieron a quedar OK

## Nueva pasada: cierre real de planilla semanal y lectura gerencial

- Se resolvió una pieza que faltaba para uso diario:
  - edición manual de asistencia desde la planilla semanal
  - ya no depende de que el turno esté operativo en ese momento
  - se puede corregir por fecha, estado, ingreso, salida y turno
- Backend agregado:
  - `PUT /api/personal/:id/asistencia/manual`
- Frontend agregado en `Personal.jsx`:
  - selector visual del día
  - editor rápido de la jornada elegida
  - guardado con recarga de detalle, ranking y planilla
- `DashboardModern.jsx` suma “Pulso del equipo”:
  - activos
  - tardanzas a mirar
  - ausencias recientes
  - mejor desempeño semanal
- `Reportes.jsx` ahora refleja también:
  - tardanzas en riesgo
  - ausencias a revisar
  - mejor performer del período

## Verificación de esta pasada

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK

## Ajuste transversal final de esta etapa

- Aunque la pasada estuvo enfocada sobre módulos generales, impacta directamente en la operación diaria:
  - `Caja` quedó más clara para control de auditoría y movimientos manuales
  - `Inventario` quedó visualmente más coherente para sincronizaciones compartidas
  - `Clientes` mejoró lectura de ficha, fidelización y tarjeta del cliente
- Esto reduce fricción para caja, mostrador y seguimiento de clientes en el uso real del sistema.

## Validación posterior

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK

## Terminación visual asociada a operación real

- Se siguió bajando fricción visual en zonas de trabajo cotidiano:
  - `Pedidos` y `TPV` quedaron con lenguaje más claro para mostrador
  - `Delivery` y `Rider` quedaron con textos más consistentes para operación móvil
  - `Caja`, `Inventario` y `Categorías` sostienen mejor la línea clara del sistema
- Esto ayuda a que el equipo use el sistema con menos ruido visual y menos texto raro en el día a día.

## Validación posterior a esta capa

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK

## Pulido visual transversal posterior

- `App.jsx`
  - activados `future` flags de React Router para modernizar la base de navegación
- `SidebarModern.jsx`
  - labels y acentos corregidos para dejar la navegación más prolija y consistente
- `Clientes.jsx`
  - detalle de cliente ya no usa botón oscuro para `EDITAR`
- `Categorias.jsx`
  - acciones fuertes y detalle pasaron a línea clara/azul
  - overlays suavizados
  - foco de controles alineado al azul del sistema
- `Cupones.jsx`
  - paleta indigo reemplazada por la identidad azul principal del sistema
  - foco, CTA y estados quedaron más coherentes con el resto del admin

## Validación posterior a ese pulido

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK

## Nueva capa de terminación visual premium

- Se siguió bajando remanente visual viejo para que el sistema no se perciba oscuro:
  - `Configuración` ya usa mejor la paleta principal en tabs y guardado
  - `SeccionGeneral` quedó más clara para branding y turnos
  - `SeccionAvanzado` ajustó lenguaje y acentos
  - `Productos` quedó bastante más fino en filtros, selección masiva, modal y detalle
  - `Delivery` suavizó overlays de modales
  - navegación lateral y títulos internos corregidos con acentos consistentes

## Verificación de esta pasada

- `npm run build` OK
- `npm run verify:core` OK
- `npm run verify:operacion` OK
