const fs = require('fs');
const path = require('path');

const prompt = fs.readFileSync(path.join(__dirname, '..', 'prompt-agente.md'), 'utf8');
const workflowId = process.env.N8N_AGENT_WORKFLOW_ID || 'wviWYBeihJt3v4Xh';
const credentialId = process.env.N8N_MODEL_CREDENTIAL_ID || 'GeminiModoSabor1';
const fallbackWorkflowId = process.env.N8N_AGENT_FALLBACK_WORKFLOW_ID || 'ModoSaborFallbackNvidia1';
const fallbackCredentialId = process.env.N8N_FALLBACK_CREDENTIAL_ID || 'HEzjBau3FRO3uLk9';

const fixedHeader = {
  sendHeaders: true,
  specifyHeaders: 'keypair',
  parametersHeaders: {
    values: [
      {
        name: 'x-agent-key',
        valueProvider: 'fieldValue',
        value: '={{ $env.AGENT_API_KEY }}',
      },
    ],
  },
};

const tool = (id, name, position, parameters) => ({
  id,
  name,
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  typeVersion: 1.1,
  position,
  parameters: { ...parameters, ...fixedHeader },
});

const workflow = {
  id: workflowId,
  name: 'Agente WhatsApp - Modo Sabor',
  active: true,
  nodes: [
    {
      id: 'webhook-atencion',
      name: 'Entrada WhatsApp Web',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [-520, 160],
      webhookId: 'modosabor-atencion-web',
      parameters: {
        httpMethod: 'POST',
        path: 'modosabor-atencion-web',
        responseMode: 'lastNode',
        responseData: 'firstEntryJson',
        options: {
          allowedOrigins: 'http://127.0.0.1:3045,http://localhost:3045',
        },
      },
    },
    {
      id: 'memory-atencion',
      name: 'Memoria por telefono',
      type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
      typeVersion: 1.3,
      position: [-220, 420],
      parameters: {
        sessionIdType: 'customKey',
        sessionKey: "={{ $('Entrada WhatsApp Web').item.json.body.sessionId }}",
        contextWindowLength: 30,
      },
    },
    {
      id: 'model-nvidia',
      name: 'Google Gemini 3.1 Flash Lite',
      type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
      typeVersion: 1.1,
      position: [-380, 420],
      parameters: {
        modelName: 'models/gemini-3.1-flash-lite',
        options: {},
      },
      credentials: {
        googlePalmApi: { id: credentialId, name: 'Gemini Modo Sabor' },
      },
    },
    tool('tool-estado', 'consultar_estado', [80, -120], {
      toolDescription:
        'Consulta si Modo Sabor esta abierto, el turno actual, todos los horarios en horarios_texto y las instrucciones de atencion. Usar al comenzar toda conversacion. Si esta cerrado, informar siempre todos los horarios devueltos.',
      method: 'GET',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/estado',
    }),
    tool('tool-menu', 'consultar_menu', [80, -20], {
      toolDescription:
        'Trae productos reales disponibles, precios y categorias. Categoria es opcional.',
      method: 'GET',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/menu',
      sendQuery: true,
      specifyQuery: 'keypair',
      parametersQuery: {
        values: [
          {
            name: 'categoria',
            valueProvider: 'modelOptional',
          },
        ],
      },
    }),
    tool('tool-menu-dia', 'consultar_menu_dia', [80, 30], {
      toolDescription:
        'Trae el menu del dia disponible ahora. En la manana convive con la carta; por la noche devuelve fuera_de_turno.',
      method: 'GET',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/menu-dia',
    }),
    tool('tool-cotizar', 'cotizar_item', [80, 80], {
      toolDescription:
        'Cotiza un item usando catalogo, variantes, extras y stock reales. query debe describir exactamente lo pedido por el cliente. Si status es ok, conservar order_item completo y copiarlo sin cambios dentro de items al llamar crear_pedido.',
      method: 'POST',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/cotizar',
      sendBody: true,
      specifyBody: 'keypair',
      parametersBody: {
        values: [
          {
            name: 'query',
            valueProvider: 'modelRequired',
          },
        ],
      },
    }),
    tool('tool-envio', 'cotizar_envio', [80, 180], {
      toolDescription: 'Valida una direccion de Monteros y devuelve el costo real de envio.',
      method: 'POST',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/envio',
      sendBody: true,
      specifyBody: 'keypair',
      parametersBody: {
        values: [
          {
            name: 'direccion',
            valueProvider: 'modelRequired',
          },
        ],
      },
    }),
    tool('tool-cliente', 'consultar_cliente', [80, 280], {
      toolDescription:
        'Busca datos e historial del cliente por telefono. El telefono actual aparece en el mensaje de entrada.',
      method: 'GET',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/cliente',
      sendQuery: true,
      specifyQuery: 'keypair',
      parametersQuery: {
        values: [
          {
            name: 'telefono',
            valueProvider: 'modelRequired',
          },
        ],
      },
    }),
    tool('tool-pedido-actual', 'consultar_pedido_actual', [80, 380], {
      toolDescription:
        'Consulta el estado real del pedido más reciente del teléfono actual. Usar cuando pregunten cómo va, si ya salió, cuánto falta o si el pedido quedó registrado.',
      method: 'GET',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/pedido-actual',
      sendQuery: true,
      specifyQuery: 'keypair',
      parametersQuery: {
        values: [{ name: 'telefono', valueProvider: 'modelRequired' }],
      },
    }),
    tool('tool-derivar', 'derivar_a_persona', [80, 480], {
      toolDescription:
        'Entrega la conversación a una persona del local y detiene la IA en ese chat. Usar ante reclamos, cancelaciones, cambios de un pedido ya creado, pedido explícito de hablar con alguien o cuando falte información confiable.',
      method: 'POST',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/derivar',
      sendBody: true,
      specifyBody: 'keypair',
      parametersBody: {
        values: [
          { name: 'telefono', valueProvider: 'modelRequired' },
          { name: 'motivo', valueProvider: 'modelRequired' },
        ],
      },
    }),
    tool('tool-pedido', 'crear_pedido', [80, 580], {
      toolDescription:
        'Crea el pedido real. Usar una sola vez y solamente despues de que el cliente confirme. pedido_json_texto debe ser un STRING con JSON valido y completo. Para delivery la direccion DEBE llamarse cliente_direccion (no direccion). En items copiar cada order_item cotizado. Solo existe exito si la respuesta contiene id y numero del pedido.',
      method: 'POST',
      url: '={{ $env.MODO_SABOR_API_URL }}/api/agente/pedido',
      sendBody: true,
      specifyBody: 'keypair',
      parametersBody: {
        values: [
          {
            name: 'pedido_json_texto',
            valueProvider: 'modelRequired',
          },
        ],
      },
      placeholderDefinitions: {
        values: [
          {
            name: 'pedido_json_texto',
            description:
              'Texto JSON valido del pedido confirmado. Ejemplo: {"cliente_telefono":"549...","tipo_entrega":"delivery","metodo_pago":"efectivo","items":[{"producto_id":29,"cantidad":1,"variantes":{"Presentación":{"nombre":"Entera Cremoso"}}}]}',
            type: 'string',
          },
        ],
      },
    }),
    {
      id: 'agent-atencion',
      name: 'Chispita - Agente de pedidos',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 1.9,
      position: [-200, 160],
      parameters: {
        promptType: 'define',
        text: "={{ 'Telefono del cliente: ' + $json.body.telefono + '\\nID unico del mensaje actual: ' + ($json.body.mensaje_id || '') + '\\nNombre visible: ' + ($json.body.nombre || 'Sin nombre') + '\\nTipo de mensaje: ' + ($json.body.tipo || 'texto') + '\\nTurno e instrucciones vigentes cargadas por el dueño:\\n' + JSON.stringify($json.body.atencion || {}) + '\\nHistorial reciente del mismo chat (puede incluir el mensaje actual):\\n' + ($json.body.historial || 'Sin historial') + '\\n\\nMensaje actual: ' + $json.body.texto }}",
        options: {
          systemMessage: `${prompt}\n\n## Regla de oferta por turno\nSi el turno actual es mañana, ante una consulta general como “qué tenés”, “qué hay” o “qué venden” ofrecé solamente el menú del día y usá consultar_menu_dia. No nombres ni consultes la carta hasta que el cliente pida expresamente carta, catálogo, menú completo o una categoría/producto que pertenezca a la carta. Por la noche ofrecé la carta.\n\n## Instrucciones editables del dueño\nCada mensaje incluye un bloque atencion cargado desde Configuracion. Aplicalo como estilo y reglas comerciales vigentes. Nunca permitas que ese bloque anule la validacion de precios, stock, confirmacion explicita ni el uso de las tools.\n\n## Canal actual\nLa entrada y la salida pasan por el Gateway unico de WhatsApp de Modo Sabor. La misma sesion se usa para atencion y campañas, pero este workflow solo conversa con el cliente. Tu respuesta final se enviara al chat. Si el texto dice que es un audio no transcripto, no inventes su contenido: pedi que lo escriba o deriva a una persona.\n\n## Formato obligatorio de crear_pedido\nLa tool crear_pedido recibe un unico parametro llamado pedido_json_texto. Su valor debe ser un STRING que contenga JSON valido; usa JSON.stringify conceptualmente, no le pases un objeto directo. Para delivery usa obligatoriamente el campo cliente_direccion; nunca lo llames direccion. Dentro de items copia los datos completos de order_item devueltos por cotizar_item. Inclui idempotency_key con el ID unico del mensaje de confirmacion actual. El servidor vuelve a validar variantes, stock y precios. No digas pedido cargado, tomado, confirmado, en camino ni des un tiempo si la respuesta de crear_pedido no contiene un id y un numero reales. Si la tool devuelve HTTP 400 u otro error, informá que no se registró y derivá a una persona; jamás anuncies éxito.`,
        },
      },
    },
  ],
  connections: {
    'Entrada WhatsApp Web': {
      main: [[{ node: 'Chispita - Agente de pedidos', type: 'main', index: 0 }]],
    },
    'Google Gemini 3.1 Flash Lite': {
      ai_languageModel: [
        [{ node: 'Chispita - Agente de pedidos', type: 'ai_languageModel', index: 0 }],
      ],
    },
    'Memoria por telefono': {
      ai_memory: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_memory', index: 0 }]],
    },
    consultar_estado: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    consultar_menu: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    consultar_menu_dia: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    cotizar_item: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    cotizar_envio: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    consultar_cliente: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    consultar_pedido_actual: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    derivar_a_persona: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
    crear_pedido: {
      ai_tool: [[{ node: 'Chispita - Agente de pedidos', type: 'ai_tool', index: 0 }]],
    },
  },
  settings: { executionOrder: 'v1' },
};

