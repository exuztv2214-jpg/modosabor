# Bitácora Claude — Modo Sabor

Registro de todo el trabajo hecho sobre el sistema Modo Sabor y sobre el agente de WhatsApp con IA. Se va actualizando a medida que avanzamos, para poder pausar y retomar sin perder el hilo.

Última actualización: 31 de julio de 2026.

---

## 1. Resumen general

El objetivo grande es tener un agente de IA atendiendo el WhatsApp de Modo Sabor: que converse con los clientes como una persona real, tome pedidos y los cargue directamente en el sistema real (con precios recalculados por el servidor, nunca inventados por la IA). Todo esto sin pagar de más: usando Gemini (tiene capa gratuita) en vez de OpenAI o Claude/Anthropic, y n8n autoalojado (sin costo de plataforma) en el mismo VPS donde ya vive el sistema.

El trabajo se dividió en dos frentes:

1. **El sistema Modo Sabor en sí** (web pública, panel admin, TPV, fidelización, etc.): una serie de auditorías y arreglos que se vienen haciendo de antes.
2. **El agente de WhatsApp**: diseño de endpoints nuevos en el backend para que la IA pueda consultar menú, cotizar, y crear pedidos; instalación de n8n en el VPS; armado y depuración del workflow.

---

## 2. Infraestructura

- El sistema corre en un **VPS de Donweb**, dominio **www.modosabor.com.ar**.
- Stack: backend Node/Express + cliente Vite/React, manejado con **pm2** (proceso `modosabor`) detrás de **nginx**, en la ruta `/opt/modosabor`.
- El deploy se hace con un script de PowerShell (`npm run deploy:donweb`), que empaqueta el proyecto, lo sube por SCP, reinstala dependencias, reconstruye el cliente y reinicia pm2, preservando `.env`, `data` y `uploads` entre despliegues. Hay un chequeo aparte (`npm run deploy:donweb:check`) que valida que el health check responda.
- El **DNS** del dominio se administra en **Cloudflare** (no en Donweb). Importante: los subdominios que apuntan a servicios propios (como n8n) tienen que estar en modo "DNS only" (nube gris, sin proxy de Cloudflare), porque si no rompe la validación de certificados HTTPS y las conexiones por WebSocket que usa WhatsApp.

### n8n

- Se instaló **n8n autoalojado con Docker** en el mismo VPS, en el subdominio **n8n.modosabor.com.ar**, con **nginx como proxy reverso** y certificado HTTPS de Let's Encrypt (certbot).
- El contenedor se recreó en un momento para agregar la variable `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, necesaria para que los nodos del workflow puedan leer variables de entorno (`$env.AGENT_API_KEY`, `$env.MODO_SABOR_API_URL`, etc.) sin que n8n lo bloquee por seguridad. Se hizo preservando los datos (workflows y credenciales) gracias al volumen `n8n_data`.

**Nota pendiente:** apareció una advertencia de "sitio peligroso" de Google Safe Browsing al entrar a n8n.modosabor.com.ar, tanto en mi navegador de prueba como en el tuyo. Todo indica que es un falso positivo típico de subdominios nuevos con un formulario de login genérico (el certificado SSL es válido, no hay señales reales de compromiso). Como esa URL solo la visitás vos como administrador —los clientes nunca la ven—, no afecta el funcionamiento del agente. Igual, en algún momento conviene pedir una revisión a Google Safe Browsing para que deje de aparecer.

---

## 3. Cambios hechos en el sistema Modo Sabor (antes de este tramo de n8n)

Resumen de las auditorías y arreglos ya aplicados y desplegados al sistema principal:

- **Lanzador de escritorio** (`ModoSabor.pyw`): corregido.
- **Bug `fmtMoney` no definido** en Pedidos y `useClientes`: corregido.
- **Auditoría completa módulo por módulo**: Dashboard, TPV, Fidelización, Web Pública, y una segunda pasada general del sistema.
- **Dashboard**: arreglos aplicados tras la auditoría.
- **Web pública**: contraste del header al hacer scroll, color hardcodeado en una etiqueta, imagen de reemplazo para productos sin foto.
- **Menú del día / turnos**: se agregó `turno_id` a categorías y `menu_dia_tipo` a productos (migración + backend + admin), con selector de turno en Categorías y tipo económico/ejecutivo + promo en Control diario. La web pública ahora cambia sola entre carta y menú del día según el turno.
- **TPV**: auditoría completa con 6 arreglos — bug de etiqueta al aparcar venta, doble venta por doble clic en confirmar, imágenes rotas en el catálogo, fricción del modal de Menú del Día, sincronización de pedidos en espera entre terminales, validación de mínimo en el campo de efectivo recibido.
- **Delivery**: auditoría del tracking GPS end-to-end.
- **Fidelización**: mejora visual del módulo, arreglo del branding roto en la tarjeta pública, posibilidad de subir imagen propia para el frente de la tarjeta, y rediseño completo (frente con imagen propia, dorso con sellos + QR estilo tarjeta de referencia).
- **Bug global de `pesosToCents`** (función `isMoneyKey`): corregido en todo el sistema.

**Pendiente de esta lista:** queda una verificación final tras un restart pendiente (tarea abierta, no bloqueante).

---

## 4. Agente de WhatsApp: diseño y backend

### 4.1. Endpoints nuevos en el backend

Se agregó `server/routes/agente.js`, pensado para ser llamado por n8n (no por navegadores ni por la web pública). Se protege con un header compartido `x-agent-key`, validado contra la variable de entorno `AGENT_API_KEY`. Si esa variable no está definida, todas las rutas devuelven 404 (no revela que la funcionalidad existe).

Rutas:

- **GET `/api/agente/estado`**: si el negocio está abierto y qué turno está corriendo.
- **GET `/api/agente/menu`**: catálogo completo o filtrado por categoría.
- **GET `/api/agente/producto/:id`**: detalle de un producto (variantes, extras, reglas).
- **POST `/api/agente/cotizar`**: recibe una descripción en lenguaje natural (ej: "pizza muzzarella docena con extra queso") y devuelve el producto identificado y el precio real, calculado contra el catálogo — la IA nunca inventa precios.
- **POST `/api/agente/envio`**: valida si una dirección está en zona de reparto (Monteros) y cotiza el envío.
- **GET `/api/agente/cliente/:telefono`** (también acepta `?telefono=` por query): historial rápido del cliente para personalizar el saludo.
- **POST `/api/agente/pedido`**: crea el pedido real. Acepta tanto un body plano como un campo `pedido_json` (string con el pedido completo en JSON) — esto último se agregó porque Gemini arma mejor sus llamadas a herramientas cuando el dato va como un único string declarado, en vez de un objeto libre con muchos campos anidados.

En todos los casos, **el precio de cada ítem se recalcula siempre del lado del servidor** contra el catálogo real (`enrichOrderItemsWithCatalog` en `systemClient.js`); el agente nunca puede fijar un precio, solo elegir producto y variantes/extras por nombre.

### 4.2. Prompt del agente ("Mica")

Está en `agente-whatsapp/prompt-agente.md` y se pegó completo en el nodo del Agente dentro de n8n. Define:

- Personalidad: "Mica", tono cercano y argentino (voseo), mensajes cortos como WhatsApp real, sin abusar de emojis, sin decir que es una IA salvo que se lo pregunten directamente.
- Reglas de negocio no negociables: reparto solo en Monteros; siempre chequear si está abierto antes de tomar un pedido; nunca inventar productos/precios/promos; el total siempre sale de sumar las cotizaciones reales.
- Flujo de 7 pasos para tomar un pedido: preguntar qué quiere → mostrar menú si lo piden → cotizar cada ítem → preguntar delivery o retiro (y cotizar envío si aplica) → preguntar forma de pago → resumen y confirmación explícita → recién ahí crear el pedido.
- Lista de las 6 herramientas disponibles y qué hace cada una.

---

## 5. El workflow de n8n

Workflow: **"Agente WhatsApp - Modo Sabor"**, en `https://n8n.modosabor.com.ar/workflow/z9zGo00ENHu6IGa9`.

