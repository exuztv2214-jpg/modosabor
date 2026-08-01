# Bitácora Claude — Modo Sabor

Registro de todo el trabajo hecho sobre el sistema Modo Sabor y sobre el agente de WhatsApp con IA. Se va actualizando a medida que avanzamos, para poder pausar y retomar sin perder el hilo.

Última actualización: 1 de agosto de 2026 (auto-update in-app + dark mode + cola offline extendida + FCM hook).

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

---

## 14. Sincronización catálogo Railway y fix "Datos inválidos" (31/07)

### 14.1. Sincronización de catálogo local → Railway

La base de Railway (`modosabor-api-production.up.railway.app`) tenía datos viejos: 73 productos (66 activos), precios desactualizados, sin extras en hamburguesas, sin los sandwichs de milanesa nuevos, sin los platos del menú del día nuevos, y Bombita/Suprema todavía activas.

Estrategia usada:

- `railway run` ejecuta comandos localmente con env vars de Railway, no dentro del contenedor. No sirve para tocar la base remota.
- Se usó un mecanismo de importación on-startup: si `server/scripts/catalog-export.json` existe cuando el servidor arranca, lo importa con `importBaseDataPackage`, hace backup antes, y borra el archivo para no re-importar.
- Lo mismo para reset de admin: `server/scripts/reset-admin-once.json`.
- Ambos archivos viajan con el deploy vía Dockerfile (`COPY server ./server`) y se consumen una sola vez.

Resultado después del deploy:

- 82 productos totales (80 locales + 2 viejos de Railway, desactivados).
- 73 activos (igual que local).
- Bombita (id 64) y Suprema a la napolitana (id 67): desactivadas.
- 16 hamburguesas con extras (Queso extra, Medallón, Papas, Huevo).
- 4 sandwichs de milanesa nuevos (Común $8000, Especial $8500, Modo Sabor $9000, Super Modo $10000).
- 5 platos del menú del día nuevos (Guiso de lentejas, Tarta de pollo, Costeleta, Albóndigas, Suprema a la suiza).
- Pepsi lata actualizada a $2000.
- Smash Simple a $6000, Bacon Cheese a $6000.

### 14.2. Fix "Datos inválidos" al editar precio desde admin

Se encontraron **dos bugs** que se combinaban:

1. **Zod schema rechazaba strings de FormData**: el admin envía PUT /api/productos/:id como `multipart/form-data` (para la imagen). Multer pone todos los campos como strings en `req.body`. El schema Zod usaba `z.number()` que rechaza strings → "Datos inválidos". Fix: se creó un helper `coerceNum` con `z.preprocess` que convierte strings numéricas a numbers antes de validar.

2. **Middleware de conversión pesos↔centavos no veía el body de multipart**: el middleware global `moneyRequestMiddleware` (en `index.js`) corre antes de que multer popule `req.body`, así que para requests multipart el body está vacío cuando el middleware lo procesa. Resultado: el precio se guardaba en pesos en vez de centavos, y la respuesta lo dividía por 100 mostrando 1/100 del valor real. Fix: se agregó `convertMultipartMoney` como middleware de ruta en productos, después de `validateBody` (que ya coercionó los strings a numbers) y antes del handler.

Archivos modificados:

- `server/schemas/index.js`: helper `coerceNum`, aplicado a todos los campos numéricos de `createProductoSchema` y `updateProductoSchema`.
- `server/utils/moneyConversion.js`: nuevo módulo con `isMoneyKey`, `pesosToCents`, `centsToPesos` extraídos de `index.js` para poder reutilizarlos en rutas.
- `server/index.js`: usa `require('./utils/moneyConversion')` en vez de funciones inline.
- `server/routes/productos.js`: `convertMultipartMoney` middleware después de multer+validateBody en POST y PUT.

### 14.3. Verificación final en producción

- **(a)** `/api/productos` devuelve 82 productos (73 activos), precios correctos.
- **(b)** PUT /api/productos/40 con FormData: precio 6000 → guardó bien → respuesta 6000 (no 60). Probado cambio a 6500 y vuelta a 6000, ambos correctos.
- **(c)** Pedidos (7), clientes (7) y caja (abierta) intactos. La importación solo tocó categorías, productos, inventario_insumos e inventario_recetas.
- Admin login con `admin@modosabor.com` funcionando.
- Tests locales: 6 suites, 0 fallos.
- Health check: OK.

---

## 15. TPV ubicación GPS + fix precios tickets + rediseño Control Diario y Club Fidelidad (31/07 - segunda parte)

Sesión larga con cinco frentes de trabajo. Todo local, pendiente de deploy al final.

### 15.1. TPV: botón "Pegar link" para cargar ubicación GPS del cliente

Pedido de Hernán: cuando el cliente le pasa la ubicación por WhatsApp (link de Google Maps o coordenadas), el operador del TPV no tenía dónde cargarlas. El botón "Guardar ubicación GPS" que ya existía toma la ubicación del dispositivo donde corre el TPV, no la del cliente, así que solo servía si el cliente estaba en el local.

- **Nuevo**: `client/src/lib/parseGpsInput.js` — parser tolerante que soporta URLs de Google Maps con `?q=lat,lng`, `@lat,lng`, `?ll=lat,lng`, y coordenadas crudas separadas por coma/espacio/barra. Valida rango, avisa si están fuera de Argentina, y rechaza explícitamente los links cortos (`goo.gl/maps/`, `maps.app.goo.gl/`) porque no se pueden expandir desde el navegador (CORS).
- **Nuevo handler** `pegarUbicacionCliente` en `TPV.jsx` que intenta leer del portapapeles y cae a `window.prompt` si el navegador bloquea. Al parsear guarda `cliente.latitud` y `cliente.longitud`.
- **Nuevo botón** "Pegar link" en `TpvSidebar.jsx` al lado del actual "Guardar ubicación GPS". Ícono `ClipboardPaste` de lucide-react.

### 15.2. Fix crítico: precios ×100 en tickets impresos y en Control Diario

Bug confirmado con un test real: un pedido de $5.000 imprimía **$500.000** en la comanda/ticket. Causa: el HTML del ticket se renderiza en el backend **antes** de que actúe el middleware `centsToPesos` (que solo procesa respuestas JSON, no HTML pre-armado).

Corregido agregando `centsToPesos(pedido)` antes de renderizar en:

- `server/routes/pedidos.js`: 3 handlers (`POST /:id/imprimir`, `POST /mesa/:mesa/precuenta`, `GET /:id/impresion/:tipo`).
- `server/routes/caja.js`: 2 handlers (cierre en vivo y `GET /cierre/:id/ticket`).

En Control Diario (`/api/operacion/menu-dia`) el precio también se veía ×100. Origen: en la sesión anterior había sacado esa ruta del `MONEY_MIDDLEWARE_SKIP_PATHS`, y ese cambio ya estaba correcto en código — con este deploy queda arreglado también.

### 15.3. Control Diario: rediseño del layout del menú del día

Foto de Hernán mostraba que el menú del día en Control Diario se veía todo aplastado: "DESTACADO" se cortaba como "DESTA", los inputs de Precio/Stock eran ilegibles. Causa: el grid principal era `xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]`, con la columna derecha muy angosta (35% del ancho).

