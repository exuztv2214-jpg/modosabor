# Auditoría del sistema — 19/09/2026

## Alcance y dictamen

### Actualización posterior: correcciones locales de pedidos públicos

Después de la auditoría, se corrigió la frontera pública de pedidos. Este apartado actualiza el estado; las reproducciones siguientes se conservan como evidencia histórica.

- Esquema público separado: solo web/kiosco, entrega delivery/retiro, precios de catálogo y sin descuento manual. Cupones calculados por servidor conservados.
- Se ignoran cliente_id, repartidor_id, mesa y pago_detalle en la entrada pública. Los canjes de puntos públicos se rechazan hasta implementar identidad verificada; el flujo interno permanece disponible.
- Un pedido público no modifica nombre, teléfono o dirección de una ficha ya existente. Los datos declarados se conservan en el pedido.
- El alta automática por pedido usa la normalización compartida de teléfonos y reutiliza una ficha equivalente, sin fusionar los duplicados históricos.
- Ambas entradas públicas (pedido y checkout) comparten el esquema. Mercado Pago no fue activado y su cálculo de preferencia sigue pendiente, fuera de esta etapa solicitada.
- Nueva regresión HTTP verify-public-orders.js incorporada al workflow CI. Verifica intentos de origen interno, precio alterado, descuento arbitrario, ficha ajena, canje no autorizado, variantes obligatorias, cupón válido y TPV autenticado.
- verify-operacion ahora crea su propio producto ficticio simple y usa origen web. El origen anterior sistema_check evitaba los controles públicos y ocultaba que el producto elegido tenía opciones obligatorias.

Verificación posterior: 134 archivos de tests aprobados; nueva regresión HTTP, core, catálogo, operación, Mozo, WhatsApp y asistente aprobados; lint servidor sin errores ni advertencias y diff sin errores de espacio. No se hizo commit, push ni deploy: las correcciones todavía no protegen Railway.

Límite adicional observado: una prueba de precio manual interno enviada como items array atravesó conversión monetaria duplicada; el formato JSON string que utiliza actualmente pedidoForm.js produjo el importe correcto. No se cambió ese contrato en esta corrección. Revisar y probar explícitamente ambas representaciones en una tarea de normalización monetaria.

Permanecen pendientes los demás hallazgos: exclusión de impresión entre documentos, visibilidad por turno del agente, integraciones/dispositivos, datos comerciales, recuperación y los problemas de Mercado Pago aplazados.

### Actualización posterior: impresión automática y turnos de Chispita

- La impresión automática ahora se reclama de forma atómica y durable en SQLite por pedido. Seis solicitudes concurrentes entregaron un solo HTML y crearon un solo trabajo; las otras cinco recibieron una omisión normal. Un fallo ficticio al registrar el trabajo revirtió el reclamo, y las reimpresiones manuales siguieron disponibles.
- Esta garantía evita el doble despacho desde pestañas o equipos que compartan la misma API/base. No prueba que la impresora física haya tomado el trabajo ni puede detectar un atasco posterior a la entrega del HTML; en esos casos queda la reimpresión manual.
- Chispita reutiliza ahora la misma visibilidad de categorías por turno que la carta pública para listar, buscar, cotizar y resolver productos. Las categorías inactivas o de otro turno no se ofrecen. Fuera de todo turno se conserva la política existente de mostrar la carta y bloquear la creación pública fuera de horario.
- Se añadieron verify-auto-print.js, cobertura de turnos en whatsappAuditRegression.test.js y ejecución de la nueva verificación en CI.

Verificación: suite de 134 archivos, verify-public-orders, verify-auto-print, verify-whatsapp, verify-whatsapp-attention, verify-operacion, lint completo y build del cliente aprobados localmente. Todavía no se hizo deploy ni prueba física.

Auditoría de lectura del código, configuración de despliegue, pruebas automatizadas y consultas de solo lectura a Railway. No se modificaron funcionalidades, credenciales ni datos del negocio. Se generaron builds y este informe. Las pruebas que escriben usaron bases ficticias temporales.

