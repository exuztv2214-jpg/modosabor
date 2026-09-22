# Auditoría técnica y operativa — 15/09/2026

## Dictamen

El sistema tiene una base funcional amplia y verificaciones que pasan, pero no está validado de punta a punta para operar todos los canales. Los principales bloqueos actuales son operativos y de configuración; también hay defectos comprobados en la infraestructura de pruebas y un conflicto de permisos en atención humana.

Auditoría de lectura: no se modificó código, configuración, usuarios, pedidos ni movimientos operativos. Los recorridos HTTP se ejecutaron con bases temporales y datos ficticios. Se generaron builds y este informe. No se enviaron mensajes, publicaciones, notificaciones ni pagos reales.

No equivale a una revisión línea por línea de todo el repositorio, un pentest completo, una certificación contable ni una prueba de todos los dispositivos. Las revisiones de código, pruebas automatizadas, estado del servicio e integraciones externas se distinguen abajo.

## Evidencia general

- Rama `main`, commit `006b67a3`, siete commits por delante de `origin/main` según la referencia local. No se hizo push ni se verificó una ejecución remota de CI.
- Sin diferencias en archivos rastreados al iniciar; se conservaron los documentos y archivos no rastreados del usuario.
- Railway: despliegue `9d5bfe84-5c2a-4e1e-a27a-0f67913369f4`, del 10/09, estado SUCCESS.
- Health público: API y SQLite correctas; Mercado Pago no configurado.
- API local en puerto 3001: no disponible durante la auditoría.
- SQLite local y Railway: `quick_check = ok`; `foreign_key_check` sin filas.
- No se encontraron bases de datos ni archivos `.env` reales entre los archivos rastreados consultados; sí plantillas `.env.example`.

### Local y Railway no son réplicas sincronizadas

| Dato | Local | Railway |
|---|---:|---:|
| Productos | 90 | 123 |
| Clientes | 44 | 318 |
| Pedidos | 7 | 605 |
| Usuarios | 4 | 2 |
| Personal | 4 | 7 |
| Repartidores | 3 | 8 |
| Cajas registradas | 70 | 91 |
| Sesión WhatsApp persistida | Sí | No |
| Último mensaje WhatsApp almacenado | 11/09/2026 01:03:21 | 29/08/2026 03:10:54 |
| Modelo WhatsApp configurado | Gemini 3.1 Flash Lite | Gemini 3.5 Flash Lite |
| Credencial Firebase con estructura esperada en el entorno | No | Sí |
| Datos efectivos para transferencias | No | Sí |

Las fechas de mensajes son las almacenadas en SQLite; no se reinterpretan como hora local del teléfono. Los conteos no prueban por sí solos pérdida de datos: demuestran que son bases distintas. No restaurar una encima de otra sin una conciliación previa.

## Hallazgos priorizados

### Alta — WhatsApp no está operativo desde Railway como canal real verificado

La carpeta de sesión está en el volumen esperado, pero no existe `whatsapp-sesion/creds.json`. No hay mensajes nuevos registrados desde agosto. La API desplegada y una prueba de IA no equivalen a una vinculación del teléfono. Local conserva su sesión, pero su servidor está apagado.

Pendiente: vincular desde el panel de Railway, mantener una sola instancia autorizada para atender, y probar texto, audio, pedido y confirmación desde otro celular. No se copió ni se activó ninguna sesión durante esta auditoría.

### Alta para puesta en marcha — Mercado Pago no configurado

El health de producción devuelve `mercadoPagoConfigured: false`. Existen rutas de preferencias y webhook, pero no se verificaron pagos, acreditaciones, rechazos ni devoluciones reales.

Pendiente: configurar la cuenta y realizar el circuito de validación correspondiente. Tener el formulario y el código no demuestra que los pagos funcionen.

### Alta para atención — Caja ve el aviso humano, pero no puede gestionar el chat

`server/routes/whatsappMasivo.js` permite consultar el contador de conversaciones pendientes con autenticación, pero después aplica `requirePermission('marketing.edit')` a las rutas de conversaciones y control del bot. El rol `caja` no posee ese permiso en `server/utils/permissions.js`.