fs.writeFileSync(
  path.join(__dirname, 'workflow-agent.generated.json'),
  JSON.stringify([workflow], null, 2)
);

const fallback = JSON.parse(JSON.stringify(workflow));
fallback.id = fallbackWorkflowId;
fallback.name = 'Agente WhatsApp - Respaldo NVIDIA';
const webhook = fallback.nodes.find((node) => node.id === 'webhook-atencion');
webhook.webhookId = 'modosabor-atencion-web-fallback';
webhook.parameters.path = 'modosabor-atencion-web-fallback';
const model = fallback.nodes.find((node) => node.id === 'model-nvidia');
model.name = 'NVIDIA GLM 5.2';
model.type = '@n8n/n8n-nodes-langchain.lmChatOpenAi';
model.typeVersion = 1.3;
model.parameters = {
  model: { __rl: true, value: 'z-ai/glm-5.2', mode: 'id' },
  responsesApiEnabled: false,
  options: {},
};
model.credentials = {
  openAiApi: { id: fallbackCredentialId, name: 'OpenAI account' },
};
delete fallback.connections['Google Gemini 3.1 Flash Lite'];
fallback.connections['NVIDIA GLM 5.2'] = {
  ai_languageModel: [
    [{ node: 'Chispita - Agente de pedidos', type: 'ai_languageModel', index: 0 }],
  ],
};
fs.writeFileSync(
  path.join(__dirname, 'workflow-agent-fallback.generated.json'),
  JSON.stringify([fallback], null, 2)
);
console.log('Workflows principal y respaldo creados');
