# Prompt para Codex — Motor único de IA para Modo Sabor

Copiá todo lo que sigue y pasáselo a Codex tal cual.

---

Trabajás en `D:\Proyectos\modosabor1`. Vas a unificar los dos agentes de IA del
sistema en un solo motor. Es un trabajo largo: **tomate el tiempo que necesites,
hacelo por partes y no preguntes nada.** Todo lo que necesitás decidir está
escrito acá.

## Regla de oro

**Todo lo que hagas es aditivo y queda apagado por defecto.** No borrás nada, no
reemplazás nada, no cambiás el comportamiento de lo que hoy funciona. Al
terminar, el sistema tiene que comportarse exactamente igual que antes hasta que
Hernán prenda el interruptor a mano.

Si en algún momento tenés que elegir entre "hacerlo elegante" y "no romper lo
que anda", elegís no romper.

## Reglas que no se negocian

- **NO uses `git add -A`, `git add .` ni `git commit -a`.** En la raíz hay bases
  de n8n con credenciales. Agregá los archivos uno por uno. Si al hacer `git
status` ves algún `.sqlite` en verde, PARÁ y avisá.
- **No borres nada.** Ni el workflow de n8n, ni los export JSON, ni código
  viejo. Esta tanda no borra.
- **No toques** `client/src/pages/Delivery.jsx`, la app del repartidor ni
  `mozo-app/`.
- **No corras** "recalcular niveles", `upsertMenuDelDia.js` ni
  `seedMenuManana.js`.
- **No instales dependencias.** Todo lo que hace falta ya está en el proyecto.
- **No escribas API keys ni contraseñas** en ningún archivo.
- **No inventes precios ni datos de negocio.**
- **Los 47 tests tienen que seguir verdes** después de cada paso. Si alguno se
  rompe, arreglalo antes de seguir.

## Contexto que necesitás saber

El sistema tiene **dos agentes de IA**, con dos motores distintos:

1. **El asistente del panel** — `server/routes/asistente.js`. Tiene el motor
   bueno: bucle de tool calling con `MAX_VUELTAS = 6`, llamando a `conversar()`
   de `server/services/iaProveedor.js`, que implementa tool calling nativo para
   Gemini, compatibles con OpenAI y Anthropic. Tiene permisos por herramienta,
   separa consultas de acciones —las acciones se proponen y esperan
   confirmación— y audita cada llamada en `auditoria_ia`.

2. **El agente de WhatsApp** — el bucle vive en un workflow de **n8n** en
   Railway. Tiene sólo 6 de las 9 herramientas conectadas y no tiene permisos,
   ni confirmación, ni auditoría.

**El trabajo es que los dos usen el motor del panel.**

---

# PASO 0 — Seguridad y cables sueltos

Esto es lo único que cambia comportamiento, y es para arreglar cosas rotas.

## 0.1 — Cerrar la fuga de datos

`server/routes/agente.js`, endpoint `GET /cliente/:telefono?`.

Hoy acepta **cualquier** teléfono. Si el modelo se confunde o alguien mete un
prompt raro, devuelve la ficha de otro cliente.

Cambialo para que el teléfono salga **del contexto de la conversación, no del
parámetro**. El gateway ya sabe de qué número viene el mensaje: pasalo por el
header `x-agent-telefono` desde `whatsappGateway.js` y usá ese. Si el parámetro
de la URL no coincide con el del header, respondé `403` y logueá el intento con
`logger.warn`.

Escribí un test en `server/tests/utils/agenteSeguridad.test.js` que verifique:
pedir la ficha de un teléfono distinto al de la conversación devuelve 403.

## 0.2 — Enchufar las dos herramientas desconectadas

`agente-whatsapp/n8n/build-agent-workflow.js` declara 9 herramientas, pero el
workflow activo `workflow-active-final.export.json` sólo tiene 6. Faltan
`menu-dia`, `pedido-actual` y `derivar`.