Consecuencia: si la persona que atiende está logueada como caja, puede recibir el aviso y no poder completar la atención desde esas rutas. Admin sí puede acceder. Es un conflicto funcional de permisos, no una exposición pública demostrada.

Pendiente: separar el permiso para atención individual del permiso para campañas masivas. No otorgar marketing completo al cajero sólo para resolver esta limitación.

### Alta para CI — Las verificaciones HTTP requieren una base inexistente en un checkout limpio

`.github/workflows/ci.yml` ejecuta las verificaciones aisladas después de los tests. `server/scripts/verify-isolated.js` intenta copiar una base con `readonly: true, fileMustExist: true`. La base no está rastreada y el workflow no contiene un paso explícito que cree esa base fuente y su catálogo. Los tests ordinarios usan una base temporal y la eliminan.

Reproducción: apuntar el verificador a una base inexistente termina con código 1 y `unable to open database file`.

Pendiente: construir una base de fixtures autónoma para CI. No subir la base del negocio al repositorio como solución. Este fallo de precondición fue reproducido localmente; no se lanzó una ejecución de GitHub Actions.

### Media — Mozo y WhatsApp tienen pruebas dependientes del producto elegido

`verify-mozo.js` toma el primer producto con precio positivo. `verify-whatsapp-agent.js` toma el primer producto elegible por su consulta. Ambos crean un pedido sin completar necesariamente las opciones obligatorias del producto.

Reproducción sobre una base temporal con el catálogo de fixtures:

- Mozo: HTTP 400, presentado por el script como fallo de precio de servidor.
- WhatsApp: HTTP 400, falta elegir Tamaño para el producto de prueba.
- Con opciones vacías exclusivamente en ese catálogo temporal, ambos recorridos pasan.

Conclusión: la validación de opciones del servidor está actuando; la preparación y el diagnóstico de estas pruebas son frágiles. No es evidencia de que el módulo venda mal todos los productos.

Pendiente: cada verificación debe crear y usar su propio producto simple, además de incorporar casos explícitos con variantes obligatorias.

### Media — Aislar la base no aísla necesariamente las salidas externas

`verify-isolated.js` copia la base fuente completa. `startSocialScheduler()` arranca desde `index.js` y puede procesar la cola cada 30 segundos; el scheduler revisado no comprueba `ISOLATED_OPERATIONAL_TEST` ni `NODE_ENV=test`. El arranque de WhatsApp tiene su propia bandera, que el wrapper no establece explícitamente.

Riesgo: una copia de datos operativos puede conservar colas y configuración externa. No se observó un envío causado por la auditoría. Para evitarlo, los recorridos de esta auditoría usaron bases ficticias sin campañas/clientes reales y deshabilitaron el arranque de WhatsApp.

Pendiente: bloquear explícitamente schedulers, sesiones y notificaciones en el entorno de verificación, además de aislar SQLite.

### Media — Configuración y datos divergentes entre entornos

Además de los conteos distintos, no coinciden el modelo del agente ni la configuración de transferencias y Firebase. Por ello una prueba local no certifica la misma operación en Railway.

Pendiente: declarar Railway como fuente operativa si ésa es la instalación elegida, separar claramente pruebas y producción y definir un procedimiento de actualización de configuración. No sincronizar a ciegas las bases.

### Preventivo — Espacio y recuperación

En Railway se midieron aproximadamente 112 MB libres sobre 433 MB visibles al filesystem. Había tres archivos de backup y el más reciente tenía fecha 15/09/2026 19:05:59 UTC. La restauración automática se probó sobre una base ficticia, no sobre un respaldo completo real de producción.

Pendiente: vigilar crecimiento de uploads, mensajes y backups; ensayar recuperación completa en un destino separado, incluyendo archivos y configuración. No se borraron copias para liberar espacio.

## Estado por módulo