- `client/src/pages/Operacion.jsx`: cambié a `xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]` (mitad-mitad).
- El grid interno de cada plato pasó de `md:grid-cols-4` a `grid-cols-2 xl:grid-cols-4` (responsivo real).
- Labels de checkboxes (Destacado y +Jugo y postre) ahora envuelven texto y no se cortan.

### 15.4. Club Fidelidad: rediseño completo de la tarjeta virtual

Frente:

- Nombre del cliente en cursiva Great Vibes primero, después cambiado por pedido de Hernán a **Poppins Bold** (moderna sans-serif) posicionado debajo del logo (top ~62%), en blanco con `drop-shadow` para que resalte sobre la imagen custom.
- Google Font Poppins agregada al `client/index.html` (junto a la existente Inter).

Dorso:

- **8 sellos en grid 4×2** (fijo, para simetría visual): 7 hamburguesas apagadas + 1 regalo dorado en el slot 8.
- **Cuando un sello se gana, aparece una llamita blanca** (SVG inline replicando el logo de Modo Sabor) sobre fondo rojo con glow.
- **Animaciones**: pop escalonado al montar (delay `index * 0.12s`), pulso continuo en el sello más nuevo, brillo dorado en el regalo cuando el premio está destrabado.
- **Sin bloque de titular** (movido al frente); badge de progreso solo debajo del QR ("2/8 · 350 pts").
- Halo rojo en la esquina superior derecha para dar profundidad.
- Subtítulo: "COMPLETÁ 7 Y EL 8VO ES GRATIS".

Archivos: `client/src/pages/ClubFidelidad/TarjetaFidelidad.jsx` (con FlameStamp y BurgerStamp como SVG inline).

### 15.5. Club Fidelidad: página pública completa

**Nuevas secciones agregadas al `/club`:**

1. **Badge "100% GRATIS"** al lado del "Programa de fidelidad" en el hero.
2. **Banner de premio real** rojo grande: "¿QUÉ GANÁS? 1 Pizza Muzzarella - Después de 7 compras. Sin trampa." — usa `premio_descripcion` y `sellos_para_premio` del config real.
3. **Barra "¿Ya sos socio?"** arriba de todo (solo visible cuando no hay cliente cargado): input de teléfono grande + botón "VER MIS SELLOS". Al buscar hace scroll suave a la tarjeta.
4. **Cartel destacado post-registro** ("Tu link personal / Este link es tu tarjeta. No lo pierdas"): muestra el link personal + 3 botones (Copiar, Enviarme el link por WhatsApp con auto-mensaje pre-armado al propio teléfono del cliente, Guardar en celular con instrucciones iOS/Android). El botón "Enviarme el link" pulsa por 6 segundos cuando el cliente recién se registra.
5. **Sección "¿Cómo funciona?"** rediseñada full-width con mini tarjeta demo animada a la izquierda (7 sellos llenándose solos en loop cada 900ms + regalo dorado al final) y 3 pasos a la derecha.
6. **Card "Compartí con amigos"** + **card "¿Necesitás ayuda?"** con botón "Escribir por WhatsApp" que abre chat con mensaje pre-llenado.
7. **FAQ colapsable** con 6 preguntas (cómo sumar sellos, cuántos hacen falta, si vencen, delivery, cambio de número, compartir tarjeta). Primera abierta por default.
8. **Nota T&C simplificada** al pie con link a la página completa.
9. Se **eliminó la grid redundante** de 3 beneficios (Tu teléfono / QR / Sellos) que decía lo mismo que "¿Cómo funciona?".

Nuevos componentes: `ClubFidelidad/BarraSocio.jsx`, `ClubFidelidad/CartelBienvenida.jsx`, `ClubFidelidad/TerminosCondiciones.jsx`.

**Modo `?preview=1`**: cuando la URL tiene `preview=1`, se inyecta un cliente demo (Hernán Lorenzo con 2 sellos ganados) para poder mostrar la página vendida sin necesidad de crear cliente real. Sirve para captures/marketing.

### 15.6. Formulario del club: campo barrio + checkbox T&C obligatorio

- **Nuevo campo** "Barrio / zona" (opcional) al lado de "Referencia del domicilio".
- **Nuevo checkbox obligatorio** "Acepto las bases y condiciones del Club..." con link a `/club/terminos`. Botón "Guardar mi ficha" deshabilitado al 40% de opacidad si no está tildado. Si ya existe cliente en la base, se pre-marca (asumimos que aceptó en su registro anterior).
- **Migración**: se agregaron 3 columnas nuevas a la tabla `clientes`: `barrio TEXT`, `acepto_terminos INTEGER`, `acepto_terminos_en DATETIME` — todas nullable/con default para no romper clientes existentes.
- **Backend `POST /club/registro`** valida que `acepto_terminos === true`, rechaza con 400 si no. Persiste barrio y timestamp de aceptación tanto en INSERT (cliente nuevo) como UPDATE (cliente existente actualizando su ficha).

### 15.7. Página `/club/terminos` (bases y condiciones)

Nueva ruta pública full-width con 10 secciones:

1. Alcance del programa
2. Cómo se ganan sellos (menciona monto mínimo si está configurado)
3. Premio y canje
4. Vigencia de sellos y puntos
5. Identificación del cliente (por teléfono)
6. Uso de datos personales (protección + baja voluntaria)
7. Fraudes y suspensión
8. Modificaciones del programa
9. Baja del programa
10. Consultas y reclamos (WhatsApp del negocio)

Los valores dinámicos (premio, cantidad de sellos, monto mínimo, días de vigencia) se leen del config real vía `/api/fidelizacion/club-branding`, así se mantienen siempre actualizados.

Registrada en `client/src/App.jsx` como `/club/terminos` (lazy load). Enlazada desde el checkbox del formulario y desde el pie del club.

### 15.8. Consistencia "8 sellos - el 8vo es gratis" en todo el sistema

Revisión y ajuste de defaults para que el sistema hable siempre del mismo esquema (7 compras necesarias + 8vo slot = premio gratis):

- **Backend `fidelizacionService.js`**: default `sellos_para_premio` de 6 → **7**, tanto en `getConfig()` como en `updateConfig()`.
- **Fallbacks frontend a 7**: `TarjetaFidelidad.jsx` (era 10), `StatsCliente.jsx` (era 10), `useClientes.jsx` (era 6). `TerminosCondiciones.jsx`, `ClubFidelidad.jsx` (banner premio y FAQ) ya estaban en 7.
- **Tarjeta física imprimible (`TarjetaFidelidadFisica.jsx`)**: tenía `const totalSellos = 6` **hardcodeado**, ahora recibe `sellosParaPremio` como prop desde `ClubFidelidad.jsx` que pasa el valor real del config. Subtítulo cambiado de "Acumula 6 puntos y consigue una sorpresa gratis" a **"Completá {N-1} y el {N}° es gratis"** dinámico.

Además `TarjetaFidelidadFisica` ahora también recibe `clubUrl` y muestra el link corto legible debajo del "N° Tarjeta" ("VER ONLINE: modosabor.com.ar/club/ABC123"), así el cliente puede tipearlo a mano si pierde el celular.

Acción manual pendiente: Hernán tiene que ir a Admin → Fidelización y **setear explícitamente `sellos_para_premio = 7`**, porque el valor default solo aplica si nunca se guardó; el valor histórico (que era 6 u 8) sigue mandando en la base actual.

