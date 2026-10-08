# Auditoría Masivos (dentro de modosabor1) — 2026-10-08

Alcance: `masivos/` (panel Stitch + whatsapp-web.js, puerto 3867) y su integración con el
servidor principal (`server/index.js:321-336`, `server/utils/masivosProxy.js`).
Estado de tests: `npm run verify` en `masivos/` OK; `masivosProxyEncoding.test.js` OK.

## Hallazgos

| # | Severidad | Hallazgo |
|---|-----------|----------|
| 1 | Alta | Flyers y menú PDF se guardan fuera del volumen persistente |
| 2 | Alta | El proxy principal corta los adjuntos a ~7,5 MB, aunque el panel promete 16 MB |
| 3 | Media | El proxy reenvía el JWT del usuario (`Authorization`) a Masivos |
| 4 | Media | En modo local no se valida `Host`: los datos se pueden leer con DNS rebinding |
| 5 | Media | `GET /api/imagen` puede devolver ~210 MB en un solo JSON |
| 6 | Media-baja | El lock por PID en un volumen persistente puede trabar el arranque |
| 7 | Baja | La configuración permite apagar toda la protección anti-ban |
| 8 | Baja | CORS no anuncia `DELETE` (en dev con Vite fallan los borrados) |

### 1. Flyers y menú PDF fuera del volumen (Alta)
`rutaImagenPromo()` (`masivos/server.js:260`) y `/api/pdf` (`:3636`) escriben en `ROOT` (`/app`).
En Railway solo `/app/data` es volumen, así que cada redeploy o reinicio borra los flyers y el menú.
El motor no avisa: "si el archivo no existe, manda solo texto". Las campañas salen sin imagen.
**Fix:** guardar en `DIR_DATA/media/` (o en una variable de entorno) y migrar los archivos que ya existen.

### 2. Límite de body en el proxy (Alta)
El servidor principal parsea JSON con `limit: '10mb'` (`server/index.js:290`) antes de llegar al proxy.
Masivos acepta adjuntos e imágenes de hasta 16 MB en base64 (`server.js:3133`, `:3591`), que en el
body ocupan unos 21 MB. Desde `www.modosabor.com.ar/masivos`, cualquier archivo de más de ~7,5 MB
falla con un 413 del servidor principal y el usuario recibe un error genérico.
**Fix:** hacer streaming del body crudo en `/masivos` (montarlo antes de `express.json`) o alinear los límites.

### 3. Fuga de credencial en el proxy (Media)
`masivosProxy.js:7-10` borra `cookie`, pero copia `authorization`. El JWT de Modo Sabor llega al
servicio Masivos y puede terminar en sus logs.
**Fix:** `delete headers.authorization;` y, ya que estamos, filtrar `x-forwarded-*` de origen.

### 4. DNS rebinding en modo local (Media)
Masivos confía en cualquier petición que venga de loopback (`server.js:2659`). Para las mutaciones
valida `Origin`, pero para los GET no valida `Host`. Una web maliciosa abierta en la PC del local
podría, con DNS rebinding, leer `/api/clientes`, `/api/conversaciones`, `/api/crm` y `/api/status`
(el QR incluido).
**Fix:** rechazar las peticiones cuyo `Host` no sea `127.0.0.1:3867`, `localhost:3867` o el host del proxy.

### 5. `GET /api/imagen` sin tope de respuesta (Media)
Devuelve hasta 10 imágenes de 16 MB en base64 dentro de un solo JSON (`server.js:3561-3579`).
Eso dispara la memoria del contenedor y tarda mucho a través del proxy.
**Fix:** devolver solo la lista de nombres y servir cada imagen como estático.

### 6. Lock por PID en volumen persistente (Media-baja)
`tomarLockPanel()` (`server.js:77-104`) guarda el PID en `data/panel.lock.json`. En un contenedor
nuevo, ese PID viejo puede coincidir con otro proceso vivo (por ejemplo `npm` o `sh`) y entonces
el servidor sale con `process.exit(2)`, lo que dispara un bucle de reinicios en Railway.
**Fix:** ignorar el lock cuando corre en contenedor (`MASIVOS_SESSION_DIR` o `RAILWAY_*`), o guardar
también el hostname y compararlo.

