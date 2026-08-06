const db = require('../db');
const logger = require('../utils/logger');

/**
 * Capa única de acceso a los modelos de IA.
 *
 * ── Tres familias, no veinte proveedores ───────────────────────────────────
 *
 * Hay decenas de proveedores de IA, pero casi todos copiaron el formato de
 * OpenAI: Kimi (Moonshot), DeepSeek, Groq, OpenRouter, Grok, Mistral, Together
 * y los modelos que corren en tu propia máquina hablan todos igual. Lo único
 * que cambia entre ellos es la dirección a la que se le pega.
 *
 * Sólo Google y Anthropic tienen formato propio.
 *
 * Por eso acá hay tres adaptadores y una lista de direcciones, en vez de un
 * adaptador por proveedor. Agregar uno nuevo es agregar una línea a la lista
 * —o ni eso: con la opción "personalizado" se escribe la dirección desde
 * Configuración, sin tocar código.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 *
 * No decide nada sobre el negocio ni sabe qué es un pedido. Solo manda texto y
 * herramientas, y devuelve lo que contestó el modelo.
 */

/*
  Los modelos por defecto son una sugerencia, no una verdad: salen nuevos todo
  el tiempo y los viejos se dan de baja. Por eso el modelo es un campo editable
  en Configuración. Si alguno de estos dejó de existir, se escribe el nombre
  del que corresponda y listo, sin tocar código.
*/
const PROVEEDORES = {
  gemini: {
    nombre: 'Google Gemini',
    familia: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modeloPorDefecto: 'gemini-2.5-flash',
    donde: 'aistudio.google.com/apikey',
    nota: 'Tiene nivel gratuito.',
  },
  anthropic: {
    nombre: 'Anthropic Claude',
    familia: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modeloPorDefecto: 'claude-sonnet-4-20250514',
    donde: 'console.anthropic.com',
    nota: 'Sin nivel gratuito.',
  },
  openai: {
    nombre: 'OpenAI (GPT)',
    familia: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    modeloPorDefecto: 'gpt-4o-mini',
    donde: 'platform.openai.com/api-keys',
    nota: 'Sin nivel gratuito.',
  },
  moonshot: {
    nombre: 'Kimi (Moonshot)',
    familia: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    modeloPorDefecto: 'kimi-k2-0711-preview',
    donde: 'platform.moonshot.ai',
    nota: 'Si tu cuenta es de China, la dirección termina en .cn — cambiala abajo.',
  },
  deepseek: {
    nombre: 'DeepSeek',
    familia: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    modeloPorDefecto: 'deepseek-chat',
    donde: 'platform.deepseek.com',
    nota: 'Muy barato para el volumen de un restaurante.',
  },
  groq: {
    nombre: 'Groq',
    familia: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    modeloPorDefecto: 'llama-3.3-70b-versatile',
    donde: 'console.groq.com/keys',
    nota: 'Contesta muy rápido y tiene nivel gratuito.',
  },
  openrouter: {
    nombre: 'OpenRouter',
    familia: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    modeloPorDefecto: 'anthropic/claude-3.5-sonnet',
    donde: 'openrouter.ai/keys',
    nota: 'Una sola clave para cientos de modelos de distintas empresas.',
  },
  xai: {
    nombre: 'xAI (Grok)',
    familia: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    modeloPorDefecto: 'grok-2-latest',
    donde: 'console.x.ai',
    nota: '',
  },
  mistral: {
    nombre: 'Mistral',
    familia: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    modeloPorDefecto: 'mistral-small-latest',
    donde: 'console.mistral.ai',
    nota: '',
  },
  together: {
    nombre: 'Together AI',
    familia: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    modeloPorDefecto: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    donde: 'api.together.ai',
    nota: '',
  },
  personalizado: {
    nombre: 'Otro (compatible con OpenAI)',
    familia: 'openai',
    baseUrl: '',
    modeloPorDefecto: '',
    donde: '',
    nota: 'Para cualquier proveedor que no esté en la lista, o un modelo corriendo en tu propia máquina. Escribí la dirección de su API.',
  },
};

const TIMEOUT_MS = 30000;

function leerConfig() {
  const filas = db.prepare('SELECT clave, valor FROM configuracion').all();
  return filas.reduce((acc, f) => {
    acc[f.clave] = f.valor;
    return acc;
  }, {});
}

/**
 * Qué proveedor está configurado, con qué dirección, modelo y clave.
 *
 * ── Por qué hay una sola clave y no una por proveedor ──────────────────────
 *
 * Con diez proveedores en la lista, guardar una clave para cada uno serían
 * diez secretos distintos que mantener, mostrar y auditar. Se usa uno solo,
 * el del proveedor activo. Si se cambia de proveedor hay que pegar la clave
 * nueva, que es exactamente lo que uno haría igual.
 *
 * La clave de la voz (`gemini_api_key`) es aparte a propósito: se puede usar
 * Gemini para la voz y otro proveedor para el asistente, sin pisarse.
 */