### 15.9. Estado del deploy y pendientes

- **Nada de la sesión 15 está en Railway todavía**. Todos los cambios están en local. Cuando Hernán quiera desplegar, corre `railway up` desde CLI (o el push a `main` dispara auto-deploy).
- Archivos tocados en total: `client/index.html`, `client/src/pages/ClubFidelidad.jsx`, `client/src/pages/ClubFidelidad/TarjetaFidelidad.jsx`, `client/src/pages/ClubFidelidad/ComoFunciona.jsx`, `client/src/pages/ClubFidelidad/FormularioCliente.jsx`, `client/src/pages/ClubFidelidad/StatsCliente.jsx`, `client/src/pages/Clientes/useClientes.jsx`, `client/src/pages/Operacion.jsx`, `client/src/pages/TPV.jsx`, `client/src/components/TPV/TpvSidebar.jsx`, `client/src/components/TarjetaFidelidadFisica.jsx`, `client/src/App.jsx`, `server/db/migrations.js`, `server/routes/fidelizacion.js`, `server/routes/pedidos.js`, `server/routes/caja.js`, `server/services/fidelizacionService.js`.
- Archivos nuevos: `client/src/lib/parseGpsInput.js`, `client/src/pages/ClubFidelidad/BarraSocio.jsx`, `client/src/pages/ClubFidelidad/CartelBienvenida.jsx`, `client/src/pages/ClubFidelidad/TerminosCondiciones.jsx`.
- Como en todas las sesiones anteriores, el sandbox de comandos no arrancó (HYPERVISOR_VIRT_DISABLED) y las pruebas se hicieron conectándose al navegador de Hernán contra `localhost:5173`. La única prueba que no se pudo hacer en vivo fue la del backend (fix de precios ×100 en tickets impresos), que requiere reiniciar el server Node para tomar los cambios.

---

## 16. App nativa Rider Android: fix persistencia + rediseño visual + APK nuevo (31/07/2026)

### 16.1. Bugs de persistencia arreglados

El rider tenía que loguearse cada vez que cerraba la app. Causa raíz: el WebView de Capacitor Android no persiste `localStorage` entre cierres de la app (a diferencia del navegador de escritorio donde sí sobrevive). Esto afectaba:

- **Sesión del rider** (`ms_rider_id`, `ms_rider_code`): se perdía al cerrar, obligaba a re-loguearse.
- **Historial de entregas** (`ms_rider_history_*`): se vaciaba al reabrir.
- **Toggle online/offline** (`ms_rider_online`): volvía al estado default.
- **Pedidos notificados** (`ms_rider_notified_*`): se perdían, causando re-alertas de pedidos ya avisados.

Solución implementada:

- **Helpers `riderStorageGet` / `riderStorageSet` / `riderStorageRemove`** en `client/src/lib/nativeRiderGps.js`: detectan si corren en nativo (Capacitor) y usan `@capacitor/preferences` (persistencia real a nivel SO), o caen a `localStorage` en web. API async unificada.
- **Bootstrap async con spinner** en `RiderPanel.jsx`: antes el componente leía sync de `localStorage` en el render inicial (en Capacitor Android eso arranca vacío). Ahora muestra "Cargando tu sesión..." mientras lee async de Preferences, y recién después monta la UI con los datos reales.
- Las 5 keys migradas a los helpers: `ms_rider_id`, `ms_rider_code`, `ms_rider_online`, `ms_rider_history_*`, `ms_rider_notified_*`.

### 16.2. Rediseño visual del RiderPanel

Cambios de UI/UX:

- **Header "Tu turno de hoy"** siempre visible (antes solo aparecía si había entregas). Íconos por métrica: Package (entregas), DollarSign (cobrado), TrendingUp (efectivo). Números con `tabular-nums` para alineación fija (corrige el desfasaje reportado donde los dígitos "saltaban" al cambiar). Reloj en vivo con fecha. Chip **ONLINE** verde pulsante (animate-pulse) cuando el rider está activo.
- **Estado vacío rediseñado**: el texto plano "SIN ENTREGAS POR AHORA" fue reemplazado por un **radar animado tipo Uber Driver** — 3 círculos concéntricos con `animate-ping` desfasado (delay 0s, 1s, 2s) + ícono de paquete centrado + texto "Esperando pedidos...". Da feedback visual de que la app está activa y escuchando.
- **Barra de acciones rápidas**: 3 chips grandes horizontales — Llamar al local (Phone), Actualizar (RefreshCw), Historial (History). Reemplazan los botones dispersos anteriores.
- **Contadores animados 0→valor**: componente `AnimatedNumber.jsx` usando `framer-motion` `useSpring` + `useTransform`. Al montar o cambiar el valor, el número sube suavemente desde 0 (o desde el valor anterior) con spring physics.
- **Cards de pedido con animación**: `AnimatePresence` + `motion.button` con spring (damping 22, stiffness 260), layout auto-reorder. Cada card nueva entra con slide-in desde la derecha.
- **Toast de entrega**: notificación negra tipo snackbar con emoji "🎉 Nª entrega del día" que aparece 3 segundos al subir el contador de entregas completadas.

### 16.3. APK generado

- **Path**: `C:\Users\Exuz\Desktop\ModoSaborRider-20260731-2216.apk`
- **Tamaño**: ~6.89 MB
- **Fecha**: 31/07/2026
- **Versión**: 1.0 (versionCode 1)
- **Build**: debug (firmado con key de debug de Android Studio)

Instrucciones para el rider:

1. **Desinstalar la app anterior** primero (el versionCode sigue en 1, Android puede rechazar la instalación si detecta firma distinta).
2. Copiar el APK al celular (WhatsApp, cable USB, Google Drive).
3. Abrir el APK → "Instalar de fuentes desconocidas" si lo pide.
4. Al abrir, **permitir "Ubicación siempre"** (no solo "mientras se usa") y **permitir notificaciones**.
5. Loguearse con su código de rider — la sesión ahora persiste entre cierres.

### 16.4. Qué le falta todavía

Pendientes para la siguiente iteración:

- **FCM / push remoto**: para avisar al rider de pedidos nuevos incluso con la app completamente cerrada (kill del SO). Requiere proyecto Firebase + configuración de server key en el backend.
- **Sonido custom fuerte**: actualmente usa el sonido default de notificación del sistema. Falta un tono tipo alarma que se escuche aunque el celular esté en volumen bajo.
- **Foto de entrega**: que el rider pueda sacar foto al entregar como comprobante (cámara nativa con Capacitor Camera).
- **APK release firmado con versionCode incremental**: el APK actual es debug. Para publicar en Play Store o distribuir sin warnings de "app no verificada" hace falta generar un keystore de release, firmar, y subir el versionCode en cada actualización.

### 16.5. Cambios técnicos

Archivos modificados:

- `client/src/lib/nativeRiderGps.js` — agregados helpers `riderStorageGet`/`riderStorageSet`/`riderStorageRemove` con `@capacitor/preferences`.
- `client/src/pages/RiderPanel.jsx` — bootstrap async, rediseño visual completo (header, radar, chips, animaciones, toast).

Archivos nuevos:

- `client/src/components/AnimatedNumber.jsx` — componente reutilizable de counter animado con framer-motion.

---

## 17. Rider súper pack: incidencia, chat, voz, offline queue, foto entrega, autologout, APK release (31/07/2026)

Segunda tanda de mejoras sobre la app rider, después de las de persistencia y rediseño. Todo pedido por el usuario con "ve con todo pero lo del pin todavía no" — se implementaron todas las features grandes menos el PIN de bloqueo (queda para más adelante por decisión explícita).

### 17.1. Detalle de pedido rediseñado (hero card premium)

La pantalla de detalle era plana y sin jerarquía. Se rehizo:

- **Hero card con gradient** (colores primario→secundario del negocio configurables), avatar circular con la inicial del cliente, número de pedido, dirección, teléfono.
- **4 botones de acción con colores**: Google Maps (azul), Waze (celeste), WhatsApp (verde), Copiar dirección (gris). Cada uno con ícono y color propio para reconocimiento rápido.
- **Card grande "Total a cobrar"** con banda de color: verde si ya está pagado, ámbar si es efectivo pendiente, primario si es digital. Tipografía enorme para leer al llegar sin sacar la vista de la calle.
- **Popover "Reportar problema"** con 4 motivos preseteados (cliente no responde, dirección incorrecta, sin cambio, otro) — al elegir uno se abre WhatsApp con mensaje prellenado al local.
- **Chat directo con el local** vía botón que abre WhatsApp con el número del negocio y contexto del pedido.

### 17.2. Meta diaria + celebración + voz TTS

- **Barra de progreso** en el header hacia la meta diaria configurable (`data?.settings?.rider_meta_diaria`, default 10 entregas). Va llenándose con cada entrega y cambia de color al llegar al 100 %.
- **Confetti CSS**: 36 partículas coloridas que caen desde arriba cuando el rider marca una entrega. Sin dependencias (solo CSS animations + keyframes). Módulo nuevo `client/src/lib/riderCelebration.js`.
- **Voz TTS** con Web Speech API (`speechSynthesis`): dice en voz alta "¡Entrega número X completada!" con voz `es-AR` (o la que tenga disponible el dispositivo), rate 1.05. Ayuda al rider a confirmar sin mirar la pantalla mientras maneja.

### 17.3. Cola offline (`riderOfflineQueue.js`)

Cuando el rider está sin señal (bajo tierra, en zona sin cobertura) las acciones críticas ya no se pierden. Nuevo módulo:

- Cola persistente en `@capacitor/preferences` (sobrevive cierres de app y reinicios).
- `enqueueRiderAction({ kind, url, method, body })` — encola cuando `navigator.onLine === false`.
- `processRiderQueue(httpClient)` — corre cada 15 s y al disparar el evento `online` del navegador, procesa la cola con retry (MAX_ATTEMPTS=10, MAX_ITEMS=100).
- **Badge visual en el footer**: "N pend." aparece cuando hay acciones esperando reconexión.
- Acciones encoladas hoy: **marcar entregado** (`kind: 'mark_delivered'`). Faltan encolar por ahora: envío de GPS, cambio de estado, reporte de incidencia (queda para siguiente tanda).

### 17.4. Foto de entrega

- Nuevo módulo `client/src/lib/riderCamera.js` con `captureDeliveryPhoto()`: usa `@capacitor/camera` en nativo (calidad 65, resolución razonable para no reventar el tamaño), fallback a `<input type="file" capture="environment">` en web.
- Integrado en `handleSwipeComplete`: si el flag `data?.settings?.delivery_requiere_foto_entrega === '1'` está activo, obliga al rider a sacar foto antes de cerrar el pedido.
- La foto viaja como `entrega_foto` (dataURL base64) en el body del POST de entrega. El campo ya existía en la tabla `pedidos` (migración vieja) y el handler `POST /repartidores/:id/rider/:code/entregar/:pedidoId` lo persiste.
- Permiso `CAMERA` + `uses-feature required=false` agregados al `AndroidManifest.xml`.

### 17.5. Autologout 30 días

- Timestamp `ms_rider_last_seen` guardado en Preferences en cada bootstrap y cada acción.
- Al arrancar la app, si pasaron más de 30 días desde el último uso, se limpia la sesión y se manda al login. Evita que un celular perdido siga logueado indefinidamente.

### 17.6. APK release firmado (auto-versionado)

- **`android/app/build.gradle`** rediseñado: lee `versionName` y `versionCode` desde `client/package.json` usando `JsonSlurper`. Fórmula: `MAJOR*10000 + MINOR*100 + PATCH` (ej. 1.4.0 → 10400). Ya no hay que tocar Gradle a mano nunca más — subir la versión es cambiar el `"version"` del package.json.
- **`signingConfigs.release`**: lee 4 variables de entorno (`MODOSABOR_KEYSTORE_PATH`, `MODOSABOR_KEYSTORE_PASSWORD`, `MODOSABOR_KEY_ALIAS`, `MODOSABOR_KEY_PASSWORD`). Si están seteadas, firma release; si no, cae a debug para no romper builds de dev.
- **Nuevo script** `npm run android:release-apk` (además del bundle `.aab` que ya existía). Sale en `android/app/build/outputs/apk/release/app-release.apk`.

Falta que el usuario genere el keystore una única vez con `keytool` — instrucciones detalladas en `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` sección 1.

### 17.7. Documentación operativa nueva

Se creó `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` con 8 secciones:

1. Firma release del APK (keystore, variables de entorno).
2. Versionado automático (cómo funciona la lectura de `package.json`).
3. Firebase Cloud Messaging (pasos para push remoto real).
4. Sonido custom fuerte (`rider_alert.mp3` en `res/raw/`).
5. Cámara y foto de entrega (ya implementada, cómo prender el flag).
6. Cola offline (estado actual + qué falta encolar).
7. Distribución al equipo (Firebase App Distribution vs Play Store vs WhatsApp).
8. Métricas de crash remoto (Sentry vs Crashlytics).

### 17.8. Archivos creados/modificados en este pack

Nuevos:

- `client/src/lib/riderCelebration.js` — confetti + TTS.
- `client/src/lib/riderOfflineQueue.js` — cola offline persistente.
- `client/src/lib/riderCamera.js` — foto de entrega.
- `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` — guía operativa.

Modificados:

- `client/src/pages/RiderPanel.jsx` — detalle premium, meta diaria, confetti, voz, cola offline, foto entrega, autologout.
- `client/src/lib/nativeRiderGps.js` — helpers Preferences ya existían de la tanda 16, se usan más ahora.
- `client/package.json` — versión 1.0.0 → 1.1.0, deps `@capacitor/camera ^8.0.0` + `@capacitor/splash-screen ^8.0.0`, script `android:release-apk`.
- `client/android/app/build.gradle` — `JsonSlurper` + `signingConfigs.release`.
- `client/android/app/src/main/AndroidManifest.xml` — permiso CAMERA + uses-feature.

---

## 18. Splash screen + login premium del rider (31/07/2026)

Última pieza visual del rider. Antes: la app abría con un flash blanco y caía al login genérico gris. Ahora tiene splash con logo y login premium al nivel Rappi/PedidosYa.

### 18.1. Splash screen nativo