El núcleo de ventas supera las verificaciones disponibles. No equivale a certificar toda la operación: hay defectos reproducibles, diferencias entre local y producción e integraciones sin activar. No se realizó revisión línea por línea de todo el repositorio, pentest exhaustivo, conciliación contable ni pruebas físicas de dispositivos.

## Evidencia de esta ejecución

- Backend: 134 archivos de tests pasados, 0 fallados. Algunos son tests de funciones y otros comprueban patrones del código; no todos son pruebas de interfaz.
- Lint cliente y servidor: aprobado.
- Build cliente y Mozo: aprobados.
- Verificaciones aisladas aprobadas: core, catálogo, operación, Mozo, WhatsApp, atención WhatsApp, asistente y backup/restauración.
- Verificadores adicionales: imágenes de opciones y duplicados de clientes por API, aprobados.
- Navegador Edge headless: atención WhatsApp con build real y API simulada, aprobado; recepción sin recarga, tomar/devolver, conservación del borrador ante error, envío único y ancho móvil.
- Social Worker: comprobación de sintaxis aprobada. No se arrancó ni publicó.
- npm audit --omit=dev: 0 vulnerabilidades reportadas en servidor, cliente y Mozo. Esto no cubre todos los paquetes de desarrollo, Python, Electron ni vulnerabilidades desconocidas.
- No existe script independiente de typecheck en los paquetes principales. No se reinstalaron dependencias ni se ejecutó audit fix.
- SQLite local y producción: quick_check correcto y foreign_key_check sin filas.
- Producción: health HTTP 200. Sin autenticación, pedidos, inventario, dashboard, estado WhatsApp y usuarios responden 401.
- GitHub: últimos tres CI consultados exitosos; el más reciente es 35402178505, commit 430033c9. No incluye las correcciones locales sin commit.

## Estado de los entornos

| Dato | Local | Railway |
|---|---:|---:|
| Productos físicos en la tabla | 131 | 130 |
| Clientes | 44 | 324 |
| Pedidos | 7 | 638 |
| Integridad SQLite | Correcta | Correcta |

Estas bases no son réplicas. No reemplazar producción por la base local. Los conteos diferentes no demuestran pérdida de información.

Railway utiliza el despliegue 7373c940-991e-4dfb-8ff9-f3bdbe2dd757. En local siguen modificados whatsappGateway.js, systemClient.js y whatsappMasivo.js, más el test nuevo whatsappAuditRegression.test.js sin rastrear. Se conservaron todos los documentos, scripts e imágenes preexistentes no rastreados.

## Hallazgos prioritarios

### Ampliación: críticos en la frontera pública de pedidos

La continuación de la auditoría reprodujo problemas más graves que los inicialmente detectados. Estos hallazgos tienen prioridad sobre el orden propuesto al final del informe.

Se añadió server/scripts/audit-order-boundaries.js, que exige ISOLATED_OPERATIONAL_TEST=1. Se ejecutó mediante verify-isolated.js sobre base ficticia, servidor loopback y bloqueo de salidas externas. No se enviaron pedidos de prueba a Railway. El script es diagnóstico: muestra resultados observados, no es todavía una prueba de regresión que exija rechazar estos casos.

| Caso | Resultado observado |
|---|---|
| Control: producto de $5.000, origen web y precio adulterado | El servidor conservó $5.000 y pago pendiente: este control funciona |
| Pedido público con origen interno, caja ficticia abierta | HTTP 200, precio inferior al catálogo y pago marcado pagado sin sesión |
| Pedido público omitiendo origen, caja ficticia abierta | Mismo resultado: el esquema introduce tpv como valor por defecto |
| Pedido web con descuento manual de $4.999, sin cupón | HTTP 200, total $1 sobre producto de $5.000 |
| Pedido público indicando ID de otra ficha ficticia | HTTP 200; cambió nombre y teléfono de esa ficha sin autenticación |
| Alta pública con teléfono equivalente en otro formato | HTTP 200 y dos fichas equivalentes: duplicación confirmada también por HTTP |
| Producto asignado a un turno no vigente | Agente lo lista y cotiza OK; catálogo público lo oculta y creación lo rechaza |
| Reclamo de impresión desde dos contextos JS independientes | Ambos aceptan; repetir en el primero se bloquea. Confirma exclusión local al documento, no entre documentos |