function proveedorActivo(config = null) {
  const cfg = config || leerConfig();
  const id = String(cfg.ia_proveedor || 'gemini').toLowerCase();
  const definicion = PROVEEDORES[id] || PROVEEDORES.gemini;
  const idValido = PROVEEDORES[id] ? id : 'gemini';

  // La variable de entorno gana sobre la base: en Railway queda encriptada y
  // fuera del alcance de cualquiera que entre al admin.
  const clave = process.env.IA_API_KEY || cfg.ia_api_key || '';

  // La dirección se puede sobrescribir incluso en los proveedores conocidos:
  // algunos tienen dominios distintos por región.
  const baseUrl = String(cfg.ia_base_url || definicion.baseUrl || '').replace(/\/+$/, '');

  return {
    id: idValido,
    definicion,
    familia: definicion.familia,
    clave,
    baseUrl,
    modelo: cfg.ia_modelo || definicion.modeloPorDefecto,
  };
}

/** ¿Se puede usar el asistente ahora mismo? */
function iaHabilitada(config = null) {
  const cfg = config || leerConfig();
  if (String(cfg.ia_asistente_activo ?? '0') !== '1') return false;
  const activo = proveedorActivo(cfg);
  // Sin dirección no hay a dónde pegarle: pasa con "personalizado" a medio
  // configurar.
  return Boolean(activo.clave && activo.baseUrl && activo.modelo);
}

/*
  ── Formato común ──────────────────────────────────────────────────────────

  mensajes:     [{ rol: 'usuario' | 'asistente' | 'herramienta', texto, ... }]
  herramientas: [{ nombre, descripcion, parametros }]  (parametros = JSON Schema)

  Respuesta:    { texto, llamadas: [{ nombre, argumentos }] }

  Cuando el modelo quiere usar una herramienta devuelve `llamadas`; cuando ya
  tiene la respuesta devuelve `texto`. Puede devolver las dos cosas.
*/

async function pedirConTimeout(url, opciones) {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opciones, signal: controlador.signal });
  } finally {
    clearTimeout(corte);
  }
}

/**
 * Un error de la API trae explicación de qué pasó (clave vencida, modelo
 * inexistente, sin saldo). Se recorta porque el cuerpo puede ser enorme.
 */
async function errorDeApi(respuesta, proveedor) {
  let detalle = '';
  try {
    detalle = (await respuesta.text()).slice(0, 300);
  } catch {
    detalle = '';
  }
  return new Error(`${proveedor} respondió ${respuesta.status}. ${detalle}`.trim());
}

// ── Familia Gemini ──────────────────────────────────────────────────────────

function aFormatoGemini(mensajes) {
  return mensajes.map((m) => {
    if (m.rol === 'herramienta') {
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.nombre,
              // Gemini exige un objeto acá, no un texto suelto.
              response: { resultado: m.resultado },
            },
          },
        ],
      };
    }
    if (m.rol === 'asistente' && m.llamadas?.length) {
      return {
        role: 'model',
        parts: m.llamadas.map((l) => ({
          functionCall: { name: l.nombre, args: l.argumentos || {} },
        })),
      };
    }
    return {
      role: m.rol === 'asistente' ? 'model' : 'user',
      parts: [{ text: m.texto || '' }],
    };
  });
}

