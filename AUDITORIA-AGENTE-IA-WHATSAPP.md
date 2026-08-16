# Auditoría del agente IA de WhatsApp

Agosto 2026. Auditoría del agente actual verificando código, base y flujo real,
contra cinco arquitecturas externas. **No se modificó nada.**

---

## 1. Resumen ejecutivo

**El agente de Modo Sabor no es un chatbot.** Es un agente con herramientas
reales que consulta el catálogo, cotiza contra la base y crea pedidos dentro del
sistema. En la clasificación pedida es **tipo F: agente con herramientas
reales**, no B ni C.

La parte valiosa —la capa de herramientas— está bien construida y es lo más
difícil de conseguir. Nueve endpoints en `/api/agente/*` respaldados por 25
funciones en `systemClient.js`, incluida `createRealOrder`. El modelo no puede
inventar precios porque no los tiene: los pide.

**El problema no es el agente. Es dónde vive el orquestador.**

El cerebro está en un workflow de **n8n**, un runtime externo, configurado por
JSON generado, sin un solo test, con las credenciales en bases SQLite sueltas en
la raíz del repo. Eso es la pieza frágil.

**Recomendación: mudar la orquestación a nuestro propio backend Node y
conservar íntegra la capa de herramientas.** No adoptar ningún framework
externo. Detalle y justificación en la sección 14.

Tres huecos concretos que encontré:

1. **El carrito existe en la base pero el agente no lo usa paso a paso.** El
   modelo arma el pedido completo en la cabeza y lo manda de una en un JSON. Por
   eso "sacame la Pepsi y agregá dos jugos" es frágil.
2. **La memoria son los últimos 12 mensajes** inyectados en el prompt. Sin
   resumen, sin expiración, sin corte de conversación nueva.
3. **La idempotencia está a medias:** hay índice único por `whatsapp_message_id`
   al guardar el mensaje, pero no vi guarda contra crear el mismo pedido dos
   veces si el modelo llama dos veces a la herramienta.

---

## 2. Nuestro agente actual

| Pieza                      | Archivo                                         | Líneas |
| -------------------------- | ----------------------------------------------- | ------ |
| Gateway de WhatsApp        | `server/services/whatsappGateway.js`            | 851    |
| Capa de datos para la IA   | `server/utils/systemClient.js`                  | 1.493  |
| Endpoints-herramienta      | `server/routes/agente.js`                       | 296    |
| Asistente del panel        | `server/routes/asistente.js`                    | 718    |
| Herramientas del asistente | `server/services/asistenteHerramientas.js`      | 949    |
| Capa multi-proveedor LLM   | `server/services/iaProveedor.js`                | —      |
| Transcripción de audio     | `server/services/whatsappAudioTranscription.js` | —      |
| Prompt del agente          | `agente-whatsapp/prompt-agente.md`              | 60     |
| Generador del workflow     | `agente-whatsapp/n8n/build-agent-workflow.js`   | 289    |

**Transporte de WhatsApp: Baileys** (`@whiskeysockets/baileys` 7.0.0-rc14). No
Meta Cloud API, no Twilio. Sesión propia, QR escaneado a mano.

**Modelo:** NVIDIA Nemotron vía nodo `lmChatOpenAi` (endpoint compatible
OpenAI). `iaProveedor.js` soporta además Gemini, Anthropic, OpenAI, Moonshot,
DeepSeek, Groq y OpenRouter, con el modelo elegible desde Configuración.

**Orquestador:** nodo `@n8n/n8n-nodes-langchain.agent` de n8n. Es un agente
LangChain de verdad, con tool calling, no un flujo de botones.

---

## 3. Arquitectura actual (flujo real)

```
Cliente en WhatsApp
      │
      ▼
Baileys  ──► whatsappGateway.js
      │        · detecta tipo (texto/audio/imagen/documento/ubicación)
      │        · si es audio → Whisper local (modelo small)
      │        · guarda en whatsapp_mensajes (UNIQUE por whatsapp_message_id)
      │        · arma historial: últimos 12 mensajes del chat
      │        · adjunta snapshot del cliente y config del turno
      │        · verifica pausa: pausaTotal / atencionIa / pausa_humana
      ▼
Webhook n8n
      │
      ▼
Agente LangChain (n8n)  ◄──►  NVIDIA Nemotron
      │
      │  8 herramientas HTTP:
      ├─ GET  /api/agente/estado          abierto/cerrado, turno
      ├─ GET  /api/agente/menu            catálogo por categoría
      ├─ GET  /api/agente/menu-dia        menú del día vigente
      ├─ POST /api/agente/cotizar         precio real con variantes
      ├─ POST /api/agente/envio           valida dirección y costo
      ├─ GET  /api/agente/cliente         ficha e historial
      ├─ GET  /api/agente/pedido-actual   pedido en curso
      ├─ POST /api/agente/derivar         handoff a humano
      └─ POST /api/agente/pedido          CREA EL PEDIDO REAL
      ▼
systemClient.js  ──►  SQLite
      ▼
createRealOrder()
      ▼
Pedido en el sistema ──► alarma sonora ──► KDS ──► cola de impresión
```