- Plugin `@capacitor/splash-screen ^8.0.0` agregado a deps.
- Configurado en `client/capacitor.config.json`:
  - `backgroundColor: '#dc1f2d'` (rojo Modo Sabor).
  - `launchAutoHide: false` — se oculta desde la app, no del sistema, para evitar el flash blanco entre splash y login.
  - `launchShowDuration: 2500` (máximo, por si el bootstrap se cuelga).
  - `androidScaleType: 'CENTER_CROP'`, `splashFullScreen: true`, `splashImmersive: true`.
- Bootstrap del `RiderPanel.jsx` cierra el splash en el `finally` con `SplashScreen.hide({ fadeOutDuration: 400 })` una vez que terminó de leer Preferences. Fade suave al login/app.

Falta gesto manual del usuario: generar `client/resources/splash.png` (2732×2732, fondo rojo con logo centrado) e `icon.png` (1024×1024), y correr `npx @capacitor/assets generate --android` para crear todas las densidades. Instrucciones detalladas en `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` sección 8.

### 18.2. Login premium

Se rehízo la pantalla de login del rider (bloque `if (!riderAuth)` en `RiderPanel.jsx`, ~line 1275). Antes: fondo gris, ícono Truck azul, dos inputs blancos. Ahora:

- **Fondo rojo Modo Sabor** (`#dc1f2d`) full-screen con **3 blobs radiales blur** superpuestos (rosa arriba-izq, rojo oscuro abajo-der, ámbar tenue centro) para dar profundidad orgánica.
- **Logo llamita SVG inline** (mismo SVG del `FlameStamp` de fidelización) en una card blanca 24×24 redondeada con glow blanco alrededor. **Animación float sutil** con framer-motion (`animate={{ y: [0, -8, 0] }}`, loop 3s, easeInOut). Es SVG puro → siempre disponible, no depende de que el backend responda ni de la URL del logo del negocio (que en login todavía no está cargada).
- **Tipografía Poppins**: kicker "MODO SABOR" con tracking amplio 0.42em, título "Rider" en 4xl black.
- **Subtítulo**: "Ingresá tu código para arrancar tu turno y empezar a recibir pedidos."
- **Card blanca de inputs** con shadow-2xl:
  - ID de repartidor: input numérico con ícono User, tabular-nums, focus border rojo.
  - Código de acceso: input password con `••••••••`, tracking-widest, mismo estilo.
- **CTA button** con gradient `from-#dc1f2d to-#b91c1c`, shadow rojo, ícono Zap. Uppercase tracking amplio.
- **Card "Instalar como app"** con `backdrop-blur-md` sobre fondo blanco/10 (glassmorphism) — se ve premium sobre el rojo. Solo aparece si `installReady || iosInstall`.
- **Footer**: "Hecho con ❤ en Monteros" con tracking amplio y opacidad baja.
- Animaciones de entrada `motion` (fade + slide desde abajo) escalonadas: logo → form (delay 0.15s) → card instalar (delay 0.35s).

Look final comparable a apps de delivery premium (Rappi Cartero, PedidosYa Repartidor) sin usar imágenes bitmap ni fonts externas (Poppins ya venía del proyecto).

### 18.3. Archivos tocados en esta tanda

- `client/src/pages/RiderPanel.jsx` — bloque de login rediseñado + hide splash en bootstrap.
- `client/capacitor.config.json` — plugin SplashScreen configurado.
- `client/package.json` — dep `@capacitor/splash-screen ^8.0.0` (agregada en tanda anterior).
- `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` — nueva sección 8 con instrucciones de assets del splash.

### 18.4. Pendientes al cierre del día

- **Instalar deps** en local: `npm --prefix client i @capacitor/splash-screen @capacitor/camera` + `npm --prefix client i -D @capacitor/assets`.
- **Generar assets del splash**: `splash.png` 2732×2732 + `icon.png` 1024×1024 en `client/resources/`, luego `npx @capacitor/assets generate --android` + `npx cap sync android`.
- **Rebuild APK release** con keystore firmado (ver `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` sección 1).
- **Deploy Railway** de todos los cambios de las tandas 16, 17 y 18 (Codex CLI, prompt separado).
- **FCM**: sigue pendiente para push real con app cerrada (sección 3 de la doc).
- **Sonido custom** `rider_alert.mp3` en `android/app/src/main/res/raw/`.
- **Cola offline extendida**: agregar GPS + cambio de estado + reporte de incidencia (hoy solo entrega).
- **Sentry o Crashlytics** para crashes remotos.
- **PIN de bloqueo** de la app rider (usuario dijo "todavía no", queda en pausa hasta pedido explícito).

---

## 19. Auto-actualización in-app del APK rider (01/08/2026)

Se implementó el sistema completo para que los riders reciban las actualizaciones de la app sin que el operador tenga que pasarles el APK por WhatsApp cada vez. Cuando hay una versión nueva, la app misma le muestra un modal al rider con el changelog y el botón "Actualizar ahora"; al aceptar, Android descarga y ofrece instalar. Cero intervención manual por rider.

### 19.1. Backend: manifest público + endpoint

- **Nuevo router `server/routes/riderApp.js`** montado en `/api/rider-app`.
- **`GET /api/rider-app/version`** (público, sin auth) devuelve `{ versionCode, versionName, downloadUrl, changelog, forceUpdate, minVersionCode, sizeMB, hasBinary }`.
  - Lee `server/uploads/rider-app/manifest.json` como fuente de verdad.
  - Fallback: si no hay manifest, lee `client/package.json` para al menos devolver la versión conocida (sin `downloadUrl` → la app no ofrece update).
  - Construye la `downloadUrl` absoluta respetando `X-Forwarded-Proto`/`Host` para que funcione tanto en local como en Railway sin hardcodear el dominio.
  - Verifica que el archivo APK exista físicamente antes de anunciarlo (`hasBinary: true/false`); si no está, no ofrece update.
- **Endpoint auxiliar `GET /api/rider-app/manifest`** que devuelve el JSON crudo (útil para debug).
- **Static ya existente `/uploads/`** sirve los APKs sin config extra.

### 19.2. Estructura de la carpeta de releases

- `server/uploads/rider-app/manifest.json` — fuente única del "cuál es la última versión".
- `server/uploads/rider-app/modosabor-rider-X.Y.Z.apk` — el binario (nombre versionado, no `latest.apk` para no romper caches en clientes viejos).
- `server/uploads/rider-app/README.md` — instrucciones inline para publicar una release nueva.

Como `uploads/` está en el volume persistido de Railway, los APKs sobreviven redeploys.

### 19.3. Cliente: módulo `riderUpdater.js`

Nuevo archivo `client/src/lib/riderUpdater.js` con:

- **`getInstalledVersion()`** — usa `@capacitor/app` (`App.getInfo()`) para leer el `versionCode` real instalado. En web devuelve null (no aplica).
- **`checkForUpdate(httpClient, { force })`** — GET al endpoint, compara con la versión instalada, aplica throttle de 6 h (para no bombardear el server), respeta el flag "dismiss" del rider (no muestra dos veces el mismo modal salvo que sea `forceUpdate` o el rider esté bajo `minVersionCode`).
- **`dismissUpdate(versionCode)`** — persiste en localStorage que el rider dijo "más tarde" para esa versión.
- **`downloadAndInstall(url)`** — abre el APK en el browser del sistema (`window.open(url, '_system')` en Capacitor Android abre en Chrome/browser default, no en el WebView). Android descarga, muestra el instalador nativo, el rider toca "Instalar" y listo. Cero plugins extra ni intents custom.