### 7. La configuración puede desactivar el anti-ban (Baja)
`POST /api/config` (`server.js:2866-2925`) acepta `DELAY_MIN_MS: 0` y `MAX_POR_HORA: 0` (sin límite),
y no pone límites a `CALENTAMIENTO_INICIO` ni a `CALENTAMIENTO_INCREMENTO`. Además,
`settingsPayload()` (`public/app.js:905`) toma como `false` cualquier switch que no se haya
renderizado, así que guardar la configuración podría apagar `BAJA_AUTOMATICA` sin que nadie se entere.
**Fix:** poner pisos (por ejemplo un delay de 5 s o más y un tope por hora) y enviar solo los switches presentes.

### 8. CORS sin `DELETE` (Baja)
`Access-Control-Allow-Methods: GET,POST,OPTIONS` (`server.js:2651`). Desde Vite (`:5173`), los
`DELETE` de imagen, PDF y grupos fallan en el preflight. En producción no afecta, porque ahí todo
pasa por el mismo origen.

## Auditoría funcional: por qué "no hace lo que quiero"

### Campañas (explican que casi no salga nada)
| # | Severidad | Problema | Dónde |
|---|-----------|----------|-------|
| F1 | Crítica | **"Base Total Habilitada" manda a 0 personas.** La interfaz envía `segmento: "todos"` y el servidor lo filtra como un segmento más. Como ningún contacto tiene ese segmento, la campaña queda vacía. Producción lo confirma: `Segmento: todos \| Pendientes: 0`. | `public/app.js:189`, `server.js:2009-2011` |
| F2 | Crítica | **El segmento por defecto ("Clientes Activos") hoy tiene 1 contacto en producción.** Si no tocás nada, la campaña sale a esa sola persona. "Activo" exige haber respondido en los últimos 14 días. | `public/app.js:1084`, `server.js:1047` |
| F3 | Crítica | **Las variables `{ULTIMO_PEDIDO}` y `{MENU_LINK}` se ofrecen en el editor pero nunca se reemplazan:** le llegan al cliente tal cual, con las llaves. Además dice "Rotación SpinTax: Activada", pero el spintax no existe. | `public/app.js:187`, `server.js:240-254` |
| F4 | Alta | **Las pestañas "Ya pidieron", "Nuevos" y "Recuperar fríos" no hacen nada:** siempre se guarda y se usa el mensaje general. El servidor sí soporta plantillas por segmento (`mensaje-<tag>.txt`), pero la interfaz nunca manda el `tag`. | `public/app.js:958-967` |
| F5 | Alta | **El pie "Respondé BAJA y no te mando más promos" nunca se agrega a los mensajes**, aunque se puede configurar. | `server.js:240-254` (`FOOTER_BAJA` no se usa) |
| F6 | Alta | **El servidor corre en UTC, no en hora argentina** (confirmado: el log dice 03:43 a las 15:43 UTC). Consecuencias: el envío programado a las 10:30 sale a las **07:30**; el "hoy" (no repetir, estadísticas, cupo) cambia a las **21:00**; el domingo sin envíos rige de sábado 21 h a domingo 21 h. Además, el log usa el formato `es-AR`, que muestra la hora sin AM/PM ("03:43" puede ser 15:43). | Dockerfile sin `TZ`, `server.js:199, 209, 3913` |
| F7 | Alta | **Excluir no tiene vuelta atrás:** ningún botón vuelve a incluir un contacto y la exclusión no queda registrada para deshacerla. Para probar con una persona, el camino previsto son los "Grupos guardados" (Contactos → guardar selección → elegir el grupo en Campaña), pero no es evidente. | `public/app.js:1039` |
| F8 | Media | **"Enviar prueba personal" usa el mensaje guardado, no lo que está escrito en el editor**, y solo se manda a tu propio número. | `server.js:3773` |