**Lo que falta en este diagrama, marcado:**

- ❌ No hay nodo de memoria en n8n. La memoria la arma el gateway a mano.
- ❌ No hay herramientas de carrito paso a paso.
- ❌ No hay `get_order_status` para que el cliente pregunte cómo viene.
- ❌ No hay asignación automática de repartidor.
- ❌ No hay link de pago.
- ⚠️ n8n es un runtime aparte: si se cae, el agente deja de contestar.

---

## 4. Fortalezas

1. **La capa de herramientas es correcta y es lo más valioso.** Todo dato del
   negocio viene del backend. El modelo interpreta y decide, no inventa.
2. **Crea pedidos reales adentro del sistema.** El agente de Fudo empuja a su
   Tienda Online; acá el pedido entra al POS, suena la alarma y se imprime.
3. **Transcribe audios** con Whisper local, modelo `small`. Ninguno de los cinco
   proyectos comparados lo trae listo para castellano rioplatense.
4. **Multi-proveedor real.** Cambiar de NVIDIA a Claude o Gemini es cambiar
   configuración, no código.
5. **Handoff implementado de verdad:** `pausa_humana`, `bot_silenciado`,
   `escalado_humano` en la base más la herramienta `/derivar`.
6. **Dedup de mensajes con índice único parcial** sobre `whatsapp_message_id`.
7. **Prompt afinado con datos reales**: 41.969 mensajes del backup.
8. **Sin costo de plataforma.** Baileys es gratis; Twilio y Wassenger cobran.

---

## 5. Debilidades

| #   | Debilidad                                                                       | Gravedad |
| --- | ------------------------------------------------------------------------------- | -------- |
| 1   | El orquestador vive en n8n: runtime externo, sin tests, config en JSON generado | **alta** |
| 2   | Credenciales de n8n en bases SQLite sueltas en la raíz del repo                 | **alta** |
| 3   | El pedido se arma de una sola vez, no incrementalmente                          | **alta** |
| 4   | Memoria = últimos 12 mensajes, sin resumen ni expiración                        | media    |
| 5   | Sin idempotencia en la creación del pedido                                      | **alta** |
| 6   | Las imágenes se detectan pero no se procesan                                    | media    |
| 7   | Sin `get_order_status`                                                          | media    |
| 8   | Whisper corre en la máquina de Hernán, no en Railway                            | media    |
| 9   | Sin observabilidad: no hay traza de qué herramienta llamó y por qué             | media    |
| 10  | El silencio de 42 minutos de la conversación 4 nunca se explicó                 | media    |

---

## 6. Herramientas: qué existe de verdad

✅ funcional · 🟡 parcial · 🟠 mock · 🔴 no existe

| Función pedida             | Estado | Dónde                                                         |
| -------------------------- | ------ | ------------------------------------------------------------- |
| `get_today_menu()`         | ✅     | `GET /api/agente/menu-dia` → `getMenuDiaToday()`              |
| `search_product()`         | ✅     | `searchProducts()`, `findProductMatch()`                      |
| `get_product_price()`      | ✅     | `POST /api/agente/cotizar` → `quoteProduct()`                 |
| `check_stock()`            | 🟡     | hay stock en `productos`; sin endpoint dedicado               |
| `get_modifiers()`          | ✅     | `getProductOptionsDetail()` con listas compartidas            |
| `get_product_variants()`   | ✅     | idem, con precio real por opción                              |
| `add_item_to_cart()`       | 🔴     | tabla `whatsapp_pedidos_borrador` existe, **sin herramienta** |
| `remove_item()`            | 🔴     | —                                                             |
| `update_quantity()`        | 🔴     | —                                                             |
| `apply_modifier()`         | 🟡     | va dentro del JSON del pedido, no como paso                   |
| `calculate_total()`        | ✅     | `quoteProduct()` + `enrichOrderItemsWithCatalog()`            |
| `get_customer()`           | ✅     | `GET /api/agente/cliente` → `getCustomerSnapshot()`           |
| `create_customer()`        | ✅     | dentro de `createRealOrder()`                                 |
| `save_address()`           | ✅     | `cliente_direcciones`                                         |
| `calculate_delivery()`     | ✅     | `POST /api/agente/envio` → `getDeliveryInfo()`                |
| `create_order()`           | ✅     | `POST /api/agente/pedido` → `createRealOrder()`               |
| `cancel_order()`           | 🔴     | —                                                             |
| `get_order_status()`       | 🟡     | `/pedido-actual` existe; no expone estados                    |
| `send_order_to_kitchen()`  | ✅     | automático al crear el pedido                                 |
| `assign_delivery_driver()` | 🔴     | hay módulo de repartidores, sin herramienta                   |
| `send_payment_link()`      | 🔴     | —                                                             |
| `handoff_to_human()`       | ✅     | `POST /api/agente/derivar` + `pausa_humana`                   |

