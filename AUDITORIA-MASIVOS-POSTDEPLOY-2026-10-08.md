# Auditoría de Masivos después del despliegue — 2026-10-08

## Resultado y alcance

La versión `8f91551900f4f6fcd714b53241a70ea454ba8903` está publicada en los dos servicios de producción. WhatsApp recuperó su sesión y reportó `listo`. Se conservaron los 574 contactos, 507 conversaciones almacenadas y los archivos de configuración, exclusiones y pausas: sus SHA-256 coinciden antes y después. La base principal pasó `PRAGMA integrity_check` y conservó 2 usuarios, 387 clientes y 914 pedidos.

La auditoría cubre Masivos completo: contactos/importación/LID, campañas, confirmación, reintentos, adjuntos, programación, bajas, conversaciones, CRM, métricas, configuración, identidad, archivos, sesión, dependencia de Chromium, proxy autenticado, permisos, turnos/pedidos del sistema principal, CI y despliegue. La revisión del resto de Modo Sabor se limita a estas integraciones y a la regresión automatizada existente. No constituye una auditoría manual de cada módulo de caja, Rider, inventario o redes sociales.

Se inspeccionaron código y bitácoras existentes, archivos y respuestas reales de Railway, las seis pantallas del panel en Chrome autenticado y pruebas aisladas de fallos con archivos temporales y WhatsApp simulado. **No se enviaron mensajes, campañas ni pruebas a personas.** No se cambiaron ajustes operativos desde el panel.

Los hallazgos siguientes son pendientes detectados después del despliegue; no se mezclaron nuevas correcciones con esta auditoría. Los diez problemas del informe anterior y cinco de las seis mejoras solicitadas ya están corregidos en la versión publicada. Los botones interactivos reales siguen pendientes.

## Despliegue y comprobaciones

