# Plan del agente de IA de Modo Sabor

Agosto 2026. Un solo motor para los dos agentes: el de WhatsApp y el del panel.

---

## Lo primero: una corrección importante

En los informes anteriores dije que había que construir un bucle de tool
calling, y después que convenía traerlo del AI SDK de Vercel.

**Las dos cosas sobran. El bucle ya existe, funciona, y está en producción.**

Está en `server/routes/asistente.js`, el asistente del panel:

```js
const MAX_VUELTAS = 6;
for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
  const respuestaIa = await conversar({ sistema, mensajes, herramientas });
  ...
  const resultado = ejecutarHerramienta(llamada.nombre, llamada.argumentos);
}
```

Y `conversar()` en `iaProveedor.js` implementa **tool calling nativo para las
tres familias de modelos**: Gemini (`functionDeclarations`), compatibles con
OpenAI (`tool_calls`) y Anthropic (`tools`).

Miré el agente de WhatsApp, miré frameworks afuera, y no miré el asistente del
panel, que es la parte más avanzada del sistema. **El plan no es construir un
motor: es dejar de tener dos.**

Consecuencia práctica: **no hay que instalar nada.** Ni AI SDK, ni VoltAgent, ni
Mastra, ni `@openai/agents`.

---

## Los dos agentes que hay hoy

|                              | **Asistente del panel**          | **Agente de WhatsApp** |
| ---------------------------- | -------------------------------- | ---------------------- |
| Quién lo usa                 | Hernán y el equipo               | los clientes           |
| Dónde vive el bucle          | `routes/asistente.js` ✅         | **n8n en Railway**     |
| Tool calling                 | nativo, multi-proveedor          | vía n8n                |
| Herramientas                 | **19 + acciones**                | **6 conectadas** de 9  |
| Permisos por herramienta     | ✅ según el rol del usuario      | ❌                     |
| Confirmación antes de actuar | ✅ propone y espera `/confirmar` | 🟡 sólo en el prompt   |
| Auditoría de llamadas        | ✅ `auditoria_ia`                | ❌                     |
| Imágenes                     | ✅                               | 🟡 detecta, no procesa |
| Audio                        | ❌                               | ✅ Whisper             |
| Memoria                      | historial que manda el cliente   | doble y descoordinada  |
| Carrito                      | no aplica                        | ❌                     |

**El del panel es más maduro en todo lo que hace a la arquitectura. El de
WhatsApp gana sólo en audio.**

Y el del panel ya resuelve tres cosas que yo iba a proponer como nuevas:

1. **Permisos por herramienta.** Sólo ofrece acciones si el usuario tiene
   `productos.edit`. El modelo no puede proponer algo que no está en su lista.
2. **Separación consulta / acción.** Las consultas se ejecutan solas; las
   acciones se convierten en una propuesta que necesita confirmación explícita.
3. **Auditoría** de qué herramienta se llamó, con qué proveedor y cuánto tardó.

---

## Adónde vamos

```
                    ┌──────────────────────────────┐
   WhatsApp ──────► │                              │
   (Baileys +       │      MOTOR ÚNICO             │ ◄────── Panel
    Whisper)        │  · bucle de tool calling     │
                    │  · multi-proveedor           │
                    │  · permisos por herramienta  │
                    │  · confirmación de acciones  │
                    │  · auditoría de cada paso    │
                    └───────────┬──────────────────┘
                                │
                    ┌───────────▼──────────────────┐
                    │      REGISTRO DE HERRAMIENTAS│
                    │  catálogo · precios · stock  │
                    │  clientes · envío · carrito  │
                    │  pedidos · caja · reportes   │
                    └───────────┬──────────────────┘
                                │
                          systemClient.js
                        asistenteHerramientas.js
                                │
                             SQLite
                                │
                    pedido → alarma → KDS → impresión
                                │
                                └──► eventos ──► n8n
                                                 (postventa, campañas,
                                                  recordatorios, CRM)
```

**Un motor, dos agentes.** La diferencia entre uno y otro es qué herramientas
ve y qué permisos tiene, no cómo funciona.

- El **cliente** ve: menú, precios, envío, su propia ficha, carrito, crear
  pedido, derivar a una persona.
- **Hernán** ve: todo eso más ventas, caja, stock, reportes y las acciones de
  modificación.

---

## El plan, por orden

### Paso 0 — Seguridad y cables sueltos · _hoy, media hora_

No depende de ninguna decisión de arquitectura.

1. **Cerrar `/api/agente/cliente`** al teléfono de la conversación. Hoy acepta
   cualquier número: si el modelo se confunde, expone la ficha de otro cliente.
   Es el único problema de seguridad real de todos los informes.
2. **Enchufar `menu-dia` y `derivar`** al workflow activo de n8n. Están
   implementadas y desconectadas: hoy el agente **no puede decir el menú del día
   ni pasar la conversación a una persona**.