Regenerá el workflow con las 9 y dejá el archivo nuevo en
`agente-whatsapp/n8n/workflow-9-tools.generated.json`. **No lo importes a n8n**
— eso lo hace Hernán a mano.

Dejá escrito en `agente-whatsapp/n8n/README.md` qué archivo hay que importar y
que las tres herramientas nuevas son `menu-dia`, `pedido-actual` y `derivar`.

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 1 — Extraer el motor

Creá `server/services/motorAgente.js`.

Mové ahí el bucle de tool calling que hoy está adentro de
`server/routes/asistente.js`. La función principal:

```js
async function ejecutarAgente({
  sistema,        // instrucciones
  mensajes,       // historial + mensaje nuevo
  herramientas,   // catálogo ya filtrado por permisos
  ejecutar,       // (nombre, argumentos) => resultado
  maxVueltas = 6,
  onPaso,         // callback por cada llamada, para auditar
})
```

**`routes/asistente.js` pasa a usarla.** El comportamiento tiene que quedar
idéntico: mismas respuestas, mismos permisos, misma auditoría.

**Criterio de éxito: los 47 tests siguen verdes y el asistente del panel se
comporta exactamente igual.** Si algo cambia, es un error tuyo, no una mejora.

Escribí `server/tests/utils/motorAgente.test.js` con al menos:

- el bucle corta al llegar a `maxVueltas`
- si el modelo no pide herramientas, devuelve el texto y no llama a `ejecutar`
- si una herramienta tira error, el error vuelve al modelo y el bucle sigue
- `onPaso` se llama una vez por herramienta ejecutada

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 2 — Registro de herramientas

Creá `server/services/registroHerramientas.js`.

Un único lugar donde cada herramienta declara:

```js
{
  nombre: 'cotizar_item',
  descripcion: '...',
  parametros: { /* JSON Schema, como ya usa iaProveedor */ },
  permiso: 'READ_MENU',
  escribe: false,
  ejecutar: (args, contexto) => { ... },
}
```

Permisos a usar:

```
READ_MENU · READ_STOCK · READ_CUSTOMER · READ_ORDER
WRITE_CART · CREATE_ORDER · CANCEL_ORDER · HANDOFF
```

Y dos perfiles:

- **`cliente`** (WhatsApp): `READ_MENU`, `READ_STOCK`, `READ_CUSTOMER`,
  `READ_ORDER`, `WRITE_CART`, `CREATE_ORDER`, `HANDOFF`.
- **`dueño`** (panel): todos, más las herramientas de
  `asistenteHerramientas.js`, respetando los permisos de usuario que ese archivo
  ya chequea.

**Regla dura: `READ_CUSTOMER` sólo puede consultar el teléfono que está en el
contexto.** El modelo no elige de quién pedir la ficha. Esto es lo mismo del
paso 0.1, pero aplicado en el registro.

Registrá como herramientas las que ya existen en `server/utils/systemClient.js`
y en `server/routes/agente.js`. **No reescribas la lógica**: el registro las
envuelve, no las reemplaza.

Tests en `server/tests/utils/registroHerramientas.test.js`:

- un perfil sin `CREATE_ORDER` no ve la herramienta de crear pedido
- pedir la ficha de otro teléfono falla aunque el modelo lo pida
- toda herramienta declarada tiene nombre, parámetros y permiso

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 3 — El carrito

Las tablas **ya existen**. No crees tablas nuevas.

```sql
whatsapp_pedidos_borrador(
  id, conversacion_id, telefono, cliente_nombre, cliente_direccion,
  tipo_entrega, metodo_pago, notas, estado, delivery_zona,
  tiempo_estimado_min, subtotal, costo_envio, total, pedido_id, ...)

whatsapp_pedidos_borrador_items(
  id, borrador_id, producto_id, nombre, cantidad, descripcion,
  variantes, extras, precio_unitario, creado_en)
```

