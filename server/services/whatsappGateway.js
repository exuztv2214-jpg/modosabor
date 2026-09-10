const fs = require('fs');
const path = require('path');
const db = require('../db');
const logger = require('../utils/logger');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { getConfigMap } = require('../utils/mercadoPago');
const { uploadsDir } = require('../utils/storagePaths');
const {
  findClienteByPhone,
  getCustomerSnapshot,
  getLastOrderByPhone,
  getMenuDiaToday,
  cleanText,
} = require('../utils/systemClient');
const { emitAtencionHumana, emitNuevoPedido } = require('../utils/socketRooms');
const { transcribeWhatsappAudio } = require('./whatsappAudioTranscription');
const { buildAgentTraining } = require('./whatsappAgentTraining');
const { atenderConMotorPropio, elegirMotorWhatsapp } = require('./agenteWhatsapp');
const { crearAgrupadorMensajes } = require('./agruparMensajes');
const { crearControl } = require('./controlWhatsapp');
const { marcarEnviada } = require('./confirmacionWhatsapp');
const { registrarRespuesta } = require('./whatsappMasivo/motor');
const { deJid } = require('./whatsappMasivo/telefono');
const { conexion } = require('./whatsappMasivo/conexion');

/*
  El socket del panel, para poder avisar cuando un chat necesita una persona.

  Lo guarda `iniciarWhatsappGateway` al arrancar. Si por lo que sea no está, se
  sigue atendiendo igual: el aviso es un extra, no una condición para responder.
*/
let socketDelPanel = null;

/** Avisa al panel que este chat quedó esperando a una persona. */
function pedirUnaPersona(conversation, telefono, motivo) {
  if (!socketDelPanel) return;
  try {
    emitAtencionHumana(socketDelPanel, {
      telefono,
      nombre: conversation?.nombre || '',
      conversacionId: conversation?.id || null,
      motivo,
    });
  } catch (error) {
    // Que falle el aviso no puede tumbar la atención del chat.
    logger.warn('WhatsApp Gateway: no pudo avisar que hace falta una persona', {
      message: error.message,
    });
  }
}

// Estos valores deben funcionar dentro de Railway aunque no exista ninguna PC
// del local encendida. Las variables de entorno pueden reemplazarlos, pero el
// servidor nunca debe caer silenciosamente a localhost en producción.
const DEFAULT_WEBHOOK = 'https://n8n-production-f8ed.up.railway.app/webhook/modosabor-atencion-web';
const DEFAULT_FALLBACK_WEBHOOK =
  'https://n8n-production-f8ed.up.railway.app/webhook/modosabor-atencion-web-fallback';
const seen = new Set();
const processingByChat = new Map();
let iniciado = false;
let recibidos = 0;
let respondidos = 0;
let ultimoError = '';
let ultimaActividad = '';
const CARTA_CAPTIONS = [
  'Hamburguesas',
  'Milanesas',
  'Pizzas',
  'Sándwiches',
  'Empanadas, papas y bebidas',
];

function configValue(key, fallback = '') {
  const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(key);
  return row ? String(row.valor ?? '') : fallback;
}

function enabled(key, fallback = false) {
  return configValue(key, fallback ? '1' : '0') === '1';
}

function safeWebhookUrl(value, fallback) {
  const candidate = String(value || '').trim() || fallback;
  if (
    process.env.NODE_ENV === 'production' &&
    /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|host\.docker\.internal)(?::|\/|$)/i.test(candidate)
  ) {
    return fallback;
  }
  return candidate;
}

function gatewayConfig() {
  const emergencyEnabled = enabled('whatsapp_emergencia_activa', true);
  return {
    pausaTotal: enabled('whatsapp_gateway_pausa_total', false),
    atencionIa: enabled('whatsapp_atencion_ia_activa', false),
    masivos: enabled('whatsapp_masivos_activo', false),
    // Un solo motor canónico: reglas, memoria, herramientas e idempotencia
    // viven en el backend. Gemini es el respaldo del proveedor, no otro flujo.
    motorPropio: true,
    agruparMs: Math.min(
      8000,
      Math.max(0, Number(configValue('whatsapp_agrupar_ms', '2000')) || 2000)
    ),
    webhook: safeWebhookUrl(
      String(process.env.WHATSAPP_AGENT_WEBHOOK_URL || '').trim() ||
        configValue('whatsapp_agente_webhook_url', DEFAULT_WEBHOOK),
      DEFAULT_WEBHOOK
    ),
    fallbackWebhook: emergencyEnabled
      ? safeWebhookUrl(
          String(process.env.WHATSAPP_AGENT_FALLBACK_WEBHOOK_URL || '').trim() ||
            configValue('whatsapp_agente_fallback_webhook_url', DEFAULT_FALLBACK_WEBHOOK),
          DEFAULT_FALLBACK_WEBHOOK
        )
      : '',
  };
}

