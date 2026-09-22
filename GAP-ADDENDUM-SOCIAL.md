# Addendum de Modo Sabor Social — Gap Analysis

Comparación del addendum contra el código actual, incluyendo lo que
implementamos hoy en las fases A, B y C.

---

## EL HALLAZGO PRINCIPAL

> **Hoy no existe ningún camino de ejecución que no pase por el worker.**

`claimWork()` es el único lugar donde un target avanza, y **lo llama el worker**.
No hay ningún reloj del lado del servidor que procese targets: busqué
`setInterval` en `socialService.js`, en `routes/social.js` y en `index.js` para
lo social y no hay ninguno.

Consecuencia directa del punto A: si la Fan Page e Instagram pasan a ejecutarse
por API desde Railway, **no tienen quién los ejecute**. La PC del local apagada
significaría que tampoco publica la API, que es exactamente lo contrario de lo
que el addendum busca.

No es un ajuste: **falta una pieza entera**, un scheduler propio del servidor.

---

## A. YA CUBIERTO

### El modelo aguanta lo que viene

- **Identidades separadas del provider.** `social_accounts` con `provider` +
  `nombre` + `metadata`, y `social_destinations.cuenta_id` obligatorio con la
  identidad adentro de la clave única. Eso es lo que hace posible el punto K —
  agregar Google Business, TikTok o Threads sin refactor.
- **Un target por destino**, con `intentos`, `max_intentos`,
  `proximo_reintento_en`, `lock_token`, `lock_hasta`, `programada_para`. El
  esqueleto para colas, reintentos y locking ya está.
- **Estados `requires_approval` y `ambiguous`** ya existen, y el retry manual
  sólo toma `failed`.
- **Metadata por grupo** ya guarda `requiereAprobacion` desde hoy (Fase B).

### Throttling: existe una versión mínima

`claimWork()` respeta un delay configurable de 5 a 300 segundos, guardado en
`social_delay_segundos` y editable desde la pantalla.

### Media servida por HTTPS

`/uploads` se sirve estático y el dominio tiene HTTPS, así que la infraestructura
para el punto D está. Falta el resto del punto D.

### Seguridad

El punto 43 original y el K del addendum ya se respetan: sesión manual, sin
evasión, sin exportar cookies.

---

## B. HAY QUE MODIFICAR

### 1. El delay es global y frena de más — **importante**

```js
const ultimaPub = db.prepare(
  "SELECT MAX(finalizado_en) ... FROM social_post_targets WHERE estado IN (...)"
).get();
if (ahora - ultima < delaySegundos * 1000) return null;
```

Tres problemas:

- **Es global, no por identidad.** El addendum pide una cola serializada por
  identidad. Hoy una publicación de Instagram frenaría la del Perfil.
- **Sin jitter.** Un intervalo exacto de 30 segundos es el patrón más
  reconocible que existe. El addendum pide ±40%.
- **Frena también los comandos.** El `return null` está *antes* de buscar
  comandos, así que después de publicar no se puede correr un health check ni
  una sincronización durante 30 segundos. Es un efecto no buscado.

### 2. `claimWork` tiene que partirse en dos

Hoy mezcla "dame un comando" con "dame un target". Con dos clases de ejecución,
el worker sólo debe recibir targets **clase browser**, y el servidor debe
procesar los **clase api** por su cuenta.

### 3. Métricas: hoy son de ejecución, no de alcance

`getMetrics()` cuenta campañas, publicaciones, éxitos y fallos **propios**. Eso
está bien y hay que conservarlo, pero el punto I pide alcance e interacciones
desde Insights. Son dos cosas distintas que hoy comparten pantalla.

Lo importante del punto I ya se respeta sin quererlo: **no se inventa ni se
scrapea nada**. Sólo hay que agregar el cartel de "sin métricas disponibles"
para Perfil y Grupos.

### 4. Health check por clase

Hoy es uno solo, del worker. El punto J pide validar el token contra la API para
la clase API. Lo de hoy (Fase E) ya distingue sesión vencida de checkpoint y
marca la Page como "Pendiente de validación", así que la base está.

### 5. `social_media` sin datos de formato

Tiene `ruta`, `mime`, `tamano`, `tipo`. Faltan **url pública, dimensiones,
duración y relación de aspecto**, que el punto D pide validar *antes* de
encolar.

---

## C. NO EXISTE

| # | Qué falta | Punto |
| --- | --- | --- |
| 1 | **Scheduler del lado del servidor** para la clase API | A |
| 2 | `executionClass` en el modelo y ruteo automático | A |
| 3 | Registro de providers con contrato común | B |
| 4 | Adaptadores API: Facebook Page e Instagram | B, C |
| 5 | Autenticación con System User token | C |
| 6 | Publicación en dos pasos de Instagram + polling del contenedor | C |
| 7 | Cifrado de credenciales | C |
| 8 | URL pública, dimensiones, duración y aspecto en la media | D |
| 9 | Validación de compatibilidad antes de encolar | D |
| 10 | **Cola por identidad** | E |
| 11 | **Jitter** | E |
| 12 | **Cupo diario por identidad** | E |
| 13 | **Cooldown por grupo (24 h)** | E |
| 14 | Cupo diario de Instagram | E |
| 15 | Pausa automática ante N fallos seguidos | E |
| 16 | Encolar el excedente para el día siguiente | E |
| 17 | **Ventana de dedupe** y estado `skipped_duplicate` | F |
| 18 | `permite_contenido_comercial`, `frecuencia_maxima_permitida`, notas, `bloqueado_manualmente` | G |
| 19 | Exclusión automática por reglas + "3 grupos excluidos por reglas" | G |
| 20 | **Kill switch** general y por identidad | H |
| 21 | Insights de Page e Instagram | I |
| 22 | Health check contra la API | J |