### Conversaciones
| # | Severidad | Problema | Dónde |
|---|-----------|----------|-------|
| F9 | Alta | **Cada sincronización borra el historial guardado:** reescribe `chats.json` solo con lo que WhatsApp Web tiene en memoria, que muchas veces es nada más que el último mensaje. | `server.js:3438` |
| F10 | Alta | **El panel solo escucha los mensajes entrantes** (evento `message`). Lo que respondés desde el celular y las promos que manda el motor no aparecen en la conversación. | `server.js:1944`, falta `message_create` |
| F11 | Media | **Cualquier mensaje entrante cuenta como "respuesta" a la campaña,** aunque a esa persona nunca se le haya mandado una promo. Eso infla "Respondieron/Activos", la salud del número y las estadísticas. | `server.js:750, 1949` |
| F12 | Media | **La sincronización saca de la lista a los contactos cuyo chat ya no aparece** (salvo los cargados a mano). | `contact-sync.js:86-99` |

### Robustez y cosmética
- F13: si Railway reinicia en medio de una campaña, la campaña queda en estado `corriendo` para siempre y no se retoma. Tampoco hay manejador de `SIGTERM` (`server.js:3933`).
- F14: `GET /api/operador` y `GET /api/conversaciones` recalculan todo el historial de 3 a 5 veces por pedido (`leerClientesEnriquecidos`): se va a poner lento a medida que se acumulen días.
- F15: "Cola de salida" siempre muestra 0, porque `stats.pendientes` no existe (`public/app.js:157`).

## Verificación en producción (www.modosabor.com.ar/masivos, solo lectura)

- Sin sesión, todas las rutas `/masivos/*` devuelven 401. `masivos.modosabor.com.ar` no existe en DNS.
- WhatsApp está `listo`, con 504 chats leídos y 572 contactos (todos `@lid`, 499 con teléfono).
- **Crítico operativo: 567 de los 572 contactos están excluidos** (`excluido: true`). Solo quedan 5
  habilitados. La corrida de las 03:43 terminó con "Pendientes: 0".
  - No figura ninguna acción masiva (`/api/acciones-masivas` vacío) ni bajas en el log.
    El único otro camino es "Excluir seleccionados" (`public/app.js:1039`), que no queda registrado
    en las acciones masivas: **no se puede deshacer**.
  - **El panel no tiene forma de volver a incluir un contacto:** `/api/excluir` con `excluir: false`
    existe en el servidor, pero ningún botón lo usa.
  - Hay que decidir si esas 567 exclusiones fueron intencionales antes de revertirlas.
- Imágenes: hay un `promo.png` de 5 KB y no hay `menu.pdf`. La respuesta de `/api/imagen` hoy pesa
  10 KB (el punto 5 queda latente). El punto 1 sigue en pie: ese archivo vive en `/app`, fuera del volumen.

## Lo que está bien
- Token del proxy comparado con `timingSafeEqual`, y el acceso remoto exige token (`server.js:2632`).
- Mutaciones protegidas por `Origin`/`Referer` (CSRF).
- El envío real exige un token de confirmación de la campaña y se bloquea con salud roja (`:3831-3840`).
- Baja automática (opt-out), días sin envío y modo "solo respuestas".
- `data/`, `sesion/` y `.wwebjs_cache/` están en `.gitignore`: no hay datos de clientes en git.
- La ruta `/masivos` del servidor principal exige `auth` + `marketing.edit`.

## Prioridad sugerida
1. **Que la campaña llegue a quien corresponde:** F1, F2, F3, F5, F6 y F7 (más reincluir a los 567 contactos).
2. **Que no se pierdan cosas:** el punto 1 (flyers en el volumen), F9 y F10.
3. **Que los adjuntos y las métricas sean confiables:** los puntos 2 y 3, y F4, F8 y F11.
4. **El resto:** los puntos 4 a 8, y F12 a F15.