function closedBusinessMessage(turnos = []) {
  const horarios = turnos
    .filter((turno) => turno?.desde && turno?.hasta)
    .map((turno) => `${turno.nombre || 'Turno'}: ${turno.desde} a ${turno.hasta}`)
    .join(' · ');
  return horarios
    ? `¡Hola! Gracias por escribir a Modo Sabor. En este momento el local está cerrado. Nuestros horarios son: ${horarios}. Escribinos en ese horario y preparamos algo rico para vos 😊`
    : '¡Hola! Gracias por escribir a Modo Sabor. En este momento el local está cerrado. Escribinos más tarde y preparamos algo rico para vos 😊';
}

function textFromMessage(message) {
  let content = message?.message || {};
  while (true) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  return String(
    content.conversation ||
      content.extendedTextMessage?.text ||
      content.imageMessage?.caption ||
      content.videoMessage?.caption ||
      ''
  ).trim();
}

function typeFromMessage(message) {
  let content = message?.message || {};
  while (true) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  if (content.audioMessage) return 'audio';
  if (content.imageMessage) return 'imagen';
  if (content.videoMessage) return 'video';
  if (content.documentMessage) return 'documento';
  return 'texto';
}

function phoneFromMessage(message) {
  const candidates = [
    message?.key?.remoteJidAlt,
    message?.key?.participantAlt,
    message?.key?.remoteJid,
  ].filter(Boolean);
  const preferred = candidates.find((jid) => String(jid).endsWith('@s.whatsapp.net'));
  return deJid(preferred || candidates[0]);
}

function upsertConversation(telefono, nombre = '') {
  db.prepare(
    `INSERT INTO whatsapp_conversaciones
       (telefono, nombre, ultimo_estado, ultimo_mensaje_en, actualizado_en)
     VALUES (?, ?, 'atencion', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(telefono) DO UPDATE SET
       nombre = CASE WHEN excluded.nombre != '' THEN excluded.nombre ELSE nombre END,
       ultimo_mensaje_en = CURRENT_TIMESTAMP,
       actualizado_en = CURRENT_TIMESTAMP`
  ).run(telefono, nombre);
  const conversation = db
    .prepare(
      `SELECT *,
              CASE
                WHEN bot_silenciado = 1 AND bot_silenciado_hasta IS NULL THEN 1
                WHEN bot_silenciado_hasta > CURRENT_TIMESTAMP THEN 1
                ELSE 0
              END AS pausa_humana
         FROM whatsapp_conversaciones WHERE telefono = ?`
    )
    .get(telefono);
  if (conversation?.bot_silenciado && !conversation.pausa_humana) {
    db.prepare(
      `UPDATE whatsapp_conversaciones
          SET bot_silenciado = 0, escalado_humano = 0, bot_silenciado_hasta = NULL
        WHERE id = ?`
    ).run(conversation.id);
    return { ...conversation, bot_silenciado: 0, escalado_humano: 0, pausa_humana: 0 };
  }
  return conversation;
}

function usableWhatsappName(value) {
  const name = cleanText(value).slice(0, 100);
  if (!name || /^\+?\d+$/.test(name)) return '';
  return name;
}