| Módulo | Evidencia obtenida | Estado y trabajo pendiente |
|---|---|---|
| Autenticación y usuarios | Pruebas de login, identidad y revocación al cambiar contraseña; rutas protegidas inspeccionadas | Base funcional. Falta matriz exhaustiva de cada endpoint por rol. |
| Permisos | Cinco endpoints sensibles de producción devolvieron 401 sin sesión; revisión de roles | Controles presentes. Corregir conflicto caja/atención WhatsApp. Esto no sustituye un pentest. |
| TPV y cobro | Pedido interno creado por HTTP aislado; suite y build correctos | Flujo básico aprobado. Faltan sesión completa de caja, teclado, cobro combinado y errores de red en navegador del local. |
| Pedidos y web pública | Alta pública, visibilidad administrativa, cambios de estado y cancelación con motivo aprobados | Circuito básico aprobado. Pagos externos y todos los casos de entrega no fueron probados en producción. |
| Tiempo real y KDS | Evento autenticado de nuevo pedido aprobado; conversión monetaria y roles inspeccionados en Socket.IO | Mecanismo implementado. Falta prueba multiusuario/multidispositivo con reconexión real y carga. |
| Impresión | Documento de ticket y pack ticket/comanda generados por pruebas | Generación aprobada. No se certifican impresora física, márgenes ni ausencia de doble impresión entre pestañas y dispositivos. |
| Caja y cierre automático | Estado/caja operativa aprobado; scheduler de cierre cada 30 segundos y persistencia revisados | Turnos configurados hasta 15:00 y 02:00 en ambos entornos. No se observó en vivo un cierre a las 15:00 ni se concilió efectivo físico. |
| Productos, categorías y listas | Código de precios de servidor, variantes y listas inspeccionado; tests de catálogo y precios aprobados | Base funcional. Validar la carta real, recetas y precios por canal antes de usarla comercialmente. Las pruebas HTTP dependen del producto elegido. |
| Operación y menú del día | Resumen y menú por HTTP aprobados; stock/plato/receta mediante asistente probado en base temporal | Flujos comprobados con fixtures. Falta validación del menú efectivo y disponibilidad del turno real. |
| Inventario y compras | Consulta HTTP aprobada; rutas protegidas y transacciones de compras revisadas; suite de reglas aprobada | Implementados. No se hizo conciliación física ni se recorrieron todas las combinaciones compra/merma/devolución/costo. |
| Clientes y direcciones | Alta y vinculación automática con pedido probadas; referencias de las bases sin errores | Base funcional. No se validaron todas las direcciones reales ni la precisión de geocodificación. |
| Cuenta corriente | Cobro protegido por permiso, transacción y caja requerida para efectivo inspeccionados; tests aprobados | Implementada. Falta conciliación comercial de saldos y prueba manual de todos los medios de pago. |
| Cupones y fidelización | Reglas y conversiones revisadas; pruebas de la suite aprobadas | Implementados. Falta probar promociones reales combinadas, vencimientos y canjes en operación del local. |
| Personal | Alta/asistencia, bloqueo de liquidación duplicada, baja lógica y privacidad del reloj aprobados por HTTP | Circuitos básicos aprobados. Falta validar reglas salariales, dispositivos de fichada y liquidación contra casos del negocio. |
| Mozo y mesas | Build propio aprobado; login nativo, mesa propia, precio de servidor e idempotencia aprobados con producto simple | Módulo base funcional. Verificador frágil con variantes; falta prueba Android y red intermitente. |
| Rider y delivery | Consulta HTTP y pruebas de lógica aprobadas; credencial Firebase estructurada presente en Railway | Configurado parcialmente. No se enviaron pushes ni se verificaron GPS, segundo plano, permisos o entrega física en dispositivos. Local no tiene esa credencial de entorno. |
| Chispita | Pruebas de pedido, cliente, deduplicación, alerta y traspaso humano aprobadas; configuración inspeccionada | Bloqueo operativo en Railway por sesión no vinculada. Local apagado. No se repitieron llamadas reales a Gemini en esta auditoría; resultados previos no se cuentan como validación actual del proveedor. |
| WhatsApp masivo | Reglas y motor de campañas incluidos en la suite; permisos de marketing presentes | Código y pruebas disponibles. Sin sesión activa verificada no está listo para enviar. No se enviaron campañas. |
| Social y marketing | Scheduler, recuperación de estados ambiguos, permisos y componentes inspeccionados; suite aprobada | Implementado, no validado externamente. Las cuentas registradas no prueban tokens vigentes, permisos Meta o worker disponible. No se publicaron contenidos. |
| Asistente interno | Prueba aislada de propuestas, firmas y ejecución confirmada de stock/receta/plato aprobada | Acciones probadas sin API IA real. No se certifica disponibilidad actual del proveedor global. |
| Reportes y resultados | Dashboard por HTTP aprobado; consultas protegidas inspeccionadas | Base funcional. No se realizó conciliación contable de los 605 pedidos productivos ni certificación fiscal. |
| Importación/exportación | Restricción de administrador y rutas inspeccionadas | Existe. No se ejecutó una importación sobre datos del negocio ni se certificaron todos los formatos. |
| Backups y despliegue | Backup/restauración ficticia aprobado, backup reciente en Railway, health y despliegue exitosos | Producción sana a nivel servicio. Falta recuperación integral y arreglar las precondiciones del CI. |