Creá `server/services/carritoWhatsapp.js` con:

```js
verCarrito(telefono);
agregarItem(telefono, { producto_id, cantidad, variantes, extras, notas });
quitarItem(telefono, itemId);
modificarItem(telefono, itemId, { cantidad, variantes, extras, notas });
vaciarCarrito(telefono);
```

## Cómo se modelan las unidades — esto es lo que decide si el agente sirve

**Cuando dos unidades del mismo producto difieren en algo, van en filas
distintas con cantidad 1 cada una. No en una fila con cantidad 2.**

"Dos napolitanas, una sin jamón y la otra con extra queso" tiene que quedar así:

```
item 12 · Suprema napolitana · cantidad 1 · guarnición papas · sin jamón
item 13 · Suprema napolitana · cantidad 1 · guarnición papas · extra queso
```

Y NO así:

```
item 12 · Suprema napolitana · cantidad 2 · ???
```

Si se agrupan, después no hay forma de saber a cuál unidad aplicar
_"a esa ponela bien cocida"_ o _"sacame una"_. Agrupar sólo cuando las dos
unidades son idénticas en producto, variantes, extras y notas.

`quitarItem` y `modificarItem` trabajan **por `itemId`**, nunca por nombre de
producto. Y `verCarrito` devuelve los ids, para que el modelo pueda referirse a
una unidad concreta.

Reglas:

- **Los precios se cotizan siempre contra el catálogo** con `quoteProduct()` de
  `systemClient.js`. El precio nunca viene del modelo.
- **Todo en centavos**, como el resto del sistema. `precio_unitario` en
  centavos: $7.000 son 700000. Un `7000` sería $70.
- `subtotal`, `costo_envio` y `total` se recalculan en cada cambio.
- Un teléfono tiene **un solo** borrador con `estado = 'abierto'`.
- **Si el borrador ya tiene `pedido_id`, está cerrado: no se toca más.** Ese
  campo es el candado de idempotencia.

Registrá las cinco como herramientas con permiso `WRITE_CART`.

Tests en `server/tests/utils/carritoWhatsapp.test.js` — usá una base en memoria
como hacen los otros tests:

- agregar dos ítems y que el total sea la suma real del catálogo
- quitar uno y que el total baje
- modificar la cantidad y que recalcule
- **el precio sale del catálogo aunque se le pase otro por parámetro**
- un borrador con `pedido_id` rechaza cualquier cambio
- los montos quedan en centavos, no en pesos

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 4 — Conectar WhatsApp al motor, apagado

Creá `server/services/agenteWhatsapp.js`: arma el contexto —teléfono, ficha del
cliente, turno, historial—, pide el perfil `cliente` al registro y llama a
`ejecutarAgente()`.

En `server/services/whatsappGateway.js`, donde hoy llama a `callAgent()` contra
n8n, agregá la bifurcación:

```js
// Apagado por defecto. Hernán lo prende desde Configuración cuando quiera
// probar. Con el flag en 0, el comportamiento es exactamente el de siempre.
const usarMotorPropio = enabled('whatsapp_motor_propio', false);
```

- `whatsapp_motor_propio = 0` → todo sigue por n8n, **igual que hoy**.
- `whatsapp_motor_propio = 1` → usa el motor propio.

Agregá la clave a la semilla de configuración con valor `'0'`.

En el panel, en Configuración → WhatsApp, agregá el interruptor **"Motor de IA
propio (experimental)"**, apagado, con la leyenda: _"Si lo apagás, vuelve a
atender por n8n."_

**No apagues n8n. No borres el workflow. No cambies el webhook.**

Tests en `server/tests/utils/agenteWhatsapp.test.js`:

- con el flag en 0, se llama al webhook de n8n y no al motor propio
- con el flag en 1, se llama al motor propio y no al webhook
- el teléfono del contexto es el de la conversación, siempre

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 5 — Una sola memoria