Diseño: **no descargamos el APK con `@capacitor/filesystem`** (que requeriría un plugin adicional para abrir el APK con intent). Delegar en el browser del sistema es más simple, cero deps nuevas, y es el patrón estándar en apps que se autoactualizan fuera de Play Store (Rappi partner, Uber partner, apps de bancos).

### 19.4. RiderPanel: modal integrado

- **Estados nuevos**: `updateInfo` (info del manifest si hay update disponible) y `updateDownloading` (loading del botón).
- **useEffect nuevo** post-bootstrap (no depende de `riderAuth` → funciona en login también, para forceUpdate). Chequea 4s después del bootstrap y vuelve a chequear cada vez que la app pasa a foreground (`visibilitychange`).
- **`renderUpdateModal()`** función que devuelve el JSX del modal como `AnimatePresence`+`motion.div`:
  - Backdrop negro con blur, se cierra al tocar fuera solo si NO es forceUpdate.
  - Header con gradient rojo `#dc1f2d → #b91c1c`, ícono Zap, título "Modo Sabor Rider vX.Y.Z", kicker "Nueva versión" o "Actualización obligatoria".
  - Body con el changelog (whitespace-pre-line), scroll si es largo. Muestra tamaño en MB y versión instalada.
  - Banner rojo "Esta actualización es obligatoria" si `forceUpdate` o versión < min.
  - Botones: "Actualizar ahora" (gradient rojo, se pone en "Descargando..." con spinner mientras) + "Más tarde" (solo si no es obligatorio).
- **Se renderiza en ambos returns** (login y app principal) — así incluso si el rider no llega a loguearse porque su versión es incompatible con el backend nuevo, ve el modal y puede actualizar.

### 19.5. Android: permiso REQUEST_INSTALL_PACKAGES

