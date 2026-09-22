# Dónde estamos y qué falta — para Codex

Modo Sabor, restaurante en Monteros (Tucumán). Repo `D:\Proyectos\modosabor1`,
producción en Railway, dominio `modosabor.com.ar`. El dueño es Hernán y **no
programa**: cualquier cosa que le pidas tiene que ser un comando para copiar y
pegar, o una acción en el panel.

Este documento tiene tres partes: **qué se hizo hoy**, **qué quedó abierto** y
**qué hay que hacer**, en ese orden.

---

## Reglas que valen para todo el trabajo

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Los archivos se
  agregan uno por uno. En la raíz hay bases `.sqlite` de n8n con credenciales
  adentro; están en `.gitignore`, pero si ves alguna en verde, **pará y avisá**.
- **No escribas API keys, contraseñas ni certificados en ningún archivo del
  repo**, ni siquiera de ejemplo.
- **Hay más de 30 archivos sin commitear que son trabajo tuyo en curso.** No los
  subas de arrastre. Cada commit, un tema.
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- No corras "recalcular niveles", `upsertMenuDelDia.js` ni `seedMenuManana.js`.
- No borres `diagnostico-asistente.js` ni `aufitoria kilo`.
- **Todo lo que toque la base de producción va adentro de Railway** (`railway
  ssh`). Correrlo desde la carpeta en Windows toca la base local, que **no** es
  la del bot. Este error ya se cometió tres veces hoy.
- **No cambies una aserción para que un test pase.** Si falla por un bug real,
  pará y avisá.
- **No reescribas la historia de git.**

---

## Parte 1 — Qué se hizo hoy

El disparador fue que Hernán encendió el motor propio de IA (que vos habías
dejado publicado y apagado en `whatsapp_motor_propio`) e hizo **una prueba real
de diez minutos por WhatsApp**. Esa sola prueba destapó cuatro errores que
estaban en producción. Todos están arreglados y subidos:

| Commit | Qué estaba mal |
| --- | --- |
| `d7f08f0a` | El agente le dijo a un cliente que la salchipapas XL tenía **"un adicional de $300.000, total $304.000"**. El adicional son 300000 **centavos** = $3.000, y la XL sale $7.000. La herramienta de opciones le pasaba al modelo los centavos crudos y además el adicional en vez del precio final. Ahora manda el precio final ya formateado, como hace `quoteProduct`. |
| `ccc3f82d` | El agente le dijo a un cliente que **la hamburguesa "Demencial" no existe en la carta**. Existe, está activa y sale $13.000. El resumen del menú mostraba 6 productos por categoría, alfabéticos: de 16 hamburguesas veía las 6 primeras (A a C) y dedujo que el resto no existía. **Seis de las nueve categorías venían recortadas.** Ahora cada categoría informa su total y avisa que la lista está recortada. |
| `8372e9a8` | El agente **cerró la conversación con "¡Hasta la próxima!"** mientras el cliente tenía media docena de empanadas cargadas y una guarnición a medio elegir. Ese pedido se perdió. El estado del carrito sólo existía si el modelo se acordaba de llamar a `ver_carrito`. Ahora va en el contexto de cada mensaje, con la instrucción de no despedirse con un pedido abierto. Tiene test: `carritoEnContexto.test.js`. |
| `4d262a7e` | **Faltaban cuatro categorías enteras en los alias**: Hamburguesas, Sandwichs, Bebidas y Pastas. Sin alias, "¿qué hamburguesas tenés?" no encontraba la categoría y caía en el resumen recortado — la misma cadena que negó la Demencial. Los alias nuevos salen del backup real de WhatsApp: 496 clientes, 27.901 mensajes, de febrero a agosto. |

También se subió:

- `9ce37c83` — La pantalla de WhatsApp ahora **muestra el último error del
  gateway**. Antes el sistema conocía el motivo de cada falla y no lo mostraba
  en ningún lado: había que entrar al código para saber por qué un audio no se
  transcribía.