## Verificaciones ejecutadas y límites

| Verificación | Resultado |
|---|---|
| `npm --prefix server test` | 129 archivos aprobados, 0 fallidos. Incluye tests de lógica, estructura y mocks; no todos son E2E. |
| `npm run lint` | Exit 0 para cliente y servidor. |
| `npm run build` | Aprobado. |
| `npm --prefix mozo-app run build` | Aprobado. |
| `npm audit --omit=dev` en server y client | 0 vulnerabilidades informadas por npm en ambos al consultar. No prueba ausencia de vulnerabilidades desconocidas. |
| `verify:core` con base ficticia | Aprobado. |
| `verify:operacion` con base ficticia | Aprobado. |
| `verify:mozo` con catálogo de fixtures | Falló por HTTP 400; pasó con opciones vacías en el catálogo temporal. |
| `verify:whatsapp` con catálogo de fixtures | Falló por variante obligatoria; pasó con opciones vacías en el catálogo temporal. |
| Asistente, modo operativo aislado | Aprobado, incluidas acciones confirmadas. |
| `verify:backup` | Restauración ficticia aprobada. |
| Verificador con base fuente inexistente | Fallo reproducido: `unable to open database file`. |
| Cinco rutas sensibles, producción sin autenticación | 401 en pedidos, inventario, dashboard, estado WhatsApp y usuarios. |
| Integridad SQLite local y Railway | Correcta, sin referencias rotas detectadas por SQLite. |

No hay un script de typecheck independiente en los paquetes raíz, cliente y Mozo inspeccionados; el build no sustituye un análisis estático completo de tipos. No se reinstalaron dependencias ni se ejecutó `audit fix`: se preservó el entorno existente. Tampoco se compilaron binarios Android/iOS ni se alteraron credenciales.

## Orden recomendado de trabajo

1. Definir la fuente operativa y vincular WhatsApp en Railway; mantener separada la instalación local.
2. Separar permisos de atención humana y campañas, y probar con un usuario caja real.
3. Hacer el CI autónomo: base de fixtures, productos propios de prueba y bloqueo de efectos externos.
4. Configurar y probar Mercado Pago si se va a ofrecer como medio de pago.
5. Ejecutar una jornada de ensayo: TPV, KDS, una impresión por pedido, Mozo, Rider, cierre y reporte.
6. Ensayar restauración completa fuera de producción y revisar capacidad del volumen.

## Archivos principales utilizados como evidencia

- `server/scripts/verify-isolated.js`, `verify-core.js`, `verify-operacion.js`, `verify-mozo.js`, `verify-whatsapp-agent.js`.
- `server/tests/run.js`, `server/tests/fixtures`, `server/tests/utils/asistente.test.js`.
- `.github/workflows/ci.yml`.
- `server/index.js`, `server/utils/operationalCaja.js`, `server/routes/caja.js`.
- `server/utils/permissions.js`, `server/routes/auth.js`, `server/routes/whatsappMasivo.js`.
- `server/services/socialScheduler.js`, `server/utils/socketRooms.js`, `server/utils/firebasePush.js`.
- `server/services/preciosServidor.js`, rutas de compras, inventario, clientes/cuenta corriente, cupones, fidelización, reportes, Mozo e intercambio de datos.
- `server/utils/storagePaths.js`, `server/utils/backupManager.js`, `docs/RAILWAY-DEPLOY.md`.

Las auditorías de agosto y parte del README describen etapas anteriores del proyecto. No se usaron como prueba de que una funcionalidad siga rota o esté actualmente operativa.