Estructura: **WhatsApp Trigger** → **Agente Modo Sabor** (nodo de IA, LangChain Agent) → **Responder por WhatsApp**. El agente tiene conectados:

- **Gemini (cerebro del agente)** — modelo `gemini-2.5-flash` — como modelo de lenguaje.
- **Memoria por teléfono** — memoria de conversación, con clave = número de WhatsApp del cliente.
- **6 herramientas** (nodos HTTP Request Tool, cada uno llamando a un endpoint de `agente.js`): `consultar_estado`, `consultar_menu`, `cotizar_item`, `cotizar_envio`, `consultar_cliente`, `crear_pedido`.

### 5.1. Decisión de modelo: Gemini en vez de OpenAI/Claude

Se verificó (con búsqueda, no de memoria) que Gemini tiene una capa gratuita real y OpenAI no, así que se cambió el nodo de modelo de Anthropic Claude a Google Gemini.

### 5.2. Credenciales configuradas

- **Google Gemini API**: API key propia de Google AI Studio.
- **WhatsApp OAuth account** (para el nodo Trigger): Client ID `1629659451507107` y Client Secret, de la app de Meta "modo sabor w".
- **WhatsApp account** (para el nodo de respuesta, más simple): Access Token + Business Account ID `26163051483357551`. El número de teléfono de prueba usado tiene ID `1118624484659978`.

Se tuvo que borrar una **suscripción de webhook vieja** en Meta, que apuntaba a un backend abandonado en Render.com, porque Meta solo permite un webhook activo por app — eso bloqueaba a n8n para registrar el suyo.

### 5.3. El problema grande: Gemini y el schema de las herramientas