- `fac599e3` — El error del audio decía "Whisper terminó con código null".
  Código nulo no es un fallo: significa que **al proceso lo mataron**. Ahora
  distingue si lo cortamos nosotros por tiempo o si lo mató el sistema
  operativo, con los segundos y la señal.
- `2cabbf5e` y `5a513d3a` — Los dos fallos que tenían el CI en rojo. **El CI
  quedó verde**, por primera vez en semanas.
- `d9296089` — La regla del turno mañana. Decía "se vende el menú del día **y
  también la carta completa**", y eso le daba permiso al agente para ofrecer las
  dos. La regla real del local es: **se ofrece el menú; la carta se manda sólo
  si el cliente la pide.** Ya se aplicó en producción con
  `server/scripts/actualizarReglasTurno.js --aplicar`.
- `888d7c77` — La transcripción de audio pasó a Gemini, con Whisper de respaldo.
  **Está apagada en producción** (ver más abajo).

---

## Parte 2 — Qué quedó abierto

### a) El audio, que es el tema más importante que queda

**Por qué importa:** en el backup de seis meses hay **1.554 audios en 182
chats**. Más de un tercio de los clientes pide hablando. No es un accesorio.

**El problema real, medido:** el contenedor de Railway tiene
`memory.max = 999.997.440` bytes, o sea **954 MB**, y estaba usando 160 MB.
Whisper `small` necesita cerca de 1 GB sólo para cargarse. Cuando no entra, el
sistema operativo lo mata sin dejar mensaje. **No es un bug: es un techo.**

**Lo que se hizo:** se creó `server/services/transcripcionGemini.js`, que manda
el audio a Gemini usando la clave que ya estaba cargada para la voz del
asistente. Whisper quedó de respaldo automático. Tiene test
(`transcripcionGemini.test.js`) verificado con cuatro mutaciones.

**Estado ahora mismo:** **apagado.** Durante la prueba el bot dejó de responder
y se apagó como precaución con:

```
transcripcion_gemini_activa = 0
```

Después se comprobó que **el silencio no tenía nada que ver con eso** (ver punto
b). Falta volver a encenderlo y probarlo de verdad:

```
railway ssh
node -e "const db=require('./server/db'); db.prepare(\"INSERT INTO configuracion (clave,valor) VALUES ('transcripcion_gemini_activa','1') ON CONFLICT(clave) DO UPDATE SET valor='1'\").run(); console.log('audio por Gemini');"
```

Y después **pedirle a Hernán que mande un audio** y confirme que contesta bien.
Si falla, el cartel rojo de la pantalla de WhatsApp muestra el motivo.

### b) La falsa alarma del bot mudo — y lo que sí hay que arreglar

El bot dejó de contestar y parecía culpa del deploy. **No lo era.** En
`whatsappGateway.js`:

```js
if (message?.key?.fromMe && !message.enviadoPorSistema) {
  // Cuando alguien responde desde el teléfono, la IA se retira de ese chat.
  bot_silenciado = 1
  bot_silenciado_hasta = datetime('now', '+30 minutes')
```

Hernán había contestado a mano desde el teléfono del local, y el bot se calló 30
minutos en ese chat. **El comportamiento es correcto.** El problema es otro:

**Nadie puede saber que eso pasó.** No se ve en ninguna pantalla. Hernán pensó
que el sistema estaba roto, revirtió un cambio que no tenía nada que ver, y
perdimos una hora.

**Qué hacer:** que la pantalla de WhatsApp muestre las conversaciones
silenciadas — quién, desde cuándo, por qué motivo (respondió una persona / el
agente derivó) y hasta cuándo. Con un botón para devolverle la conversación al
bot. La consulta que arma el estado ya calcula `pausa_humana` en
`whatsappGateway.js` cerca de la línea 191; sale de ahí.

**Ojo con un detalle:** `pausa_humana` **no es una columna de la tabla**, es un
`CASE ... AS pausa_humana` dentro de ese SELECT. Consultarla directo falla con
"no such column".

### c) Los tests corren contra la base de producción de la máquina

