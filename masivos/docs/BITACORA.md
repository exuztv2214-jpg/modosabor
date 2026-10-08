# Bitácora de Masivos

## 2026-10-08 — Listas de 100 y prioridad por compras

Se agregó en Contactos **Crear listas de 100**, para todos los habilitados o sólo los seleccionados. El modal revisa cantidad y nombre; cancelar no guarda. Los grupos se agregan sin borrar los anteriores y no se envía ningún mensaje al crearlos. Se respetan exclusiones/pausas y equivalencias teléfono/LID, incluso cuando una sincronización cambia la representación de un contacto seleccionado. Si no hay espacio para nuevos grupos, se rechaza la operación sin perder los existentes.

Las listas y el motor priorizan cantidad de pedidos reales de Modo Sabor y, ante empate, compra más reciente. Después se conserva la prioridad operativa existente. No se usa el número de consultas como si fueran compras; no encontrar un pedido asociado tampoco prueba que la persona nunca compró.

Uso manual: Contactos → seleccionar personas si corresponde → Crear listas de 100 → Campaña → elegir Lista 1, Lista 2, etc. Cada grupo tiene hasta 100 personas, y el envío sigue respetando el máximo y las pausas configurados.

Uso automático: Configuración → máximo por tanda 100 → Tandas automáticas → Campaña → Todos los habilitados → preparar y revisar. El motor recorre primero los 100 con mayor prioridad y luego los siguientes, con las pausas, cupo por ventana, bajas y bloqueo por turno vigentes. **Elegir una lista procesa sólo esa lista; no encadena las demás.** Crear listas no cambia estos ajustes ni activa programación automática. Cien por tanda no significa cien mensajes simultáneos ni garantiza evitar restricciones de WhatsApp.

Verificación local: 36 regresiones de Masivos y comprobaciones existentes correctas. Pruebas con 205 habilitados generan 100/100/5, sin duplicados; todos en modo tandas cubre 205 y un grupo cubre 100. Se verificaron cancelación, selección capturada, PN/LID y rechazo por capacidad. Navegador con datos ficticios: modal, creación y selector de grupos correctos, cero envíos; vista compacta observada de 434 px sin desbordamiento. Revisión independiente final sin nuevos P1/P2.

**Chispita: diferido por pedido explícito del usuario.** La detección de inactivos, propuesta de mensaje de recuperación y eventual automatización se definirán cuando lo solicite; no se implementó un envío automático de recuperación.

Bloqueos/lecturas: la falta de confirmación de entrega o lectura no permite afirmar por sí sola que alguien bloqueó al negocio o que no leyó. WhatsApp contempla recibos desactivados y problemas de conexión, entre otras causas. Se propone registrar estados por mensaje/campaña, mostrar lectura no confirmada y ofrecer pausas reversibles por falta de interacción con revisión humana, sin borrar personas ni marcarlas como bloqueadas por inferencia. La atribución por mensaje sigue siendo un pendiente de la auditoría anterior.