**13 de 22 funcionales. Cinco vacíos importantes: carrito incremental,
cancelar, estado del pedido, asignar repartidor, link de pago.**

---

## 7. Los diez casos de prueba

| #   | Caso                                                | ¿Lo resuelve? | Cómo / dónde falla                                                                                                        |
| --- | --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | "dos supremas napolitanas y una Pepsi"              | ✅ sí         | `cotizar` ×2 → `pedido`. Es el caso feliz                                                                                 |
| 2   | "dos milas, una sin jamón, la otra con extra queso" | 🟡 frágil     | Requiere dos ítems distintos del mismo producto. Sin carrito incremental el modelo tiene que sostenerlo en la cabeza      |
| 3   | "lo mismo que pedí el viernes"                      | 🟡 parcial    | `getLastOrderByPhone()` trae **el último**, no el del viernes. Sin búsqueda por fecha                                     |
| 4   | "¿qué menú tienen hoy?"                             | ✅ sí         | `menu-dia`                                                                                                                |
| 5   | "hasta 20 lucas para dos personas"                  | 🔴 no         | No hay herramienta de búsqueda por presupuesto. El modelo improvisaría con el catálogo — riesgo de inventar combinaciones |
| 6   | "burger sin cebolla, con bacon, papas sin cheddar"  | 🔴 no         | Modificadores anidados sobre ítems distintos. Sin carrito por ítem es casi seguro que se equivoca                         |
| 7   | "tres de pollo, dos de carne, una docena surtida"   | 🟡 frágil     | "Docena surtida" no es un producto: necesita lógica de negocio que no existe                                              |
| 8   | "estoy en Congreso 1250, ¿cuánto sale el envío?"    | ✅ sí         | `envio` valida y cotiza contra Monteros                                                                                   |
| 9   | "quiero retirar a las 13:30"                        | 🟡 parcial    | Take away sí; **hora programada no existe**                                                                               |
| 10  | "sacame la Pepsi y agregá dos jugos"                | 🔴 **no**     | **El vacío más grave.** Sin `remove_item` el modelo reconstruye el pedido entero de memoria                               |

**Resumen: 3 sólidos, 4 frágiles, 3 que no funcionan.** Los tres que fallan
tienen la misma causa: **falta un carrito con herramientas paso a paso.**

---

## 8. Memoria

| Pregunta                       | Respuesta verificada                                                  |
| ------------------------------ | --------------------------------------------------------------------- |
| ¿Vive sólo en el prompt?       | **Sí.** El gateway arma un texto con los últimos 12 mensajes          |
| ¿Se guarda en base?            | Sí, `whatsapp_mensajes` (241 filas) y `whatsapp_conversaciones` (8)   |
| ¿Por número de WhatsApp?       | Sí                                                                    |
| ¿Por sesión?                   | No hay concepto de sesión                                             |
| ¿Expira?                       | **No**                                                                |
| ¿Resumen automático?           | **No**                                                                |
| ¿Recupera pedidos anteriores?  | Sí, `getLastOrderByPhone()` — sólo el último                          |
| ¿"lo mismo de ayer"?           | 🟡 el último, no por fecha                                            |
| ¿Historial del cliente?        | Sí, `getCustomerSnapshot()`: nombre, cantidad de pedidos, direcciones |
| ¿Distingue conversación nueva? | **No.** Doce mensajes de hace tres semanas entran igual               |

El corte fijo en 12 es el problema real: un pedido largo con idas y vueltas
empuja fuera del contexto lo que el cliente pidió al principio.

---

## 9. WhatsApp: qué está integrado

**Baileys**, no Cloud API ni Twilio.