La última prueba ejecuta la función real claimAlertKey en dos contextos de JavaScript; no simula la interfaz completa, no abre ventanas de impresión ni certifica una impresora física.

Causas del límite público:

- server/routes/pedidos.js:1340 permite POST sin login y conserva origen del body.
- server/schemas/index.js define origen con valor predeterminado tpv para el esquema compartido.
- server/services/pedidoService.js utiliza origen para decidir si fuerza precios públicos y aplica restricciones de turno.
- El descuento general del body entra al cálculo sin limitarlo al canal interno autorizado.
- El cliente_id recibido puede alcanzar la rama que actualiza datos de una ficha existente.

Se leyó el código desplegado por SSH: estas mismas condiciones están presentes en Railway. Esto confirma presencia de la lógica, no una explotación en producción. No se revisó el historial buscando atribuir ataques ni se afirma que alguien haya aprovechado estos fallos.

Corrección prioritaria propuesta:

1. Separar esquema público e interno y fijar el origen público en servidor; la ruta interna debe mantener autenticación y permisos.
2. Calcular precios y descuentos públicos exclusivamente desde reglas autorizadas; impedir descuentos manuales y estados de cobro implícitos de TPV.
3. No permitir modificar fichas ni consumir beneficios por un ID arbitrario; definir identidad verificada para los canales públicos.
4. Añadir regresiones HTTP negativas para estos casos, sin retirar los controles positivos de catálogo y cupones.
5. Revisar también checkout y otros puntos de entrada al servicio común, publicar el arreglo completo y validar sin crear ventas reales no autorizadas.

No se implementó la corrección durante esta continuación de auditoría.

### Segunda ampliación: fidelización y checkout

Se amplió el diagnóstico aislado con dos casos adicionales:

- **Canje sin identidad verificada:** una solicitud HTTP pública que indica cliente_id y puntos_a_canjear consumió saldo de una ficha ficticia sin autenticación. El saldo pasó de 100 a 0 en el escenario ejecutado. No se atribuye todavía el tamaño exacto del consumo a una única causa: requiere revisar también conversiones y reglas de canje. Sí queda demostrado que no hubo verificación de titularidad antes del consumo.
- **Importe incorrecto de preferencia Mercado Pago:** se ejecutó el handler real de checkout con fetch simulado exclusivamente para el proveedor. Un producto de $5.000, con descuento interno de $1.000, produjo un pedido de $4.000, pero el cuerpo de la preferencia contenía unit_price=500000 y suma=500000. El handler utiliza importes internos en centavos sin convertirlos y arma los renglones sin aplicar el descuento al importe externo. No se creó una preferencia real ni se contactó Mercado Pago. Esta prueba invoca el handler después de la etapa de middleware, por eso los valores de entrada son internos.

Referencias: server/services/pedidoService.js:967 y :736; server/routes/pedidos.js:1189; server/utils/mercadoPago.js:29. El helper de Mercado Pago serializa el body sin convertir unidades.

Antes de activar Mercado Pago, asegurar que la suma enviada al proveedor coincida exactamente, en pesos, con el total final autorizado del pedido. Agregar casos con envío, descuentos, cupones y puntos, además del precio simple. Revisar también compensación de stock/beneficios cuando falla la creación de preferencia.

Estos casos mantienen la prioridad de separar el contrato público del interno y verificar identidad antes de usar beneficios. No se cambiaron rutas ni servicios; únicamente se amplió el script diagnóstico y este informe.