Fuentes consultadas: [confirmaciones de lectura de WhatsApp](https://faq.whatsapp.com/665923838265756/?cms_platform=iphone&locale=te_IN), [ayuda sobre bloqueos](https://faq.whatsapp.com/666362298345682/?locale=es_LA) y [política de mensajes del proveedor](https://business.whatsapp.com/policy/preview?lang=es_LA). Consentimiento, relevancia, frecuencia y respeto de la baja son controles fundamentales; dividir la base en listas no da inmunidad frente a bloqueos o reportes.

Publicación de esta mejora: pendiente de registrar después de verificar el despliegue. No se enviaron mensajes reales durante el desarrollo ni la verificación.

## 2026-10-08 — Commit, despliegue y auditoría posterior

Pedido: publicar las correcciones, auditar Masivos completo y sus integraciones, proponer mejoras y actualizar la bitácora.

### Código publicado

Commit `8f91551900f4f6fcd714b53241a70ea454ba8903` (`8f91551`), publicado en `main` de `exuztv2214-jpg/modosabor` desde la rama `codex/masivos-auditoria-turnos`.

Incluye las diez correcciones comprobadas de la auditoría previa y estas mejoras:

- Contactos con el estilo común y adaptación móvil.
- Confirmaciones mediante modales del panel.
- Subida de logo PNG/JPG/WebP, hasta 2 MB.
- Nombre y foto del usuario del panel, separados por usuario autenticado.
- Bloqueo persistente para no repetir promociones al mismo contacto en el mismo turno, con equivalencias teléfono/LID y noche que cruza medianoche.
- Proxy que transmite el usuario autenticado y horarios reales del negocio; conexión local del launcher compatible con el token compartido.
- Pruebas del motor, borradores, modales, identidad y turnos incorporadas a la CI.

**Pendiente:** botones interactivos reales. La sesión QR actual no los soporta; se documentaron la cuenta Business Platform, plantillas y webhooks necesarios en [botones-interactivos.md](botones-interactivos.md). No se enviaron credenciales por chat ni se simuló esa función como si estuviera implementada.

### Respaldo previo

Directorio local: `C:/Users/Exuz/Documents/ModoSabor-backups/2026-10-08-masivos-release`.

Snapshot consistente de SQLite, integridad comprobada, archivo de datos operativos de Masivos con SHA-256 verificado y diez JSON válidos. El respaldo de Masivos excluye la sesión de Chromium, fotos y copias anteriores; no es una restauración integral de WhatsApp. La sesión permanece en el volumen persistente.

### Publicación

Se desplegó primero `modosabor-api`, luego `modosabor-masivos`:

| Servicio | Despliegue                             | Resultado |
| -------- | -------------------------------------- | --------- |
| API      | `031e09a0-6ccb-41ec-89e8-b8c953ad870c` | SUCCESS   |
| Masivos  | `d9685a80-666d-47c0-925d-b3ad303d42f2` | SUCCESS   |

[Panel publicado](https://www.modosabor.com.ar/masivos). No se cambió DNS ni el proyecto que atiende al dominio raíz sin `www`.

Verificado después de publicar: WhatsApp `listo`, 574 contactos y 507 chats almacenados; configuración, exclusiones, pausas y contactos con hashes idénticos a los previos. Registro de turno habilitado, horarios del sistema sincronizados (10:00–15:00 y 20:30–02:00). Motor detenido y programación inactiva, como antes.

SQLite mantuvo integridad `ok`, 2 usuarios, 387 clientes, 914 pedidos y 188 configuraciones. Código remoto de Masivos coincidente por hash. Salud pública 200, acceso sin sesión al proxy 401 y acceso directo sin token 403.

### Verificación

- Masivos: comprobaciones existentes y 30 regresiones correctas.
- Backend: 146 archivos de prueba correctos, 0 fallados, con base temporal.
- ESLint de los archivos principales cambiados, sintaxis JS/Python, verificación de cutover y diff correctos.
- [CI del código publicado](https://github.com/exuztv2214-jpg/modosabor/actions/runs/37838824571): backend, frontend y Mozo correctos, incluidos los flujos aislados operativos.
- Chrome autenticado: seis secciones cargan, controles nuevos visibles, cancelación del modal de alta sin guardar, sin errores de consola observados.
- No se enviaron mensajes o campañas reales ni se cambiaron la foto, el logo o los ajustes reales para verificar.

### Auditoría y próximas mejoras

Informe: [AUDITORIA-MASIVOS-POSTDEPLOY-2026-10-08.md](../../AUDITORIA-MASIVOS-POSTDEPLOY-2026-10-08.md).

Se documentaron 14 hallazgos con evidencia, prioridad y corrección mínima. Los primeros son: reintentos ambiguos que pueden duplicar, lectura permisiva de exclusiones/pausas dañadas, respaldo automático incompleto, reemplazo de multimedia que puede perder el original y ejecución/recuperación de campañas después de reinicios.

También se revisaron caché de horarios, migración nocturna, dependencias, espacio de volumen, peso de imágenes, atribución de métricas y borradores de configuración. Se proponen botones reales, agenda por fecha/turno, resultados atribuibles a pedidos y exponer recordatorios/deshacer ya disponibles en el backend.

Los hallazgos posteriores quedan como pendientes; no se declara que estén corregidos en `8f91551`. La auditoría no provocó fallos ni envíos en producción. No se comprobó entrega real de WhatsApp, launcher operativo de Windows ni una cuenta Business Platform.

Historial técnico anterior: [superpowers/progress.md](superpowers/progress.md). Las entradas anteriores que dicen «no desplegado» corresponden a verificaciones previas; esta entrada registra su publicación efectiva.