`npm test` abre `server/data/modosabor.db`, la base real de la PC de Hernán. Los
tests que insertan escriben datos de verdad. Está diagnosticado y medido en
**`PROMPT-CODEX-TESTS.md`**: 72 tests, 5 con base propia, 16 que cargan la
compartida, 9 de esos acoplados a datos reales. Ese documento tiene el plan
completo y no hace falta rehacerlo.

Hoy quedan 3 fallando en local por esto.

### d) Los tres frentes grandes, sin empezar

En `PROMPT-CODEX-LO-QUE-DUELE.md` está el detalle de cada uno:

1. **Costos.** 78 productos activos, **cero con costo cargado**. El estado de
   resultados informa 0% de cobertura, o sea que no se sabe el margen de nada.
   Hace falta una pantalla para cargarlos rápido, ordenada por lo más vendido.
   **Los costos los carga Hernán; vos hacés la herramienta.**
2. **Offline.** El primer pedazo ya está: el panel avisa cuando se corta
   internet (`5a513d3a`). Falta que la carta abra sin conexión y que los pedidos
   se encolen con clave de idempotencia.
3. **ARCA.** Bloqueado esperando cuatro datos que sólo tiene Hernán: CUIT,
   condición frente al IVA, punto de venta y certificado digital. La
   especificación está en `ESPEC-FACTURACION-ARCA.md`. **Nada de eso va al
   repositorio.**

### e) Un archivo que quedó descartado

`server/services/socialService.js` tenía un error de sintaxis: una copia
huérfana del cuerpo de `createDestination` pegada después de `deleteDestination`.
Las funciones `updateDestination` y `deleteDestination` estaban completas pero
**no las usaba nadie** — sin exportar, sin rutas, sin pantalla.

Se descartó el cambio y se guardó en
`docs/pendiente-editar-borrar-destinos.diff`. Si hace falta editar y borrar
destinos, va completo: función, ruta, pantalla y test.

---

## Parte 3 — Qué hacer, en este orden

**Con freno entre cada paso. Pegá el resultado y esperá.**

### 1. Confirmar que el bot está sano

```
railway ssh
node -e "const db=require('./server/db'); console.table(db.prepare(\"SELECT telefono, bot_silenciado, escalado_humano, ultimo_estado, datetime(bot_silenciado_hasta) AS hasta FROM whatsapp_conversaciones ORDER BY actualizado_en DESC LIMIT 8\").all());"
```

Si hay conversaciones silenciadas de clientes reales, **no las despiertes todas**:
puede haber alguien esperando atención humana de verdad. Mostrá la tabla y frená.

### 2. Volver a encender el audio por Gemini y que Hernán lo pruebe

El comando está en el punto (a). Después pedile un audio de prueba y confirmá
que contesta con lo que se dijo.

**Si falla, no lo apagues y ya: mirá el cartel rojo de la pantalla de WhatsApp,
que ahora dice el motivo exacto.**

### 3. Mostrar las conversaciones silenciadas en el panel

Lo del punto (b). Es chico y evita que vuelva a pasar lo de hoy.

### 4. Los tests contra la base de producción

Seguí `PROMPT-CODEX-TESTS.md` tal cual. Está medido, no lo rehagas.

### 5. Recién ahí, los costos

Lo del punto (d.1).

---

## Cómo verificar cualquier cosa que toques

Para cada arreglo, **rompé a propósito el código que el test cubre y confirmá
que el test se pone en rojo.** Después devolvelo. Si al romperlo sigue pasando,
el test no prueba nada y hay que decirlo.

Esto no es ceremonia: en este repo ya pasó que siete tests se cargaban sin
ejecutar sus comprobaciones y contaban como aprobados. Está documentado en el
comentario de `server/tests/run.js`.

Antes de cada push:

```
cd server && npm test && npm run lint
cd ../client && npm run build
```

---

## Lo que NO hacés vos

- Cargar costos, precios o datos del negocio.
- Rotar credenciales o tocar variables de entorno en Railway.
- Conectar WhatsApp o escanear el QR.
- Decidir si se paga más memoria en Railway o se cambia de proveedor de IA.
- Decidir qué pasa con el PDF de la carta (11 MB, sin trackear).