| Capacidad          | Estado                                          |
| ------------------ | ----------------------------------------------- |
| Recibir mensajes   | ✅                                              |
| Enviar             | ✅                                              |
| Webhooks           | ✅ hacia n8n                                    |
| Plantillas         | 🔴 no aplica en Baileys                         |
| Imágenes           | 🟡 detecta y lee el caption; no procesa la foto |
| Audios             | ✅ Whisper local                                |
| Ubicación          | 🟡 detecta el tipo                              |
| Documentos         | 🟡 detecta el tipo                              |
| Contactos          | 🔴                                              |
| Estados de entrega | 🔴                                              |
| Reintentos         | 🟡 hay proveedor de emergencia                  |
| Rate limits        | ✅ en WhatsApp masivo; no en el agente          |

**Riesgo de Baileys:** es ingeniería inversa de WhatsApp Web. No está aprobado
por Meta, el número se puede banear y cada actualización de WhatsApp lo puede
romper. A cambio: gratis, sin aprobación, sin plantillas y sin ventana de 24
horas. Para un local es un intercambio razonable, pero hay que saberlo.

---

## 10. Las cinco arquitecturas externas

### VoltAgent — WhatsApp Order Agent

Framework TypeScript open source. El ejemplo de pedidos por WhatsApp trae tres
herramientas —listar menú, crear pedido, consultar estado—, cada una tipada con
Zod, con errores explícitos, y **working memory** que sostiene el carrito entre
mensajes. Soporta MCP y cambio de proveedor por configuración.

Es el más parecido a lo que ya tenemos, y su ejemplo tiene **menos herramientas
que nosotros**. Su aporte real es la memoria de trabajo y el tipado con Zod.