function nombreDeclaradoPorCliente(texto) {
  const match = String(texto || '').match(
    /\b(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([a-záéíóúüñ][a-záéíóúüñ' -]{1,80})/i
  );
  if (!match) return '';
  const nombre = usableWhatsappName(match[1].replace(/[,.!?:;].*$/, '').trim());
  // “Soy de la esquina” o “soy el que…” no son nombres: nunca los usemos
  // para ensuciar una ficha de cliente por una frase común.
  if (/^(?:el|la|un|una|de|para|quien|que)\b/i.test(nombre)) return '';
  return nombre;
}

function syncCustomerFromWhatsapp(telefono, whatsappName = '', nombreDeclarado = '') {
  const existing = findClienteByPhone(db, telefono);
  const visibleName = usableWhatsappName(whatsappName);
  const explicitName = usableWhatsappName(nombreDeclarado);
  if (existing) {
    const nombreCanonico = explicitName || cleanText(existing.nombre) || visibleName;
    if (nombreCanonico && nombreCanonico !== cleanText(existing.nombre)) {
      db.prepare('UPDATE clientes SET nombre = ? WHERE id = ?').run(nombreCanonico, existing.id);
      return { ...existing, nombre: nombreCanonico };
    }
    return existing;
  }
  const nombreNuevo = explicitName || visibleName;
  const result = db
    .prepare("INSERT INTO clientes (nombre, telefono, direccion, notas) VALUES (?, ?, '', ?)")
    .run(nombreNuevo, telefono, 'Alta automática desde WhatsApp');
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
}

function asksForCarta(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/menu\s+del\s+dia/.test(normalized)) return false;
  /*
    "Ver el menú" no significa necesariamente "mandame las cinco imágenes".
    A la mañana los clientes lo usan para preguntar qué hay de menú del día;
    si lo clasificamos como carta antes de mirar el turno, salteamos la oferta
    vigente y mandamos cinco imágenes sin que las hayan pedido. La carta se
    dispara únicamente ante una petición inequívoca.
  */
  return /\b(carta|menu completo|menu de la carta)\b/.test(normalized);
}

function normalizeIntentText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9$\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldAnswerMenuDayDirectly(text, recentHistory = '') {
  const current = normalizeIntentText(text);
  if (
    /\b(?:envio|direccion|demora|tarda|falta|mi pedido|transferencia|pago|cancelar|reclamo)\b/.test(
      current
    )
  ) {
    return false;
  }
  const history = normalizeIntentText(recentHistory);
  const asksGeneralMenu =
    /\b(?:q|que|cual|cuales|lista|mostrar|mostrame|ver)\b.*\bmenu\b/.test(current) ||
    /\bmenu(?:s)?\s+(?:del\s+dia|de\s+hoy|economico|economicos|ejecutivo|ejecutivos)\b/.test(
      current
    );
  const asksPrices = /\b(?:cuanto|cuantos|precio|precios|vale|valen|sale|salen)\b/.test(current);
  const recentMenuContext =
    /\bmenu(?:s)?\s+(?:del\s+dia|de\s+hoy|economico|economicos|ejecutivo|ejecutivos)\b/.test(
      history
    );
  const affirmative = /^(?:si|dale|bueno|ok|okay|por favor)$/.test(current);
  const offeredAllPrices = /(?:precio|precios).{0,80}(?:demas|todos).{0,80}menu\s+del\s+dia/.test(
    history
  );
  const correctsWrongMenu = /^(?:eso\s+no|no\s+son|esos\s+no|esta\s+mal)/.test(current);

  /*
    En el turno de la mañana, "qué hay" es la forma más común de pedir el
    menú del día. No debe depender de que el modelo recuerde consultar la foto
    fechada: el gateway la lee del servidor y nunca mezcla platos históricos.
    Excluimos categorías concretas para que "qué pizzas hay" siga yendo al
    catálogo de pizzas, no al menú diario.
  */
  const asksGenericOffer =
    /\b(?:que\s+hay|que\s+tienen|que\s+venden|que\s+ofrecen|hay\s+para\s+comer)\b/.test(current) &&
    !/\b(?:pizza|empanada|hamburguesa|milanesa|mila|lomito|sandwich|sanguche|papa|bebida|gaseosa|pepsi|jugo|pasta|fideo|raviol|canelon|noqui)\b/.test(
      current
    );

  return (
    asksGeneralMenu ||
    asksGenericOffer ||
    (asksPrices && recentMenuContext) ||
    (affirmative && offeredAllPrices) ||
    (correctsWrongMenu && recentMenuContext)
  );
}

function requestedMenuDayKind(text, recentHistory = '') {
  const current = normalizeIntentText(text);
  if (/\beconomico(?:s)?\b/.test(current)) return 'economico';
  if (/\bejecutivo(?:s)?\b/.test(current)) return 'ejecutivo';

  // Sólo heredamos el grupo ante una corrección explícita. En "cuánto valen"
  // o "sí" corresponde mostrar ambos, aunque el historial mencione primero
  // económicos y después ejecutivos.
  if (/^(?:eso\s+no|no\s+son|esos\s+no|esta\s+mal)/.test(current)) {
    const history = normalizeIntentText(recentHistory);
    const economicIndex = Math.max(
      history.lastIndexOf('economico'),
      history.lastIndexOf('economicos')
    );
    const executiveIndex = Math.max(
      history.lastIndexOf('ejecutivo'),
      history.lastIndexOf('ejecutivos')
    );
    if (economicIndex > executiveIndex) return 'economico';
    if (executiveIndex > economicIndex) return 'ejecutivo';
  }
  return '';
}

function buildMenuDayReply(products = [], requestedKind = '') {
  if (!products.length) return 'Hoy no quedan platos disponibles del menú del día.';

  const groups = new Map();
  const add = (label, priceText, productName) => {
    const key = `${label}|${priceText}`;
    if (!groups.has(key)) groups.set(key, { label, priceText, names: [] });
    const group = groups.get(key);
    if (!group.names.includes(productName)) group.names.push(productName);
  };

  products.forEach((product) => {
    const sizes = (product.opciones_detalle || []).find(
      (group) => normalizeIntentText(group?.grupo) === 'tamano'
    )?.opciones;
    if (Array.isArray(sizes) && sizes.length) {
      sizes.forEach((size) => {
        const executive = normalizeIntentText(size?.nombre).includes('ejecutivo');
        const kind = executive ? 'ejecutivo' : 'economico';
        if (requestedKind && requestedKind !== kind) return;
        add(executive ? 'Ejecutivos' : 'Económicos', size.precio_texto, product.nombre);
      });
      return;
    }
    if (requestedKind && requestedKind !== product.tipo_menu_dia) return;
    add(
      product.tipo_menu_dia === 'ejecutivo' ? 'Ejecutivos' : 'Económicos',
      product.precio_desde_texto,
      product.nombre
    );
  });

  if (!groups.size) {
    const label = requestedKind === 'ejecutivo' ? 'ejecutivos' : 'económicos';
    return `Hoy no quedan menús ${label} disponibles.`;
  }

  const lines = ['El menú disponible hoy es:'];
  for (const group of groups.values()) {
    lines.push(`\n*${group.label} (${group.priceText}):*`);
    group.names.forEach((name) => lines.push(`- ${name}`));
  }
  lines.push('\nDecime cuál querés y, si lleva salsa o guarnición, te paso las opciones.');
  return lines.join('\n');
}

async function sendCarta(jid, conversation, telefono) {
  for (let index = 0; index < CARTA_CAPTIONS.length; index += 1) {
    const file = path.join(uploadsDir, 'whatsapp-carta', `${index + 1}.png`);
    if (!fs.existsSync(file)) throw new Error(`Falta la imagen ${index + 1} de la carta`);
    const caption =
      index === 0 ? `Carta de Modo Sabor · ${CARTA_CAPTIONS[index]}` : CARTA_CAPTIONS[index];
    await conexion.enviarImagen(jid, fs.readFileSync(file), caption);
    saveMessage(conversation.id, telefono, 'saliente', 'imagen', caption, {
      origen: 'sistema',
      carta_pagina: index + 1,
    });
  }
  const closing = 'Ahí tenés la carta completa 😊 Decime qué querés pedir.';
  await conexion.enviarTexto(jid, closing);
  saveMessage(conversation.id, telefono, 'saliente', 'texto', closing, { origen: 'sistema' });
}

function saveMessage(conversationId, telefono, direction, type, content, payload = {}) {
  db.prepare(
    `INSERT INTO whatsapp_mensajes
       (conversacion_id, telefono, direccion, tipo, contenido, payload, whatsapp_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    conversationId,
    telefono,
    direction,
    type,
    String(content || '').slice(0, 8000),
    JSON.stringify(payload),
    String(payload.whatsapp_id || '')
  );
}

function historyFor(conversationId) {
  return db
    .prepare(
      `SELECT direccion, contenido, creado_en
         FROM whatsapp_mensajes
        WHERE conversacion_id = ?
          AND datetime(creado_en) >= datetime(
                (SELECT MAX(creado_en) FROM whatsapp_mensajes WHERE conversacion_id = ?),
                '-45 minutes'
              )
        -- Doce turnos alcanzan para un pedido completo y evitan que pruebas o
        -- conversaciones viejas contradigan lo que el cliente está pidiendo
        -- ahora. El contexto técnico se valida siempre contra el catálogo.
        ORDER BY id DESC LIMIT 12`
    )
    .all(conversationId, conversationId)
    .reverse()
    .map((item) => `${item.direccion === 'entrante' ? 'Cliente' : 'Chispita'}: ${item.contenido}`)
    .join('\n');
}

async function callAgent(payload, webhook) {
  // n8n y el SDK del modelo ya reintentan internamente. Repetir además desde
  // el gateway convertía un límite de cuota en varios minutos sin respuesta.
  // Ante cualquier falla, handleIncoming pasa de inmediato al proveedor real
  // de respaldo.
  const response = await fetch(webhook, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-telefono': String(payload?.telefono || ''),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`n8n ${response.status}: ${raw.slice(0, 240)}`);
  }
  const data = JSON.parse(raw);
  const output = String(data.output || data.text || '').trim();
  if (!output) throw new Error('n8n no devolvio una respuesta');
  return output;
}

function claimsOrderWasCreated(output) {
  const normalized = cleanText(output)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized
    .split(/[.!?\n]+/)
    .some(
      (frase) =>
        !/\b(?:no|todavia no|aun no|sin|cuando|si confirmas)\b/.test(frase) &&
        /(?:pedido (?:fue |ha sido |esta |quedo )?(?:cargado|creado|tomado|confirmado|en camino)|ya lo pase a cocina|listo.{0,30}pedido|sale en \d+)/i.test(
          frase
        )
    );
}

function usesExternalAgentCatalog() {
  const configuredApi = configValue(
    'whatsapp_agente_catalogo_url',
    String(process.env.WHATSAPP_AGENT_CATALOG_URL || '')
  ).trim();
  if (configuredApi) return !/127\.0\.0\.1|localhost|host\.docker\.internal/i.test(configuredApi);
  return false;
}

function externalAgentBaseUrl() {
  return configValue(
    'whatsapp_agente_catalogo_url',
    String(process.env.WHATSAPP_AGENT_CATALOG_URL || '')
  )
    .trim()
    .replace(/\/+$/, '');
}

/**
 * La sesión de WhatsApp puede estar en una PC de prueba mientras que n8n usa
 * el catálogo publicado. En ese caso el pedido no aparecerá en la SQLite local
 * y validar sólo contra ella bloqueaba una venta real. Consultamos la misma API
 * que usa el agente, sin exponer su clave ni asumir que un texto del modelo es
 * suficiente evidencia.
 */
async function getExternalLastOrderByPhone(telefono) {
  const baseUrl = externalAgentBaseUrl();
  const key = String(process.env.AGENT_API_KEY || '').trim();
  if (!baseUrl || !key) return null;
  const response = await fetch(
    `${baseUrl}/api/agente/pedido-actual?telefono=${encodeURIComponent(telefono)}`,
    {
      headers: { 'x-agent-key': key },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!response.ok) throw new Error(`No se pudo verificar el pedido remoto (${response.status})`);
  const body = await response.json();
  return body?.encontrado && body?.pedido ? body.pedido : null;
}

function createdWhatsappOrderAfter(telefono, previousOrderId) {
  const order = getLastOrderByPhone(db, telefono);
  if (!order || String(order.origen || '').toLowerCase() !== 'whatsapp') return null;
  return Number(order.id || 0) > Number(previousOrderId || 0) ? order : null;
}

async function handleIncoming(message) {
  if (message.mensajesOriginales) {
    const originales = message.mensajesOriginales.filter(
      (item) =>
        !db
          .prepare('SELECT 1 FROM whatsapp_mensajes WHERE whatsapp_message_id = ?')
          .get(String(item.key?.id || ''))
    );
    if (!originales.length) return;
    message = combinarMensajes(originales);
  }
  const jid = String(message?.key?.remoteJid || '');
  // WhatsApp hoy suele entregar el chat como @lid y el teléfono real en
  // remoteJidAlt. Guardar el LID como teléfono rompe el historial y la ficha
  // del cliente, aunque responder al chat sí debe hacerse sobre remoteJid.
  const telefono = phoneFromMessage(message);
  const id = String(message?.key?.id || '');
  if (!telefono || !id || seen.has(id)) return;
  if (db.prepare('SELECT 1 FROM whatsapp_mensajes WHERE whatsapp_message_id = ?').get(id)) return;
  seen.add(id);
  if (seen.size > 2000) seen.delete(seen.values().next().value);

  const text = textFromMessage(message);
  const type = typeFromMessage(message);
  const requiereRevision = ['imagen', 'video', 'documento'].includes(type);
  let usableText = text || (requiereRevision ? `[${type} recibido: requiere revisión humana]` : '');
  let transcriptionError = null;
  if (!usableText && type === 'audio') {
    try {
      usableText = await transcribeWhatsappAudio(message, conexion);
    } catch (error) {
      transcriptionError = error;
      usableText = '[audio recibido sin transcripción]';
    }
  }
  if (!usableText) return;

  const direction = message?.key?.fromMe ? 'saliente' : 'entrante';
  const nombreDeclarado = direction === 'entrante' ? nombreDeclaradoPorCliente(usableText) : '';
  const customer = syncCustomerFromWhatsapp(telefono, message?.pushName || '', nombreDeclarado);
  const knownName = customer?.nombre || message?.pushName || '';
  const conversation = upsertConversation(telefono, knownName);
  const originales = message.mensajesOriginales || [message];
  for (const original of originales) {
    saveMessage(
      conversation.id,
      telefono,
      direction,
      type,
      message.mensajesOriginales ? textFromMessage(original) : usableText,
      {
        whatsapp_id: String(original.key.id),
        transcripto: type === 'audio' && !transcriptionError,
      }
    );
  }

  if (message?.key?.fromMe && !message.enviadoPorSistema) {
    // Cuando alguien responde desde el teléfono, la IA se retira de ese chat.
    db.prepare(
      `UPDATE whatsapp_conversaciones
          SET bot_silenciado = 1,
              escalado_humano = 1,
              bot_silenciado_hasta = datetime('now', '+30 minutes'),
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(conversation.id);
    ultimaActividad = `Atencion humana en ${telefono}`;
    return;
  }
  if (message?.key?.fromMe) return;

  recibidos += 1;
  registrarRespuesta({ telefono, texto: usableText, mensajeId: id });
  const config = gatewayConfig();
  if (config.pausaTotal || !config.atencionIa || conversation.pausa_humana) return;

  if (requiereRevision) {
    db.prepare(
      `UPDATE whatsapp_conversaciones SET bot_silenciado = 1, escalado_humano = 1,
      bot_silenciado_hasta = NULL, ultimo_estado = 'esperando_humano',
      ultimo_contexto = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(`Revisar ${type} en el WhatsApp del local`, conversation.id);
    pedirUnaPersona(conversation, telefono, `Revisar ${type} en el WhatsApp del local`);
    const respuesta =
      'Recibí tu archivo. Una persona del local tiene que revisarlo; si es un comprobante, el pago todavía está pendiente de verificación.';
    await conexion.enviarTexto(jid, respuesta);
    saveMessage(conversation.id, telefono, 'saliente', 'texto', respuesta, { origen: 'sistema' });
    return;
  }

  if (transcriptionError) {
    const fallback =
      'No pude escuchar bien ese audio. ¿Me lo escribís en un mensaje así tomo el pedido?';
    await conexion.enviarTexto(jid, fallback);
    saveMessage(conversation.id, telefono, 'saliente', 'texto', fallback, {
      origen: 'sistema',
      motivo: 'audio_no_transcripto',
    });
    ultimoError = `Audio no transcripto para ${telefono}: ${transcriptionError.message}`;
    ultimaActividad = `Audio no transcripto de ${telefono}`;
    return;
  }

  // Guardamos el último pedido antes de llamar al agente. Si algo falla,
  // esto permite distinguir un error común de una respuesta ambigua después
  // de haber creado un pedido. Sólo el segundo caso necesita intervención
  // humana para evitar que un reintento duplique la venta.
  const previousOrder = getLastOrderByPhone(db, telefono);
  const control = crearControl(db, telefono);
  let pedidoConsultado = null;

  try {
    await conexion.enviarPresencia(jid, 'composing');
    const businessConfig = getConfigMap(db);
    const currentShift = getCurrentShiftInfo(businessConfig);
    if (!currentShift.abierto_ahora) {
      const closedReply = closedBusinessMessage(currentShift.turnos);
      await conexion.enviarTexto(jid, closedReply);
      saveMessage(conversation.id, telefono, 'saliente', 'texto', closedReply, {
        origen: 'sistema',
        motivo: 'fuera_de_horario',
      });
      await conexion.enviarPresencia(jid, 'paused');
      respondidos += 1;
      ultimoError = '';
      ultimaActividad = `Horario informado a ${telefono}`;
      return;
    }
    if (type === 'texto' && asksForCarta(usableText)) {
      await sendCarta(jid, conversation, telefono);
      await conexion.enviarPresencia(jid, 'paused');
      respondidos += 1;
      ultimoError = '';
      ultimaActividad = `Carta enviada a ${telefono}`;
      return;
    }
    const recentHistory = historyFor(conversation.id);
    if (
      type === 'texto' &&
      currentShift.turno_actual?.id === 'manana' &&
      shouldAnswerMenuDayDirectly(usableText, recentHistory)
    ) {
      const menuDayReply = buildMenuDayReply(
        getMenuDiaToday(db),
        requestedMenuDayKind(usableText, recentHistory)
      );
      await conexion.enviarTexto(jid, menuDayReply);
      await conexion.enviarPresencia(jid, 'paused');
      saveMessage(conversation.id, telefono, 'saliente', 'texto', menuDayReply, {
        origen: 'sistema',
        motivo: 'menu_dia_vigente',
      });
      respondidos += 1;
      ultimoError = '';
      ultimaActividad = `Menú del día informado a ${telefono}`;
      return;
    }
    const externalCatalog = !config.motorPropio && usesExternalAgentCatalog();
    // Es deliberadamente no bloqueante: si la consulta externa no está
    // disponible, el flujo conserva las validaciones locales y n8n devolverá
    // su propio error al intentar crear un pedido.
    let previousExternalOrder = null;
    if (externalCatalog) {
      try {
        previousExternalOrder = await getExternalLastOrderByPhone(telefono);
      } catch (error) {
        logger.warn('WhatsApp Gateway: no pudo leer pedido remoto previo', {
          telefono,
          message: error.message,
        });
      }
    }
    const agentPayload = {
      // Versionar la memoria descarta las reglas viejas de conversaciones
      // abiertas antes de este cambio operativo.
      sessionId: `wa:v3:${telefono}`,
      mensaje_id: id,
      telefono,
      nombre: knownName || conversation.nombre || '',
      tipo: type,
      texto: usableText,
      historial: recentHistory,
      /*
        ── Quién es el que escribe ────────────────────────────────────────────

        Esto ya existía como herramienta que la IA *podía* pedir, pero no
        viajaba con el mensaje. O sea que arrancaba cada charla a ciegas: sin
        saber si era un cliente de años o alguien que escribe por primera vez,
        sin su dirección, sin lo que pidió la última vez.

        Un mozo no consulta si te conoce: te conoce cuando entrás. Por eso va
        en el mensaje y no como una herramienta que quizás se llame.

        Trae el nombre, cuántos pedidos hizo, sus direcciones guardadas con la
        etiqueta que les pusieron —"Casa", "Trabajo"— y el último pedido. Con
        eso puede saludar por el nombre, dar por sabida la dirección de siempre
        y ofrecer lo que suele pedir.
      */
      cliente: (() => {
        try {
          return getCustomerSnapshot(db, telefono);
        } catch (error) {
          // Sin la ficha se atiende igual, como se venía atendiendo hasta hoy.
          logger.warn('WhatsApp Gateway: no pudo leer la ficha del cliente', {
            telefono,
            message: error.message,
          });
          return null;
        }
      })(),
      abierto_ahora: currentShift.abierto_ahora,
      turno_actual: currentShift.turno_actual,
      atencion: buildAgentTraining(businessConfig, currentShift.turno_actual),
    };
    const llamarN8n = async (payload) => {
      try {
        return await callAgent(payload, config.webhook);
      } catch (primaryError) {
        if (!config.fallbackWebhook || config.fallbackWebhook === config.webhook) {
          throw primaryError;
        }
        logger.warn('WhatsApp Gateway: usando proveedor alternativo', {
          message: primaryError.message,
        });
        return callAgent(payload, config.fallbackWebhook);
      }
    };
    let output = await elegirMotorWhatsapp({
      usarMotorPropio: config.motorPropio,
      payload: agentPayload,
      llamarN8n,
      llamarMotor: (payload) =>
        atenderConMotorPropio(payload, {
          assertControl: control.assertControl,
          dependenciasPedido: { assertControl: control.assertControl },
          onPedidoConsultado: (resultado) => {
            if (resultado?.encontrado && resultado?.pedido) pedidoConsultado = resultado.pedido;
          },
          onHandoff: (motivo) => {
            control.aceptarDerivacion();
            pedirUnaPersona(conversation, telefono, motivo);
          },
          onPedidoCreado: (pedido) => {
            if (socketDelPanel) emitNuevoPedido(socketDelPanel, pedido);
          },
        }),
    });

    const createdOrder = createdWhatsappOrderAfter(telefono, previousOrder?.id);
    let createdExternalOrder = null;
    if (externalCatalog && claimsOrderWasCreated(output)) {
      try {
        const externalOrder = await getExternalLastOrderByPhone(telefono);
        if (
          externalOrder &&
          String(externalOrder.id || '') !== String(previousExternalOrder?.id || '')
        ) {
          createdExternalOrder = externalOrder;
        }
      } catch (error) {
        logger.warn('WhatsApp Gateway: no pudo validar pedido remoto creado', {
          telefono,
          message: error.message,
        });
      }
    }
    let integrityError = '';
    /*
      ── Por qué se sacó el permiso por "trae un número" ─────────────────────

      Acá había una condición más:

          (!externalCatalog || !includesOrderNumber(output))

      Con el catálogo externo configurado —que es el caso, `whatsapp_agente_
      catalogo_url` apunta al sitio— eso apagaba el control **cada vez que el
      modelo escribía un número**. Le alcanzaba con decir "es el #243" para
      pasar de largo.

      O sea que el número inventado por el modelo se usaba como prueba de que
      el pedido existía, tres líneas debajo de un comentario que dice que la
      frase del modelo no es evidencia.

      Se vio en una conversación real: "Pedido confirmado, es el #243. Va en
      camino", dos veces seguidas, sin ninguna llamada a la herramienta de
      crear pedido registrada.

      La prueba de que el pedido existe es una sola: haberlo encontrado en la
      base local (`createdOrder`) o en la remota (`createdExternalOrder`). Si
      la verificación remota falla por red, se prefiere pecar de prudente:
      decirle al cliente que todavía no quedó confirmado y pasarle el chat a
      una persona. Molesta, pero no deja a nadie esperando una comida que
      nadie está cocinando.
    */
    control.assertControl();
    if (
      claimsOrderWasCreated(output) &&
      !createdOrder &&
      !createdExternalOrder &&
      !pedidoConsultado
    ) {
      // La frase del modelo no es evidencia: el pedido debe existir realmente.
      // Si no existe, nunca se confirma al cliente y se entrega el chat a una
      // persona para evitar pérdida de ventas o preparación fantasma.
      // Sin tiempo límite: una persona tiene que intervenir sí o sí.
      // Antes se ponía +30 minutos y el bot volvía solo aunque nadie
      // hubiera contestado. Un cliente esperó 42 minutos por esto.
      db.prepare(
        `UPDATE whatsapp_conversaciones
            SET bot_silenciado = 1,
                escalado_humano = 1,
                bot_silenciado_hasta = NULL,
                ultimo_estado = 'esperando_humano',
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id = ?`
      ).run(conversation.id);
      pedirUnaPersona(conversation, telefono, 'La IA dijo que creó un pedido que no existe');
      output =
        'Todavía no pude registrar el pedido en el sistema. No quedó confirmado; ya te atiende una persona del local para cargarlo bien.';
      integrityError = `La IA afirmo crear un pedido inexistente para ${telefono}`;
      ultimoError = integrityError;
      logger.error('WhatsApp Gateway: confirmacion de pedido bloqueada', { telefono });
    }
    await conexion.enviarTexto(jid, output);
    marcarEnviada(db, telefono, output);
    await conexion.enviarPresencia(jid, 'paused');
    saveMessage(conversation.id, telefono, 'saliente', 'texto', output, { origen: 'ia' });
    db.prepare(
      `UPDATE whatsapp_conversaciones
          SET ultima_respuesta_en = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(conversation.id);
    respondidos += 1;
    ultimoError = integrityError;
    ultimaActividad = `IA respondio a ${telefono}`;
  } catch (error) {
    if (error?.code === 'WHATSAPP_CONTROL_CHANGED') return;
    try {
      control.assertControl();
    } catch {
      return;
    }
    ultimoError = error.message;
    ultimaActividad = `Error atendiendo a ${telefono}`;
    logger.error('WhatsApp Gateway: fallo la atencion IA', { message: error.message, telefono });
    const orderCreatedDuringFailure = createdWhatsappOrderAfter(telefono, previousOrder?.id);
    // Si apareció un pedido nuevo durante la llamada, el resultado es ambiguo:
    // la tool alcanzó a crearlo pero falló al devolver la respuesta. Nunca
    // reintentamos automáticamente porque duplicaría pedidos. En su lugar,
    // avisamos al cliente y entregamos el chat a una persona del local.
    // Sin tiempo límite: la persona tiene que devolver el chat a mano.
    // Si el bot vuelve solo sin que nadie haya contestado, el cliente
    // queda entre dos silencios.
    db.prepare(
      `UPDATE whatsapp_conversaciones
          SET bot_silenciado = 1,
              escalado_humano = 1,
              bot_silenciado_hasta = NULL,
              ultimo_estado = 'esperando_humano',
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(conversation.id);
    // También sin pedido creado: no dejar al cliente repitiendo mensajes
    // contra una cuota agotada o un proveedor caído. Conservar el borrador.
    pedirUnaPersona(
      conversation,
      telefono,
      'La atención automática falló. Revisá la conversación y el borrador antes de confirmar.'
    );
    const fallback = orderCreatedDuringFailure
      ? 'Hubo un problema al responder después de cargar el pedido. Le dejé un aviso a una persona del local para que lo verifique.'
      : 'No pude completar la atención automática. Le dejé un aviso a una persona del local para que revise tu consulta.';
    try {
      await conexion.enviarPresencia(jid, 'paused');
      await conexion.enviarTexto(jid, fallback);
      saveMessage(conversation.id, telefono, 'saliente', 'texto', fallback, {
        origen: 'sistema',
        motivo: 'error_agente',
      });
      ultimaActividad = `Derivado a una persona: ${telefono}`;
    } catch (sendError) {
      logger.error('WhatsApp Gateway: no pudo avisar la derivacion', {
        message: sendError.message,
        telefono,
      });
    }
  }
}

function serializeByKey(key, task) {
  const queueKey = String(key || 'desconocido');
  const previous = processingByChat.get(queueKey) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (processingByChat.get(queueKey) === current) processingByChat.delete(queueKey);
    });
  processingByChat.set(queueKey, current);
  return current;
}

function combinarMensajes(mensajes) {
  mensajes = [...new Map(mensajes.map((item) => [item.key?.id, item])).values()];
  const ultimo = mensajes[mensajes.length - 1];
  const texto = mensajes.map(textFromMessage).filter(Boolean).join('\n');
  const ids = mensajes.map((item) => String(item?.key?.id || '')).filter(Boolean);
  return {
    ...ultimo,
    key: { ...ultimo.key, id: ids.join('+').slice(0, 240) },
    message: { conversation: texto },
    mensajesAgrupados: ids,
    mensajesOriginales: mensajes,
  };
}

const agrupadorMotorPropio = crearAgrupadorMensajes({
  procesar: (message) => {
    const key = phoneFromMessage(message) || String(message?.key?.remoteJid || 'desconocido');
    return serializeByKey(key, () => handleIncoming(message));
  },
  obtenerClave: phoneFromMessage,
  combinar: combinarMensajes,
  maxMs: 8000,
});

function enqueueIncoming(message) {
  const key = phoneFromMessage(message) || String(message?.key?.remoteJid || 'desconocido');
  if (message?.key?.fromMe && !message.enviadoPorSistema) {
    db.prepare(
      "UPDATE whatsapp_conversaciones SET bot_silenciado = 1, escalado_humano = 1, bot_silenciado_hasta = datetime('now', '+30 minutes') WHERE telefono = ?"
    ).run(key);
  }
  const config = gatewayConfig();
  const agrupar =
    config.motorPropio &&
    !message?.key?.fromMe &&
    typeFromMessage(message) === 'texto' &&
    Boolean(textFromMessage(message));
  if (agrupar) return agrupadorMotorPropio.agregar(message, config.agruparMs);
  return serializeByKey(key, () => handleIncoming(message));
}

function iniciarWhatsappGateway(io = null) {
  if (iniciado) return;
  iniciado = true;
  socketDelPanel = io;
  conexion.on('mensaje', (message) => {
    enqueueIncoming(message).catch((error) => {
      ultimoError = error.message;
      logger.error('WhatsApp Gateway: mensaje no procesado', { message: error.message });
    });
  });
}

function resumenGateway() {
  return { ...gatewayConfig(), recibidos, respondidos, ultimoError, ultimaActividad };
}

module.exports = {
  iniciarWhatsappGateway,
  resumenGateway,
  gatewayConfig,
  textFromMessage,
  typeFromMessage,
  phoneFromMessage,
  asksForCarta,
  shouldAnswerMenuDayDirectly,
  requestedMenuDayKind,
  buildMenuDayReply,
  usableWhatsappName,
  nombreDeclaradoPorCliente,
  claimsOrderWasCreated,
  enqueueIncoming,
  serializeByKey,
  safeWebhookUrl,
  closedBusinessMessage,
  combinarMensajes,
};