### 1. Alta: duplicación de clientes por el alta automática de pedidos

La API de administración de clientes aplica normalización y control de duplicados, pero createPedidoRecord compara telefono por igualdad literal y luego inserta si no encuentra coincidencia.

Reproducción aislada: se registró una ficha ficticia con teléfono formateado; se llamó a createPedidoRecord con el mismo número sin separadores. Resultado: dos clientes y un pedido creado. Es una reproducción del servicio interno, no una venta real ni una reproducción HTTP completa.

Producción: usando phoneKey, la misma normalización del control de clientes, hay 28 grupos duplicados que abarcan 56 fichas. Un análisis más amplio por últimos diez dígitos arroja 31 candidatos; no confundir esos candidatos con duplicados confirmados ni fusionarlos automáticamente.

Acción: unificar resolución de identidad en todas las altas (pedidos, clientes, fidelización, importación y WhatsApp), añadir prueba HTTP de alta automática y conciliar duplicados preservando pedidos, puntos, direcciones y saldos.

Evidencia: server/services/pedidoService.js:478 y :531; server/utils/clienteDuplicates.js; server/routes/clientes.js:895.

### 2. Alta: la impresión automática no tiene exclusión entre pestañas o equipos

GlobalOrderAlerts usa claimAlertKey para print, pero esa clave queda en un Map de memoria del documento. La persistencia en localStorage se usa únicamente para entregado. Dos pestañas o computadoras pueden reclamar el mismo pedido por separado. La ruta de impresión registra un trabajo nuevo en cada llamada y no recibe una clave de idempotencia de impresión automática.

No se observó una impresora duplicando en esta ejecución. El riesgo está confirmado por el alcance del bloqueo, y las pruebas actuales de impresión única verifican patrones de código, no dos navegadores concurrentes.

Acción: designar terminal de impresión o reclamar el trabajo de forma atómica en servidor; separar impresión automática de reimpresión manual y probar dos pestañas/dos equipos.

Evidencia: client/src/components/GlobalOrderAlerts.jsx:77; client/src/lib/orderAlerts.js:24; server/routes/pedidos.js:1408; server/tests/utils/impresionUnica.test.js.

### 3. Alta para atención: WhatsApp desconectado

Railway informa estado qr y no tiene creds.json persistido. La atención IA está habilitada, pero falta vincular el número. No se enviaron mensajes ni se cambió la sesión.

Las cuatro correcciones de la auditoría anterior están verificadas en local, sin publicar: audios durante pausas, categorías inactivas, teléfonos con separadores y período de métricas.

Acción: publicar el conjunto validado, vincular una sola instancia y probar texto, audio, alta, opciones, confirmación repetida, derivación y recuperación tras reinicio. La disponibilidad actual de Gemini y del proveedor alternativo no se certificó con llamadas reales.

### 4. Alta para pagos online: Mercado Pago no configurado

El health productivo devuelve mercadoPagoConfigured=false. La existencia de checkout/webhook no acredita cobros reales. No se intentaron pagos ni devoluciones.

Acción: configurar y ensayar aprobación, rechazo, pendiente, repetición de webhook y conciliación antes de ofrecerlo como canal operativo.

### 5. Media: Chispita puede consultar productos de otro turno

El catálogo público usa catalogVisibility, que filtra categorías por turno. Las consultas getProducts/getProductById del agente filtran actividad, pero no turno_id. buildPedidoPayload sí valida el turno al crear el pedido. Puede existir una oferta/cotización que luego se rechaza al confirmar.

Producción tiene ocho categorías nocturnas, una de mañana y dos sin restricción. Es una inconsistencia de código relevante para la configuración actual; no se registró una conversación real que la reprodujera.

Acción: reutilizar la misma política de disponibilidad en consulta, cotización y creación.

Evidencia: server/utils/systemClient.js:205; server/utils/catalogVisibility.js; server/services/pedidoService.js:929.