> [voltagent.dev/recipes-and-guides/whatsapp-ai-agent](https://voltagent.dev/recipes-and-guides/whatsapp-ai-agent/) ·
> [github.com/VoltAgent/voltagent](https://github.com/VoltAgent/voltagent) ·
> [examples/with-whatsapp](https://github.com/VoltAgent/voltagent/tree/main/examples/with-whatsapp)

### Twilio WhatsApp Agent Demo

Flujo: usuario → webhook Twilio → `server.js` → `runAgent()` → `tools.js` (FAQ,
reserva, handoff) → API REST de Twilio. Valida la firma de Twilio antes de
procesar. Tres herramientas. Es una demo limpia, no un sistema de pedidos.

Aporta: **validación de firma del webhook** y separación webhook/agente/tools.

Contra: Twilio cobra por mensaje y exige aprobación de Meta, plantillas y
ventana de 24 horas. Migrar desde Baileys es cambiar de modelo de negocio.

> [github.com/twilio-samples/whatsapp-agent-demo](https://github.com/twilio-samples/whatsapp-agent-demo)

### Wassenger Restaurant Bot

Bot de restaurante para reservas de mesa, con GPT-4o multimodal —texto, audio e
imagen—, respuestas en audio, RAG, herramientas MCP y handoff humano que asigna
el chat a un agente y lo saca del flujo del bot. Hay versiones en Python, C#,
PHP y Node.

Aporta: el **handoff mejor resuelto** de los cinco, y el precedente de audio e
imagen como entrada de primera clase.

Contra: atado a Wassenger, que es SaaS pago. Es de reservas, no de pedidos.

> [github.com/wassengerhq/whatsapp-chatgpt-bot-restaurant](https://github.com/wassengerhq/whatsapp-chatgpt-bot-restaurant) ·
> [whatsapp-chatgpt-bot-python](https://github.com/wassengerhq/whatsapp-chatgpt-bot-python)

### LangGraph multi-agente

Grafo de estados con supervisor y agentes especializados: menú, pedido,
delivery, pago, CRM.

**Mi lectura: para este caso no aporta y complica.** Un pedido de comida es un
flujo lineal con un carrito. La ventaja de LangGraph aparece cuando hay
ramificación real y agentes que se pisan. Acá agregaría un runtime más, un
modelo mental más y latencia extra —cada salto entre agentes es otra llamada al
modelo— para resolver algo que un agente con buenas herramientas ya hace.

Lo que **sí** vale la pena robarle: **el estado explícito**. Que el carrito sea
un objeto de estado versionado y no algo que el modelo sostiene en la cabeza.

### OpenAI Agents SDK / Responses API

El framework oficial de OpenAI para agentes en producción, sucesor de Swarm.
Cuatro primitivas —agents, tools, handoffs, guardrails— más tracing y structured
outputs. `Agent` + `Runner` maneja turnos, herramientas, guardas, handoffs y
sesiones.

Es la arquitectura de referencia más madura. **Su limitación acá: es Python** y
está pensado primero para modelos de OpenAI, cuando nuestra fortaleza es poder
cambiar de proveedor.

Lo valioso son las **ideas**, que se implementan en Node sin la librería:
guardrails, tracing de cada llamada, structured outputs y sesiones.

> [openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/) ·
> [developers.openai.com/api/docs/guides/agents](https://developers.openai.com/api/docs/guides/agents)

---

## 11. Comparativa

|                         | **Modo Sabor**   | VoltAgent  | Twilio      | Wassenger    | LangGraph | OpenAI SDK  |
| ----------------------- | ---------------- | ---------- | ----------- | ------------ | --------- | ----------- |
| Lenguaje natural        | ✅               | ✅         | ✅          | ✅           | ✅        | ✅          |
| Tool calling            | ✅               | ✅ Zod     | ✅          | ✅ MCP       | ✅        | ✅          |
| Structured output       | 🟡               | ✅         | 🟡          | 🟡           | ✅        | ✅          |
| Memoria                 | 🟡 12 msj        | ✅ working | 🟡 sesión   | 🟡 memoria   | ✅ estado | ✅ sesiones |
| WhatsApp                | ✅ Baileys       | ✅         | ✅ Twilio   | ✅ Wassenger | ✗         | ✗           |
| Pedidos reales          | ✅ **en el POS** | 🟡 demo    | ✗           | ✗ reservas   | —         | —           |
| Acceso a la base        | ✅               | ✅         | 🟡          | 🟡           | ✅        | ✅          |
| RAG                     | ✗                | ✅         | ✗           | ✅           | ✅        | ✅          |
| Handoff                 | ✅               | 🟡         | ✅          | ✅ **mejor** | 🟡        | ✅          |
| Observabilidad          | ✗                | ✅         | 🟡          | 🟡           | ✅        | ✅ tracing  |
| Audio                   | ✅ Whisper       | 🟡         | ✗           | ✅           | —         | 🟡          |
| Imagen                  | ✗                | 🟡         | ✗           | ✅           | —         | ✅          |
| Dependencia de terceros | **n8n**          | framework  | Twilio $    | Wassenger $  | framework | OpenAI      |
| Costo de plataforma     | **$0**           | $0         | por mensaje | suscripción  | $0        | por token   |
| Control del código      | **total**        | alto       | alto        | bajo         | alto      | medio       |
| Lenguaje                | JS               | TS         | JS          | Py/C#/PHP    | Py/JS     | **Python**  |
| Madurez                 | media            | media      | alta        | alta         | alta      | **alta**    |

---

## 12. Puntuación (1–10)

| Criterio                   | Modo Sabor | VoltAgent | Twilio | Wassenger | LangGraph | OpenAI SDK |
| -------------------------- | ---------- | --------- | ------ | --------- | --------- | ---------- |
| IA conversacional          | 7          | 8         | 7      | 8         | 8         | **9**      |
| WhatsApp                   | 8          | 7         | **9**  | **9**     | 3         | 3          |
| Tool calling               | 8          | **9**     | 7      | 8         | 8         | **9**      |
| Memoria                    | 5          | **8**     | 6      | 7         | **9**     | 8          |
| Pedidos gastronómicos      | **9**      | 7         | 3      | 5         | 5         | 4          |
| Integración con lo nuestro | **10**     | 6         | 4      | 3         | 5         | 4          |
| Facilidad de desarrollo    | 6          | 7         | 8      | 8         | 5         | 8          |
| Escalabilidad              | 6          | 8         | **9**  | 8         | 8         | **9**      |
| Costo                      | **10**     | 9         | 4      | 4         | 9         | 6          |
| Mantenimiento              | 5          | 7         | 8      | 8         | 5         | 8          |
| Control del código         | **10**     | 8         | 7      | 3         | 8         | 6          |
| Seguridad                  | 6          | 7         | **9**  | 7         | 7         | 8          |
| Producción                 | 6          | 7         | **9**  | 8         | 8         | **9**      |
| **Total /130**             | **96**     | **98**    | **90** | **86**    | **88**    | **91**     |

Los totales están apretados a propósito: **ninguna opción externa es tan
superior como para justificar tirar lo que hay.** VoltAgent gana por dos puntos
sobre un sistema que ya funciona y ya crea pedidos reales.

---

## 13. Ganador

# RECOMIENDO A + G

**Mejorar nuestro agente, mudando la orquestación de n8n al backend Node, y
tomando prestadas ideas puntuales de VoltAgent y del OpenAI Agents SDK.**

No adoptar ningún framework externo.

**Por qué**

1. **Lo difícil ya está hecho.** La capa de herramientas —25 funciones, 9
   endpoints, creación real de pedido contra el catálogo— es exactamente lo que
   los cinco proyectos externos tendrían que construir desde cero contra nuestra
   base. Ninguno viene con eso.

2. **Ninguno crea pedidos en un POS.** VoltAgent tiene una demo con tres
   herramientas. Twilio hace reservas. Wassenger hace reservas. Nosotros creamos
   el pedido, suena la alarma y se imprime la comanda.

3. **El problema es n8n, no el agente.** Un runtime aparte, configurado por JSON
   generado, sin tests, con credenciales en bases sueltas. Sacarlo resuelve la
   mitad de las debilidades de la sección 5 sin tocar las herramientas.

4. **Twilio y Wassenger cambian el modelo de negocio.** Los dos cobran por
   mensaje o suscripción, y Twilio exige aprobación de Meta con plantillas. Hoy
   el costo de plataforma es cero.

5. **El Agents SDK es Python.** Meter Python en un backend Node por un
   orquestador es un runtime más para mantener, y perderíamos el multi-proveedor
   que ya funciona.

**Segunda opción: VoltAgent.** Si en algún momento el orquestador propio se
vuelve difícil de mantener, VoltAgent es TypeScript, tiene working memory,
herramientas tipadas con Zod, observabilidad y soporte MCP. Es el camino de
salida natural. Pero adoptarlo hoy sería reescribir para ganar poco.

---

## 14. Arquitectura recomendada

```
Cliente WhatsApp
      │
      ▼
Baileys ──► whatsappGateway.js          [SE MANTIENE]
      │       · dedup por whatsapp_message_id
      │       · audio → Whisper
      │       · verifica pausa humana
      ▼
ConversationManager                     [NUEVO]
      │  · sesión por teléfono con expiración
      │  · resumen automático al pasar N mensajes
      │  · corta conversación nueva por inactividad
      ▼
AgentOrchestrator (Node)                [NUEVO — reemplaza n8n]
      │  · bucle de tool calling contra iaProveedor.js
      │  · máximo de iteraciones y timeout
      │  · traza cada llamada en auditoria_ia
      │  · guardrails antes de ejecutar
      ▼
ToolRegistry                            [NUEVO — envuelve lo que ya existe]
      │  · schema Zod por herramienta
      │  · permiso por herramienta
      │  · idempotency key en las de escritura
      ▼
/api/agente/*  +  systemClient.js       [SE MANTIENE ÍNTEGRO]
      ▼
SQLite → pedido → alarma → KDS → impresión
```

**Herramientas nuevas a agregar al registro:**

```
carrito_ver / carrito_agregar / carrito_quitar / carrito_modificar
pedido_estado          para "¿ya salió mi delivery?"
pedido_cancelar        con confirmación obligatoria
buscar_por_presupuesto para el caso 5
repartidor_asignar     ya existe el módulo
```

El carrito se apoya en `whatsapp_pedidos_borrador`, que **ya está en la base con
subtotal, costo_envio, total, zona y `pedido_id`.** No hay que crear el modelo:
hay que exponerlo como herramientas.

---

## 15. Qué reutilizar y qué reemplazar

**Reutilizar tal cual**

- `systemClient.js` entero — es el activo más valioso
- `routes/agente.js` — los 9 endpoints
- `whatsappGateway.js` — Baileys, Whisper, pausa, dedup
- `iaProveedor.js` — multi-proveedor
- `prompt-agente.md` y `REGLAS-CHISPITA.md` — afinados con 41.969 mensajes
- Toda la mecánica de handoff humano

**Reemplazar**

- El workflow de n8n → orquestador en Node
- La memoria de 12 mensajes fijos → sesión con resumen
- El pedido en un solo JSON → carrito incremental

**Borrar**

- `n8n/*.export.json` y `*.generated.json` una vez migrado
- Las cuatro bases SQLite de n8n de la raíz

---

## 16. Seguridad

**El modelo no debe poder:** modificar precios, ejecutar SQL, borrar productos,
tocar permisos, ver datos de otros clientes, inventar descuentos, crear pedidos
sin confirmación.

Permisos por herramienta:

| Permiso         | Herramientas            | Riesgo                                                      |
| --------------- | ----------------------- | ----------------------------------------------------------- |
| `READ_MENU`     | menu, menu-dia, cotizar | ninguno                                                     |
| `READ_STOCK`    | stock                   | ninguno                                                     |
| `READ_CUSTOMER` | cliente                 | **datos personales: sólo del teléfono que escribe**         |
| `WRITE_CART`    | carrito\_\*             | bajo, reversible                                            |
| `CREATE_ORDER`  | pedido                  | **alto: requiere confirmación explícita + idempotency key** |
| `CANCEL_ORDER`  | cancelar                | **alto: confirmación + ventana de tiempo**                  |
| `HANDOFF`       | derivar                 | ninguno                                                     |

Regla dura: **`READ_CUSTOMER` sólo puede consultar el teléfono de la
conversación en curso.** Hoy `/api/agente/cliente/:telefono` acepta cualquier
número — si el modelo se confunde o alguien inyecta un prompt, expone la ficha
de otro cliente. **Esto hay que cerrarlo aunque no se migre nada más.**

También: el `x-agent-key` del header es lo único que protege `/api/agente/*`.
Con n8n afuera del proceso eso es necesario; con el orquestador adentro, esos
endpoints pueden dejar de ser HTTP y pasar a ser llamadas de función.

---

## 17. Evitar que el LLM invente

Ya está bien resuelto y hay que sostenerlo:

| Dato         | De dónde sale                                    |
| ------------ | ------------------------------------------------ |
| Precios      | `quoteProduct()` contra la base                  |
| Productos    | `findProductMatch()` — si no existe, no existe   |
| Stock        | `productos.stock_directo`                        |
| Horarios     | `getBusinessInfo()`                              |
| Menú del día | `getMenuDiaToday()`                              |
| Envío        | `getDeliveryInfo()` contra las zonas de Monteros |

**La regla:** el modelo interpreta, elige herramienta, explica y confirma.
Ningún número del negocio sale de su cabeza.

Refuerzo que falta: **validar la salida antes de mandarla.** Si la respuesta
contiene un precio que no salió de `cotizar` en esta conversación, no se manda.

---

## 18. Structured outputs

Sí, conviene. **Con Zod**, porque el backend es Node y Zod ya es dependencia del
servidor.

Cada herramienta define su schema, se valida la llamada del modelo antes de
ejecutar, y si no valida se le devuelve el error al modelo para que corrija en
vez de romper.

No hace falta un JSON gigante de intención como el del ejemplo. Es más robusto
que cada herramienta tenga su schema chico: el modelo llama `carrito_agregar`
con `{producto_id, cantidad, opciones[]}` y el registro valida eso.

---

## 19. Handoff humano

Ya funciona. El flujo pedido está implementado:

```
"quiero hablar con una persona"  →  /api/agente/derivar
        ↓
pausa_humana = 1  →  el gateway corta antes de llamar al agente
        ↓
emitAtencionHumana(io)  →  aviso en el panel
        ↓
el operador responde
        ↓
al cerrar la atención, pausa_humana = 0
```

Falta: **derivar solo después de N intentos fallidos.** Hoy depende de que el
modelo decida llamar la herramienta. Wassenger lo resuelve mejor: cuenta
reintentos y escala sin preguntarle al modelo.

---

## 20. Idempotencia

Lo que hay:

```sql
CREATE UNIQUE INDEX idx_whatsapp_mensajes_message_id
  ON whatsapp_mensajes(whatsapp_message_id)
  WHERE TRIM(COALESCE(whatsapp_message_id,'')) != ''
```

Bien para no guardar el mismo mensaje dos veces. **Insuficiente para no crear el
mismo pedido dos veces.**

Falta:

1. Que `POST /api/agente/pedido` acepte una **idempotency key** derivada del
   `mensaje_id` de confirmación, con índice único.
2. Que `whatsapp_pedidos_borrador.pedido_id` se use como candado: si ya tiene
   pedido, no crear otro.
3. Chequeo de dedup **antes** de invocar al agente, no sólo al guardar.

---

## 21. Costos

| Concepto | Hoy               | Con la migración                         |
| -------- | ----------------- | ---------------------------------------- |
| WhatsApp | $0 (Baileys)      | $0                                       |
| Modelo   | por token, NVIDIA | igual o menos: menos llamadas por pedido |
| n8n      | hosting propio    | **$0 — se elimina**                      |
| Whisper  | $0, local         | $0                                       |
| Base     | SQLite            | igual                                    |
| Hosting  | Railway           | igual                                    |

Contra Twilio (por mensaje + aprobación de Meta) o Wassenger (suscripción), la
diferencia se paga sola. El único costo variable real es el modelo, y un carrito
incremental **baja** el costo por pedido: hoy el modelo re-razona el pedido
entero en cada vuelta.

---

## 22. Plan de migración

**Fase 0 — cerrar la fuga de datos.** Limitar `/api/agente/cliente` al teléfono
de la conversación. Independiente de todo lo demás.

**Fase 1 — paralelo.** Orquestador Node al lado de n8n, apagado. Los dos hablan
con las mismas herramientas.

**Fase 2 — sólo lectura.** Encender el nuevo con `READ_*` únicamente. Comparar
sus respuestas contra las de n8n con conversaciones del backup.

**Fase 3 — carrito.** Agregar `carrito_*` sobre `whatsapp_pedidos_borrador`.
Sigue sin poder crear pedidos.

**Fase 4 — crear pedido con idempotency key.** Un solo teléfono de prueba.

**Fase 5 — clientes reales limitados.** Diez clientes conocidos, con el panel
mirando. n8n sigue levantado como respaldo.

**Fase 6 — producción.** Apagar n8n. Borrar las bases sueltas.

En ninguna fase se toca `systemClient.js`.

---

## 23. Tests propuestos

| Test                  | Qué prueba                                                      |
| --------------------- | --------------------------------------------------------------- |
| Pedido simple         | dos productos, total correcto                                   |
| Modificadores         | "una sin jamón, la otra con extra queso"                        |
| Producto inexistente  | no inventa, ofrece alternativa                                  |
| Stock agotado         | no lo vende                                                     |
| Fuera de zona         | no promete envío                                                |
| **Mensaje duplicado** | el mismo `message_id` dos veces → un pedido                     |
| **Pedido duplicado**  | dos llamadas a crear con la misma key → un pedido               |
| Quitar del carrito    | caso 10, el que hoy falla                                       |
| Cancelación           | pide confirmación                                               |
| Pedido anterior       | "lo mismo de ayer"                                              |
| Handoff               | pausa la IA y no vuelve a contestar                             |
| Audio                 | ogg → transcripción → pedido                                    |
| **Fuga de datos**     | pedir la ficha de otro teléfono → denegado                      |
| Precio inventado      | si la respuesta trae un precio que no salió de `cotizar`, falla |

Los tres en negrita son los que hoy no tienen red.

---

## 24. Riesgos

| Riesgo                                             | Prob.     | Impacto  | Mitigación                             |
| -------------------------------------------------- | --------- | -------- | -------------------------------------- |
| Baileys se rompe con una actualización de WhatsApp | media     | **alto** | proveedor de emergencia ya existe      |
| Ban del número                                     | baja      | **alto** | límites de envío ya implementados      |
| El nuevo orquestador anda peor                     | media     | medio    | correr en paralelo, fases 1-5          |
| Whisper se cae con la máquina de Hernán            | **alta**  | medio    | mover a Railway o aceptar el degradado |
| El modelo inventa algo                             | baja      | **alto** | validación de salida (sección 17)      |
| Fuga de datos de otro cliente                      | **media** | **alto** | **Fase 0**                             |

---

## 25. Recomendación final

### GANADOR: mejorar nuestro agente + orquestador propio en Node

### SEGUNDA OPCIÓN: VoltAgent

### QUÉ MANTENER

`systemClient.js` · `routes/agente.js` · `whatsappGateway.js` ·
`iaProveedor.js` · Whisper · el prompt y las reglas · el handoff

### QUÉ REEMPLAZAR

El workflow de n8n · la memoria de 12 mensajes · el pedido en un solo JSON

### COMPLEJIDAD

Media. El trabajo pesado —la capa de herramientas— está hecho. Lo que falta es
un bucle de tool calling, un registro de herramientas con Zod y cuatro
herramientas de carrito.

### RIESGO DE MIGRACIÓN

**Bajo, si se respetan las fases.** El orquestador nuevo consume las mismas
herramientas que el viejo. n8n queda de respaldo hasta la fase 6.

### LO PRIMERO, INDEPENDIENTE DE TODO

**Cerrar `/api/agente/cliente` al teléfono de la conversación.** Hoy acepta
cualquier número. Es la única cosa de este informe que es un problema de
seguridad y no de arquitectura.

---

## Fuentes

- [VoltAgent — WhatsApp Order Agent](https://voltagent.dev/recipes-and-guides/whatsapp-ai-agent/)
- [VoltAgent — repo](https://github.com/VoltAgent/voltagent) · [ejemplo WhatsApp](https://github.com/VoltAgent/voltagent/tree/main/examples/with-whatsapp)
- [Twilio — whatsapp-agent-demo](https://github.com/twilio-samples/whatsapp-agent-demo)
- [Twilio — WhatsApp AI Agent con Node y GPT-5](https://www.twilio.com/en-us/blog/developers/tutorials/integrations/whatsapp-ai-agent-twilio-openai)
- [Wassenger — bot de restaurante](https://github.com/wassengerhq/whatsapp-chatgpt-bot-restaurant)
- [Wassenger — bot multimodal en Python](https://github.com/wassengerhq/whatsapp-chatgpt-bot-python)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) · [guía oficial](https://developers.openai.com/api/docs/guides/agents)
- [Baileys](https://github.com/WhiskeySockets/Baileys)

**Límites de esta auditoría:** no ejecuté el agente contra WhatsApp real —los
diez casos son análisis del código y las herramientas disponibles, no pruebas
en vivo—. De los proyectos externos leí documentación y descripción de repos,
no corrí ninguno. Y leí la base local, no la de producción.
