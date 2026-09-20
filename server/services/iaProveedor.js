const db = require('../db');
const logger = require('../utils/logger');
const { desencriptar } = require('../utils/encryptConfig');

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
 * Ojo con el nombre: la familia `openai` es ese formato de mensajes, no la
 * empresa. OpenAI como proveedor no está en la lista porque no se usa, pero la
 * familia tiene que quedarse: es la que hablan NVIDIA, Groq, DeepSeek y la
 * opción "personalizado", que es justamente la que atiende WhatsApp hoy.
 *
 * Por eso acá hay tres adaptadores y una lista de direcciones, en vez de un
 * adaptador por proveedor. Agregar uno nuevo es agregar una línea a la lista
 * —o ni eso: con la opción "personalizado" se escribe la dirección desde
 * Configuración, sin tocar código.
 *
 * ── Circuit breaker y fallback ─────────────────────────────────────────────
 *
 * Si el proveedor activo falla (timeout, caída, rate limit), el sistema
 * reintenta una vez con backoff y luego prueba automáticamente con otros
 * proveedores que tengan clave configurada en variables de entorno.
 *
 * Esto permite tener un proveedor principal (ej: Gemini) y un respaldo
 * (ej: Groq) sin que nadie tenga que hacer nada cuando el principal se cae.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 *
 * No decide nada sobre el negocio ni sabe qué es un pedido. Solo manda texto y
 * herramientas, y devuelve lo que contestó el modelo.
 */

const TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 1;

/*
  ── Sobre los modelos de esta lista ────────────────────────────────────────

  Son una sugerencia, no una verdad. Salen modelos nuevos todo el tiempo y los
  viejos se dan de baja, así que cualquier lista escrita hoy va a estar
  incompleta en unos meses.

  Por eso en Configuración el modelo se puede elegir de la lista **o escribir a
  mano**. Si el proveedor sacó uno nuevo, se escribe el nombre y funciona, sin
  esperar a que nadie actualice este archivo.

  El primero de cada lista es el que se usa por defecto.
*/
const PROVEEDORES = {
  gemini: {
    nombre: 'Google Gemini',
    familia: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    /*
      Medido el 17/09/2026 con el catálogo real de herramientas:
      `gemini-3.5-flash-lite` contestó en 573 ms, `gemini-3.6-flash` devolvió
      503 por demanda y `gemini-3.1-flash-lite` tardó 23,8 s —al filo del
      timeout de 30 s, o sea que se caía sola en hora pico—.
    */
    modeloPorDefecto: 'gemini-3.5-flash-lite',
    modelos: ['gemini-3.5-flash-lite', 'gemini-3.6-flash'],
    envKey: 'GEMINI_API_KEY',
    donde: 'aistudio.google.com/apikey',
    nota: 'Tiene nivel gratuito.',
  },
  anthropic: {
    nombre: 'Anthropic Claude',
    familia: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modeloPorDefecto: 'claude-sonnet-4-20250514',
    modelos: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
    envKey: 'ANTHROPIC_API_KEY',
    donde: 'console.anthropic.com',
    nota: 'Sin nivel gratuito.',
  },
  moonshot: {
    nombre: 'Kimi (Moonshot)',
    familia: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    modeloPorDefecto: 'kimi-k2-0711-preview',
    modelos: ['kimi-k2-0711-preview', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    envKey: 'MOONSHOT_API_KEY',
    donde: 'platform.moonshot.ai',
    nota: 'Si tu cuenta es de China, la dirección termina en .cn — cambiala abajo.',
  },
  deepseek: {
    nombre: 'DeepSeek',
    familia: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    modeloPorDefecto: 'deepseek-chat',
    modelos: ['deepseek-chat', 'deepseek-reasoner'],
    envKey: 'DEEPSEEK_API_KEY',
    donde: 'platform.deepseek.com',
    nota: 'Muy barato para el volumen de un restaurante.',
  },
  groq: {
    nombre: 'Groq',
    familia: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    modeloPorDefecto: 'llama-3.3-70b-versatile',
    modelos: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    envKey: 'GROQ_API_KEY',
    donde: 'console.groq.com/keys',
    nota: 'Contesta muy rápido y tiene nivel gratuito.',
  },
  openrouter: {
    nombre: 'OpenRouter',
    familia: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    modeloPorDefecto: 'anthropic/claude-3.5-sonnet',
    modelos: [
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'deepseek/deepseek-chat',
    ],
    envKey: 'OPENROUTER_API_KEY',
    donde: 'openrouter.ai/keys',
    nota: 'Una sola clave para cientos de modelos de distintas empresas.',
  },
  xai: {
    nombre: 'xAI (Grok)',
    familia: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    modeloPorDefecto: 'grok-2-latest',
    modelos: ['grok-2-latest', 'grok-2-vision-latest'],
    envKey: 'XAI_API_KEY',
    donde: 'console.x.ai',
    nota: '',
  },
  mistral: {
    nombre: 'Mistral',
    familia: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    modeloPorDefecto: 'mistral-small-latest',
    modelos: ['mistral-small-latest', 'mistral-large-latest', 'pixtral-12b-2409'],
    envKey: 'MISTRAL_API_KEY',
    donde: 'console.mistral.ai',
    nota: '',
  },
  together: {
    nombre: 'Together AI',
    familia: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    modeloPorDefecto: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    modelos: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    envKey: 'TOGETHER_API_KEY',
    donde: 'api.together.ai',
    nota: '',
  },
  personalizado: {
    nombre: 'Otro (compatible con OpenAI)',
    familia: 'openai',
    baseUrl: '',
    modeloPorDefecto: '',
    modelos: [],
    envKey: null,
    donde: '',
    nota: 'Para cualquier proveedor que no esté en la lista, o un modelo corriendo en tu propia máquina. Escribí la dirección de su API.',
  },
};

function leerConfig() {
  const filas = db.prepare('SELECT clave, valor FROM configuracion').all();
  return filas.reduce((acc, f) => {
    acc[f.clave] = f.valor;
    return acc;
  }, {});
}

function esBaseUrlSegura(baseUrl) {
  const url = String(baseUrl || '').trim();
  if (/^https:\/\//i.test(url)) return true;
  // El HTTP sólo se admite en desarrollo para proveedores locales; nunca para
  // enviar una clave o datos del negocio por una red pública.
  return (
    String(process.env.NODE_ENV || '').trim() !== 'production' &&
    /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(url)
  );
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

  const clave = process.env.IA_API_KEY || desencriptar(cfg.ia_api_key) || '';

  const guardada = String(cfg.ia_base_url || '').trim();
  const esDireccion = /^https?:\/\/.+/i.test(guardada);
  const baseUrlCandidata = (esDireccion ? guardada : definicion.baseUrl || '').replace(/\/+$/, '');
  const baseUrl = esBaseUrlSegura(baseUrlCandidata) ? baseUrlCandidata : '';

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
  return Boolean(activo.clave && activo.baseUrl && activo.modelo);
}

/*
  ── Formato común ──────────────────────────────────────────────────────────

  mensajes:     [{ rol: 'usuario' | 'asistente' | 'herramienta', texto, imagen?, ... }]
  herramientas: [{ nombre, descripcion, parametros }]  (parametros = JSON Schema)

  Respuesta:    { texto, llamadas: [{ nombre, argumentos }] }
*/

function partirImagen(dataUrl) {
  const coincidencia = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!coincidencia) return null;
  return { tipo: coincidencia[1], base64: coincidencia[2] };
}

async function pedirConTimeout(url, opciones) {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opciones, signal: controlador.signal });
  } finally {
    clearTimeout(corte);
  }
}