### 6. Media: cierre automático no equivale a arqueo físico

El turno mañana está configurado 10:00–15:00; noche 20:30–02:00. Railway contiene 97 cierres automáticos. Los tres últimos consultados tienen reporte persistido; uno corresponde al 18/09 a las 18:01 UTC, 15:01 Argentina.

closeCaja escribe monto_final_declarado igual al efectivo esperado y diferencia=0. Es un valor calculado, no contado por el cajero. No interpretar ese cero como conciliación física comprobada.

Acción: distinguir cierre automático estimado de arqueo confirmado y permitir registrar conteo/diferencia sin perder el reporte original.

Evidencia: server/index.js:476; server/utils/operationalCaja.js:104.

### 7. Media: push Rider y Social sin evidencia operativa reciente

Railway tiene FIREBASE_SERVICE_ACCOUNT_JSON presente, pero cero repartidores con fcm_token. Sin token no hay destino para la notificación push. La presencia de la variable no prueba credenciales válidas ni entrega.

Social Worker tiene último heartbeat 2026-08-25 01:24:04 UTC. La fila conserva estado online, pero el servicio calcula offline por antigüedad; no es prueba de que la interfaz lo muestre conectado. La cola de destinos está vacía. No se validaron tokens Meta ni se publicó contenido.

Acción: registrar dispositivos Rider, probar push en primer/segundo plano y validar worker/cuentas antes de programar publicaciones dependientes de la PC.

### 8. Media: capacidad y recuperación

Volumen: 454.299.648 bytes totales, 78.462.976 disponibles (aproximadamente 74,8 MiB libres), 83 % usado. Hay tres backups SQLite de aproximadamente 21 MiB cada uno; el más reciente es del 18/09 a las 22:33 UTC.

La restauración ficticia pasa, pero no se ensayó recuperación integral de producción con imágenes y configuración en un entorno separado. No se borró ningún respaldo.

Acción: revisar capacidad/retención y mantener copia externa; ensayar recuperación completa fuera de producción.

### 9. Datos comerciales por completar

De 118 productos activos, 117 tienen el campo costo en cero. No usar esos valores como validación de margen real; deben contrastarse con costos de recetas y compras. La pantalla de costos ya advierte esta situación.

Las 27 opciones compartidas tienen imagen vacía en producción. La carga de imágenes está implementada y probada, pero todavía no hay fotos asignadas a esas opciones.

## Estado módulo por módulo

