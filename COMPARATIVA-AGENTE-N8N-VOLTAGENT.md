# n8n vs VoltAgent para el agente de Modo Sabor

Agosto 2026. Auditoría del workflow real que está corriendo, contra el ejemplo
oficial de VoltAgent. **No se modificó ningún archivo.**

---

## 1. Resumen

Tres hallazgos que cambian el diagnóstico respecto de la auditoría anterior.
Los pongo primero porque son correcciones a lo que yo mismo reporté ayer.

**1. El agente que está en producción tiene 6 herramientas, no 9.** El generador
`build-agent-workflow.js` declara nueve, pero el workflow exportado y activo
—`workflow-active-final.export.json`, `active: true`— sólo tiene seis:

```
consultar_estado · consultar_menu · cotizar_item
cotizar_envio · consultar_cliente · crear_pedido
```

**Faltan tres, y dos son graves: `menu-dia` y `derivar`.** O sea que el agente
que atiende hoy **no puede consultar el menú del día ni derivar a una persona**,
aunque las dos cosas estén implementadas en el backend. La herramienta de
handoff que reporté como funcional no está conectada.

**2. Sí hay nodo de memoria.** El activo tiene `memoryBufferWindow` "Memoria por
teléfono". Ayer dije que no había. Me equivoqué: miré el generador, no el
workflow exportado. **Y eso crea un problema nuevo:** el gateway ya manda los
últimos 12 mensajes en el prompt _y además_ n8n mantiene su propia ventana. Dos
memorias que no se conocen entre sí.

**3. `retryOnFail: 0` en todos los nodos.** Si una herramienta falla, no
reintenta.

**Recomendación: opción D.** Mantener nuestro agente, mudar el cerebro de n8n a
nuestro backend Node **usando el AI SDK de Vercel para el bucle de tool
calling**, copiar de VoltAgent el patrón de _working memory_ tipada con Zod, y
dejar n8n sólo para automatizaciones. Justificación en la sección 20.

> **Corrección posterior.** En la primera versión de este informe propuse
> escribir el bucle de tool calling a mano, y descarté el Agents SDK de OpenAI
> diciendo que era sólo Python. **Las dos cosas estaban mal.** Existe
> `@openai/agents` para TypeScript, y sobre todo existe el AI SDK de Vercel, que
> es el toolkit de agentes más instalado en el ecosistema y resuelve el bucle en
> diez líneas. No hay razón para escribirlo nosotros. La sección 5-bis compara
> las cuatro opciones.

---

## 2. Arquitectura actual

```
Cliente
   │  WhatsApp
   ▼
Baileys ── whatsappGateway.js          [corre en la máquina de Hernán]
   │  · Whisper local transcribe audios
   │  · dedup: UNIQUE parcial en whatsapp_message_id
   │  · arma historial: últimos 12 mensajes
   │  · verifica pausaTotal / atencionIa / pausa_humana
   │
   │  fetch HTTPS, timeout 90s, con webhook de fallback
   ▼
n8n en Railway                          [n8n-production-f8ed.up.railway.app]
   │  Agente LangChain "Mica" + NVIDIA GLM 5.2
   │  memoryBufferWindow por teléfono
   │
   │  6 llamadas HTTP posibles, cada una un ida y vuelta a Railway
   ▼
API Modo Sabor en Railway
   │  /api/agente/{estado,menu,cotizar,envio,cliente,pedido}
   ▼
systemClient.js → SQLite → createRealOrder()
   ▼
Pedido → alarma → KDS → cola de impresión
   │
   ▼  respuesta vuelve por n8n al gateway y de ahí a WhatsApp
```

**Tres saltos de red por mensaje, más uno por cada herramienta que use.**
Máquina local → Railway (n8n) → Railway (API) ×N → Railway (n8n) → máquina
local.

---

## 3. Cómo funciona nuestro n8n