async function errorDeApi(respuesta, proveedor) {
  let detalle = '';
  try {
    detalle = (await respuesta.text()).slice(0, 300);
  } catch {
    detalle = '';
  }
  const error = new Error(`${proveedor} respondió ${respuesta.status}. ${detalle}`.trim());
  // El código va aparte del texto: decidir si conviene reintentar mirando una
  // frase del mensaje es frágil, y cada proveedor la redacta distinto.
  error.status = respuesta.status;
  return error;
}

/*
  Un fallo que probablemente se arregle solo en un segundo.

  Importa distinguirlos porque la respuesta es opuesta: ante una clave mal
  puesta o un modelo dado de baja, reintentar es perder tiempo; ante un 503
  —"este modelo está con mucha demanda", que es lo que devuelve Gemini en
  hora pico— reintentar es exactamente lo que hay que hacer.

  Sin esta distinción el proveedor elegido para atender perdía su turno con el
  primer pico de demanda y contestaba otro modelo.
*/
function esErrorTransitorio(error) {
  const status = Number(error?.status || 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  return (
    error?.name === 'AbortError' ||
    /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed/i.test(String(error?.message || ''))
  );
}

function aFormatoGemini(mensajes) {
  return mensajes.map((m) => {
    if (m.rol === 'herramienta') {
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.nombre,
              response: { resultado: m.resultado },
            },
          },
        ],
      };
    }
    if (m.rol === 'asistente' && m.llamadas?.length) {
      return {
        role: 'model',
        parts: m.llamadas.map(
          (l) =>
            l.geminiPart || {
              functionCall: { name: l.nombre, args: l.argumentos || {} },
            }
        ),
      };
    }
    const partes = [];
    const imagen = m.rol === 'usuario' ? partirImagen(m.imagen) : null;
    if (imagen) {
      partes.push({ inlineData: { mimeType: imagen.tipo, data: imagen.base64 } });
    }
    partes.push({ text: m.texto || '' });

    return { role: m.rol === 'asistente' ? 'model' : 'user', parts: partes };
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
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim(),
    llamadas: partes
      .filter((p) => p.functionCall)
      .map((p, index) => ({
        id: p.functionCall.id || `gemini-${Date.now()}-${index}`,
        nombre: p.functionCall.name,
        argumentos: p.functionCall.args || {},
        // Gemini exige devolver intacta la firma del turno que pidió la herramienta.
        geminiPart: p,
      })),
    uso: {
      entrada: Number(datos?.usageMetadata?.promptTokenCount || 0),
      salida: Number(datos?.usageMetadata?.candidatesTokenCount || 0),
    },
  };
}

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
    if (m.rol === 'usuario' && partirImagen(m.imagen)) {
      salida.push({
        role: 'user',
        content: [
          { type: 'text', text: m.texto || '' },
          { type: 'image_url', image_url: { url: m.imagen } },
        ],
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
    uso: {
      entrada: Number(datos?.usage?.prompt_tokens || 0),
      salida: Number(datos?.usage?.completion_tokens || 0),
    },
  };
}

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
    const imagen = m.rol === 'usuario' ? partirImagen(m.imagen) : null;
    if (imagen) {
      return {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: imagen.tipo, data: imagen.base64 },
          },
          { type: 'text', text: m.texto || '' },
        ],
      };
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
    uso: {
      entrada: Number(datos?.usage?.input_tokens || 0),
      salida: Number(datos?.usage?.output_tokens || 0),
    },
  };
}

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
 * Devuelve proveedores alternativos que tienen clave en variables de entorno.
 * Ordenados por velocidad/costo aproximado para un restaurante.
 */