| Módulo | Estado verificado | Falta / modificación recomendada |
|---|---|---|
| Autenticación y usuarios | Login, revocación de sesiones y protección básica pasan | Matriz completa endpoint/rol y prueba de sesiones en dispositivos reales |
| TPV y cobro | Pedido interno, cálculo de pagos y validaciones pasan | Ensayo de jornada, teclado, caídas de red y concurrencia; resolver identidad e impresión |
| Pedidos y web pública | Alta, consulta administrativa, transición y cancelación con motivo pasan | Pago externo, datos reales de entrega y múltiples clientes concurrentes |
| Tiempo real y KDS | Evento autenticado de pedido probado; reglas monetarias y reconexión cubiertas | Dos pantallas reales, reconexión y carga; no certificar solo con tests de texto |
| Impresión | HTML ticket/comanda generado | Exclusión entre pestañas/equipos, impresora física, márgenes, reintentos |
| Caja y turnos | Cierre automático y reporte comprobados con tests y registros reales | Diferenciar arqueo físico de importe calculado; conciliación de efectivo |
| Productos | Precios de servidor, promociones y validaciones de catálogo pasan | Revisar costos, recetas y disponibilidad comercial real |
| Categorías | CRUD y restricciones de catálogo probados | Aplicar también restricción de turno a las consultas del agente |
| Listas de opciones e imágenes | Subida, validación, persistencia y uso compartido pasan | Cargar fotos reales; 0 de 27 opciones con imagen |
| Menú del día / operación | Resumen, disponibilidad fechada y reglas de precios probados | Recorrido real de menú económico/ejecutivo/premium con beneficios y agotados |
| Listas de precios por canal | Resolución y administración implementadas, suite aprobada | Conciliar precios reales entre web, TPV y agente con listas activadas |
| Clientes y direcciones | API bloquea duplicados incluso en solicitudes simultáneas | Corregir alta automática de pedidos y consolidar duplicados con revisión |
| Inventario / recetas | Consulta y reglas de stock/recetas cubiertas | Conteo físico, costos reales y ensayo compra–venta–cancelación–merma |
| Compras | Validaciones, permisos y transacciones inspeccionados | Conciliar medios de pago, proveedores y su impacto en caja/stock |
| Cuenta corriente | Límites y cobros implementados, tests pasan | Conciliar saldos reales y efectos de fichas duplicadas |
| Cupones | Unidades y reglas cubiertas por tests | Combinaciones comerciales, vencimientos y uso concurrente real |
| Fidelización / club | Reglas, seguridad pública y puntos cubiertos | Alta consistente de clientes, canjes reales y conciliación tras duplicados |
| Cotizaciones | Rutas protegidas y tests disponibles/aprobados | Recorrido comercial completo y control de precios antes de convertir |
| Personal / asistencia | Asistencia, bloqueo de liquidación duplicada y baja lógica probados por HTTP | Validación de salarios, horarios, liquidación y terminal de fichada del negocio |
| Mesas y Mozo | Login nativo, mesa propia, precio e idempotencia pasan; build correcto | Dispositivo Android, uso sin red y sincronización al volver |
| Rider / delivery | Consulta, reglas y código Firebase presentes | Registrar tokens; push, GPS, permisos, segundo plano y entrega real |
| WhatsApp atención | Pruebas locales y UI simulada pasan | Deploy de correcciones, QR, prueba real de IA/audio y restricción por turno |
| WhatsApp masivo | Reglas de cuotas, baja y deduplicación pasan | Sesión vinculada y ensayo controlado; no se enviaron campañas |
| Social / marketing | Permisos, cola, recuperación ambigua y suite aprobados; worker compila sintácticamente | Worker activo, cuentas y permisos válidos, prueba de publicación controlada |
| Asistente interno | Propuestas firmadas y acciones confirmadas pasan en entorno aislado | Proveedor real y evaluación de respuestas sobre casos representativos |
| Reportes / resultados | Dashboard probado, reglas de fechas y dinero cubiertas | Conciliación contra ventas/caja y completar costos; no certificación contable |
| Importación / exportación | Permisos, límite de archivos y tests CSV presentes | Ensayo integral con archivo real anonimizado y estrategia única de identidad |
| Auditoría / configuración | Rutas y registros presentes; revisión de protección básica | Cobertura completa de acciones sensibles y revisión periódica de retención |
| Backups | Backup/restauración ficticios correctos; copias productivas existentes | Restauración completa con uploads/configuración fuera de producción |
| Deploy / CI | CI remota reciente exitosa; API y DB saludables | Publicar cambios locales completos; README desactualizado en versiones |

## Orden propuesto

1. Corregir identidad de clientes en el servicio común y añadir prueba de regresión HTTP.
2. Resolver impresión única entre pestañas/equipos sin bloquear reimpresión manual.
3. Unificar visibilidad por turno en Chispita y publicar las correcciones locales verificadas.
4. Vincular WhatsApp y hacer una prueba real de texto/audio/pedido.
5. Activar y probar Rider/push y los canales de pago/publicación que se vayan a usar.
6. Conciliar duplicados, costos y arqueo; completar fotos de opciones.
7. Probar jornada completa y recuperación integral; revisar espacio antes de crecer.

No se implementaron estas acciones durante la auditoría. Los problemas ya corregidos en septiembre (permisos Caja/WhatsApp y verificadores dependientes de una base operativa) no se reportan como pendientes: sus nuevas pruebas pasaron hoy.