| Nodo                     | Tipo                 | Qué hace                       |
| ------------------------ | -------------------- | ------------------------------ |
| Entrada WhatsApp Web     | `webhook`            | recibe el POST del gateway     |
| Memoria por teléfono     | `memoryBufferWindow` | ventana de contexto por número |
| NVIDIA GLM 5.2           | `lmChatOpenAi`       | el modelo                      |
| consultar_estado         | `toolHttpRequest`    | abierto/cerrado, turno         |
| consultar_menu           | `toolHttpRequest`    | catálogo                       |
| cotizar_item             | `toolHttpRequest`    | precio real                    |
| cotizar_envio            | `toolHttpRequest`    | valida dirección y costo       |
| consultar_cliente        | `toolHttpRequest`    | ficha e historial              |
| crear_pedido             | `toolHttpRequest`    | **crea el pedido real**        |
| Mica - Agente de pedidos | `langchain.agent`    | orquesta                       |

Diez nodos. Sin reintentos. Sin nodo de manejo de errores.

**Lo que el prompt le inyecta:** teléfono, nombre visible, tipo de mensaje,
configuración del turno cargada por el dueño, historial reciente y el mensaje
actual.

---

## 4. ¿Qué tan agente es realmente?

**Nivel 4: agente con tools.** No es un bot de botones ni un LLM que sólo
escribe texto.

Demostración: el nodo es `@n8n/n8n-nodes-langchain.agent` con seis
`toolHttpRequest` conectadas por `ai_tool`. El modelo decide cuál llamar. Cuando
el cliente escribe "¿cuánto sale una napolitana?", el modelo llama
`cotizar_item` y usa el número que devuelve el backend. No lo inventa porque no
lo tiene.

**No llega a nivel 5 (agente con estado).** No hay carrito: el modelo sostiene
el pedido en su ventana de contexto y lo manda entero de una sola vez a
`crear_pedido`. Ese es el techo de la arquitectura actual.

---

## 5. VoltAgent

Lo que trae el ejemplo oficial, leído del código publicado:

| Componente         | Qué es                                                      |
| ------------------ | ----------------------------------------------------------- |
| Herramientas       | **tres**: listar menú, crear pedido, consultar estado       |
| Validación         | Zod en cada herramienta, con errores estructurados          |
| Base               | Supabase (Postgres) — `menu_items`, `orders`, `order_items` |
| Modelo             | `gpt-4o-mini` vía `@ai-sdk/openai`                          |
| WhatsApp           | **Meta Cloud API**, con verificación de `hub.verify_token`  |
| Servidor           | Hono                                                        |
| Memoria            | `Memory` + `LibSQLMemoryAdapter` persistente en archivo     |
| **Working memory** | **schema Zod, scope `conversation`**                        |
| Observabilidad     | VoltOps (plataforma externa, claves opcionales)             |
| Logging            | Pino                                                        |

**La joya es la working memory:**

```typescript
const workingMemorySchema = z.object({
  orders: z
    .array(
      z.object({
        menuItemId: z.number(),
        itemName: z.string(),
        quantity: z.number(),
        price: z.number(),
      })
    )
    .default([]),
  deliveryAddress: z.string().default(''),
  orderStatus: z.enum(['selecting', 'address_needed', 'completed']).default('selecting'),
});
```

El carrito es un objeto tipado y persistido por conversación, no algo que el
modelo recuerda. Se limpia al confirmar. **Eso es exactamente lo que nos falta.**

**Lo que el ejemplo NO tiene:**

- Audio. El webhook hace `if (message.type !== "text") continue` — descarta todo
  lo que no sea texto. Nuestro sistema ya transcribe con Whisper.
- Modificadores y variantes. Sus productos son planos: nombre y precio.
- Handoff humano.
- Zonas de delivery. La dirección es un `string` libre.
- Promociones, stock, turnos, menú del día.