### Paso 1 — Extraer el motor · _sin cambiar comportamiento_

Sacar el bucle de `routes/asistente.js` a `services/motorAgente.js`, y dejar que
el asistente del panel lo use desde ahí.

**Criterio de éxito: los 47 tests siguen verdes y el asistente se comporta
igual.** Si algo cambia, es un error.

### Paso 2 — Registro de herramientas

Un único lugar donde cada herramienta declara: nombre, descripción, parámetros,
**permiso** y si es de lectura o de escritura.

De VoltAgent copiamos una idea concreta: **el teléfono sale del contexto, nunca
de lo que elige el modelo.**

### Paso 3 — El carrito

Cuatro herramientas —`ver`, `agregar`, `quitar`, `modificar`— sobre
`whatsapp_pedidos_borrador`, que **ya existe en la base** con subtotal, costo de
envío, total, zona y `pedido_id`.

Esto es lo que arregla los casos que hoy fallan:

> "agregale una Pepsi" · "mejor sacame la Pepsi" · "papas con cheddar a una sola"

Hoy el modelo tiene que rearmar el pedido entero de memoria en cada vuelta. Con
carrito, cada cambio es una operación sobre una fila.

Y `pedido_id` funciona de candado: si el borrador ya tiene pedido, no se crea
otro.

### Paso 4 — WhatsApp al motor único

El gateway deja de llamar a n8n y llama al motor directamente. Las herramientas
dejan de ser HTTP y pasan a ser llamadas de función: se ahorran cuatro idas y
vueltas a Railway por pedido.

**n8n queda levantado como respaldo.** Volver atrás es cambiar una variable de
configuración — el gateway ya tiene webhook primario y de fallback.

### Paso 5 — Una sola memoria

Hoy hay dos que no se hablan: el gateway manda los últimos 12 mensajes en el
prompt, y n8n mantiene su propia ventana. Queda una, en nuestra base, con
resumen al pasar N mensajes y corte por inactividad.

### Paso 6 — Idempotencia

Idempotency key derivada del mensaje de confirmación, con índice único. Ya
existe el dedup de mensajes; falta el de pedidos.

### Paso 7 — Apagar n8n como cerebro

Queda sólo para automatizaciones: postventa, campañas, recordatorios, CRM,
tareas programadas. Todo lo que puede esperar cinco minutos.

Se borran las cuatro bases SQLite de n8n de la raíz y los nueve workflows
exportados.

---

## Lo que gana el asistente del panel

No es sólo trabajo para WhatsApp. Al compartir motor, el asistente hereda:

- **El carrito**, para armar pedidos por teléfono desde el panel.
- **Audio**, para dictarle en vez de escribir.
- **Las herramientas del catálogo** de `systemClient.js` que hoy no ve.

Y al revés: WhatsApp hereda del panel los permisos, la confirmación de acciones
y la auditoría.

---

## Qué NO hacemos

|                                                       | Por qué                                               |
| ----------------------------------------------------- | ----------------------------------------------------- |
| Instalar VoltAgent, Mastra, AI SDK o `@openai/agents` | el bucle ya existe y es multi-proveedor               |
| Migrar a la API oficial de Meta                       | decisión tomada: se sigue con Baileys                 |
| Multi-agente con supervisor                           | un pedido es lineal; agregaría latencia y complejidad |
| Redis para el carrito                                 | SQLite alcanza y la tabla ya está                     |
| Supabase                                              | ya tenemos base                                       |
| Reescribir `systemClient.js`                          | es el activo más valioso del sistema                  |

---

## Riesgos

| Riesgo                                            | Mitigación                                          |
| ------------------------------------------------- | --------------------------------------------------- |
| Romper el asistente del panel al extraer el motor | paso 1 sin cambiar comportamiento, con los 47 tests |
| El motor único anda peor en WhatsApp              | n8n de respaldo hasta el paso 7                     |
| Baileys se rompe                                  | proveedor de emergencia, ya existe                  |
| Whisper se cae con la máquina de Hernán           | evaluar moverlo a Railway                           |
| Pedido duplicado                                  | paso 6                                              |
| **Fuga de datos de otro cliente**                 | **paso 0, hoy**                                     |

---

## Resumen

**No hay que construir un agente. Hay que unificar los dos que ya existen.**

El motor está hecho y probado en el panel. El agente de WhatsApp usa uno peor,
alquilado a n8n, con la mitad de las herramientas conectadas. El trabajo real es
mudarlo al motor bueno y agregarle un carrito sobre una tabla que ya está en la
base.

**Complejidad: baja.** **Dependencias nuevas: ninguna.** **Vuelta atrás: cambiar
una variable, hasta el paso 7.**

Y lo primero, independiente de todo: **cerrar la fuga de datos y enchufar las
dos herramientas desconectadas.**
