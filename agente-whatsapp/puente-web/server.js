const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

require('dotenv').config({ path: path.join(__dirname, '..', '..', 'server', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const PORT = Number(process.env.PORT || 3035);

/*
  ── Por qué el puente escucha sólo en la máquina donde corre ───────────────

  `app.listen(PORT)` sin host escucha en TODAS las interfaces. Este puente
  expone `/api/qr` —el código para vincular WhatsApp—, `/api/chats` con las
  conversaciones de los clientes y `/api/test-disparo` para mandar mensajes.
  Sin autenticación.

  Con eso, cualquiera en la misma red del local —el WiFi que también usan los
  clientes— podía pedir el QR y vincular su propio celular al WhatsApp del
  negocio. Leer todas las conversaciones y escribir en nombre del local.

  Ahora escucha sólo en 127.0.0.1. Si algún día hace falta llegarle desde
  otra máquina, se pone BRIDGE_HOST y se le agrega la clave de abajo, pero
  el valor por defecto tiene que ser el seguro.
*/
const HOST = String(process.env.BRIDGE_HOST || '127.0.0.1').trim();

/*
  Clave de acceso. Es la segunda barrera, para el caso en que alguien cambie
  el host: sin ella, abrir el puente a la red lo deja abierto del todo.
*/
const BRIDGE_API_KEY = String(process.env.BRIDGE_API_KEY || '').trim();
const OPERATOR_KEY = String(process.env.BRIDGE_OPERATOR_KEY || 'dale')
  .trim()
  .toLowerCase();
const OPERATOR_KEYS = String(process.env.BRIDGE_OPERATOR_KEYS || `${OPERATOR_KEY},#dale`)
  .split(',')
  .map((key) => key.trim().toLowerCase())
  .filter(Boolean);
const AUTO_ON_OPERATOR_KEY = String(process.env.BRIDGE_AUTO_ON_OPERATOR_KEY || 'true') !== 'false';
const DELETE_OPERATOR_KEY = String(process.env.BRIDGE_DELETE_OPERATOR_KEY || 'false') === 'true';
const BRIDGE_HEADLESS = String(process.env.BRIDGE_HEADLESS || 'false') !== 'false';
const N8N_WEBHOOK_URL = String(process.env.N8N_COPILOTO_WEBHOOK_URL || '').trim();
const N8N_SECRET = String(process.env.N8N_COPILOTO_SECRET || '').trim();
const MODO_SABOR_API_URL = String(
  process.env.MODO_SABOR_API_URL || 'https://modosabor.com.ar'
).replace(/\/+$/, '');
const AGENT_API_KEY = String(process.env.AGENT_API_KEY || '').trim();

const dataDir = path.join(__dirname, 'data');
const historyFile = path.join(dataDir, 'history.json');
const logFile = path.join(dataDir, 'bridge.log');
fs.mkdirSync(dataDir, { recursive: true });

const app = express();
/*
  CORS cerrado. Antes era `cors()` a secas, que responde a cualquier origen:
  una página abierta en la computadora del local podía leer las
  conversaciones desde el navegador. Se permite el panel y nada más.
*/
const ORIGENES = new Set(
  [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    ...String(process.env.BRIDGE_ALLOWED_ORIGINS || '')
      .split(',')
      .map((x) => x.trim()),
  ].filter(Boolean)
);
app.use(
  cors({
    origin: (origen, cb) => cb(null, !origen || ORIGENES.has(origen)),
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/*
  Sólo se pide la clave si está configurada. Así el uso normal —el puente en
  la máquina del local, escuchando en 127.0.0.1— sigue funcionando sin
  cambiar nada, y quien lo abra a la red está obligado a ponerla.
*/
app.use('/api', (req, res, next) => {
  if (!BRIDGE_API_KEY) return next();
  const enviada = req.get('x-bridge-key') || req.query.key || '';
  if (enviada === BRIDGE_API_KEY) return next();
  return res.status(401).json({ error: 'Falta la clave del puente' });
});

let currentQr = '';
let currentQrDataUrl = '';
let ready = false;
let lastError = '';
let authReadyTimer = null;
let restartAttempts = 0;
const events = [];
const history = loadHistory();
const chatIndex = {};

function findChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.platform !== 'win32') return undefined;
  const candidates = [
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  } catch {
    return {};
  }
}

function formatError(error) {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  return error.message || error.name || error.code || JSON.stringify(error);
}

function hydrateChatIndexFromHistory() {
  for (const [chatId, messages] of Object.entries(history)) {
    if (!Array.isArray(messages) || !messages.length) continue;
    const last = messages[messages.length - 1];
    chatIndex[chatId] = {
      chat_id: chatId,
      nombre: last.nombre || last.telefono || chatId,
      telefono: last.telefono || '',
      ultimo_texto: last.texto || '',
      ultimo_en: last.enviado_en || '',
      total_mensajes: messages.length,
    };
  }
}

function saveHistory() {
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

function rememberEvent(type, detail = {}) {
  const entry = { at: new Date().toISOString(), type, detail };
  events.unshift(entry);
  events.splice(100);
  console.log(`[${entry.at}] ${type}`, detail);
  try {
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  } catch {}
}

function normalizeText(value) {
  return String(value || '').trim();
}

function isOperatorTrigger(text) {
  return OPERATOR_KEYS.includes(normalizeText(text).toLowerCase());
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function quantityNearText(fullText, productName) {
  const normalizedText = normalizeForMatch(fullText);
  const normalizedProduct = normalizeForMatch(productName);
  const idx = normalizedText.indexOf(normalizedProduct);
  if (idx < 0) return 1;
  const before = normalizedText.slice(Math.max(0, idx - 24), idx);
  const after = normalizedText.slice(
    idx + normalizedProduct.length,
    idx + normalizedProduct.length + 18
  );
  const numericBefore = before.match(/(?:^|\s)(\d{1,2})\s*$/);
  const numericAfter = after.match(/^\s*x?\s*(\d{1,2})(?:\s|$)/);
  const wordBefore = before.match(/(?:^|\s)(una|un|dos|tres|cuatro|cinco)\s*$/);
  const map = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
  return Number(numericBefore?.[1] || numericAfter?.[1] || map[wordBefore?.[1]] || 1);
}

function guessDeliveryType(text) {
  const normalized = normalizeForMatch(text);
  if (/\b(retira|retiro|paso|buscar|local)\b/.test(normalized)) return 'retiro';
  return 'delivery';
}

function guessPayment(text) {
  const normalized = normalizeForMatch(text);
  if (/\b(transferencia|transf|transferir)\b/.test(normalized)) return 'transferencia';
  if (/\b(mercado pago|mercadopago|mp)\b/.test(normalized)) return 'mercadopago';
  if (/\b(modo)\b/.test(normalized)) return 'modo';
  if (/\b(uala)\b/.test(normalized)) return 'uala';
  return 'efectivo';
}

function cleanAddressText(value) {
  return normalizeText(value)
    .replace(
      /\b(pago|abona|abono|abonar|efectivo|transferencia|transf|mercado\s*pago|mercadopago|mp|modo|uala)\b.*$/i,
      ''
    )
    .replace(
      /\b(quiero|pedido|pedir|una|un|dos|tres|cuatro|cinco|smash|hamburguesa|pizza|milanesa|empanada|pepsi|mirinda|jugo)\b.*$/i,
      ''
    )
    .trim()
    .replace(/[.,;:-]+$/g, '')
    .trim();
}

function extractAddressCandidate(text) {
  const clean = normalizeText(text);
  if (!/\d{1,5}/.test(clean)) return '';

  const afterDelivery = clean.match(
    /\b(?:delivery|llevar|llevalo|llevarlo|enviar|mandar|domicilio|direccion|dirección|queda|estoy)\b\s*(?:en|a|al|:)?\s+(.{3,120})/i
  );
  if (afterDelivery?.[1]) {
    const value = cleanAddressText(afterDelivery[1]);
    if (value && /\d{1,5}/.test(value)) return value;
  }

  const streetMatch = clean.match(
    /\b((?:calle|avenida|av|pasaje|barrio|manzana|mz|san|diego|belgrano|sarmiento|villarroel|lamadrid|rivadavia|colon|mitre|alberdi|peron|perón|9 de julio|25 de mayo)[^,\n]{0,80}\d{1,5}[^,\n]{0,80})/i
  );
  if (streetMatch?.[1]) return cleanAddressText(streetMatch[1]);

  const simpleStreet = clean.match(
    /\b([a-záéíóúñü\s.]{3,50}\s+\d{1,5}(?:\s+[a-záéíóúñü\s.]{2,40})?)\b/i
  );
  return cleanAddressText(simpleStreet?.[1] || '');
}

function guessAddress(messages) {
  const customerMessages = messages
    .filter((message) => !message.from_me)
    .map((message) => message.texto || '');
  const candidates = customerMessages.map(extractAddressCandidate).filter(Boolean);
  return candidates[candidates.length - 1] || '';
}

function guessCustomerName(payload) {
  return normalizeText(payload.nombre) || 'Cliente WhatsApp';
}

async function buildLocalPedidoJson(payload) {
  if (!MODO_SABOR_API_URL || !AGENT_API_KEY) {
    throw new Error('Falta configurar MODO_SABOR_API_URL o AGENT_API_KEY.');
  }

  const menuResponse = await fetch(`${MODO_SABOR_API_URL}/api/agente/menu?limite=300`, {
    headers: { 'x-agent-key': AGENT_API_KEY },
  });
  if (!menuResponse.ok) {
    throw new Error(`No se pudo leer el menu de Modo Sabor: HTTP ${menuResponse.status}`);
  }
  const menu = await menuResponse.json();
  const products = [];
  for (const category of menu.categories || []) {
    for (const product of category.products || []) products.push(product);
  }
  for (const product of menu.products || []) products.push(product);

  const messages = Array.isArray(payload.mensajes) ? payload.mensajes : [];
  const conversationText = messages.map((message) => message.texto || '').join('\n');
  const normalizedConversation = normalizeForMatch(conversationText);
  const matches = [];

  const orderedProducts = [...products].sort(
    (a, b) => String(b.nombre || '').length - String(a.nombre || '').length
  );
  for (const product of orderedProducts) {
    const productName = normalizeForMatch(product.nombre);
    if (!productName || productName.length < 4) continue;
    if (normalizedConversation.includes(productName)) {
      matches.push({
        producto_id: Number(product.id),
        cantidad: Math.max(1, quantityNearText(conversationText, product.nombre)),
        variantes: {},
        extras: [],
        descripcion: product.nombre,
      });
    }
  }

  const uniqueItems = [];
  const seen = new Set();
  for (const item of matches) {
    if (seen.has(item.producto_id)) continue;
    seen.add(item.producto_id);
    uniqueItems.push(item);
  }

  if (!uniqueItems.length) {
    throw new Error(
      'No pude detectar productos del catalogo en la conversacion. Probá escribiendo el nombre exacto del producto antes de #dale.'
    );
  }

  return {
    cliente_nombre: guessCustomerName(payload),
    cliente_telefono: normalizePhone(payload.telefono || ''),
    cliente_direccion: guessAddress(messages),
    tipo_entrega: guessDeliveryType(conversationText),
    metodo_pago: guessPayment(conversationText),
    notas:
      `Pedido detectado desde WhatsApp Web. Revisar antes de confirmar.\n\n${conversationText}`.slice(
        0,
        1800
      ),
    items: uniqueItems,
  };
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function resolveChatId(message) {
  return (
    message.id?.remote ||
    (message.fromMe ? message.to : message.from) ||
    message.from ||
    message.to ||
    message.id?._serialized ||
    ''
  );
}

function pushMessage(chatId, message) {
  if (!history[chatId]) history[chatId] = [];
  history[chatId].push(message);
  history[chatId] = history[chatId].slice(-50);
  saveHistory();
}

function recentMessages(chatId) {
  return (history[chatId] || []).slice(-30);
}

async function sendPayloadToDestination(payload) {
  if (N8N_WEBHOOK_URL) {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(N8N_SECRET ? { 'x-bridge-secret': N8N_SECRET } : {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    rememberEvent('copiloto_n8n', { status: response.status, body: text.slice(0, 300) });
    return;
  }

  if (MODO_SABOR_API_URL && AGENT_API_KEY) {
    const pedidoJson = await buildLocalPedidoJson(payload);
    const response = await fetch(`${MODO_SABOR_API_URL}/api/agente/copiloto/dale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-key': AGENT_API_KEY,
      },
      body: JSON.stringify({ ...payload, pedido_json: pedidoJson }),
    });
    const body = await response.json().catch(() => ({}));
    rememberEvent('copiloto_modosabor_directo', { status: response.status, body });
    return;
  }

  rememberEvent('copiloto_sin_destino', {
    message: 'Falta N8N_COPILOTO_WEBHOOK_URL o AGENT_API_KEY para enviar el contexto.',
  });
}

async function sendToCopilot({ chat, triggerMessage }) {
  const contact = await triggerMessage.getContact().catch(() => null);
  const chatId = chat?.id?._serialized || resolveChatId(triggerMessage);
  const chatPhone = normalizePhone(
    (triggerMessage.fromMe ? triggerMessage.to : triggerMessage.from) || chatId
  );
  const phone = chatPhone || normalizePhone(contact?.number || '');
  return sendPayloadToDestination({
    comando: '#dale',
    origen: 'whatsapp-web-bridge',
    chat_id: chatId,
    telefono: phone,
    nombre: chat?.name || contact?.pushname || contact?.name || phone || chatId,
    mensajes: recentMessages(chatId),
  });
}

async function sendChatByIdToCopilot(chatId) {
  const messages = recentMessages(chatId);
  if (!messages.length) {
    throw new Error('No hay mensajes recientes para ese chat.');
  }
  const lastCustomerMessage =
    [...messages].reverse().find((message) => !message.from_me) || messages[messages.length - 1];
  const meta = chatIndex[chatId] || {};
  return sendPayloadToDestination({
    comando: '#dale',
    origen: 'whatsapp-web-bridge-ui',
    chat_id: chatId,
    telefono: lastCustomerMessage.telefono || meta.telefono || '',
    nombre: meta.nombre || lastCustomerMessage.nombre || '',
    mensajes: messages,
  });
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'modo-sabor-copiloto' }),
  puppeteer: {
    headless: BRIDGE_HEADLESS,
    executablePath: findChromeExecutable(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

function clearAuthReadyTimer() {
  if (authReadyTimer) clearTimeout(authReadyTimer);
  authReadyTimer = null;
}

function scheduleReadyWatch() {
  clearAuthReadyTimer();
  authReadyTimer = setTimeout(async () => {
    if (ready) return;
    rememberEvent('ready_timeout', {
      message: 'WhatsApp se autentico pero no termino de conectar.',
    });
    if (restartAttempts >= 2) {
      lastError =
        'WhatsApp Web quedo autenticado pero no conecto. Abrir http://localhost:3035 y revisar QR/sesion.';
      rememberEvent('ready_timeout_final', { message: lastError });
      return;
    }
    restartAttempts += 1;
    try {
      await client.destroy().catch(() => {});
      currentQr = '';
      currentQrDataUrl = '';
      ready = false;
      rememberEvent('client_reinitialize', { attempt: restartAttempts });
      await client.initialize();
    } catch (error) {
      lastError = formatError(error);
      rememberEvent('client_reinitialize_error', { error: lastError, stack: error?.stack });
    }
  }, 90_000);
}

client.on('qr', async (qr) => {
  currentQr = qr;
  currentQrDataUrl = await qrcode.toDataURL(qr);
  ready = false;
  clearAuthReadyTimer();
  rememberEvent('qr', { message: 'QR actualizado' });
});

client.on('ready', () => {
  ready = true;
  currentQr = '';
  currentQrDataUrl = '';
  lastError = '';
  restartAttempts = 0;
  clearAuthReadyTimer();
  rememberEvent('ready', { message: 'WhatsApp conectado' });
});

client.on('authenticated', () => {
  rememberEvent('authenticated', { message: 'Sesion autenticada' });
  scheduleReadyWatch();
});

client.on('auth_failure', (message) => {
  ready = false;
  lastError = message || 'Fallo de autenticacion';
  clearAuthReadyTimer();
  rememberEvent('auth_failure', { message: lastError });
});

client.on('disconnected', (reason) => {
  ready = false;
  lastError = reason || 'Desconectado';
  clearAuthReadyTimer();
  rememberEvent('disconnected', { reason: lastError });
});

client.on('message_create', async (message) => {
  try {
    const text = normalizeText(message.body);
    if (!text) return;

    const chatId = resolveChatId(message);
    if (!chatId || chatId === 'status@broadcast') return;

    const chat = await message.getChat().catch((error) => {
      rememberEvent('chat_lookup_warning', { chat_id: chatId, error: formatError(error) });
      return null;
    });
    const contact = await message.getContact().catch(() => null);
    const chatPhone = normalizePhone((message.fromMe ? message.to : message.from) || chatId);
    const phone = chatPhone || normalizePhone(contact?.number || '');
    const entry = {
      id: message.id?._serialized || '',
      from_me: Boolean(message.fromMe),
      telefono: phone,
      nombre: chat?.name || contact?.pushname || contact?.name || phone || chatId,
      texto: text,
      enviado_en: new Date(
        (message.timestamp || Math.floor(Date.now() / 1000)) * 1000
      ).toISOString(),
    };

    pushMessage(chatId, entry);
    chatIndex[chatId] = {
      chat_id: chatId,
      nombre: entry.nombre,
      telefono: entry.telefono,
      ultimo_texto: entry.texto,
      ultimo_en: entry.enviado_en,
      total_mensajes: history[chatId].length,
    };

    if (AUTO_ON_OPERATOR_KEY && message.fromMe && isOperatorTrigger(text)) {
      rememberEvent('dale_detectado', { chat: chat?.name || chatId });
      if (DELETE_OPERATOR_KEY) {
        message
          .delete(true)
          .then(() => rememberEvent('dale_borrado', { chat: chat?.name || chatId }))
          .catch((error) => rememberEvent('dale_borrado_error', { error: formatError(error) }));
      }
      await sendToCopilot({ chat, triggerMessage: message });
    }
  } catch (error) {
    lastError = formatError(error);
    rememberEvent('message_error', { error: lastError, stack: error?.stack });
  }
});

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    ready,
    qr_available: Boolean(currentQrDataUrl),
    last_error: lastError,
    operator_key: OPERATOR_KEY,
    operator_keys: OPERATOR_KEYS,
    auto_on_operator_key: AUTO_ON_OPERATOR_KEY,
    delete_operator_key: DELETE_OPERATOR_KEY,
    headless: BRIDGE_HEADLESS,
    n8n_configured: Boolean(N8N_WEBHOOK_URL),
    modosabor_configured: Boolean(MODO_SABOR_API_URL && AGENT_API_KEY),
    direct_parser_enabled: Boolean(!N8N_WEBHOOK_URL && MODO_SABOR_API_URL && AGENT_API_KEY),
    events: events.slice(0, 20),
  });
});

app.get('/api/qr', (_req, res) => {
  res.json({ qr: currentQr, data_url: currentQrDataUrl });
});

app.get('/api/chats', (_req, res) => {
  const chats = Object.values(chatIndex)
    .sort((a, b) => String(b.ultimo_en || '').localeCompare(String(a.ultimo_en || '')))
    .slice(0, 30);
  res.json(chats);
});

app.post('/api/chats/disparar', async (req, res) => {
  try {
    const chatId = String(req.body?.chat_id || '').trim();
    if (!chatId) return res.status(400).json({ error: 'Falta chat_id' });
    await sendChatByIdToCopilot(chatId);
    rememberEvent('dale_ui_detectado', { chat_id: chatId });
    res.json({ ok: true });
  } catch (error) {
    lastError = error.message;
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/test-disparo', async (req, res) => {
  try {
    await sendPayloadToDestination({
      comando: '#dale',
      origen: 'whatsapp-web-bridge-test',
      chat_id: 'test-local',
      telefono: '3810000000',
      nombre: 'Cliente prueba',
      mensajes: [
        {
          from_me: false,
          telefono: '3810000000',
          nombre: 'Cliente prueba',
          texto:
            req.body?.texto ||
            'Hola quiero una Smash Simple y una Pepsi lata para delivery en San Martin 969, pago efectivo',
          enviado_en: new Date().toISOString(),
        },
      ],
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/test-pedido-json', async (req, res) => {
  try {
    const payload = {
      comando: '#dale',
      origen: 'whatsapp-web-bridge-test',
      chat_id: 'test-local-json',
      telefono: String(req.body?.telefono || '3810000000'),
      nombre: String(req.body?.nombre || 'Cliente prueba'),
      mensajes: [
        {
          from_me: false,
          telefono: String(req.body?.telefono || '3810000000'),
          nombre: String(req.body?.nombre || 'Cliente prueba'),
          texto:
            req.body?.texto ||
            'Hola quiero una Smash Simple y una Pepsi lata para delivery en San Martin 969, pago efectivo',
          enviado_en: new Date().toISOString(),
        },
      ],
    };
    res.json(await buildLocalPedidoJson(payload));
  } catch (error) {
    res.status(500).json({ error: formatError(error) });
  }
});

app.listen(PORT, HOST, () => {
  rememberEvent('server', { url: `http://${HOST}:${PORT}`, host: HOST });
  if (HOST !== '127.0.0.1' && !BRIDGE_API_KEY) {
    /* Un puente abierto a la red sin clave regala el WhatsApp del local.
       Se avisa fuerte en vez de arrancar en silencio. */
    console.error(
      `\n  ATENCION: el puente esta escuchando en ${HOST} sin BRIDGE_API_KEY.\n` +
        '  Cualquiera en la red puede pedir el QR y vincular el WhatsApp del local.\n'
    );
  }
});

client.initialize().catch((error) => {
  lastError = formatError(error);
  rememberEvent('init_error', { error: lastError, stack: error?.stack });
});

hydrateChatIndexFromHistory();