> [voltagent.dev/recipes-and-guides/whatsapp-ai-agent](https://voltagent.dev/recipes-and-guides/whatsapp-ai-agent/) ·
> [github.com/VoltAgent/voltagent/tree/main/examples/with-whatsapp](https://github.com/VoltAgent/voltagent/tree/main/examples/with-whatsapp)

---

## 5-bis. Las otras tres opciones que faltaban

VoltAgent no es la única alternativa, y no es la mejor. Las cuatro que existen
hoy para un backend JavaScript:

|                             | Qué es                                                                                        | Para nosotros            |
| --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| **AI SDK de Vercel** (`ai`) | **librería**, no framework. Bucle de tool calling, herramientas con Zod, agnóstico del modelo | **la indicada**          |
| `@openai/agents` (TS)       | framework oficial de OpenAI: agentes, tools, handoffs, guardrails, tracing, MCP. Node 22+     | segunda opción           |
| Mastra                      | framework TS del equipo de Gatsby: agentes, workflows, memoria, evals, observabilidad         | más maduro que VoltAgent |
| VoltAgent                   | framework TS más chico                                                                        | último                   |

**El bucle que yo proponía escribir a mano es esto:**

```js
generateText({ model, tools, stopWhen: stepCountIs(8) });
```

El modelo razona, llama la herramienta, ve el resultado, vuelve a razonar, hasta
que contesta o se acaba el presupuesto de pasos. Con `stopWhen` se controla el
tope — el default son 20 pasos y en producción no conviene dejarlo suelto.

**Por qué el AI SDK y no los frameworks**

1. **Es una librería.** Se importa y listo: ningún runtime nuevo, ninguna
   reescritura, ningún lock-in. Los otros tres son frameworks que imponen su
   forma de estructurar la aplicación.
2. **Es agnóstico del modelo por diseño.** Eso preserva `iaProveedor.js`: hoy se
   cambia de NVIDIA a Claude o Gemini desde Configuración. `@openai/agents`
   empuja hacia OpenAI.
3. **Cubre exactamente el hueco.** Bucle de tool calling y herramientas tipadas.
   Handoff ya lo tenemos en la base; los guardrails son validaciones nuestras.

**Lo que hay que verificar antes de comprometerse:** el backend es JavaScript
con `require`, y el AI SDK es TypeScript y ESM primero. Funciona en Node, pero
hay que probar que conviva con el `require` que usa todo el servidor. Son diez
minutos y va antes de cualquier decisión.

> [AI SDK — agentes y bucle de herramientas](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk) ·
> [`@openai/agents` TypeScript](https://openai.github.io/openai-agents-js/) ·
> [Mastra](https://mastra.ai)

---

## 6. Comparación

| Función                    | n8n actual              | VoltAgent        | Ganador             |
| -------------------------- | ----------------------- | ---------------- | ------------------- |
| Conversación natural       | 7                       | 8                | VoltAgent           |
| Tool calling               | 7                       | 9                | **VoltAgent** (Zod) |
| Memoria                    | 5 doble y descoordinada | 9                | **VoltAgent**       |
| Estado del carrito         | **3**                   | **9**            | **VoltAgent**       |
| Pedidos complejos          | 4                       | 7                | VoltAgent           |
| Modificadores              | **6** (los nuestros)    | **2** (no tiene) | **nosotros**        |
| Contexto largo             | 5                       | 8                | VoltAgent           |
| Historial del cliente      | **8**                   | 5                | **nosotros**        |
| WhatsApp                   | 8 Baileys, gratis       | 7 Cloud API      | nosotros            |
| Audio                      | **9** Whisper           | **1** descarta   | **nosotros**        |
| Imágenes                   | 3                       | 3                | empate              |
| Ubicación                  | 3                       | 1                | nosotros            |
| Structured outputs         | 4                       | 9                | **VoltAgent**       |
| Reintentos                 | **1**                   | 8                | **VoltAgent**       |
| Manejo de errores          | 3                       | 8                | VoltAgent           |
| Idempotencia               | 5                       | 4                | nosotros            |
| Observabilidad             | **2**                   | **9** VoltOps    | **VoltAgent**       |
| Debugging                  | 4 visual                | 8                | VoltAgent           |
| Logging                    | 4                       | 8 Pino           | VoltAgent           |
| Testing                    | **1**                   | 7                | **VoltAgent**       |
| Escalabilidad              | 5                       | 8                | VoltAgent           |
| Performance                | **4**                   | 8                | **VoltAgent**       |
| Mantenimiento              | **3** JSON generado     | 8                | **VoltAgent**       |
| Desarrollo rápido          | 7                       | 6                | n8n                 |
| Control del código         | **3**                   | 8                | **VoltAgent**       |
| Integración con lo nuestro | **9** ya andando        | 5                | **nosotros**        |
| Seguridad                  | 5                       | 7                | VoltAgent           |
| Costo                      | 8 self-hosted           | 9                | VoltAgent           |
| Dependencia de terceros    | 5 n8n                   | 6 framework      | empate              |
| **Total**                  | **142/290**             | **199/290**      |                     |

VoltAgent gana claro **como framework**. La pregunta es si eso alcanza para
reemplazar un sistema que ya crea pedidos reales — y la respuesta está en las
filas donde ganamos: modificadores, audio, historial, integración.

---

## 7. Los diez pedidos

| #   | Caso                                                        | n8n hoy                                                        | Con carrito                      |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| 1   | "dos hamburguesas, una sin cebolla, otra con extra cheddar" | 🟡 dos ítems distintos del mismo producto, sólo en el contexto | ✅ dos filas del carrito         |
| 2   | "agregale una Pepsi"                                        | 🟡 tiene que rearmar todo                                      | ✅ `add_cart_item`               |
| 3   | "mejor sacame la Pepsi"                                     | 🔴 **falla**                                                   | ✅ `remove_cart_item`            |
| 4   | "papas con cheddar a una sola"                              | 🔴 **falla**                                                   | ✅ `update_cart_item` por índice |
| 5   | "lo mismo que pedí ayer"                                    | 🟡 trae el último, no por fecha                                | 🟡 igual                         |
| 6   | "para tres personas por menos de $30.000"                   | 🔴 no hay herramienta                                          | 🔴 hay que crearla               |
| 7   | "¿qué menú ejecutivo tienen hoy?"                           | 🔴 **la herramienta no está conectada**                        | ✅ conectarla                    |
| 8   | "a la dirección de siempre"                                 | ✅ `consultar_cliente`                                         | ✅                               |
| 9   | "voy a pagar transferencia"                                 | ✅ va en el pedido                                             | ✅                               |
| 10  | "confirmalo"                                                | 🟡 sin idempotency key                                         | ✅ con key                       |

**Cuatro de diez fallan hoy. Tres se arreglan con carrito. El caso 7 se arregla
conectando una herramienta que ya existe.**

---

## 8. Memoria

Hoy hay **dos memorias que no se hablan**:

1. El gateway arma un texto con los últimos 12 mensajes y lo mete en el prompt.
2. n8n mantiene su `memoryBufferWindow` por teléfono.

Si las ventanas no coinciden, el modelo ve el mismo mensaje dos veces o ve un
historial que contradice el otro. Nadie definió cuál manda.

**Debería haber una sola**, en nuestra base, con: resumen automático al pasar N
mensajes, expiración por inactividad, y corte de conversación nueva.

---

## 9. El carrito

**Recomendación: en el backend de Modo Sabor, en la tabla que ya existe.**

`whatsapp_pedidos_borrador` ya está en la base con `conversacion_id`, `telefono`,
`cliente_direccion`, `tipo_entrega`, `metodo_pago`, `estado`, `delivery_zona`,
`subtotal`, `costo_envio`, `total` y `pedido_id`. Más
`whatsapp_pedidos_borrador_items`.

**El modelo de datos está hecho y nadie lo usa como carrito.**

Descartados: la memoria del LLM (se pierde y miente), n8n (el estado no puede
vivir en el orquestador), Redis (una pieza más de infraestructura para algo que
SQLite ya resuelve), VoltAgent memory (duplicaría el estado fuera de nuestra
base).

El `pedido_id` de esa tabla además sirve de candado de idempotencia: si ya tiene
pedido, no se crea otro.

---

## 10. Las herramientas y dónde van

**Regla: la lógica de negocio se queda en el backend.** El orquestador sólo
decide cuál llamar.

| Herramienta                      | Dónde   | Estado                          |
| -------------------------------- | ------- | ------------------------------- |
| `get_menu_today`                 | backend | ✅ existe, **sin conectar**     |
| `search_product` / `get_product` | backend | ✅                              |
| `get_modifiers`                  | backend | ✅ listas compartidas           |
| `check_stock`                    | backend | 🟡 hay dato, falta endpoint     |
| `create_cart` / `get_cart`       | backend | 🔴 tabla lista, sin herramienta |
| `add/update/remove_cart_item`    | backend | 🔴                              |
| `get_customer` / `_history`      | backend | ✅                              |
| `get_saved_addresses`            | backend | ✅                              |
| `calculate_delivery`             | backend | ✅                              |
| `apply_promotion`                | backend | 🔴                              |
| `get_total`                      | backend | ✅                              |
| `confirm_order` / `create_order` | backend | ✅ falta idempotency key        |
| `get_order_status`               | backend | 🟡                              |
| `cancel_order`                   | backend | 🔴                              |
| `handoff_to_human`               | backend | ✅ existe, **sin conectar**     |

**Ninguna va en n8n. Ninguna va en VoltAgent.** Todas viven donde ya viven.

---

## 11. WhatsApp

> **Decisión tomada por Hernán, no está en discusión: se sigue con Baileys. No
> se usa la API oficial de Meta.**
>
> La comparación de abajo queda como registro de qué se gana y qué se pierde con
> esa elección, no como una propuesta de cambio. Ninguna recomendación de este
> informe depende de migrar a la API oficial: el orquestador propio, el carrito
> y las herramientas funcionan igual sobre Baileys.
>
> Lo único que sí hay que sostener por elegir la vía no oficial: el proveedor de
> emergencia andando, los límites de envío puestos, y saber que el número se
> puede banear.

|                         | n8n + Baileys (hoy)     | VoltAgent + Cloud API      |
| ----------------------- | ----------------------- | -------------------------- |
| Costo por mensaje       | **$0**                  | por conversación           |
| Aprobación de Meta      | no                      | **sí**                     |
| Plantillas              | no hacen falta          | obligatorias fuera de 24 h |
| Riesgo de ban           | **sí**                  | no                         |
| Estabilidad             | depende de WhatsApp Web | oficial                    |
| Verificación de webhook | ninguna                 | `hub.verify_token`         |

Baileys es ingeniería inversa: gratis y sin trámite, pero el número se puede
banear. Es un intercambio válido para un local, siempre que se sepa.

---

## 12. Audio

Acá ganamos sin discusión.

```
audio ogg → Whisper local (small) → texto → agente → herramientas
```

El webhook de VoltAgent descarta todo lo que no sea texto. Implementarlo ahí
sería trabajo nuevo; nosotros ya lo tenemos andando.

---

## 13. Seguridad

| Riesgo                          | Hoy                                                            |
| ------------------------------- | -------------------------------------------------------------- |
| SQL libre                       | ✅ imposible, las herramientas son endpoints fijos             |
| Modificar precios               | ✅ imposible                                                   |
| Inventar descuentos             | 🟡 el prompt lo prohíbe, nada lo valida                        |
| Editar stock                    | ✅ imposible                                                   |
| **Ver pedidos de otro cliente** | 🔴 **`/api/agente/cliente/:telefono` acepta cualquier número** |
| Confirmar dos veces             | 🔴 sin idempotency key                                         |
| Autenticación                   | 🟡 sólo el header `x-agent-key`                                |
| Verificación de webhook         | 🔴 n8n no valida quién le pega                                 |
| Rate limiting                   | 🔴 no en el agente                                             |

**El primero sigue siendo el único problema de seguridad real.** VoltAgent lo
resuelve bien en su ejemplo: saca el teléfono del `context.userId` y filtra
siempre por ahí, sin dejar que el modelo lo elija. **Esa idea la copiaría hoy
mismo.**

---

## 14. Performance

**Por mensaje, hoy:**

```
local → Railway(n8n)     ~100-300 ms
n8n → modelo             ~1-3 s
n8n → API Railway        ~50-150 ms × cada herramienta
n8n → local              ~100-300 ms
```

Un pedido que usa cuatro herramientas son **cuatro idas y vueltas entre dos
servicios de Railway**, más los saltos del principio y el final. El timeout está
en 90 segundos, lo que dice bastante de lo que se espera.

**Con el orquestador en nuestro backend**, las herramientas dejan de ser HTTP y
pasan a ser llamadas de función: se ahorran todos los saltos intermedios. Queda
sólo la latencia del modelo, que es irreducible.

---

## 15. Costos

**Gratis:** n8n self-hosted, VoltAgent (open source), Baileys, Whisper local,
SQLite.

**Infraestructura:** hoy se paga un servicio extra de Railway sólo para n8n.
Con el orquestador adentro, **ese servicio desaparece**.

**Consumo de API:** el modelo. Un carrito incremental **baja** el costo: hoy el
modelo re-razona el pedido completo en cada vuelta.

**Lo que agregaría VoltAgent:** Supabase (no hace falta, tenemos SQLite) y
VoltOps para observabilidad (opcional, y es SaaS externo).

**Lo que agregaría Cloud API:** costo por conversación más el trámite con Meta.

---

## 16. Mantenimiento a dos años

| Pregunta                      | n8n                                    | Backend propio        |
| ----------------------------- | -------------------------------------- | --------------------- |
| ¿Fácil para Codex?            | **no** — JSON generado, sin tipos      | **sí** — JS con tests |
| ¿Workflows visuales gigantes? | sí, y crecen                           | no                    |
| ¿Testing?                     | **ninguno**                            | los 47 que ya corren  |
| ¿Versionar en Git?            | **mal** — nueve export JSON en el repo | bien                  |
| ¿Agregar una herramienta?     | editar JSON, exportar, importar        | una función y un test |

En `agente-whatsapp/n8n/` hay **nueve archivos de workflow exportados**. Nadie
sabe cuál es cuál sin abrirlos. Eso ya es deuda.

---

## 17. La arquitectura híbrida

Sí, la separación es correcta. Pero **el cerebro va en nuestro backend, no en
VoltAgent.**

```
WhatsApp
   ▼
Baileys + whatsappGateway.js            [se mantiene]
   · Whisper · dedup · pausa humana
   ▼
ConversationManager                     [nuevo, en el backend]
   · una sola memoria, con resumen y expiración
   ▼
AgentOrchestrator                       [nuevo — reemplaza a n8n]
   · generateText({ tools, stopWhen })   ← AI SDK de Vercel
   · el proveedor sale de iaProveedor.js
   · tope de pasos y timeout
   · traza cada paso en auditoria_ia
   ▼
ToolRegistry                            [nuevo — envuelve lo que ya existe]
   · schema Zod por herramienta          ← de VoltAgent
   · permiso por herramienta
   · idempotency key en las de escritura
   ▼
systemClient.js + carrito en            [se mantiene]
whatsapp_pedidos_borrador
   ▼
SQLite → pedido → alarma → KDS → impresión
   │
   └──► eventos ──► n8n  [degradado a automatizaciones]
                     · postventa · campañas · recordatorios
                     · Sheets · mails · CRM · tareas programadas
```

**n8n deja de estar en el camino crítico de un pedido.** Si se cae, el agente
sigue tomando pedidos; sólo se atrasan las automatizaciones. Hoy, si n8n se cae,
el negocio deja de atender.

---

## 18. Riesgos

| Riesgo                              | Prob.     | Impacto  | Mitigación                          |
| ----------------------------------- | --------- | -------- | ----------------------------------- |
| El orquestador nuevo anda peor      | media     | medio    | correr en paralelo, n8n de respaldo |
| Baileys se rompe                    | media     | **alto** | proveedor de emergencia ya existe   |
| **Fuga de datos de otro cliente**   | **media** | **alto** | **arreglar ya, sin esperar nada**   |
| Pedido duplicado                    | media     | alto     | idempotency key                     |
| Whisper se cae con la máquina local | **alta**  | medio    | mover a Railway                     |
| Adoptar un framework joven          | —         | —        | evitado al no adoptar VoltAgent     |

---

## 19. Migración

**Fase 0 — hoy, sin depender de nada.** Cerrar `/api/agente/cliente` al teléfono
de la conversación. Conectar `menu-dia` y `derivar` al workflow activo: dos
herramientas que ya existen y no están enchufadas.

**Fase 0-bis — diez minutos.** Probar que el AI SDK conviva con el backend, que
usa `require` en todo. Si no convive, se resuelve antes de escribir nada más.

**Fase 1.** Orquestador Node al lado de n8n, apagado.

**Fase 2.** Encenderlo sólo lectura. Comparar contra n8n con conversaciones del
backup de 41.969 mensajes.

**Fase 3.** Carrito sobre `whatsapp_pedidos_borrador`. Todavía no crea pedidos.

**Fase 4.** Crear pedido con idempotency key, un teléfono de prueba.

**Fase 5.** Diez clientes conocidos, con el panel mirando. n8n sigue vivo.

**Fase 6.** Apagar n8n como cerebro. Dejarlo para automatizaciones.

**Vuelta atrás:** hasta la fase 5, es cambiar una variable de configuración. El
gateway ya tiene webhook primario y de fallback.

---

## 20. Decisión final

### RECOMENDACIÓN: **D — mantener nuestro agente, con el AI SDK de Vercel como motor**

Con la separación de la opción C: **n8n queda, pero sólo para automatizaciones.**

En una frase: **el cerebro se muda a nuestro backend, el bucle lo pone el AI SDK
de Vercel, las herramientas siguen siendo las nuestras, y de VoltAgent se copian
tres patrones sin instalar VoltAgent.**

### POR QUÉ

1. **Lo difícil ya está hecho y VoltAgent no lo trae.** Su ejemplo tiene tres
   herramientas contra nuestras seis conectadas y nueve implementadas. No tiene
   modificadores, ni variantes, ni zonas de delivery, ni turnos, ni menú del día,
   ni handoff. Migrar sería reconstruir todo eso sobre Supabase.

2. **Nuestro agente crea pedidos reales en el POS.** El de VoltAgent inserta
   filas en Supabase. Acá el pedido entra al sistema, suena la alarma y se
   imprime la comanda.

3. **Ganamos en audio y perderíamos.** Su webhook descarta todo lo que no sea
   texto. Nosotros ya transcribimos con Whisper. Migrar sería un retroceso.

4. **El problema no es el framework, es dónde vive el cerebro.** Sacar la
   orquestación de n8n resuelve performance, testing, versionado y
   mantenibilidad de una sola vez, sin tocar las herramientas.

5. **No adoptar ningún framework** —ni VoltAgent, ni Mastra, ni
   `@openai/agents`— evita atarnos a una dependencia en el centro del negocio y
   preserva el multi-proveedor de `iaProveedor.js`. El AI SDK es una librería:
   entra y sale sin arrastrar la arquitectura.

6. **Pero tampoco escribir el bucle a mano.** Eso era un error de la primera
   versión de este informe. El AI SDK ya lo tiene resuelto y probado por miles
   de proyectos; escribirlo nosotros sería mantener código que alguien más
   mantiene mejor.

### QUÉ MANTENER DE MODO SABOR

`systemClient.js` · los 9 endpoints de `/api/agente/*` · `whatsappGateway.js`
con Baileys y Whisper · `iaProveedor.js` · el prompt y `REGLAS-CHISPITA.md`
afinados con 41.969 mensajes reales · el handoff · la tabla de borradores

### QUÉ TOMAR DE VOLTAGENT

- **Working memory tipada con Zod** — el carrito como objeto validado por
  conversación, que se limpia al confirmar. Es la pieza que nos falta.
- **Herramientas con schema Zod** y respuesta estructurada `{success, data,
error}` en vez de texto libre.
- **El teléfono sale del contexto, no del modelo** — arregla la fuga de datos.
- **Reintentos y fallback** por herramienta.
- **Logging con Pino y trazas por llamada.**

### PARA QUÉ SEGUIR USANDO N8N

Postventa · campañas · recordatorios · avisos a cocina y delivery que no sean
críticos · Sheets · mails · CRM · tareas programadas. Todo lo que puede
esperar cinco minutos.

### QUÉ DEJAR DE HACER EN N8N

Ser el cerebro del agente. Guardar memoria de conversación. Estar en el camino
crítico de un pedido. Guardar credenciales en bases SQLite sueltas en la raíz
del repo.

### COMPLEJIDAD DE MIGRACIÓN: **BAJA-MEDIA**

Bajó respecto de la primera versión del informe. El trabajo pesado está hecho, y
el bucle —que era la parte más grande de lo que faltaba— lo pone el AI SDK.
Queda: un registro de herramientas con Zod y cuatro herramientas de carrito
sobre una tabla que ya existe.

### RIESGO: **BAJO**

El orquestador nuevo consume las mismas herramientas que el viejo. n8n queda de
respaldo hasta la fase 6, y volver atrás es cambiar una variable.

---

### Lo primero, antes que cualquier migración

1. **Cerrar `/api/agente/cliente` al teléfono de la conversación.** Es el único
   problema de seguridad real de todo el informe.
2. **Conectar `menu-dia` y `derivar` al workflow activo.** Están implementadas y
   desenchufadas. Hoy el agente no puede decir el menú del día ni pasarle la
   conversación a una persona.

Las dos son de hoy y no dependen de ninguna decisión de arquitectura.

---

## Fuentes

- [VoltAgent — WhatsApp Order Agent](https://voltagent.dev/recipes-and-guides/whatsapp-ai-agent/) — código del ejemplo
- [VoltAgent — repo](https://github.com/VoltAgent/voltagent) · [ejemplo](https://github.com/VoltAgent/voltagent/tree/main/examples/with-whatsapp)
- [VoltAgent — Working Memory](https://voltagent.dev/docs/agents/memory/working-memory/)
- [Baileys](https://github.com/WhiskeySockets/Baileys)
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [AI SDK de Vercel — construir agentes](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk)
- [OpenAI Agents SDK para TypeScript](https://openai.github.io/openai-agents-js/) · [`@openai/agents` en npm](https://www.npmjs.com/package/@openai/agents)
- [Mastra](https://mastra.ai)

**Del lado nuestro:** leí el código y el workflow exportado marcado `active:
true`. No pude verificar contra la instancia de n8n en Railway, así que si ahí
hay un workflow distinto del exportado, mis conclusiones sobre las seis
herramientas cambiarían. **Vale la pena que alguien lo confirme en la interfaz
de n8n antes de decidir nada.**