Agregado al `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

Necesario para que Android permita que la app abra un APK. La primera vez que un rider toque "Actualizar", Android le pide "permitir instalar apps de esta fuente" → una vez aceptado, queda persistido y las siguientes updates son un toque.

### 19.6. Flujo operativo para publicar una versión

Documentado en detalle en `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` sección 9. Resumen:

1. `npm --prefix client run android:release-apk` → genera `app-release.apk`.
2. `copy` a `server/uploads/rider-app/modosabor-rider-X.Y.Z.apk`.
3. Editar `manifest.json` con nueva versión + changelog.
4. `git commit` + `push origin main` → Railway redeploya solo.

Los riders reciben el aviso al abrir la app (o cuando vuelven del background). Máximo 6h de delay por el throttle.

### 19.7. Comportamiento y throttling

- **Throttle 6h**: no chequeamos más de 1 vez cada 6 horas salvo que se fuerce (visibility change no fuerza, respeta throttle).
- **Dismiss por versión**: si el rider dice "más tarde" a la v1.2.0, no vuelve a ver ese modal hasta que salga una versión más nueva (v1.2.1 vuelve a molestar).
- **ForceUpdate bloqueante**: no hay botón "Más tarde", el backdrop no cierra al tocar fuera. Bloquea el uso.
- **MinVersionCode**: si el rider tiene menos del mínimo declarado en el manifest, se le fuerza aunque `forceUpdate` sea false. Útil para cortar versiones incompatibles con cambios de backend.

### 19.8. Archivos creados/modificados

Nuevos:

- `server/routes/riderApp.js` — router público con `/version` y `/manifest`.
- `server/uploads/rider-app/manifest.json` — fuente de verdad de la última versión.
- `server/uploads/rider-app/README.md` — instrucciones inline.
- `client/src/lib/riderUpdater.js` — check, dismiss, downloadAndInstall.

Modificados:

- `server/index.js` — mount de `/api/rider-app`.
- `client/src/pages/RiderPanel.jsx` — import del updater, estados, useEffect de check, handlers, `renderUpdateModal()`, inyección en ambos returns.
- `client/android/app/src/main/AndroidManifest.xml` — permiso REQUEST_INSTALL_PACKAGES.
- `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` — nueva sección 9 con el flujo completo (numeración corrida: métricas de crash ahora es sección 10).

### 19.9. Pendiente para siguiente iteración

- **Notificación push automática al publicar versión** (necesita FCM ya configurado, sección 3 de la doc). Sin FCM: mandar mensaje al grupo de WhatsApp manualmente para que abran la app.
- **UI en admin panel para subir APK + editar manifest** (hoy es git commit). Bajo esfuerzo, mejora la UX del operador.
- **Rollback rápido**: si una versión sale rota, editar manifest a la versión anterior + `forceUpdate: true` con changelog "Rollback urgente" → los riders vuelven a la versión previa (pero necesitan tenerla en la carpeta).

---

## 20. Dark mode + cola offline extendida + FCM scaffolding + sonido custom (01/08/2026 - noche)

Después del auto-update se hizo una auditoría del código real vs los tasks declarados. Aparecieron features que estaban en los nombres de los tasks pero no en el código (dark mode, cola offline extendida, sonido custom, FCM). Se implementaron los 4 en una sola tanda.

### 20.1. Dark mode automático

- **CSS scoped** en `client/src/styles/riderDark.css`: en vez de agregar `dark:...` a cada uno de los ~2800 renglones del RiderPanel, se overridean los tokens (`.bg-white`, `.text-gray-900`, borders, colores semánticos pastel) cuando el `<html>` tiene la clase `dark` **y** el elemento está dentro de `.rider-shell`. Cero touch al JSX.
- **Estado `themeMode`**: `'light' | 'dark' | 'auto'`. Persistido en Preferences con clave `ms_rider_theme` para sobrevivir cierres de app.
- **useEffect que aplica/quita `dark` al `<html>`**: en modo `'auto'` respeta `prefers-color-scheme: dark` del sistema y reacciona en vivo si el rider cambia el tema del OS.
- **Botón toggle en el header**: cicla `auto → light → dark → auto`. Iconos lucide: `Monitor` para auto, `Sun` para light, `Moon` para dark. Tooltip descriptivo.
- **Cleanup al desmontar**: quita la clase `dark` para no afectar admin/TPV/web pública.

Ideal para riders que trabajan de noche — el fondo blanco quema los ojos. Y por ser OLED en la mayoría de celulares Android modernos, ahorra batería.

### 20.2. Cola offline extendida

Antes solo se encolaba `mark_delivered`. Se extendió a:

- ✅ **Cambio de estado de pedido** (`kind: 'change_state'`) — aceptar, comenzar reparto, marcar cancelado.
- ✅ **Reporte de incidencia** (`kind: 'report_issue'`) — con motivo preseteado + apertura WhatsApp al local si hay red.

Implementación en `updateEstado(pedidoId, nuevoEstado, extra)`:

- Detecta `navigator.onLine === false`.
- Encola con `enqueueRiderAction({ kind, url, method: 'PUT', body })`.
- **Actualización optimista local**: el UI cambia el estado del pedido al toque como si hubiera funcionado. El rider sigue trabajando sin fricción.
- Toast "📡 Sin señal — se guardó y se sincroniza al reconectar."
- La cola se procesa cada 15s + al disparar evento `online` del browser (ya existía).

**GPS no se encola** por diseño (1 punto cada 5s → 100+ items acumulados serían basura y saturarían el server al reconectar). Comportamiento estándar de Uber/Rappi: se descartan los puntos offline y se retoma el stream en vivo apenas hay red.

### 20.3. Sonido custom `rider_alert`

- Cambiado `sound: 'default'` → `sound: 'rider_alert'` en las 2 ocurrencias de `nativeRiderGps.js` (canal + schedule).
- Si el archivo `client/android/app/src/main/res/raw/rider_alert.mp3` no existe, Android cae al sonido default automático (no rompe la notificación).
- Falta grabar/buscar el mp3 fuerte (2-4 seg tipo "ding-dong de restaurante") y ponerlo en la carpeta. Sin gestos manuales del server.

### 20.4. FCM scaffolding (dormant hasta configurar Firebase)

Todo el código está listo. Cuando el operador cree el proyecto Firebase y agregue `google-services.json`, se activa solo sin cambios de código adicionales.

**Cliente** (`client/src/lib/riderPush.js`):

- `registerRiderPushToken(riderId, code)` — pide permiso, se registra en FCM, obtiene token, lo manda al backend. Idempotente (no re-registra en misma sesión). Con timeout 12s para no colgar el bootstrap.
- `subscribeRiderPush(onNotification)` — listener para pushes recibidos en foreground.
- **Import dinámico de `@capacitor/push-notifications`**: si el plugin no está instalado, todo es no-op silencioso. La app sigue funcionando idéntica.
- Enchufado en el bootstrap del `RiderPanel` post-login vía import dinámico.

**Backend** (`server/routes/repartidores.js`):

- Nuevo endpoint `POST /repartidores/:id/rider/:codigo/fcm-token` que valida el rider y persiste el token.
- **Migración auto**: columnas `fcm_token`, `fcm_platform`, `fcm_actualizado_en` en tabla `repartidores` (agregadas a `server/db/migrations.js`).
- Funciona incluso sin `firebase-admin` en el server: guarda el token. Cuando se instale el SDK y se agregue el sender, los tokens están ahí listos para usar.

**Documentación** (`docs/RIDER_NATIVE_APP_NEXT_STEPS.md` sección 3):

- Marcado como ✅ lo que ya está integrado.
- Pasos externos restantes: crear proyecto Firebase, `google-services.json`, `npm i @capacitor/push-notifications`, agregar sender en backend con `firebase-admin`.

### 20.5. Archivos creados/modificados

Nuevos:

- `client/src/styles/riderDark.css` — overrides scoped para dark mode.
- `client/src/lib/riderPush.js` — hook FCM cliente (dormant hasta Firebase configurado).

Modificados:

- `client/src/pages/RiderPanel.jsx` — import CSS dark, estado `themeMode`, useEffect que aplica clase `dark`, botón toggle en header, extensión de `updateEstado` con offline queue + optimista local, integración del `registerRiderPushToken` en bootstrap post-login.
- `client/src/lib/nativeRiderGps.js` — `sound: 'default'` → `'rider_alert'` en canal y schedule.
- `server/routes/repartidores.js` — endpoint `POST /rider/:codigo/fcm-token`.
- `server/db/migrations.js` — columnas FCM en tabla repartidores.
- `docs/RIDER_NATIVE_APP_NEXT_STEPS.md` — actualizadas secciones 3 (FCM), 4 (sonido), 6 (offline queue) con estado real.

### 20.6. Estado post-tanda

**Todo lo que se puede hacer sin gestos externos está hecho.** Los pendientes reales son:

- **Deploy Railway** (git push) — todos los cambios desde tanda 16 sin deployar.
- **Instalar deps nativas**: `npm --prefix client i @capacitor/splash-screen @capacitor/camera` + `-D @capacitor/assets`.
- **Generar splash assets** e `icon.png` (2732×2732 + 1024×1024).
- **Generar keystore** para firma release + build APK release firmado.
- **Grabar `rider_alert.mp3`** y ponerlo en `android/app/src/main/res/raw/`.
- **Configurar Firebase** (proyecto + google-services.json + instalar `@capacitor/push-notifications` + `firebase-admin` en server).
- **PIN de bloqueo** de la app (usuario dijo "todavía no", pendiente hasta pedido explícito).

---

## 21. Menú del día v2: guarniciones + extras opcionales (01/08/2026 - urgente)

Ampliación del sistema de menú del día para soportar guarniciones (variante obligatoria por plato) y extras opcionales (postre / bebida+postre). Antes el operador tenía que crear cada guarnición a mano en cada plato; ahora hay una lista maestra global y por plato se eligen cuáles se ofrecen.

### 21.1. Modelo de datos

**Nuevos settings globales (persistidos en `configuracion`)**:

- `menu_dia_precio_economico` = 5000
- `menu_dia_precio_ejecutivo` = 7000
- `menu_dia_extra_postre_precio` = 1000
- `menu_dia_extra_bebida_postre_precio` = 1000
- `menu_dia_guarniciones_lista` = JSON array con la lista maestra editable.

**Por producto del menú del día** (usa las columnas `variantes` y `extras` existentes):

- `variantes`: JSON con un único grupo `{ nombre: 'Guarnición', opciones: [{nombre, precio_extra: 0}, ...] }` — obligatorio elegir 1 al pedir.
- `extras`: JSON array con 0-2 extras opcionales:
  - `{ nombre: 'Postre', precio: 1000 }`
  - `{ nombre: 'Bebida + Postre', precio: 1000 }` (solo tipo=ejecutivo)

### 21.2. Backend

Reescritura del bloque de menú del día en `server/routes/operacion.js`:

- **Constantes canónicas**: `VARIANTE_GUARNICION_NOMBRE`, `EXTRA_POSTRE_NOMBRE`, `EXTRA_BEBIDA_POSTRE_NOMBRE`.
- **`loadMenuDiaSettings()`**: lee los 5 settings globales con fallback.
- **`buildMenuDiaVariantes(guarniciones)`**: arma el JSON de variantes según selección.
- **`buildMenuDiaExtras(flags)`**: arma el JSON de extras según toggles.
- **`extractGuarnicionesFromVariantes(variantesRaw)`** y **`extractExtrasFlagsFromExtras(extrasRaw)`**: helpers inversos para hidratar el UI con la selección actual.
- Reemplazado el sistema legacy de `promoActiva`/`withPromoExtra` (que solo soportaba "Jugo + Postre" hardcoded).
- **`buildMenuDiaManagerPayload()`** ahora expone en cada item `guarniciones_hoy[]`, `ofrece_postre_hoy`, `ofrece_bebida_postre_hoy`, y en la raíz `guarnicionesLista`, `extraPostrePrecio`, `extraBebidaPostrePrecio`.
- **`persistMenuDiaItems()`** regenera variantes y extras al guardar, respetando los flags recibidos del UI (o preservando los actuales si el UI no los mandó).
- **`crearProductoMenuDia`** (POST /menu-dia/nuevo) acepta `guarniciones[]`, `ofrece_postre`, `ofrece_bebida_postre` al crear un plato.

**Nuevos endpoints**:

- `GET /operacion/menu-dia/config` — devuelve los 5 settings globales.
- `PUT /operacion/menu-dia/config` — actualiza precios y lista maestra de guarniciones. Sanitiza (números > 0, dedup + trim de guarniciones).

### 21.3. UI Admin (Operación → Menú del día)

Cambios en `client/src/pages/Operacion.jsx`:

**Nuevo componente `ConfigMenuDiaGlobal`** (colapsable arriba del listado):

- 4 inputs para precios (económico, ejecutivo, postre extra, bebida+postre extra).
- Editor de la lista maestra de guarniciones: chips con botón × para quitar + input + botón "Agregar" (o Enter).
- Botón "Guardar configuración" que persiste via `PUT /menu-dia/config`.

**Cada card de plato del menú del día**:

- Reemplazado el toggle único "Jugo y postre" por un bloque nuevo:
  - **Chips seleccionables de guarniciones** de la lista global (multi-select). Cada chip activo se muestra con "✓ Nombre" en primario, inactivo en gris. Contador "El cliente eligirá 1 de N" abajo.
  - **Toggle "Ofrecer Postre"** siempre disponible.
  - **Toggle "Ofrecer Bebida + Postre"** solo visible si `tipo_hoy === 'ejecutivo'`.

**Formulario "Agregar plato eventual"**:

- Mismos controles: chips de guarniciones + 2 toggles de extras condicionales.
- Estado inicial actualizado con `guarniciones: []`, `ofrece_postre: 0`, `ofrece_bebida_postre: 0`.

### 21.4. Cero cambios en TPV y Web pública

Los modales de variante existentes (`WebPublica/VariantModal.jsx` y `TPV/TpvVariantModal.jsx`) ya soportan el formato genérico `{ variantes: [{nombre, opciones: [{nombre, precio_extra}]}], extras: [{nombre, precio}] }`. Como el backend ahora genera ese JSON automáticamente al guardar, TPV y web funcionan sin tocar nada más.

### 21.5. Script `seedMenuManana.js` para pre-cargar el menú de mañana

`server/scripts/seedMenuManana.js` — script idempotente que:

1. Persiste los 5 settings globales.
2. Asegura la categoría "Menu del Dia".
3. Resetea disponibilidad de todos los platos.
4. Upsert (por nombre) de los 7 platos de mañana:
   - **Económicos ($5.000)**: Wok (arroz/fideo), Canelones (salsa roja/blanca/mixta), Suprema napolitana (8 guarniciones), Pollo al verdeo (5 guarniciones). Todos con postre opcional.
   - **Ejecutivos ($7.000)**: Costeleta a la riojana, 1/4 pollo al horno, Bombita de papas. Cada uno con sus guarniciones específicas + postre + bebida+postre opcionales.
5. Registra el snapshot histórico del día.

Correr con:

```powershell
node server/scripts/seedMenuManana.js
```

Después el operador puede entrar a Operación → Menú del día y ajustar guarniciones o precios si hace falta.

### 21.6. Archivos creados/modificados

Nuevos:

- `server/scripts/seedMenuManana.js` — script pre-carga.

Modificados:

- `server/routes/operacion.js` — sistema v2 de guarniciones+extras (helpers + endpoints + payload).
- `server/db/seed.js` — settings iniciales de guarniciones + precios de extras.
- `client/src/pages/Operacion.jsx` — componente `ConfigMenuDiaGlobal`, UI de chips por plato, formulario nuevo actualizado.

### 21.7. Retrocompatibilidad

- Los platos existentes con el sistema legacy (`promo_hoy` / "Jugo + Postre") se leen como `ofrece_bebida_postre_hoy = 0` (el nombre no matchea con el canónico nuevo). Al primer guardado desde el UI nuevo, se regeneran los extras según los toggles.
- La constante `LEGACY_PROMO_NOMBRE = 'Jugo + Postre'` queda declarada pero no usada — sirve como documentación del rename.

---

## 19. Deploy completo: splash + keystore + APK release firmado + push Railway (01/08/2026)

Sesión de ejecución de todos los pendientes de las tandas 16–18. Se completaron las 4 tareas que habían quedado sin ejecutar al cierre del día anterior.

### 19.1. Dependencias instaladas

- `@capacitor/splash-screen ^8.0.2` (dependencies)
- `@capacitor/camera ^8.2.2` (dependencies)
- `@capacitor/assets ^3.0.5` (devDependencies)
- Verificadas en `client/package.json` y `client/package-lock.json`.

### 19.2. Assets del splash screen generados

- Se creó `client/resources/` con `icon.png` (1024×1024) y `splash.png` (2732×2732).
- Ambas generadas programáticamente con sharp: llamita blanca (extraída por color de `rider-flame-red.png`) centrada sobre fondo rojo `#dc1f2d`, con anti-aliasing suavizado.
- Se corrió `npx @capacitor/assets generate --android` → 87 assets generados (mipmaps foreground/background/round en todas las densidades + splash portrait/landscape + dark variants).
- Se corrió `npx cap sync android` → 7 plugins sincronizados (nuevos: `@capacitor/camera`, `@capacitor/splash-screen`).