Gemini rechaza cualquier herramienta cuyo `parameters.properties` quede vacío (es una limitación conocida de compatibilidad n8n + Gemini, reportada en GitHub n8n-io/n8n #13294 y #14023). El workflow original tenía los parámetros de cada tool metidos como expresiones `$fromAI()` crudas dentro de la URL o del body JSON — eso no se declara como parámetro real, así que Gemini veía el schema vacío y **tiraba abajo TODO el agente**, no solo esa herramienta.

La solución fue, en cada uno de los 6 nodos, declarar los parámetros usando la interfaz estructurada de n8n ("Query/Body Parameters: Using Fields Below" con "Value Provided: By Model"), en vez de expresiones sueltas. Esto exigió también dos cambios en el backend (ya mencionados arriba): aceptar `telefono` por query string en `/cliente`, y aceptar `pedido_json` como string en `/pedido`.

### 5.4. Otros problemas encontrados y corregidos en esta sesión

- **n8n bloqueaba el acceso a variables de entorno** desde las expresiones de los nodos → se resolvió agregando `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` al contenedor Docker.
- **Header de autenticación faltante o corrompido**: varios de los 6 nodos tool tenían el header `x-agent-key` vacío, mal nombreado, o directamente ausente (en algún punto de la depuración se pisó por error). Se revisaron y corrigieron uno por uno: `consultar_estado`, `consultar_menu`, `cotizar_item`, `cotizar_envio` y `crear_pedido` — todos confirmados con `x-agent-key` usando `{{ $env.AGENT_API_KEY }}`.
- **El nodo `consultar_cliente` había desaparecido por completo del workflow** (se borró sin querer durante la depuración). Se recreó desde cero: URL `GET /api/agente/cliente`, parámetro de query `telefono` (por modelo), header `x-agent-key`, y se reconectó como herramienta del agente.
- **Publicación pendiente**: en n8n los cambios en los nodos quedan como borrador hasta hacer clic en **Publish** — el webhook de producción (el que realmente recibe los WhatsApp) sigue usando la última versión publicada. Varias rondas de "no responde" fueron en realidad porque se probaba contra una versión vieja sin los arreglos. Ya se publicó la versión con todos los arreglos de esta sesión.

---

## 6. Estado actual (23/07, última prueba)

Se publicó la versión con: los 6 nodos con headers correctos, `consultar_cliente` recreado y reconectado, y los parámetros declarados correctamente para Gemini.

Al mandar un mensaje de prueba desde el número `+54 9 3863 56-7109` al número de test de Meta, **no pasó nada** (ni respuesta ni error visible). Todavía no pudimos confirmar la causa porque, al intentar revisar la pestaña de Executions en n8n para ver el detalle, apareció la advertencia de "sitio peligroso" de Google Safe Browsing — tanto en mi navegador de prueba como en el tuyo — que bloquea el acceso hasta que se la pasa manualmente ("Detalles" → "Visitar sitio no seguro").

### Pendiente inmediato

1. Pasar la advertencia de seguridad en el navegador (una vez sirve para destrabar el acceso).
2. Revisar la pestaña **Executions** del workflow en n8n para ver si el mensaje de prueba generó una ejecución nueva, y si generó error, en qué nodo.
3. Si no generó ninguna ejecución: sospechar del lado de Meta/WhatsApp (webhook no registrado, token vencido, número de prueba desconectado) más que del workflow en sí.
4. Confirmar que el agente responde de punta a punta, que llama las herramientas en el orden correcto, y que un pedido de prueba se crea bien en el sistema real con precios recalculados por el servidor.

### Pendiente a más largo plazo (una vez todo funcione en el número de prueba)

- Migrar del número de prueba de Meta al número real del negocio (381-598-8735).
- Reemplazar el token de acceso de WhatsApp (hoy de corta duración, tipo "test") por un token de System User permanente.
- Pedir revisión de Google Safe Browsing para el subdominio n8n.
- Rotar la contraseña root del VPS (se compartió en texto plano en el chat en algún momento de la configuración inicial).

---

## 7. Próximos pasos acordados

Según lo último charlado: hacemos una pausa acá con el agente de WhatsApp (documentado en esta bitácora para no perder el hilo), volvemos a terminar los pendientes del sistema Modo Sabor, y cuando esté todo lo hacemos un solo despliegue (`npm run deploy:donweb`) al VPS.

---

## 8. Corrección crítica de pedidos y precios (23/07)

Se encontró la causa de los errores vistos como **"Datos inválidos"** al vender desde la web pública/TPV y de los totales mal mostrados después de confirmar un pedido:

- El middleware `server/middleware/sanitize.js` escapaba comillas dentro de campos JSON serializados como `items`.
- Eso convertía el JSON de productos del pedido en un string no parseable.
- Al no poder parsear los items, el backend terminaba calculando importes en `0` o importes incoherentes.
- También podía afectar el flujo del agente de WhatsApp cuando enviaba `pedido_json`.

Correcciones realizadas:

- `/api/agente` queda excluida del escape HTML para conservar `pedido_json` parseable.
- Los campos JSON string conocidos (`items`, `variantes`, `extras`, `pagos`, `split_payments`, `metodos_pago`) conservan su JSON original si es válido.
- Las rutas normales siguen escapando HTML en campos de texto comunes.
- `server/scripts/verify-operacion.js` ahora verifica que un pedido público y un pedido interno TPV mantengan el ida/vuelta correcto de pesos/centavos: por ejemplo `$4500` vuelve como `$4500`, no como `$45`, `$50` o `$0`.

Validación local ejecutada:

- `node server\tests\run.js`: OK, 5 suites pasadas.
- `npm run verify:operacion`: OK, crea pedido público, lo lista, cambia estado, genera ticket y crea pedido TPV validando importes.
- `npm run verify:core`: OK.
- `npm run build`: OK.
- SQLite `PRAGMA integrity_check`: OK.
- SQLite `PRAGMA foreign_key_check`: 0 errores.
- La verificación no dejó clientes temporales ni pedidos de prueba persistidos.

---

## 9. Tracking, mapas y rutas de delivery (23/07)

Se reforzó el flujo de mapas porque en producción se vieron iframes bloqueados y rutas que podían interpretarse fuera de Monteros.

Correcciones realizadas:

- `client/src/lib/maps.js` ahora arma direcciones completas con localidad, provincia y país por defecto: **Monteros, Tucuman, Argentina**.
- Si una dirección trae una ciudad conflictiva conocida como Concepción, San Miguel de Tucumán, Yerba Buena o Aguilares, se prioriza Monteros salvo que la dirección ya mencione Monteros.
- Se agregó link de Waze para la app rider.
- `LiveTrackingMap` ya no queda cargando indefinidamente: si Leaflet/CDN no responde en 8 segundos, muestra fallback operativo con botones para abrir destino/rider en Google Maps.
- `RiderRouteMap` muestra una tarjeta clara cuando el pedido no tiene coordenadas exactas, con ruta por dirección completa a Monteros.
- `RiderPanel` ahora abre rutas usando la configuración del negocio.
- `Delivery` dejó de depender de iframes de Google para el radar, domicilio de rider y ficha: ahora usa paneles con dirección segura y botones de ruta/mapa.

Validación local ejecutada después del cambio:

- `npm run build`: OK.
- `node server\tests\run.js`: OK.
- `npm run verify:operacion`: OK.
- `npm run verify:core`: OK.

---

## 10. Deploy DonWeb endurecido (23/07)

Se revisó el flujo de despliegue al VPS DonWeb para evitar que vuelva a pasar el error de SSH visto anteriormente como `mkdir: missing operand`.

Correcciones realizadas:

- `deploy/deploy-donweb.ps1` ahora valida que `MODOSABOR_VPS_HOST`, `MODOSABOR_VPS_PORT` y `MODOSABOR_VPS_PATH` tengan valores seguros antes de subir.
- El path remoto no puede quedar vacío ni ser `/`.
- Antes de empaquetar/subir, ejecuta `npm run build` localmente.
- El script remoto ya no viaja como comando largo inline por SSH: se escribe en un `.sh`, se sube al VPS como `/root/modosabor-deploy.sh` y se ejecuta con `bash`.
- `docs/DEPLOY-DONWEB-RAPIDO.md` quedó actualizado explicando que el deploy preserva `.env`, `server/data` y `server/uploads`.

Validación ejecutada:

- `npm run package:donweb`: OK.
- `npm run deploy:donweb:check`: OK contra `https://modosabor.com.ar/api/health`.

---

## 11. Dorso de tarjeta Club Fidelidad (23/07)

Se ajustó la página pública de Club/Fidelidad para que la parte trasera de la tarjeta no se vea deformada ni más alta que el frente.

Cambios realizados:

- Se agregó el fondo entregado por Hernán como asset del cliente:
  - `client/public/assets/fidelidad/tarjeta-fide-dorso.png`
- `client/src/pages/ClubFidelidad/TarjetaFidelidad.jsx` ahora usa ese fondo para el dorso.
- El dorso quedó con proporción fija `8/5`, igual que el frente.
- El QR queda integrado a la izquierda, con texto "Escaneá tu tarjeta".
- Los sellos/puntos quedan sobre el fondo oscuro, en una grilla ordenada.
- El mismo dorso se usa tanto si hay frente personalizado cargado como si el sistema muestra la tarjeta generada por defecto.

Validación ejecutada:

- `npm run build`: OK.
- `npx eslint src/pages/ClubFidelidad/TarjetaFidelidad.jsx`: OK.

### Ajuste visual posterior

Después de revisar que el primer dorso todavía se veía pobre, se rediseñó nuevamente:

- QR dentro de una placa blanca limpia, como tarjeta impresa real.
- Logo del negocio integrado arriba a la derecha.
- Título y beneficio con jerarquía clara.
- Sellos dentro de un panel translúcido ordenado.
- Nombre del socio y puntos en una barra inferior.
- Se conserva el fondo negro entregado, pero como textura de marca y no como único diseño.

Validación posterior:

- `npx eslint src/pages/ClubFidelidad/TarjetaFidelidad.jsx`: OK.
- `npm run build`: OK.

---

## 12. WhatsApp Copiloto con `#dale` (23/07)

Se empezó el flujo recomendado para usar IA en WhatsApp sin que atienda sola al cliente.

Objetivo:

- El cliente escribe por WhatsApp.
- El local responde manualmente.
- Cuando el operador escribe `#dale`, n8n/IA lee la conversación reciente.
- La IA arma un `pedido_json`.
- El sistema crea un borrador revisable, no un pedido real automático.
- El operador confirma el borrador desde el sistema y recién ahí entra el pedido a cocina/delivery.

Cambios implementados:

- Nuevo servicio compartido:
  - `server/services/whatsappCopilotoService.js`
- Nuevo endpoint protegido por clave de agente:
  - `POST /api/agente/copiloto/dale`
- Nueva API administrativa protegida por sesión:
  - `GET /api/whatsapp-copiloto/borradores`
  - `GET /api/whatsapp-copiloto/borradores/:id`
  - `POST /api/whatsapp-copiloto/borradores/:id/confirmar`
  - `POST /api/whatsapp-copiloto/borradores/:id/descartar`
- Nueva pantalla del panel:
  - `/admin/whatsapp-copiloto`
- Menú lateral actualizado con "WhatsApp Copiloto".
- Se agregó `pedido_id` a `whatsapp_pedidos_borrador` para mantener trazabilidad borrador -> pedido confirmado.
- Se creó `agente-whatsapp/prompt-copiloto-dale.md`, separado del prompt del agente automático.
- `agente-whatsapp/README.md` quedó actualizado con el modo recomendado.

Pendiente para activación real:

- Conectar n8n/Meta WhatsApp al endpoint `POST /api/agente/copiloto/dale`.
- Configurar `AGENT_API_KEY`.
- Probar primero con número de prueba de Meta.
- Verificar un caso real: cliente pide -> operador escribe `#dale` -> aparece borrador -> confirmar.

Validación local ejecutada:

- `node server\tests\run.js`: OK.
- Smoke de `createDraftFromCopilot` con producto real y rollback: OK.
- `npm run verify:core`: OK.
- `npm run verify:operacion`: OK.
- `npm run build`: OK.

### Rediseño simplificado final

El segundo rediseño seguía viéndose cargado y poco gráfico. Se reemplazó por una composición más cercana a una tarjeta impresa:

- Fondo negro de Modo Sabor a pantalla completa.
- QR limpio a la izquierda, sin caja gigante.
- Título arriba con jerarquía simple: "Modo Sabor" + "Tarjeta de fidelidad".
- Sellos grandes al centro en grilla 3x2, más parecidos a la referencia impresa.
- Sin logo flotante ni paneles innecesarios.
- Nombre del cliente y progreso/puntos abajo.

Validación:

- `npx eslint src/pages/ClubFidelidad/TarjetaFidelidad.jsx`: OK.
- `npm run build`: OK.

### Ajuste de carga de WhatsApp Copiloto (24/07)

Se revisó el error visual "No se pudo cargar WhatsApp Copiloto" en local.

Diagnóstico:

- El puerto `3001` estaba ocupado por un backend viejo que respondía `404` para `/api/whatsapp-copiloto/borradores`.
- Al levantar temporalmente el backend actual, la ruta respondió correctamente y devolvió `401 No autorizado` en la prueba directa de PowerShell, esperado porque esa llamada no lleva cookie de sesión admin.
- La duplicación del toast venía de la doble ejecución de efectos en `React.StrictMode` durante desarrollo.

Corrección:

- `client/src/pages/WhatsAppCopiloto.jsx` evita la doble carga inicial con `useRef`.
- El toast ahora muestra el detalle real del error (`401`, `404`, mensaje del servidor, etc.) para diagnosticar más rápido.

Validación:

- `npm run build`: OK.
- `GET /api/health`: OK con backend actual.
- `GET /api/whatsapp-copiloto/borradores?estado=abierto`: ruta existente; devuelve `401` sin sesión, como corresponde.

### Configuración del flujo WhatsApp Copiloto

Se completó la preparación del lado de Modo Sabor para conectar n8n/WhatsApp:

- `AGENT_API_KEY` local ya está configurado en `server/.env`.
- `POST /api/agente/copiloto/dale` acepta `pedido_json` como string o como objeto JSON, para tolerar variaciones de n8n.
- Se agregó `agente-whatsapp/payload-copiloto-dale.example.json`.
- Se agregó `agente-whatsapp/workflow-copiloto-dale.md` con el flujo recomendado.
- Se agregó `deploy/configure-donweb-agent.ps1` para configurar `AGENT_API_KEY` en el `.env` remoto de DonWeb sin tocar el resto del deploy.
- `agente-whatsapp/README.md` quedó actualizado con la URL pública `https://modosabor.com.ar` para n8n.

Validación real:

- Prueba sin `producto_id`: el sistema rechazó el borrador porque no permite que la IA invente precios.
- Prueba con producto real `Smash Simple` (`producto_id = 40`): creó borrador correctamente en `/admin/whatsapp-copiloto`.
- Se verificó visualmente que aparecía como pendiente 1 por `$6.000`.
- Se descartó el borrador de prueba desde la UI y quedó nuevamente en 0 pendientes.

Pendiente externo:

- DonWeb no permitió configurar remoto desde la herramienta en modo no interactivo (`Permission denied` sin password/TTY).
- Quedó listo `deploy/configure-donweb-agent.ps1` para ejecutarlo desde PowerShell y cargar la misma `AGENT_API_KEY` en `/opt/modosabor/server/.env`.

### Estado DonWeb posterior

Se configuró manualmente `AGENT_API_KEY` en DonWeb y se reinició PM2. `https://modosabor.com.ar/api/health` respondió OK en production.

Prueba remota:

- `GET https://modosabor.com.ar/api/agente/estado`: OK con `x-agent-key`.
- `POST https://modosabor.com.ar/api/agente/copiloto/dale`: todavía devuelve `404`, lo que confirma que DonWeb conserva una versión vieja del código sin la ruta nueva.

Acción necesaria:

- Subir el código actualizado a DonWeb con `npm run deploy:donweb`.
- Se reforzó `deploy/deploy-donweb.ps1` para que no informe deploy completo si falla `scp` o `ssh`.

### Deploy DonWeb completado para WhatsApp Copiloto

El usuario ejecutó `npm run deploy:donweb` con éxito:

- Build local OK.
- Paquete subido por SCP OK.
- Build remoto OK.
- PM2 reiniciado OK.
- `npm run deploy:donweb:check`: OK.
- `GET https://modosabor.com.ar/api/agente/estado`: OK.
- `POST https://modosabor.com.ar/api/agente/copiloto/dale` sin `#dale`: OK, devuelve `sin_comando_dale`.
- `POST https://modosabor.com.ar/api/agente/copiloto/dale` con `#dale` y `producto_id = 40`: OK, creó borrador remoto `#1`.

Observación importante:

- En producción `Smash Simple` devolvió total `$5.000`, mientras local estaba en `$6.000`.
- Esto indica que el deploy subió código, pero la base de datos remota conserva precios/menu viejos.
- Queda pendiente sincronizar datos de catálogo/precios de local a DonWeb si se quiere que producción refleje la carta actual.

Limpieza pendiente:

- Descartar desde `/admin/whatsapp-copiloto` el borrador remoto de prueba `#1` (`Cliente prueba remoto copiloto`).

### Sincronización segura DonWeb: admin y catálogo (24/07)

Se detectó que producción tenía código actualizado, pero base de datos operativa con datos viejos:

- `POST /api/auth/login` en producción rechazó `admin@modosabor.com / ModoSabor2026!`.
- `Smash Simple` en producción figuraba a `$5.000`, mientras local está a `$6.000`.
- El borrador remoto de prueba de WhatsApp Copiloto quedó pendiente porque no se podía entrar al admin productivo.

Corrección preparada:

- Se agregó `server/scripts/export-catalog.js` para exportar solo datos de carta y stock técnico.
- Se agregó `server/scripts/import-catalog.js` para importar en DonWeb con upsert.
- Se agregó `deploy/sync-donweb-catalog.ps1`.
- Se agregó `deploy/reset-donweb-admin.ps1`.
- Se agregaron scripts npm:
  - `npm run deploy:donweb:reset-admin`
  - `npm run deploy:donweb:sync-catalog`

Cuidado aplicado:

- La sincronización NO copia toda la base.
- NO toca pedidos, clientes, caja, personal, asistencia, repartidores ni movimientos reales.
- Actualiza `categorias`, `productos`, `inventario_insumos` e `inventario_recetas`.
- Si un insumo ya existe en producción, conserva `stock_actual` y `actualizado_en` para no pisar el stock real del local.
- Los productos que existan en producción pero no estén en local se desactivan, no se borran, para proteger historial.

Validación local:

- Export local OK: 9 categorías, 71 productos, 7 insumos, 140 recetas.
- Importador probado contra copia temporal de la DB: OK.

Pendiente operativo:

1. Ejecutar en PowerShell desde `D:\Proyectos\modosabor1`:
   - `npm run deploy:donweb:reset-admin`
   - `npm run deploy:donweb:sync-catalog`
2. Entrar a `https://modosabor.com.ar/admin` con `admin@modosabor.com / ModoSabor2026!`.
3. Ir a `/admin/whatsapp-copiloto` y descartar el borrador remoto de prueba `#1` (`Cliente prueba remoto copiloto`).
4. Validar producción con `npm run deploy:donweb:check`.

### Fix deploy helpers DonWeb (24/07)

El primer intento de reset admin y sync catalog falló porque los scripts remotos se subían a `/root`:

- `reset-admin`: Node no encontraba `bcryptjs` porque el script corría fuera de `/opt/modosabor/server`.
- `sync-catalog`: Node no encontraba `../db` porque el importador también corría desde `/root`.

Corrección aplicada:

- `deploy/reset-donweb-admin.ps1` ahora sube el script temporal a `$RemotePath/server/scripts/_reset-admin.remote.js` y lo ejecuta desde `cd $RemotePath/server`.
- `deploy/sync-donweb-catalog.ps1` ahora sube el importador a `$RemotePath/server/scripts/_import-catalog.remote.js` y lo ejecuta desde `cd $RemotePath/server`.
- La exportación local sigue generando `deploy/catalog-export.json`.

Validación:

- Sintaxis PowerShell OK.
- `npm run deploy:donweb:sync-catalog -- -LocalOnly` OK: 9 categorías, 71 productos, 7 insumos, 140 recetas.
- Sintaxis Node de export/import OK.

Reintentar:

```powershell
cd D:\Proyectos\modosabor1
npm run deploy:donweb:reset-admin
npm run deploy:donweb:sync-catalog
npm run deploy:donweb:check
```

### DonWeb admin y catálogo confirmados (24/07)

Se ejecutaron correctamente en producción:

- `npm run deploy:donweb:reset-admin`
- `npm run deploy:donweb:sync-catalog`
- `npm run deploy:donweb:check`

Resultado:

- Admin productivo actualizado correctamente.
- Login productivo validado por API con `admin@modosabor.com`.
- Health productivo OK en `https://modosabor.com.ar/api/health`.
- Catálogo sincronizado desde local: 9 categorías, 71 productos, 7 insumos, 140 recetas.
- PM2 reinició correctamente.
- Menú productivo verificado vía `/api/agente/menu?categoria=hamburguesas`:
  - `Smash Simple`: `$6.000`
  - `Bacon Cheese`: `$6.000`
  - `Route 66`: `$9.500`

Pendiente manual menor:

- Entrar a `/admin/whatsapp-copiloto` y descartar el borrador remoto de prueba `#1` si todavía aparece abierto.

### WhatsApp Copiloto: puente local para WhatsApp Web (24/07)

Se decidió avanzar con un puente local de WhatsApp Web porque el flujo pedido por el local es humano primero:

- El operador responde manualmente desde WhatsApp.
- La IA no atiende sola.
- Cuando el pedido está claro, se manda al Copiloto para crear un borrador en el sistema.

Importante técnico:

- La API oficial de WhatsApp Business es más estable, pero está pensada para operar desde API/n8n y no siempre sirve si el operador quiere seguir respondiendo desde la app/WhatsApp Web normal.
- Para probar rápido con el WhatsApp actual, se agregó `agente-whatsapp/puente-web` usando `whatsapp-web.js`.

Agregado:

- `agente-whatsapp/puente-web/server.js`: puente local con WhatsApp Web, QR, historial corto por chat y detección de disparo.
- `agente-whatsapp/puente-web/public/`: panel local en `http://localhost:3035`.
- `agente-whatsapp/puente-web/README.md`: instalación y uso.
- `agente-whatsapp/workflow-puente-web-copiloto.md`: contrato del webhook n8n que transforma conversación en `pedido_json`.
- Scripts npm:
  - `npm run whatsapp:bridge:install`
  - `npm run whatsapp:bridge`

Mejora clave:

- Además del atajo escrito `#dale`, se agregó botón `Mandar al copiloto` sobre chats recientes. Ese botón es el recomendado porque el cliente no ve ninguna palabra clave.

Validación:

- `npm install` dentro de `agente-whatsapp/puente-web`: OK, 0 vulnerabilidades.
- `node -c agente-whatsapp/puente-web/server.js`: OK.
- Se ajustó el puente para usar Chrome instalado en Windows si Puppeteer no descarga Chromium propio.

Pendiente:

- Configurar `N8N_COPILOTO_WEBHOOK_URL` cuando tengamos el webhook real.
- Ejecutar `npm run whatsapp:bridge`, abrir `http://localhost:3035`, escanear QR y probar con un chat real.

### Fix puente WhatsApp Web: MESSAGE_ERROR r (24/07)

Durante la prueba con QR conectado, la pantalla del puente mostraba `MESSAGE_ERROR {"error":"r"}` y no aparecían chats recientes.

Diagnóstico:

- El fallo venía de llamadas frágiles de `whatsapp-web.js` dentro de `message.getChat()` / `message.getContact()`.
- En algunos mensajes WhatsApp Web puede responder con errores internos poco descriptivos, incluso una sola letra.

Corrección:

- `agente-whatsapp/puente-web/server.js` ahora resuelve `chatId` desde datos crudos del mensaje (`id.remote`, `from`, `to`) antes de llamar APIs frágiles.
- Si `getChat()` falla, registra `chat_lookup_warning` y sigue guardando el mensaje igual.
- Se agregaron fallbacks para nombre/teléfono.
- Se mejoró el registro de errores con `formatError` y `stack` cuando exista.
- Se agregó hidratación de `chatIndex` desde `data/history.json` al iniciar, para que los chats guardados reaparezcan después de reiniciar.

Validación:

- `node -c agente-whatsapp\puente-web\server.js`: OK.

Acción requerida:

- Reiniciar el puente con Ctrl+C y `npm run whatsapp:bridge` para tomar el fix.

### WhatsApp puente: modo automatico `dale` (24/07)

Se ajustó el puente para que el uso diario sea simple:

- El operador atiende por WhatsApp normalmente.
- Cuando el pedido está claro, escribe `dale` en el chat.
- El puente detecta automáticamente ese mensaje saliente y dispara la conversación al Copiloto.
- El botón `Mandar al copiloto` queda solo como respaldo manual.

Agregado:

- `BRIDGE_AUTO_ON_OPERATOR_KEY=true` para activar/desactivar el disparo automático.
- `BRIDGE_DELETE_OPERATOR_KEY=false` para permitir que, si se cambia a `true`, el puente intente borrar el `#dale` después de detectarlo.
- La UI muestra si el disparo automático está activo.

Pendiente clave:

- Conectar `N8N_COPILOTO_WEBHOOK_URL` con un workflow real que use IA para convertir la conversación en `pedido_json` y llamar a `/api/agente/copiloto/dale`.

### WhatsApp puente: modo directo sin n8n para pruebas (24/07)

El usuario reportó que el puente "no hace nada". Se confirmó por `/api/status` que estaba levantado, pero sin destino configurado:

- `n8n_configured: false`
- `modosabor_configured: false`
- No existía `.env` en `agente-whatsapp/puente-web`.

Corrección:

- El puente ahora carga primero `server/.env` del proyecto, así toma automáticamente `AGENT_API_KEY` y `MODO_SABOR_API_URL` si no hay `.env` propio del puente.
- Si no hay webhook n8n, usa un extractor local básico:
  - Lee el menú real desde `/api/agente/menu`.
  - Busca nombres de productos en la conversación.
  - Detecta cantidad cercana al nombre del producto.
  - Detecta delivery/retiro y método de pago de forma simple.
  - Intenta detectar dirección por texto con número y palabras de calle/zona, sin tomar cantidades como dirección.
  - Envía `pedido_json` a `/api/agente/copiloto/dale` para crear borrador.
- Se agregó endpoint de prueba `/api/test-pedido-json`.
- El teléfono del pedido ahora se toma desde el chat del cliente, incluso cuando el disparador `dale` lo manda el local.

Limitación:

- Este modo directo no es IA real. Sirve para pedidos simples con nombres de productos claros. Para entender audios, mensajes ambiguos, cambios complejos y variantes conversacionales, sigue haciendo falta n8n + IA.

Acción requerida:

- Reiniciar `npm run whatsapp:bridge` para tomar el cambio.
- Probar en WhatsApp con un texto claro, por ejemplo: "una Smash Simple y una Pepsi lata, delivery San Martin 969, efectivo", luego escribir `dale`.

### WhatsApp puente: cierre de flujo dormido (24/07)

Pedido del usuario: que no haya pasos raros ni paneles obligatorios; solo escribir `dale` en WhatsApp y que el pedido entre al sistema.

Estado dejado:

- `dale` y `#dale` son aceptados como disparadores.
- En `.env`, `BRIDGE_OPERATOR_KEYS` queda entre comillas (`"dale,#dale"`) para que `#dale` no sea tomado como comentario.
- El puente queda apuntando directo a `https://modosabor.com.ar`, tomando la clave del `server/.env`.
- El puente queda con `BRIDGE_HEADLESS=false`, porque WhatsApp Web en modo invisible puede autenticarse pero quedar sin emitir `ready`.
- El puente toma la conversación reciente y crea borrador en Modo Sabor directo si no hay n8n.
- El botón manual queda como respaldo, no como flujo principal.
- Se agregaron launchers:
  - `Iniciar_WhatsApp_Copiloto.bat`
  - `Instalar_WhatsApp_Copiloto_Inicio_Windows.bat`
- Validado:
  - `node -c agente-whatsapp\puente-web\server.js`: OK.
  - `node server\tests\run.js`: 6 pasados, 0 fallados.
  - `npm run verify:core`: OK.
  - `npm run deploy:donweb:check`: OK.
  - Puente local `http://localhost:3035/api/status`: `ready=true`, `modosabor_configured=true`, `direct_parser_enabled=true`, `operator_keys=["dale","#dale"]`.
  - Parser local con ejemplo: detectó `Smash Simple`, `Pepsi lata`, `delivery`, `efectivo` y dirección `San Martin 969`.

Uso esperado:

1. Dejar abierto el puente con doble clic en `Iniciar_WhatsApp_Copiloto.bat`.
2. Escanear QR si WhatsApp lo pide.
3. Atender normal desde WhatsApp.
4. Cuando el pedido está claro, escribir `dale`.
5. El borrador entra a `/admin/whatsapp-copiloto` para confirmar.

### Backup por posible migracion de DonWeb (25/07)

Motivo: DonWeb subio el costo mensual y se evalua migrar a otro VPS economico.

Hecho:

- Backup local creado en `D:\Backups\ModoSabor\local-20260725-014936`.
- ZIP local creado en `D:\Backups\ModoSabor\local-20260725-014936.zip`.
- Incluye base local `server\data\modosabor.db`, uploads, deploy, docs, bitacora, scripts de WhatsApp y configuracion de proyecto.
- Manifest local: `D:\Backups\ModoSabor\local-20260725-014936\manifest.json`.
- Se agregaron scripts reutilizables:
  - `deploy\backup-local.ps1`
  - `deploy\backup-donweb.ps1`

Estado DonWeb al intentar backup remoto:

- `149.50.133.118:5942` no respondio por SSH.
- `https://modosabor.com.ar/api/health` no respondio dentro del timeout.
- Queda pendiente correr `deploy\backup-donweb.ps1` cuando DonWeb vuelva a responder para bajar una copia exacta del VPS con DB, uploads, backups internos, nginx, PM2 y `.env`.

### Railway nuevo, sincronizacion segura y diagnostico rider (30/07)

Motivo: se creo una cuenta nueva de GitHub/Railway para probar hosting barato y dejar el sistema levantado fuera de DonWeb.

Hecho en GitHub/Railway:

- Repo nuevo usado: `exuztv-modosabor/modosabor`.
- Railway CLI quedó logueado en la cuenta nueva y enlazado al proyecto `celebrated-smile`.
- Servicio Railway usado: `modosabor-api`.
- URL Railway: `https://modosabor-api-production.up.railway.app`.
- Se corrigió el deploy en Railway:
  - start command sin `cd` roto.
  - arranque de base fresca con migraciones antes de indices dependientes.
  - `playwright-core` movido a dependencias runtime del server.
  - variables de volumen ajustadas a `/opt/render/project/src/server/data`.
- Commits subidos:
  - `Prepare Modo Sabor for Railway deployment`
  - `Fix Railway start command`
  - `Fix Railway fresh database startup`
  - `Install server runtime browser dependency`
  - `Add safe Railway base data import`
  - `Deactivate stale products on base data import`

Sincronizacion de datos:

- No se subio la base completa para no arrastrar pedidos, caja, clientes ni datos operativos viejos.
- Se agrego importador seguro de datos base:
  - categorias
  - productos
  - inventario_insumos
  - inventario_recetas
  - personal
  - repartidores
  - configuracion no sensible
- Export local generado con:
  - 9 categorias
  - 71 productos
  - 7 insumos
  - 140 recetas
  - 4 empleados
  - 3 repartidores
  - 116 configuraciones seguras
- Railway importo esos datos y creo backup automatico antes de tocar la base.
- Se desactivaron 2 productos viejos que existian solo en Railway. No se borraron para no romper referencias historicas.
- Validacion final:
  - Railway health OK.
  - 9 categorias OK.
  - 4 empleados OK.
  - 3 repartidores OK.
  - 66 productos activos, igual que local.

Credenciales:

- Admin remoto reseteado para `admin@modosabor.com`.
- No dejar claves sensibles escritas en bitacora ni repo.

Rider / Maps:

- El rider mostro ruta hacia zona Bella Vista/Rio Colorado al abrir una direccion de Monteros.
- Causa encontrada: el fallback de geocodificacion y la zona visual de delivery usaban `-26.975,-65.275`, que no corresponde al centro real de Monteros.
- Correccion aplicada:
  - bounds de Monteros corregidos a la zona real de la ciudad.
  - si Nominatim devuelve coordenadas fuera de Monteros, ya no se guarda un fallback falso.
  - la app rider y el tracking publico ignoran coordenadas de cliente fuera de Monteros y abren Maps con la direccion completa: calle + Monteros + Tucuman + Argentina.
  - se corrigio la zona visual de delivery en los mapas embebidos.
- Prueba tecnica:
  - `-26.975,-65.275` ahora se considera fuera de zona.
  - el link de ruta para `las piedras 736` se arma como direccion textual completa y no como coordenada falsa.

### Tracking rider: precision, descarte y suavizado GPS (31/07)

Motivo: el rider tracking podia mostrar coordenadas imprecisas o saltos de cientos de metros porque la app aceptaba y subia toda lectura del navegador aunque viniera con mala precision.

Hecho:

- Confirmado: la app rider corre como web/PWA, no como app nativa.
- El tracking del rider ya usa `navigator.geolocation.watchPosition`.
- Se centralizaron opciones GPS para rider:
  - `enableHighAccuracy: true`
  - `timeout: 15000`
  - `maximumAge: 0`
- Se agrego filtro en cliente antes de pintar en mapa o subir al servidor:
  - descarta lecturas con `accuracy` mayor a 100 metros.
  - descarta saltos bruscos que exigirian velocidad irreal.
  - suaviza movimientos chicos para que el marcador no pegue saltos visuales.
- Se agrego validacion equivalente en backend:
  - si llega precision mala o salto brusco, responde OK ignorado y no actualiza `repartidores`, `pedidos` ni sockets.
  - evita que el tracking publico quede contaminado por una lectura vieja/mala.

Limitacion importante:

- Al ser web/PWA, la precision real depende del navegador, permisos, GPS del celular, ahorro de bateria, señal y si la app queda en segundo plano.
- Con estos ajustes se mejora mucho la estabilidad, pero el techo de precision no es igual al de una app nativa Android con tracking en background.

Validado:

- `npm run build` OK.
- `npm run verify:core` OK.
- `npm run verify:operacion` OK.
- Prueba tecnica del filtro GPS:
  - lectura buena aceptada.
  - lectura con precision baja rechazada.
  - salto brusco rechazado.

### App nativa Rider con Capacitor (31/07)

Motivo: el tracking web/PWA tiene limite de precision y puede cortarse cuando el rider minimiza la pantalla. Se preparo Rider como app nativa para Android/iOS manteniendo el resto del sistema en web.

Hecho:

- Se agrego Capacitor al cliente.
- App nativa enfocada en Rider:
  - `appId`: `com.modosabor.rider`
  - `appName`: `Modo Sabor Rider`
  - pantalla inicial nativa: `/rider`
- Se agregaron plataformas:
  - Android en `client/android`
  - iOS en `client/ios`
- Se agregaron plugins:
  - `@capacitor/core`
  - `@capacitor/app`
  - `@capacitor/geolocation`
  - `@capacitor/local-notifications`
  - `@capacitor-community/background-geolocation`
- Se creo capa `nativeRiderGps`:
  - nativo: usa background geolocation.
  - nativo: pide permiso de notificacion para sostener el foreground service de Android.
  - nativo: envia ubicaciones con `CapacitorHttp` para no depender del WebView cuando queda en background.
  - web: mantiene fallback con `navigator.geolocation`.
  - conserva filtro de precision/saltos/suavizado antes de enviar al backend.
- En nativo, la API apunta por defecto a Railway:
  - `https://modosabor-api-production.up.railway.app`
- Android configurado:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`
  - `FOREGROUND_SERVICE_LOCATION`
  - `POST_NOTIFICATIONS`
  - `android.useLegacyBridge: true`
- iOS configurado:
  - `NSLocationWhenInUseUsageDescription`
  - `NSLocationAlwaysAndWhenInUseUsageDescription`
  - `NSLocationAlwaysUsageDescription`
  - `UIBackgroundModes: location`
- Se agrego guia:
  - `docs/RIDER_NATIVE_APP.md`
- Se agrego script para generar APK debug usando el JDK de Android Studio:
  - `deploy/build-rider-apk.ps1`
  - `npm run native:android:debug`

Validado:

- `npm --prefix client run build:native` OK.
- APK debug generado correctamente:
  - `client\android\app\build\outputs\apk\debug\app-debug.apk`

Pendiente real de campo:

- Instalar APK en un celular real.
- Entrar como rider.
- Permitir ubicacion precisa y en segundo plano.
- Iniciar un pedido en camino.
- Bloquear/minimizar el celular y confirmar que el backend sigue recibiendo ubicacion.

### Avisos y sincronizacion automatica del Rider (31/07)

Motivo: los pedidos nuevos solo aparecian al tocar Sincronizar y el rider podia no advertir
una asignacion si la app estaba abierta en otra pantalla o el socket se habia reconectado.

Hecho:

- El backend emite `pedido_asignado` exclusivamente al room del rider correspondiente.
- El cliente conserva la suscripcion del rider y vuelve a unirse automaticamente despues de
  una desconexion o cambio de red.
- La pantalla Rider sincroniza silenciosamente:
  - cada 10 segundos;
  - al recuperar internet;
  - al volver a primer plano;
  - al recuperar el foco.
- La sincronizacion silenciosa no activa el estado de carga general, por lo que no hace
  parpadear ni bloquear la pantalla.
- Cada pedido nuevo asignado genera una sola alerta:
  - sonido;
  - vibracion;
  - aviso visual;
  - notificacion local nativa en Android.
- Los pedidos ya avisados se guardan por rider en el dispositivo para no repetir la alarma
  durante cada consulta automatica.
- Android usa el canal de alta prioridad `rider-orders`, con sonido y vibracion.

Validado:

- ESLint de los archivos tocados sin errores.
- `npm run build` OK.
- `npm run verify:core` OK.
- `npm run verify:operacion` OK.
- Prueba del evento `pedido_asignado` OK: solo se emite a `repartidor_<id>`.
- `npm run native:android:debug` OK.
- APK actualizado:
  - `client\android\app\build\outputs\apk\debug\app-debug.apk`

Limite tecnico:

- Si Android fuerza el cierre completo de la app o el usuario la detiene, Socket.IO y el
  sondeo dejan de ejecutarse. Para avisar incluso con la app totalmente cerrada hace falta
  incorporar push remoto con Firebase Cloud Messaging.

### Icono rojo de la app Rider (31/07)

Hecho:

- Se preparo una version roja y limpia de la llama de Modo Sabor.
- Se reemplazaron los iconos del launcher de Android en todas las densidades, incluyendo
  variante redonda e icono adaptativo.
- Se actualizo el icono de iOS.
- La PWA Rider ahora declara iconos PNG de 192 px, 512 px y una variante `maskable`.
- Se cambio el color de tema del manifiesto al rojo de marca.
- Se incremento la version de la cache del service worker para distribuir los iconos nuevos.

Validado:

- Dimensiones y formatos de los recursos Android, iOS y PWA correctos.
- `npm run build` OK.
- `npm run native:android:debug` OK.
- APK actualizado:
  - `client\android\app\build\outputs\apk\debug\app-debug.apk`

---

## 13. TPV: segunda auditoría, rediseño y catálogo del menú (31/07)

Tramo de trabajo separado del de WhatsApp/n8n (que sigue en pausa, ver sección 6). Empezó con una auditoría completa del proyecto pedida por Hernán, con foco después en el módulo TPV.

### 13.1. Segunda auditoría de TPV: 6 bugs corregidos

Se releyó `TPV.jsx` y sus componentes (`TpvCatalog`, `TpvSidebar`, `TpvVariantModal`, `TpvHeader`) y el backend de ventas/pedidos, buscando bugs nuevos más allá de los ya arreglados en la primera auditoría (sección 3).

Encontrados y corregidos:

- **Sincronización de "ventas en espera" (race condition)**: el diseño anterior mandaba la lista completa al servidor en cada cambio (`PUT` de todo el array). Si dos terminales guardaban/borraban casi al mismo tiempo, una terminal con datos un poco viejos podía resucitar un pedido que la otra ya había borrado. Se reemplazó por operaciones por ítem: `POST /api/tpv/espera` (upsert con `INSERT ... ON CONFLICT DO UPDATE`) y `DELETE /api/tpv/espera/:id`, más un polling cada 20s y al volver a la pestaña.
- **Efectivo recibido sin validar si el campo quedaba vacío**: el mínimo de efectivo solo se chequeaba si el campo tenía algo cargado; si quedaba vacío, se saltaba la validación. Corregido tanto en `pedidoForm.js` (`getTpvSubmitError`) como en el `preflightChecklist` de `TPV.jsx` (que es lo que deshabilita el botón VENDER).
- **Confirmación antes de perder el pedido**: se agregó `window.confirm` antes de vaciar el carrito manualmente y antes de salir del TPV con ítems cargados, más un aviso del navegador (`beforeunload`) si se intenta cerrar/recargar la pestaña con el pedido sin guardar.
- **"Hora de entrega" siempre visible**: pedido explícito de Hernán — antes el campo de horario aparecía siempre, aunque la mayoría de los pedidos salen apenas están listos (sin horario pactado). Se reemplazó por un toggle "Programar hora" (apagado por defecto): si está apagado, el pedido sale ni bien está listo; si se prende, recién ahí aparece el selector de hora.
- **Imágenes rotas en el catálogo**: si la imagen de un producto no existía más en el servidor, el navegador mostraba el ícono roto nativo. Se agregó un componente `ProductThumb` con `onError` que cae al ícono de categoría o a un ícono de plato genérico.
- **Restaurar un pedido en espera no lo sacaba de la lista**: al tocar "Abrir" en un pedido guardado, quedaba una copia vieja en la lista de espera que se podía volver a vender por error. Ahora "Abrir" saca el pedido de la lista (local y en el servidor).
- **Bug menor de texto**: el badge de turno mostraba "Turno Turno Noche" (duplicado) porque el nombre del turno ya incluye la palabra "Turno". Corregido con un formateador que evita duplicarla.

### 13.2. Rediseño visual del TPV

Hernán pidió un rediseño de fondo del TPV: partes de la UI se veían cortadas, y había campos que aparecían siempre cuando deberían ser condicionales (el caso de "hora de entrega" de arriba).

Mandó una captura mostrando el sidebar del carrito cortado (el tab "MESA" no se veía). La causa real, encontrada revisando en vivo con las devtools del navegador conectado:

- **Bug de layout en cascada (flexbox sin `min-w-0`)**: varios contenedores flex del TPV (`TpvSidebar`, el contenedor del catálogo, y el `<div>` intermedio que envuelve header + fila catálogo/sidebar en `TPV.jsx`) no tenían `min-w-0`/`shrink-0` explícitos. Un contenedor flex sin `min-w-0` usa el ancho mínimo de su contenido como piso, en vez de respetar el espacio disponible. Esto hacía que la fila completa terminara siendo ~92px más ancha que el viewport real, y como el contenedor exterior recorta con `overflow-hidden` (sin scroll), esos 92px de más quedaban invisibles del lado derecho — cortando el sidebar del carrito.
- Se corrigió en tres niveles: `TpvSidebar` (el `<aside>`) ahora tiene `shrink-0` para no comprimirse nunca por debajo de su ancho fijo; `TpvCatalog` tiene `min-w-0` para que sea el catálogo el que ceda espacio si hace falta; y el `<div>` intermedio en `TPV.jsx` también sumó `min-w-0`. Verificado en vivo con el navegador conectado: antes se veía el botón "Fullscreen" y el tab "MESA" cortados, después se ven completos.
- **Ícono del buscador de clientes mal alineado**: el botón con el ícono de "buscar cliente" (al lado del campo Teléfono) no tenía `-translate-y-1/2`, así que quedaba corrido hacia abajo en vez de centrado en el campo. Se corrigió y de paso se le dio forma de botón circular con fondo (antes era un ícono suelto).

### 13.3. Notas por producto y extras (TPV + web pública)

Pedido de Hernán: si un cliente quiere pedir sin aceituna (o cualquier otra aclaración), no había dónde anotarlo; y productos como las hamburguesas no ofrecían extras de la carta (queso, carne, papas) aunque el sistema ya tenía el campo `extras` armado.

- Se agregó un campo "Nota (opcional)" al modal de variantes/extras, tanto en `TpvVariantModal.jsx` (TPV) como en `VariantModal.jsx` (web pública). La nota se guarda en el ítem del carrito y viaja en la `descripcion` que ya se manda al pedido (se ve en ticket/comanda sin tocar el backend).
- En el TPV, el botón "+ opciones" del catálogo (antes solo aparecía si el producto tenía extras cargados) ahora está siempre disponible, para poder agregar una nota aunque el producto no tenga variantes ni extras.
- Se cargaron extras en las 16 hamburguesas: Queso extra ($1.000), Medallón de carne extra ($2.500), Papas ($1.500), Huevo ($1.000) — usando los mismos precios que ya existían en la categoría "Agregados".
- Probado en vivo en la web pública: al elegir "Bacon Cheese", ahora aparecen los 4 extras y el campo de nota; se seleccionó "Queso extra" (el total subió de $6.000 a $7.000), se escribió una nota, y se agregó bien al carrito.

### 13.4. Actualización de precios desde el menú nuevo (PDF/imágenes)

Hernán mandó 5 imágenes del menú impreso (Hamburguesas, Milanesas, Pizzas, Sandwichs, Empanadas). Antes de tocar precios se revisaron las imágenes buscando errores de diseño/contenido:

- Título "Hamburgesas" con error de tipeo (falta la "u"), repetido en dos subtítulos.
- En Milanesas, "4 Quesos" y "Roquefort" tenían la descripción idéntica copiada y pegada.
- En Pizzas, la descripción de "4 Quesos" era literalmente la de "Choclo" (mencionaba choclo en crema en vez de los 4 quesos).
- "Mediterranea" (milanesa) tenía un texto roto: "...rcon un toque lo oliva".
- "Sfijas" (empanada) probablemente debería llevar h: "Sfihas".

Esos son ajustes del archivo de diseño (Canva/Illustrator), no del sistema — quedaron señalados para Hernán, no se tocan desde acá.

Comparando los 71 productos del sistema contra el menú nuevo, la gran mayoría de los precios ya estaba al día. Se actualizaron 4 que estaban desactualizados:

- Pepsi lata: $1.500 → $2.000.
- Empanada Jamón y Queso: media $5.000→$5.500, docena $9.000→$10.000.
- Empanada Mondongo: media $4.500→$5.500, docena $9.000→$10.000.
- Empanada Verdura: media $4.500→$5.000, docena $8.000→$9.000.

**Sandwichs reestructurado**: el sistema solo tenía 4 productos (Común/Especial/Modo Sabor/Napolitana, todos de lomito), pero el menú nuevo pide 8: los mismos 4 tipos pero separados en línea de Lomito y línea de Milanesa, cada uno con Chico/Grande. Se renombraron los 4 existentes con el prefijo "Lomito" (el que se llamaba "Napolitana" en realidad tenía la descripción exacta de "Super Modo" del menú nuevo, así que se renombró y se corrigió el precio grande de $15.500 a $16.000), y se crearon 4 productos nuevos "Milanesa ..." con los mismos precios ($8.000/$13.000 a $10.000/$16.000 según el tipo).

**Pendiente, no tocado sin confirmar con Hernán**:

- Productos duplicados con precio distinto: "BBQ" (viejo, $13.500/$15.000) vs "Modo Sabor BBQ" (el correcto, $11.500/$13.000); "Suiza" vs "Modo Suiza" (mismo precio, nombre repetido).
- Una "Clasica" cargada por error dentro de la categoría Pizzas (con opciones Carne/Pollo), duplicado de la Clásica real de Milanesas.
- La pizza "Pepperoni", que existe en el sistema pero no aparece en ningún menú nuevo.

### 13.5. Menú del día reemplazado por el de mañana

Se desactivaron los 5 platos viejos del menú del día que no correspondían (Bombita de papas y Suprema a la napolitana quedaron desactivados sin borrar, para no romper historial) y se armó el menú que pidió Hernán para el día siguiente, todo cargado pero **apagado** (`disponible_hoy = 0`) hasta que se prenda desde Control Diario:

- **Económico $5.000**: Wok de verduras y pollo (arroz o fideo — reutilizando el producto viejo, ya tenía esa variante), Canelón (salsa blanca/roja/mixta), Guiso de lentejas y arroz, Tarta de pollo y puerro.
- **Ejecutivo $7.000**: Costeleta de res a caballo (sin guarnición a elección), Costillita de cerdo al horno, Albóndigas rellenas y Suprema a la suiza (estos 3 con guarnición a elección: arroz blanco, arroz a la provenzal, fideo a la provenzal, papas, puré, arroz primavera).

### 13.6. Bug de fondo encontrado: precios ×100 en Control Diario

Mientras se cargaba el menú del día, la pantalla de Control Diario (`/api/operacion/menu-dia`) mostraba precios 100 veces más grandes (ej. $700.000 en vez de $7.000).

Causa real: el sistema tiene un middleware global (`server/index.js`) que guarda la plata en centavos en la base y la convierte a pesos automáticamente en cada respuesta JSON (y viceversa en cada request). Esa ruta específica (`/api/operacion/menu-dia`) había quedado **excluida a propósito** de esa conversión durante un arreglo anterior (el mismo de la sección "Bug global de `pesosToCents`", 23/07), con un comentario en el código diciendo que se podía sacar de la lista de exclusión "con confianza en el próximo reinicio" una vez reverificada — exactamente la tarea que había quedado pendiente sin cerrar.

Se comparó el mismo producto a través de `/api/productos` (que sí convierte bien) contra `/api/operacion/menu-dia` (que no convertía) y se confirmó que los datos guardados están correctos — es solo un problema de visualización en esa pantalla. Se sacó `/api/operacion/menu-dia` de la lista de exclusión en `server/index.js`. Este cambio, como todos los de código en este tramo, **necesita reiniciar/desplegar el servidor para tomar efecto** (no se pudo probar en caliente en este entorno porque el sandbox de comandos no estuvo disponible durante toda la sesión).

### 13.7. Nota técnica de esta sesión

Durante todo este tramo, la terminal/sandbox de comandos (`node`, `npm`, `git`) no estuvo disponible (error `HYPERVISOR_VIRT_DISABLED`). Todos los cambios de código se hicieron y revisaron a mano con las herramientas de archivo, y las pruebas en vivo (layout del TPV, ícono, notas/extras, precios) se hicieron conectándose al navegador del propio Hernán contra `localhost:5173`, no contra producción. **Ningún cambio de este tramo está todavía en Donweb** — falta correr `npm run deploy:donweb` para subir todo junto (el TPV, las notas/extras, el catálogo actualizado, el menú del día nuevo, y el fix del middleware de precios).