---

## QUÉ SE ROMPE AL MIGRAR, Y QUÉ SE SALVA

### Lo que se salva entero

**Todo el modelo de datos.** Campañas, targets, estados, locking, reintentos,
identidades, destinos, conjuntos, logs. No hay que tocar nada de eso: un target
de la Page por API usa exactamente las mismas tablas que uno de un grupo por
navegador. Sólo hay que agregarle una columna que diga por dónde se ejecuta.

**La pantalla.** El compositor, la lista de campañas, el detalle, el retry de
fallidos: todo funciona igual sin importar cómo se publica por debajo. Es
justamente lo que el punto B busca.

**`reportPublication()` y `refreshCampaignState()`.** El cálculo de
`partial` / `published` / `failed` es agnóstico. Sirve igual.

### Lo que se rompe

**`claimWork()` como único motor.** Hay que agregar el scheduler del servidor.
Es lo más grande.

**El health check del dashboard.** Hoy asume que todo depende del worker. Con la
Page por API, el worker puede estar apagado y la Page seguir funcionando — y la
pantalla diría que está todo mal.

**`facebookPublisherService.js` para la Page.** Sus funciones sirven para grupos
y perfil; para la Page quedan sin uso. **No las borraría todavía**: hasta que la
API esté validada de punta a punta, son el camino que funciona.

**El alta manual de destinos.** Hoy `createDestination` no sabe de clase de
ejecución. Un destino de Page tiene que nacer sabiendo que va por API.

---

## ORDEN QUE PROPONGO

Respetando lo que pedís: throttling, dedupe y kill switch **antes** de habilitar
publicación masiva real.

### Fase 1 — Los frenos (sin tocar nada de API)

Es lo primero porque **hoy la publicación masiva ya se puede disparar** y los
únicos frenos son un delay global sin jitter. Antes de que eso toque grupos
reales, tiene que estar completo.

1. Cola por identidad, con jitter configurable.
2. Cupo diario por identidad y cooldown de 24 h por grupo.
3. Pausa automática ante N fallos seguidos.
4. El excedente se encola para mañana y se dice en el resumen.
5. Sacar el delay de adelante de los comandos.
6. Todo configurable desde la pantalla.

### Fase 2 — Dedupe y reglas por grupo

7. `skipped_duplicate` como estado, con ventana de 7 días configurable.
8. Campos de reglas por grupo, editables a mano.
9. Exclusión automática, visible en el resumen.

### Fase 3 — Kill switch

10. Pausar todo y pausar por identidad, sin perder estado.

**Hasta acá no se toca ni una línea de API.** Y con esto ya se puede hacer la
prueba crítica del punto 40 sobre grupos reales sin riesgo de una avalancha.

### Fase 4 — La capa de providers

11. `executionClass` en destinos, con ruteo.
12. Registro de providers con el contrato de cuatro métodos.
13. Envolver lo que ya existe —grupos y perfil— como providers browser, sin
    cambiarles el comportamiento.

### Fase 5 — El scheduler del servidor

14. Reloj propio que toma targets clase API. Con locking e idempotencia, igual
    que el worker.

### Fase 6 — Fan Page por API

15. System User token, guardado cifrado.
16. Adaptador de Page: feed, foto, video, story.
17. Health check contra la API.
18. Migrar los destinos de Page a clase API.

### Fase 7 — Instagram por API

19. Media con URL pública, dimensiones y aspecto.
20. Validación de compatibilidad antes de encolar.
21. Adaptador de Instagram con los dos pasos y el polling.
22. Cupo de 50 por día.

### Fase 8 — Insights

23. Métricas reales de Page e Instagram, y "sin métricas disponibles" para
    Perfil y Grupos.

---

## DOS COSAS QUE CONVIENE DECIR ANTES DE EMPEZAR

**El addendum mejora mucho el riesgo.** Migrar la Fan Page e Instagram a la API
oficial saca de la automatización de navegador exactamente las dos cosas que se
pueden hacer de forma sancionada. Lo que queda del lado del navegador —perfil y
grupos— es lo que no tiene camino oficial. Y la regla de que la clase browser
**no crezca nunca** es la decisión más importante del documento.

**Los nombres de permisos y los endpoints los verifico cuando llegue la Fase 6**,
contra la documentación de Meta del día, como pedís. No los doy por buenos desde
este documento: esa API cambia seguido y lo que escriba hoy puede estar viejo
cuando lleguemos.

---

## LO QUE NECESITO DE VOS

Confirmar que arranco por la **Fase 1**, los frenos.

Y una cosa que no depende de mí: la prueba crítica del punto 40 —sincronizar
grupos reales del Perfil y publicar en uno— **necesita el Worker andando en tu
PC**, con Chrome en el puerto 9222 y la sesión de Facebook iniciada a mano. Sin
eso puedo seguir construyendo, pero no puedo validar nada de verdad.
