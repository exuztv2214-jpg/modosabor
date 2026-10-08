# Bitácora de Masivos

## 2026-10-08 — Pendientes de las auditorías, salvo Chispita (Claude)

Pedido: "ve con todos menos chispita" sobre la lista de faltantes (auditoría de Codex + la propia).

**Regresión corregida y publicada primero (`1e1c49b`):** el commit `4cf99c2` había borrado por error notas, recordatorios y ficha de cliente; Inicio fallaba en producción con `recordatoriosPendientes is not defined`. Se restauraron y quedó una prueba que llama a Inicio y a recordatorios.

Protección de envíos y datos:

- **Envíos dudosos:** si WhatsApp no confirma (timeout, corte), el contacto queda "Dudoso", no se reintenta y cuenta como enviado en el turno. Se resuelve a mano en Resultados: "Llegaron" o "No llegaron (reintentar)". Sólo se reintentan errores que ocurren antes de enviar ([resguardo.js](../resguardo.js)).
- **Bajas y pausas dañadas:** si `excluidos.json` o `pausados.json` existen pero no se pueden leer, las campañas y la programación se frenan, se guarda una copia del archivo dañado y no se permite pisarlo. Se destraba al restaurar un respaldo.
- **Respaldo completo y verificado:** contactos, bajas, pausas, grupos, mensaje, configuración, registro por turno, perfiles, CRM, notas, recordatorios, agenda, campañas, etc. Cada copia se relee y compara por hash. Se hace al arrancar, al actualizar contactos y una vez por día; se puede hacer a mano, descargar en un solo archivo y restaurar (antes de restaurar se respalda lo actual). La sesión de WhatsApp queda afuera a propósito.
- **Campañas cortadas:** al arrancar, las que quedaron "corriendo" pasan a "Cortada"; Railway manda SIGTERM en cada deploy y ahora se detiene el motor ordenadamente. No se reanudan solas: Resultados ofrece "Retomar N que faltaron".
- **Programación diaria:** el estado (bloqueada / corriendo / finalizada) se guarda en disco antes de empezar; un reinicio en el mismo minuto no vuelve a mandar.
- **Turnos vencidos:** si los horarios no se sincronizan hace más de 48 h, no se arman campañas. La migración del registro por turno incluye lo enviado ayer.
- **Flyers y PDF:** el archivo nuevo se escribe aparte y recién después se reemplaza el anterior. Campañas, etiquetas, contactos y configuración usan escritura atómica.
- **Pisos contra el baneo:** nunca menos de 8 s entre mensajes ni más de 120 por ventana; "0 = sin límite" dejó de existir (0 usa 60).
- **Dependencias:** proxy-addr 2.0.8 y qs 6.16.0 (se fueron el aviso crítico y el moderado). Quedan 9 avisos altos en la cadena Puppeteer/whatsapp-web.js sin arreglo disponible sin cambiar la versión de WhatsApp; no se forzó.

Resultados atribuidos:

- Cada promo guarda su ID de mensaje; los tildes se cuentan para la campaña que los generó. Una respuesta cuenta si llega dentro de las 48 h de la promo.
- "Pidieron": contactos con un pedido real en Modo Sabor el día de la campaña o los 2 siguientes. La API principal ahora devuelve los días con pedido (`fechas`, últimos 30). Es coincidencia en el tiempo, no prueba que fue por la promo, y así se aclara en pantalla.
- Resultados muestra por campaña enviados → entregados → leídos → respondieron → pidieron.

Funciones nuevas:

- **Agenda de promos** (Campaña → Revisar → "Agendar para otro momento"): fecha y hora, mensaje y archivos congelados en una copia. Si no puede salir dentro de 20 minutos, queda "No salió" en vez de mandarse tarde. Una por vez; se puede cancelar.
- **Estado del sistema** en Inicio: horarios, pedidos, último respaldo, espacio en disco, campañas cortadas y envíos dudosos, con alertas.
- **Recordatorios** desde Chats (botón de alarma) y lista en Inicio.
- **Respuestas rápidas** en Chats (agregar, usar, borrar).
- **Deshacer** la última exclusión/pausa/reactivación en bloque (Contactos).
- **Exportar contactos** a CSV para Excel (con protección contra fórmulas).
- Imágenes: `/api/imagen` devuelve URLs en lugar de 5 MB en base64.
- Configuración: la pausa 0 ya no se muestra como 15/45 y los cambios sin guardar no se pierden si el panel se refresca.

Verificación: 47 pruebas de Masivos (nuevas: dudosos, bajas dañadas, campañas cortadas, programador persistente, respaldo/restauración, reemplazo de flyers con disco lleno, agenda congelada y vencida, deshacer, exportar, recordatorios) y la prueba de la ruta de datos de la API. Navegador local con datos de ejemplo inyectados sólo en la página: Inicio, Resultados, Campaña, Contactos, Chats y Configuración sin errores ni desborde horizontal en ancho de celular. No se enviaron mensajes.

## 2026-10-08 — Posibles bloqueos y contactos que no leen (Claude)

Pedido: saber qué contactos tienen bloqueado al negocio o no leen, para sacarlos de las listas y bajar el riesgo de baneo. Se tomó también el trabajo de "listas de 100" que Codex dejó terminado sin commit (`2770fac`).

WhatsApp no informa bloqueos. La única señal es que un mensaje nunca pase de un tilde. Se juntan los tildes de todos los días por contacto (una lectura puede llegar al día siguiente del envío) y se marcan dos segmentos, con reglas conservadoras ([entrega.js](../entrega.js)):

- **Posible bloqueo** (`sin_entrega`): 2 o más promos, la última hace 2 o más días, sin ninguna entrega ni respuesta.
- **No lee** (`no_lee`): 3 o más promos entregadas, ninguna leída, sin respuestas.

Una respuesta del contacto lo saca de ambos. Sólo cuentan los envíos desde el primer día con tildes registrados, para no marcar a quienes recibieron antes de que existiera el registro.

Uso: Contactos → filtros "Posible bloqueo" y "No leen" → seleccionar → pausar o excluir (reversible). Las campañas **omiten por defecto los posibles bloqueos**; en Destinatarios hay una casilla para incluirlos, y el plan muestra cuántos se omitieron. La opción queda atada al plan confirmado. La programación automática también los omite. "No lee" sólo se informa: puede ser alguien con las confirmaciones de lectura desactivadas.

Nada de esto es prueba: un teléfono apagado o un número dado de baja dan la misma señal. No se borra a nadie ni se lo marca como bloqueado por inferencia.

Verificación: pruebas nuevas de las reglas (`scripts/entrega.test.js`) y suite completa de Masivos correcta. Navegador local: filtros, aviso y casilla visibles, sin errores. No se enviaron mensajes.

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