function proveedoresFallback() {
  const ordenPreferido = [
    'groq',
    'deepseek',
    'openrouter',
    'gemini',
    'moonshot',
    'mistral',
    'xai',
    'together',
    'anthropic',
  ];
  const resultado = [];
  ordenPreferido.forEach((id) => {
    const p = PROVEEDORES[id];
    if (!p || !p.envKey) return;
    const clave = process.env[p.envKey];
    if (!clave) return;
    resultado.push({
      id,
      definicion: p,
      familia: p.familia,
      clave,
      baseUrl: p.baseUrl,
      modelo: p.modeloPorDefecto,
    });
  });
  return resultado;
}

async function dormir(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function intentarConProveedor(opciones) {
  const { familia, definicion, clave, baseUrl, modelo, sistema, mensajes, herramientas } = opciones;
  if (!clave) throw new Error('No hay una clave de IA configurada');
  if (!baseUrl) throw new Error('Falta la dirección de la API del proveedor');

  const implementacion = FAMILIAS[familia];
  return await implementacion({
    clave,
    baseUrl,
    modelo,
    sistema,
    mensajes,
    herramientas,
    nombreProveedor: definicion.nombre,
  });
}

/*
  Ejecuta una conversación con una configuración explícita. Se usa cuando un
  canal tiene su propio respaldo (WhatsApp) y no puede depender de variables
  globales del proceso. La clave nunca se registra: sólo llega al adaptador de
  la API y el resultado conserva qué proveedor atendió para la métrica.
*/
async function conversarConProveedor({ sistema, mensajes, herramientas = [], proveedor }) {
  const baseUrl = String(proveedor?.baseUrl || '').replace(/\/+$/, '');
  if (!esBaseUrlSegura(baseUrl)) {
    throw new Error('La dirección del proveedor de respaldo no es segura');
  }

  /*
    Reintenta igual que el proveedor global.

    Antes esto llamaba una sola vez. Cuando este proveedor es el que el dueño
    eligió para atender WhatsApp, un 503 de un segundo le sacaba el turno y
    contestaba otro modelo, con otro tono y otro precio de tokens. Se veía en
    la métrica como si el elegido no hubiera existido nunca.
  */
  let ultimoError = null;
  let resultado = null;
  for (let intento = 0; intento <= MAX_RETRIES; intento += 1) {
    if (intento > 0) await dormir(RETRY_DELAY_MS);
    try {
      resultado = await intentarConProveedor({
        id: String(proveedor?.id || 'respaldo'),
        definicion: {
          nombre: String(proveedor?.nombre || proveedor?.id || 'Proveedor de respaldo'),
        },
        familia: proveedor?.familia || 'openai',
        clave: String(proveedor?.clave || ''),
        baseUrl,
        modelo: String(proveedor?.modelo || ''),
        sistema,
        mensajes,
        herramientas,
      });
      ultimoError = null;
      break;
    } catch (error) {
      ultimoError = error;
      if (!esErrorTransitorio(error)) break;
    }
  }
  if (ultimoError) throw ultimoError;

  return {
    ...resultado,
    _meta: {
      proveedor: String(proveedor?.id || 'respaldo'),
      modelo: String(proveedor?.modelo || ''),
      fallback: true,
    },
  };
}

/**
 * Manda una conversación al modelo configurado.
 *
 * Si el proveedor activo falla:
 *  1. Reintenta una vez con backoff.
 *  2. Si sigue fallando, prueba con proveedores alternativos que tengan
 *     clave en variables de entorno.
 *
 * @param {object} opciones
 * @param {string} opciones.sistema        Instrucciones fijas del asistente.
 * @param {Array}  opciones.mensajes       Conversación en formato común.
 * @param {Array}  [opciones.herramientas] Lo que el modelo puede llamar.
 * @returns {Promise<{texto: string, llamadas: Array, _meta: {proveedor: string, modelo: string, duracionMs: number}}>}
 */
async function conversar({ sistema, mensajes, herramientas = [] }) {
  const inicio = Date.now();
  const config = leerConfig();
  const principal = proveedorActivo(config);
  const fallbackHabilitado = String(config.ia_fallback_activo || '0') === '1';
  let ultimoError = null;

  // ── 1. Intentar con el proveedor activo (con retry) ───────────────────────
  for (let intento = 0; intento <= MAX_RETRIES; intento += 1) {
    if (intento > 0) {
      logger.info(`[ia] Reintento ${intento} con ${principal.id} después de ${RETRY_DELAY_MS}ms`);
      await dormir(RETRY_DELAY_MS);
    }
    try {
      const resultado = await intentarConProveedor({
        ...principal,
        sistema,
        mensajes,
        herramientas,
      });
      return {
        ...resultado,
        _meta: {
          proveedor: principal.id,
          modelo: principal.modelo,
          duracionMs: Date.now() - inicio,
          fallback: false,
        },
      };
    } catch (error) {
      ultimoError = error;
      // Error de auth o de modelo dado de baja: reintentar no lo va a arreglar.
      if (!esErrorTransitorio(error)) break;
    }
  }

  // ── 2. Fallback a proveedores alternativos ────────────────────────────────
  const alternativas = fallbackHabilitado
    ? proveedoresFallback().filter((a) => a.id !== principal.id)
    : [];
  if (alternativas.length > 0) {
    logger.warn('[ia] Proveedor principal falló, probando fallback', {
      proveedor: principal.id,
      error: String(ultimoError?.message || ultimoError).slice(0, 200),
      alternativas: alternativas.map((a) => a.id),
    });
  }

  for (const alternativa of alternativas) {
    try {
      const resultado = await intentarConProveedor({
        ...alternativa,
        sistema,
        mensajes,
        herramientas,
      });
      logger.info('[ia] Fallback exitoso', {
        proveedor: alternativa.id,
        modelo: alternativa.modelo,
      });
      return {
        ...resultado,
        _meta: {
          proveedor: alternativa.id,
          modelo: alternativa.modelo,
          duracionMs: Date.now() - inicio,
          fallback: true,
          proveedorOriginal: principal.id,
        },
      };
    } catch (error) {
      ultimoError = error;
      logger.warn('[ia] Fallback falló', {
        proveedor: alternativa.id,
        mensaje: String(error?.message || error).slice(0, 200),
      });
    }
  }

  // Nada funcionó.
  logger.error('[ia] Todos los proveedores fallaron', {
    principal: principal.id,
    alternativas: alternativas.map((a) => a.id),
    error: String(ultimoError?.message || ultimoError).slice(0, 200),
  });
  throw ultimoError || new Error('No se pudo conectar con ningún proveedor de IA');
}

/** Lista para la pantalla de Configuración, sin datos internos. */
function catalogoDeProveedores() {
  return Object.entries(PROVEEDORES).map(([id, p]) => ({
    id,
    nombre: p.nombre,
    familia: p.familia,
    baseUrl: p.baseUrl,
    modeloPorDefecto: p.modeloPorDefecto,
    modelos: p.modelos || [],
    donde: p.donde,
    nota: p.nota,
  }));
}

module.exports = {
  PROVEEDORES,
  catalogoDeProveedores,
  conversar,
  conversarConProveedor,
  iaHabilitada,
  proveedorActivo,
  proveedoresFallback,
  esBaseUrlSegura,
};