Hoy hay dos que no se hablan: el gateway manda los últimos 12 mensajes en el
prompt, y n8n mantiene su propio `memoryBufferWindow`.

Creá `server/services/memoriaConversacion.js`:

```js
obtenerContexto(telefono, { maxMensajes = 12, minutosInactividad = 120 })
```

- Trae los mensajes de `whatsapp_mensajes` del teléfono.
- **Si pasaron más de `minutosInactividad` desde el último, es una conversación
  nueva:** devuelve vacío.
- Si hay más de `maxMensajes`, devolvé `resumen + los últimos N`.

**El resumen se guarda, no se recalcula.** Agregá con `ensureColumn()` a
`whatsapp_conversaciones`:

```
resumen_texto            TEXT    DEFAULT ''
resumen_hasta_mensaje_id INTEGER DEFAULT 0
```

Y el resumen se rehace **sólo cuando entraron más de `maxMensajes` mensajes
nuevos desde `resumen_hasta_mensaje_id`**, no en cada mensaje.

Si se recalculara siempre, una conversación larga pagaría una llamada al modelo
por cada mensaje entrante para resumir casi lo mismo: costo y latencia por nada.

Úsalo sólo desde el motor propio. **No toques el camino de n8n.**

Tests: corte por inactividad, resumen al pasar el tope, y que dos teléfonos
distintos nunca compartan contexto.

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 5.5 — Cómo habla

Toda la arquitectura puede estar impecable y el agente igual contestar como una
máquina. Esto es tan importante como el resto.

## 5.5.a — Agrupar mensajes antes de contestar

En WhatsApp la gente escribe así:

```
hola
      (2 s)
quiero dos napos
      (1 s)
una sin jamon
```

Si se procesa cada webhook al instante, el agente contesta **tres veces** y
queda insoportable. Además razona sobre un pedido incompleto.

En `whatsappGateway.js`, antes de llamar al agente, esperá una ventana corta —
por defecto **2 segundos, configurable con `whatsapp_agrupar_ms`** — juntando los
mensajes que sigan llegando del mismo teléfono. Si entra otro dentro de la
ventana, se reinicia el contador. Recién ahí se llama al agente, con los
mensajes concatenados.

Tope: si se acumulan más de 8 segundos, se manda igual.

Esto vale **sólo para el motor propio**, no toques el camino de n8n.

Tests: tres mensajes en 3 segundos → una sola llamada al agente, con el texto de
los tres.

## 5.5.b — La política conversacional

Creá `agente-whatsapp/politica-conversacional.md` y cargá su contenido en el
prompt del sistema del perfil `cliente`. **No lo pongas hardcodeado en el
código**: tiene que poder editarse sin deploy, como las reglas actuales.

El agente:

- Habla en castellano rioplatense, con voseo, como un empleado del local.
- Responde corto. Dos o tres líneas, nunca párrafos.
- **Nunca nombra sus procesos internos.** Ni "carrito", ni "agregado
  exitosamente", ni "he añadido", ni "procesando su solicitud".
- **No repite el pedido completo después de cada mensaje.** Sólo al final, antes
  de confirmar.
- Pregunta **sólo lo que falta de verdad**.
- Entiende mensajes partidos, abreviaturas y errores de tipeo: "2 napos", "una
  coca gde", "mila napo".
- Acepta correcciones sin discutir ni justificarse.
- Si algo no está, ofrece una alternativa concreta, una sola vez.
- No insiste, no vende de más, no repite promociones.
- Si el cliente se muestra molesto, baja el tono, pide disculpas una vez y
  ofrece pasar con una persona.

Ejemplos que van en el archivo:

```
Cliente:  2 napos una sin jamon
Bien:     Dale. ¿Las dos con la misma guarnición?
Mal:      Se han añadido 2 unidades de Suprema Napolitana a su carrito.

Cliente:  sacame una
Bien:     Listo, queda una sola. ¿Con qué guarnición?
Mal:      He eliminado 1 producto. Su carrito ahora contiene 1 producto.
```

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 6 — Idempotencia del pedido

Hoy hay índice único en `whatsapp_mensajes.whatsapp_message_id`, así que un
mensaje no se guarda dos veces. **Falta que un pedido no se cree dos veces.**

- Agregá `idempotency_key TEXT DEFAULT ''` a `pedidos` con `ensureColumn()` en
  `server/db/migrations.js`, como se hace con las otras columnas.
- Índice único parcial, igual que el de mensajes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_idempotency
  ON pedidos(idempotency_key)
  WHERE TRIM(COALESCE(idempotency_key,'')) != ''
```

- `createRealOrder()` en `systemClient.js` acepta `idempotencyKey` opcional. Si
  ya existe un pedido con esa clave, **devuelve el pedido existente en vez de
  crear otro**, sin error.

**La clave no la puede fabricar el modelo.** Se arma en el servidor con tres
cosas que el modelo no elige:

```
canal + whatsapp_message_id_de_la_confirmacion + borrador_id
```

Ejemplo: `whatsapp:3AF1B2C3D4:87`.

## La confirmación es una sola transacción

Esto es lo importante del paso, más que la clave.

```
borrador abierto → crear pedido → asignar pedido_id → cerrar borrador
```

Las cuatro cosas van **adentro de una transacción de base**, con
`db.transaction()` como en el resto del sistema.

Sin transacción existe este caso feo: se crea el pedido, el proceso se cae antes
de escribir `pedido_id`, se reintenta y se crea un segundo pedido. El cliente
recibe dos veces la misma comida y el local la paga.

El `idempotency_key` cubre el reintento; la transacción cubre la caída a mitad
de camino. **Hacen falta las dos.**

Tests:

- dos llamadas con la misma clave → un solo pedido y el mismo número
- sin clave, el comportamiento de siempre
- **si falla al cerrar el borrador, no queda pedido creado** (simulá el error)
- un borrador con `pedido_id` rechaza una segunda confirmación

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 6.5 — Batería de conversaciones difíciles

Los 47 tests prueban el sistema. **Ninguno prueba si el agente atiende bien.**

Creá `server/tests/agente/` con un corredor de conversaciones:
`server/tests/agente/correrConversaciones.js`.

Cada caso es una lista de mensajes del cliente y un resultado esperado del
carrito. El modelo se llama de verdad; se verifica el estado final, no el texto.

**Sacá casos reales del backup en `D:\Proyectos\BackupWhatsAppChats`** — hay
41.969 mensajes de conversaciones verdaderas. Armá **al menos 40 casos**, la
mitad tomados de ahí y la mitad inventados para cubrir los bordes.

Casos obligatorios:

```
1  "2 napos una sin jamon" / "la otra con extra queso"
2  "no no sacame una"
3  "dejame solo una"
4  "sumale coca" / "grande"
5  "cuanto es?"
6  "mejor sacame la pepsi y poneme dos jugos"
7  "quiero algo para tres por menos de 30 lucas"
8  "lo mismo que pedi la vez pasada"
9  "mandalo a la direccion de siempre"
10 producto que no existe en la carta
11 producto sin stock
12 dirección fuera de zona
13 el mismo mensaje dos veces (webhook repetido)
14 "confirmalo" dos veces seguidas
15 "quiero hablar con alguien"
```

Qué se evalúa automáticamente en cada uno:

- productos correctos y en la cantidad correcta
- modificadores aplicados **a la unidad que corresponde**
- **ningún precio inventado**: todo importe de la respuesta tiene que existir en
  el catálogo
- el pedido **no** se crea antes de la confirmación
- el pedido se crea **exactamente una vez**
- cuántas herramientas usó (si son más de 12 para un pedido simple, algo anda mal)

Guardá el resultado en `server/tests/agente/resultados.json` con la fecha, para
poder comparar entre corridas.

**Esto no corre con `node tests/run.js`** —gasta tokens y tarda— sino con su
propio comando:

```
node server/tests/agente/correrConversaciones.js
```

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 7 — Documentar, no ejecutar

Escribí `agente-whatsapp/MIGRACION.md` explicando:

- qué se construyó y dónde quedó cada cosa
- cómo prender el motor propio (el interruptor de Configuración)
- cómo volver atrás (apagarlo)
- qué falta hacer a mano: importar el workflow de 9 herramientas a n8n
- qué se podrá borrar el día que el motor propio esté probado, **sin borrarlo
  ahora**

**No apagues n8n. No borres nada. No hagas deploy.**

Sobre borrar: la secuencia correcta es **deshabilitar → archivar → observar 30
días → recién ahí borrar**. Los nueve export de workflow son documentación
histórica y camino de vuelta. El disco que ocupan no vale lo que valen el día
que algo falle.

---

# PASO 8 — Audio también en el panel

El asistente del panel hoy acepta imágenes pero no audio. WhatsApp acepta audio
pero no procesa imágenes.

Al compartir motor, esto es barato: usá `transcribeWhatsappAudio()` —o el mismo
servicio de Whisper— para que el asistente del panel acepte un audio dictado.
Hernán puede pedirle cosas hablando en vez de escribir mientras cocina.

Si el servicio de Whisper resulta difícil de reutilizar fuera del contexto de
WhatsApp, **no lo fuerces**: dejá el paso sin hacer y anotalo.

**Hacé un commit LOCAL del paso. No pushees.**

---

# PASO 9 — Observabilidad

Hoy no hay forma de saber por qué el agente hizo lo que hizo.

Extendé la tabla `auditoria_ia` —o creá `agente_metricas` si no encaja— para
registrar por conversación:

```
latencia total · tokens de entrada y salida · proveedor y modelo usados
herramientas llamadas y en qué orden · errores · si hubo handoff
si terminó en pedido creado
```

Y una pantalla simple en el panel, bajo Configuración → WhatsApp, con:

- pedidos completados sobre conversaciones iniciadas
- latencia promedio
- herramientas más usadas
- conversaciones que terminaron en handoff
- las últimas 20 conversaciones con su traza, para poder abrir una y ver qué
  pasó

Sin esto, cuando el agente se porte mal sólo vas a tener el testimonio del
cliente.

**Hacé un commit LOCAL del paso. No pushees.**

---

# Una restricción que vale para todo

**`motorAgente.js`, `registroHerramientas.js`, `carritoWhatsapp.js` y
`memoriaConversacion.js` no pueden importar Baileys ni saber nada de WhatsApp.**

Reciben texto y contexto, devuelven texto y acciones. Quién trajo el mensaje es
problema del gateway.

No hace falta construir una capa de transporte con adaptadores: eso sería armar
una abstracción para un caso que hoy no existe. Alcanza con la regla de arriba,
que no cuesta nada y deja la puerta abierta.

---

# Al terminar todo

Corré y pegá el resultado:

```
cd server && node tests/run.js
node scripts/verificarRutasDelCliente.js
cd ../client && npm run build
```

Después hacé `git status` y `git diff --stat`, y **mostrame la lista de archivos
antes de pushear**. El commit final y el push los autorizo yo.

Y escribí un resumen corto de:

- qué quedó hecho paso por paso
- qué decisiones tuviste que tomar que no estaban en este documento
- qué encontraste roto que no estaba previsto
- qué NO pudiste hacer y por qué

Si algo de este documento resulta imposible o está mal —por ejemplo, una tabla
que no tiene la columna que digo— **no lo fuerces: dejá ese paso sin hacer,
seguí con el siguiente, y anotalo en el resumen final.**