| Elemento | Evidencia |
|---|---|
| Repositorio | `exuztv2214-jpg/modosabor`, rama remota `main` |
| Código publicado | `8f91551` — `fix(masivos): proteger campañas por turno y completar identidad del panel` |
| Servicio principal | `modosabor-api`, despliegue `031e09a0-6ccb-41ec-89e8-b8c953ad870c`, `SUCCESS` |
| Servicio Masivos | `modosabor-masivos`, despliegue `d9685a80-666d-47c0-925d-b3ad303d42f2`, `SUCCESS` |
| CI del código publicado | [Ejecución 37838824571](https://github.com/exuztv2214-jpg/modosabor/actions/runs/37838824571), tres trabajos correctos: backend, frontend y Mozo |
| Acceso | [Panel de producción](https://www.modosabor.com.ar/masivos) |
| Código remoto | SHA-256 de `masivos/server.js` y `public/app.js` coincidentes con el checkout publicado; proxy principal comprobado por SSH |
| Salud pública | `/api/health`: 200 |
| Protección del panel | `/masivos/api/status` sin sesión: 401; dominio directo de Masivos sin token: 403 |
| Datos servidor a servidor | `/api/masivos-datos/turnos` sin token: 403; con token: 200 y horarios reales |
| Sesión | WhatsApp `listo`; motor detenido; programación automática inactiva, como antes del despliegue |
| Turnos | Mañana 10:00–15:00; noche 20:30–02:00; `NO_REPETIR_MISMO_TURNO=true` |
| Navegador | Inicio, Campaña, Contactos, Chats, Resultados y Configuración cargan; perfil/logo/control de turno visibles; modal de alta cancelado sin guardar; sin errores de consola observados |

Verificación del código: `npm --prefix masivos run verify` pasó sus comprobaciones y 30 regresiones; `npm --prefix server test` pasó 146 archivos, 0 fallados, con base temporal. ESLint de los archivos principales modificados, sintaxis JavaScript/Python, `verify-masivos-cutover.cjs` y `git diff --check` correctos. La CI también pasó los flujos aislados operativos, restauración de respaldo, lint y compilaciones.

Antes de publicar se guardaron en `C:/Users/Exuz/Documents/ModoSabor-backups/2026-10-08-masivos-release`:

- `modosabor.sqlite.gz` y su copia descomprimida: snapshot consistente de SQLite, integridad local `ok`. SHA-256 comprimido: `de89a653694ac77353ab3307adf2d4d3aba890a004307ce2ffd395c760ca3fd9`.
- `masivos-datos.tgz`: datos operativos, configuración, historial y multimedia; diez JSON validados y rutas del archivo comprobadas. SHA-256: `e8edb626d2f6f3320e41861b54033351d3497e048bfd3274ab0cdced79f1cfe0`.
- El respaldo manual de Masivos excluye sesión de Chromium, fotos y respaldos previos. La sesión permanece en el volumen; este archivo no se presenta como un respaldo integral restaurable de WhatsApp.

## Corregir primero

### 1. [P1] Un envío aceptado con respuesta ambigua puede repetirse

**Lugar:** `masivos/server.js:2417–2444`, bucle de `correrEnvio`.

Si WhatsApp acepta un mensaje pero `sendMessage` termina con un timeout u otro error no clasificado como fatal, el motor vuelve a intentarlo. El registro por turno se escribe después de que la promesa devuelve éxito. No distingue «falló antes de enviar» de «quizás enviado».

**Prueba aislada:** un destinatario; el adaptador simulado registra aceptación y falla en la primera llamada, devuelve éxito en la segunda. Resultado: dos aceptaciones para el mismo contacto, mientras las estadísticas muestran un solo envío correcto. No es una duplicación observada en clientes reales.

**Cambio mínimo:** persistir intento/identificador y un estado `incierto`; no reintentar automáticamente errores ambiguos. Conciliar por ID/ack cuando sea posible y exigir revisión explícita para resolver los inciertos. Documentar que el canal QR no proporciona por sí solo una garantía de entrega exactamente una vez.

### 2. [P1] Exclusiones y pausas dañadas se interpretan como listas vacías

**Lugar:** `masivos/server.js:340`, `359`, `493`, llamados desde selección y `contactoHabilitadoMotor`.

La lectura devuelve un conjunto vacío o `{}` tanto cuando aún no existe un archivo como cuando hay JSON inválido o un error de lectura. En ese segundo caso una baja/pausa previamente guardada deja de bloquear.

**Prueba aislada:** escribir JSON inválido en exclusiones y pausas; ambas lecturas devuelven cero registros y la campaña simulada manda a los dos contactos de la prueba.

**Cambio mínimo:** diferenciar `ENOENT` inicial de corrupción/error de disco. Ante un archivo existente ilegible, bloquear campañas y mostrar una alerta de recuperación. Mantener el original para diagnóstico y restauración.

### 3. [P2] El respaldo automático no permite restaurar el estado operativo completo

**Lugar:** `masivos/server.js:718–743`, `hacerBackup`.

Sólo copia contactos, exclusiones y etiquetas; omite pausas, grupos, mensajes, campañas, registro por turno, perfiles y configuración. Además silencia fallos y guarda las copias en el mismo volumen. Restaurar sólo esos archivos puede perder protecciones y permitir repetir campañas.

**Prueba aislada:** crear pausas, registro por turno y perfiles, ejecutar el respaldo y enumerar la copia: ninguno de esos tres archivos queda incluido. La copia manual de esta publicación es más amplia; no cambia la limitación del respaldo rutinario.

**Cambio mínimo:** un manifiesto único de datos operativos, copia consistente y verificación de lectura, estado visible del último respaldo y copia fuera del volumen. Probar restauración en un directorio temporal. Tratar sesión de WhatsApp como una categoría aparte, con acceso restringido.

## Corregir después

### 4. [P2] Reemplazar multimedia puede borrar el original antes de guardar el nuevo

**Lugar:** `masivos/server.js:4027–4036`; también revisar escrituras directas de configuración (`3281`), campañas (`554`) y PDF (`4069`).

La opción de reemplazar imágenes elimina las anteriores antes de escribir el archivo nuevo. Un fallo de disco pierde el material vigente. Varias escrituras JSON importantes aún usan `writeFileSync` directamente, aunque ya existe `escribirJsonSeguro`.

**Prueba aislada:** imagen original existente, reemplazo válido y fallo `ENOSPC` simulado al escribir: la petición falla y el original ya no existe.

**Cambio mínimo:** validar y escribir un temporal antes de reemplazar; borrar imágenes anteriores sólo tras confirmar el archivo nuevo. Reutilizar el reemplazo atómico existente para los JSON críticos y propagar los fallos que afecten a la trazabilidad.

### 5. [P2] El programador olvida que ya ejecutó al reiniciar

**Lugar:** `masivos/server.js:4423–4455`, `ultimaCorridaProgramada`.

La marca diaria sólo vive en memoria. Reiniciar dentro del minuto programado permite otra corrida. El registro por turno evita repetir contactos ya confirmados, pero la segunda corrida puede enviar a otra tanda y superar el alcance esperado de una única ejecución diaria.

**Prueba aislada:** máximo de un contacto por corrida; ejecutar el tick programado, reiniciar la marca de memoria y repetir el tick en el mismo minuto: se envía a dos destinatarios distintos.

**Cambio mínimo:** persistir fecha/hora/ID y estado de cada ejecución antes de comenzar. Al arrancar, recuperar esa marca y mostrar si fue bloqueada, interrumpida o completada. La programación está desactivada actualmente en producción.

### 6. [P2] Una campaña interrumpida queda registrada como si siguiera ejecutándose

**Lugar:** creación/persistencia en `masivos/server.js:551–599`, finalización `2544`, arranque del motor `2117` y cierre `4462`.

Una caída o redeploy antes de finalizar deja `estado=corriendo` en disco. El motor nuevo comienza detenido, sin reconciliar campañas previas. El cierre sólo maneja `SIGINT`, no `SIGTERM` del contenedor.

**Prueba aislada:** guardar una campaña `corriendo` y consultar el panel recién inicializado: historial `corriendo`, motor `false`. No hay una recuperación de pendientes al arrancar.

**Cambio mínimo:** marcar ejecuciones huérfanas como `interrumpida`, conservar enviados/pendientes/inciertos y ofrecer una nueva preparación revisable. Manejar `SIGTERM` para detener el motor y cerrar sesión ordenadamente. No reanudar envíos automáticamente.

### 7. [P2] Los turnos almacenados no caducan

**Lugar:** `masivos/server.js:259–260` y `4370–4391`.

Si falla la sincronización del sistema principal, cualquier caché con un array de turnos sigue siendo válida, sin comprobar `actualizado`. Los horarios pueden haber cambiado y el panel seguir calculando claves de turno antiguas indefinidamente.

**Prueba aislada:** una caché fechada en el año 2000 devuelve `turnosDisponibles()=true`.

**Cambio mínimo:** mostrar la antigüedad de la sincronización y definir una tolerancia explícita. Superada esa tolerancia, impedir nuevas campañas hasta revalidar los horarios. La caché de producción sí se sincronizó en este despliegue.

### 8. [P2] La primera migración después de medianoche omite envíos de la noche anterior

**Lugar:** `masivos/server.js:245–266`.

Cuando falta `envios-turno.json`, la migración lee únicamente `enviados-HOY.json`. Si la instalación se actualiza a las 00:30 durante el turno iniciado el día anterior, no incorpora envíos hechos a las 23:00 de esa misma noche.

**Prueba aislada:** turno `2026-10-07:noche`, fecha actual `2026-10-08`, envío registrado el 7 y registro por turno inexistente: cero bloqueados. El funcionamiento normal después de crear el registro sí conserva la noche a través de medianoche.

**Cambio mínimo:** durante la migración, incluir conservadoramente los archivos de todas las fechas cubiertas por el turno activo. Este despliegue se realizó por la tarde, fuera del escenario de reproducción.

### 9. [P2] Dependencias con avisos de seguridad pendientes de tratar

**Lugar:** `masivos/package-lock.json`, cadena Express/Puppeteer/whatsapp-web.js.

`npm audit --omit=dev --package-lock-only --json`, consultado el 8 de octubre, reportó **14 nodos afectados: 1 crítico, 12 altos y 1 moderado**. Son dependencias relacionadas, no catorce ataques independientes demostrados. Versiones reales comprobadas en el contenedor: Express 5.2.1, proxy-addr 2.0.7, qs 6.15.3, Puppeteer 24.38.0 y whatsapp-web.js 1.34.7.

El aviso crítico de [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) requiere una configuración vulnerable de subredes de confianza; Masivos no activa `trust proxy` y su control local usa `req.socket.remoteAddress`. **No se demostró una evasión de autenticación en esta aplicación.** La corrección publicada por el mantenedor es 2.0.8.

El aviso de [extract-zip](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) afecta extracción de ZIP no confiable. No hay un importador ZIP expuesto por Masivos, y el contenedor usa Chromium del sistema con descarga de Puppeteer desactivada. La presencia del paquete requiere seguimiento, sin atribuirle una ruta explotable que no se comprobó.

**Cambio mínimo:** actualizar de forma controlada los paquetes con arreglo disponible, regenerar lock y verificar QR, sesión, sincronización y mensajería en un entorno de prueba. Separar los avisos transitivos sin arreglo automático y evaluar su uso real. No ejecutar `npm audit fix --force` ni cambiar a ciegas el commit de WhatsApp.

### 10. [P2] Poco margen de almacenamiento en el servicio principal

Railway reportó antes del despliegue **447,10 MB usados sobre 500 MB configurados** en la API, y 335,43 MB sobre 500 MB en Masivos. Las métricas del proveedor y `du` no miden exactamente lo mismo y cambian con la sesión; no se extrapoló una fecha de agotamiento.

La lectura posterior por SSH encontró aproximadamente 213 MiB en uploads y 95 MiB en respaldos del servicio principal. En Masivos la sesión de Chromium ocupa unos 253 MiB. Un volumen lleno afectaría archivos, SQLite y la persistencia del registro por turno. El historial de envíos y las imágenes antiguas de identidad tampoco tienen una política explícita de retención.

**Cambio mínimo:** alertas de espacio, revisar crecimiento y capacidad, respaldos externos y retención con restauración comprobada. No borrar uploads, sesiones ni respaldos para ganar espacio sin identificar y aprobar qué datos son prescindibles.

### 11. [P2] Cada carga descarga las imágenes completas y duplica la primera

**Lugar:** `masivos/server.js:3994–4010`; `masivos/public/app.js:1567`.

`GET /api/imagen` serializa todos los archivos en base64 y repite la primera imagen en el campo de compatibilidad `dataUrl`. `refresh()` lo solicita aunque se esté viendo otra sección.

**Medición real:** la respuesta actual pesa **5.541.911 bytes**, con aproximadamente 2 MiB de archivos multimedia almacenados. Con diez imágenes de 16 MiB el coste puede superar 200 MiB por respuesta; ese máximo es un cálculo, no una carga aplicada a producción.

**Cambio mínimo:** devolver metadatos y URLs autenticadas, servir los archivos como binario y cargar vista previa sólo al entrar a Campaña. Retirar el duplicado cuando ya no haya clientes antiguos que lo necesiten.

### 12. [P2] Las métricas de respuestas y lecturas no están atribuidas a campañas

**Lugar:** `masivos/server.js:824–849`, evento `message_ack` alrededor de `2083`, `/api/estadisticas` `4082–4130`.

Se registra cualquier mensaje entrante individual como respuesta y se guarda el último ack por contacto, aunque corresponda a una conversación manual. El panel combina esos contadores con envíos promocionales. Tampoco cuenta dos promos enviadas al mismo contacto en turnos distintos del mismo día como dos envíos: el histórico diario es un conjunto de contactos.

**Prueba aislada:** sin campañas ni envíos, insertar un ack leído y una consulta individual produce `enviados=0`, `leidos=1`, `respondieron=1`. Los eventos existen; su atribución comercial es lo que falta.

**Cambio mínimo:** persistir ID de mensaje, ID de campaña y turno, conciliar acks por mensaje y distinguir respuestas generales de respuestas posteriores a una campaña. Mostrar «contactos únicos» donde corresponda. Vincular ventas reales sólo mediante una atribución definida, sin convertir consultas o pedidos probables en ventas.

### 13. [P2] Configuración pierde cambios pendientes cuando se vuelve a renderizar

**Lugar:** `masivos/public/app.js:1322`, `1436`, `1497–1573`, `1627`, `1788–1792`, `2316`.

Los inputs generales se reconstruyen desde `state.config`. A diferencia del mensaje y del perfil, no hay borrador para estos campos. Una respuesta tardía de guardado, una actualización de datos o un evento de estado que renderice Configuración puede descartar texto escrito después.

**Prueba aislada de `saveSettings`:** con una edición nueva pendiente, la respuesta del servidor reemplaza la configuración y renderiza el valor anterior. Revisión del manejador `input`: guarda borradores de perfil/mensaje, pero no de configuración.

**Cambio mínimo:** conservar un borrador de configuración y su revisión, como ya se hace para perfil/mensaje; no limpiar cambios hechos después de iniciar el guardado. Mostrar si hay cambios sin guardar al navegar.

## Mejora pequeña

### 14. [P3] Una pausa válida de cero segundos aparece como 15/45 segundos

**Lugar:** `masivos/public/app.js:1336` y resumen de campaña `454`.

La API acepta cero; la interfaz utiliza `ms || fallback`, por lo que sustituye cero por el valor predeterminado. Guardar otros ajustes puede volver a persistir esa pausa distinta.

**Prueba aislada:** ejecutar la función real `seconds(0,15000)` devuelve 15.

**Cambio mínimo:** distinguir cero de ausencia (`??`) y cubrir el caso con una comprobación pequeña. No se recomienda usar pausas nulas para campañas reales; el problema es representar fielmente el ajuste guardado.

## Qué agregar y en qué orden

| Prioridad | Función | Resultado concreto y condición |
|---|---|---|
| 1 | Centro de campañas con estados enviado, pendiente, incierto e interrumpido | Resolver hallazgos 1, 5 y 6; revisión antes de retomar, sin reenvío automático de inciertos |
| 1 | Estado operativo visible | Última sincronización de turnos/pedidos, antigüedad de caché, último respaldo verificable y espacio disponible; alertas accionables |
| 1 | Botones interactivos reales por WhatsApp Business Platform | Elegir plantilla aprobada, completar parámetros, previsualizar botones reales y mantener el mismo control por turno. Requiere cuenta/número/credenciales configurados de forma segura y webhooks; ver [prerrequisitos](masivos/docs/botones-interactivos.md) |
| 2 | Agenda por fecha y turno | Campaña específica, destinatarios y adjuntos congelados/revisables, ejecución persistida; evitar que cambios del editor alteren un envío programado |
| 2 | Resultados por campaña vinculados a pedidos | Separar enviado/entregado/leído/respondido por ID; enlazar pedidos con una regla o código de campaña y mostrar la atribución usada |
| 2 | Recordatorios y seguimiento en Chats | Exponer las rutas existentes `/api/recordatorios` y completar recordatorios en la interfaz; el backend ya las ofrece y el frontend no las consume |
| 2 | Historial y deshacer de acciones sobre contactos | Reutilizar `/api/acciones-masivas` y `/api/acciones-masivas/deshacer`, mostrar cantidad afectada y estado anterior; no equivale a deshacer mensajes enviados |
| 3 | Exportación y restauración guiada | Exportación de contactos sin perder LID/etiquetas; vista previa y verificación de respaldo en un entorno temporal antes de sustituir datos |
| 3 | Despliegue coordinado de ambos servicios | Tras CI, publicar primero la API y después Masivos, registrar versión y salud de ambos. Este push no activó por sí solo ambos despliegues y Masivos no tiene repositorio de origen conectado |

Para botones: el commit instalado de [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js/blob/1780711a1c86dfeca7c5ba6a66f950eac93dde28/README.md#supported-features) declara el envío de botones como deprecado/no soportado. La integración oficial debe seguir las condiciones de plantillas y mensajería documentadas en el archivo de prerrequisitos. No se reemplazó ese pedido por enlaces ni por botones decorativos.

## Decisiones y límites de esta auditoría

- Conservar el sistema y sus funcionalidades. Resolver primero los riesgos concretos; no rehacer frontend/backend ni introducir otro framework para corregirlos.
- Mantener el acceso con usuario, permiso `marketing.edit` y token servidor a servidor. El proxy elimina cookies/autorización y reemplaza el ID de usuario enviado por el navegador por el autenticado. Las regresiones de proxy/perfil pasan.
- La sesión lista y la inspección de páginas prueban conexión/carga; no prueban entrega real ni funcionamiento de los botones de Business Platform.
- El manejo de fallos se verificó con simulación local. No se provocaron corrupción, falta de espacio, caídas o tráfico de carga en producción.
- Perfil/logo se probaron con carga y persistencia en el entorno aislado de la implementación anterior; en producción se verificaron controles y lecturas, sin cambiar la identidad real.
- El launcher de Windows no se ejecutó contra la sesión operativa en esta publicación. No se verificaron credenciales o plantillas de una cuenta Business Platform.
- Las dependencias se evaluaron sobre el lock y versiones instaladas. Se distinguió un aviso de seguridad de un ataque demostrado; no se hizo pentesting externo ni se aplicaron actualizaciones forzadas.
- Los informes anteriores conservan su fecha y contexto. Este documento y la bitácora reflejan el estado después de publicar `8f91551`.