async function conversarGemini({ clave, baseUrl, modelo, sistema, mensajes, herramientas }) {
  const cuerpo = {
    contents: aFormatoGemini(mensajes),
    systemInstruction: { parts: [{ text: sistema }] },
  };
  if (herramientas?.length) {
    cuerpo.tools = [
      {
        functionDeclarations: herramientas.map((h) => ({
          name: h.nombre,
          description: h.descripcion,
          parameters: h.parametros,
        })),
      },
    ];
  }

  const respuesta = await pedirConTimeout(`${baseUrl}/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) throw await errorDeApi(respuesta, 'Gemini');

  const datos = await respuesta.json();
  const partes = datos?.candidates?.[0]?.content?.parts || [];
  return {
    texto: partes
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('')
      .trim(),
    llamadas: partes
      .filter((p) => p.functionCall)
      .map((p) => ({ nombre: p.functionCall.name, argumentos: p.functionCall.args || {} })),
  };
}

// ── Familia OpenAI ──────────────────────────────────────────────────────────
// La usan OpenAI, Kimi, DeepSeek, Groq, OpenRouter, Grok, Mistral, Together y
// prácticamente cualquier proveedor nuevo.

function aFormatoOpenAI(mensajes) {
  const salida = [];
  mensajes.forEach((m) => {
    if (m.rol === 'herramienta') {
      salida.push({ role: 'tool', tool_call_id: m.id, content: String(m.resultado) });
      return;
    }
    if (m.rol === 'asistente' && m.llamadas?.length) {
      salida.push({
        role: 'assistant',
        content: m.texto || null,
        tool_calls: m.llamadas.map((l) => ({
          id: l.id,
          type: 'function',
          function: { name: l.nombre, arguments: JSON.stringify(l.argumentos || {}) },
        })),
      });
      return;
    }
    salida.push({ role: m.rol === 'asistente' ? 'assistant' : 'user', content: m.texto || '' });
  });
  return salida;
}

async function conversarOpenAI({
  clave,
  baseUrl,
  modelo,
  sistema,
  mensajes,
  herramientas,
  nombreProveedor,
}) {
  const cuerpo = {
    model: modelo,
    messages: [{ role: 'system', content: sistema }, ...aFormatoOpenAI(mensajes)],
  };
  if (herramientas?.length) {
    cuerpo.tools = herramientas.map((h) => ({
      type: 'function',
      function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
    }));
  }

  const respuesta = await pedirConTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) throw await errorDeApi(respuesta, nombreProveedor || 'El proveedor');

  const datos = await respuesta.json();
  const mensaje = datos?.choices?.[0]?.message || {};
  return {
    texto: String(mensaje.content || '').trim(),
    llamadas: (mensaje.tool_calls || []).map((l) => ({
      id: l.id,
      nombre: l.function?.name,
      argumentos: parsearArgumentos(l.function?.arguments),
    })),
  };
}

// ── Familia Anthropic ───────────────────────────────────────────────────────

function aFormatoAnthropic(mensajes) {
  return mensajes.map((m) => {
    if (m.rol === 'herramienta') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.id, content: String(m.resultado) }],
      };
    }
    if (m.rol === 'asistente' && m.llamadas?.length) {
      const contenido = [];
      if (m.texto) contenido.push({ type: 'text', text: m.texto });
      m.llamadas.forEach((l) => {
        contenido.push({ type: 'tool_use', id: l.id, name: l.nombre, input: l.argumentos || {} });
      });
      return { role: 'assistant', content: contenido };
    }
    return { role: m.rol === 'asistente' ? 'assistant' : 'user', content: m.texto || '' };
  });
}

async function conversarAnthropic({ clave, baseUrl, modelo, sistema, mensajes, herramientas }) {
  const cuerpo = {
    model: modelo,
    max_tokens: 2048,
    system: sistema,
    messages: aFormatoAnthropic(mensajes),
  };
  if (herramientas?.length) {
    cuerpo.tools = herramientas.map((h) => ({
      name: h.nombre,
      description: h.descripcion,
      input_schema: h.parametros,
    }));
  }

  const respuesta = await pedirConTimeout(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': clave,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) throw await errorDeApi(respuesta, 'Anthropic');

  const datos = await respuesta.json();
  const bloques = datos?.content || [];
  return {
    texto: bloques
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim(),
    llamadas: bloques
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, nombre: b.name, argumentos: b.input || {} })),
  };
}

/**
 * Los argumentos vienen como texto JSON y el modelo a veces manda algo roto.
 * Un objeto vacío es mejor que tirar abajo toda la consulta: la herramienta
 * va a fallar por falta de datos y el modelo puede reintentar.
 */
function parsearArgumentos(texto) {
  try {
    return JSON.parse(texto || '{}');
  } catch {
    return {};
  }
}

const FAMILIAS = {
  gemini: conversarGemini,
  openai: conversarOpenAI,
  anthropic: conversarAnthropic,
};

/**
 * Manda una conversación al modelo configurado.
 *
 * @param {object} opciones
 * @param {string} opciones.sistema        Instrucciones fijas del asistente.
 * @param {Array}  opciones.mensajes       Conversación en formato común.
 * @param {Array}  [opciones.herramientas] Lo que el modelo puede llamar.
 * @returns {Promise<{texto: string, llamadas: Array}>}
 */
async function conversar({ sistema, mensajes, herramientas = [] }) {
  const { id, familia, definicion, clave, baseUrl, modelo } = proveedorActivo();
  if (!clave) throw new Error('No hay una clave de IA configurada');
  if (!baseUrl) throw new Error('Falta la dirección de la API del proveedor');

  const implementacion = FAMILIAS[familia];
  try {
    return await implementacion({
      clave,
      baseUrl,
      modelo,
      sistema,
      mensajes,
      herramientas,
      nombreProveedor: definicion.nombre,
    });
  } catch (error) {
    // Se loguea corto: el mensaje puede traer partes de la respuesta del
    // proveedor, y los logs de Railway son más accesibles que la base.
    logger.warn('[ia] Falló la consulta al modelo', {
      proveedor: id,
      modelo,
      mensaje: String(error?.message || error).slice(0, 200),
    });
    throw error;
  }
}

/** Lista para la pantalla de Configuración, sin datos internos. */
function catalogoDeProveedores() {
  return Object.entries(PROVEEDORES).map(([id, p]) => ({
    id,
    nombre: p.nombre,
    familia: p.familia,
    baseUrl: p.baseUrl,
    modeloPorDefecto: p.modeloPorDefecto,
    donde: p.donde,
    nota: p.nota,
  }));
}

module.exports = {
  PROVEEDORES,
  catalogoDeProveedores,
  conversar,
  iaHabilitada,
  proveedorActivo,
};