### 19.3. Keystore de release generado

- Path: `client/android/modosabor-rider.jks` (gitignored, nunca se sube al repo).
- Alias: `rider-key`.
- RSA 2048 bits, validez 10000 días (~27 años, vence ~2053).
- DN: `CN=Hernan Lorenzo, OU=Modo Sabor, O=Modo Sabor, L=Monteros, ST=Tucuman, C=AR`.
- Huella SHA-256: `53:97:58:74:7F:A0:1E:1C:34:83:43:BF:EE:66:35:1E:8B:70:D0:D9:42:74:2D:1F:B3:9F:0B:90:E3:73:9A:E7`.
- Se descomentaron `*.jks` y `*.keystore` en `client/android/.gitignore` para protección.
- **IMPORTANTE**: este keystore es irrecuperable si se pierde. Hernán debe guardarlo en un lugar seguro fuera de la carpeta del proyecto (USB, nube privada). Sin él no se puede firmar una actualización que Android acepte como upgrade del APK actual.

### 19.4. APK release firmado

- **Versión**: 1.1.0 (leída de `client/package.json` vía JsonSlurper en build.gradle).
- **versionCode**: 10100 (fórmula MAJOR×10000 + MINOR×100 + PATCH).
- **Path escritorio**: `C:\Users\Exuz\Desktop\ModoSaborRider-v1.1.0-release.apk`
- **Tamaño**: ~8.99 MB.
- **Fecha/hora**: 01/08/2026 00:09.
- **Firmado**: con keystore `modosabor-rider.jks`, alias `rider-key`.
- Build: `gradlew assembleRelease` OK (410 tasks, 1m 50s).

### 19.5. Deploy Railway

- Push a `main` con commit que incluye: assets splash, mipmaps, config capacitor, .gitignore keystore, package.json/lock, RiderPanel, build.gradle, docs.
- Railway auto-despliega desde el push a main.

### 19.6. Pendientes que siguen abiertos

- FCM / push remoto (app cerrada).
- Sonido custom fuerte (`rider_alert.mp3`).
- Cola offline extendida (GPS + cambio estado + reporte).
- Sentry / Crashlytics para crashes remotos.
- PIN de bloqueo (en pausa por decisión del usuario).
