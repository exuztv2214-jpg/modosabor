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
const { emitAtencionHumana } = require('../utils/socketRooms');
const { transcribeWhatsappAudio } = require('./whatsappAudioTranscription');
const { buildAgentTraining } = require('./whatsappAgentTraining');
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
    ? `Ahora estamos cerrados. Nuestros horarios son: ${horarios}. Cuando abramos, escribinos y te atendemos.`
    : 'Ahora estamos cerrados. Escribinos más tarde y te atendemos.';
}

function textFromMessage(message) {
  let content = message?.message || {};
  if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
  if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
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
  if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
  if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
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

function syncCustomerFromWhatsapp(telefono, whatsappName = '') {
  const existing = findClienteByPhone(db, telefono);
  const visibleName = usableWhatsappName(whatsappName);
  if (existing) {
    if (!cleanText(existing.nombre) && visibleName) {
      db.prepare('UPDATE clientes SET nombre = ? WHERE id = ?').run(visibleName, existing.id);
      return { ...existing, nombre: visibleName };
    }
    return existing;
  }
  if (!visibleName) return null;
  const result = db
    .prepare("INSERT INTO clientes (nombre, telefono, direccion, notas) VALUES (?, ?, '', ?)")
    .run(visibleName, telefono, 'Alta automática desde WhatsApp');
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
}

function asksForCarta(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/menu\s+del\s+dia/.test(normalized)) return false;
  return /\b(carta|menu completo|menu de la carta|ver el menu)\b/.test(normalized);
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

  return (
    asksGeneralMenu ||
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
       (conversacion_id, telefono, direccion, tipo, contenido, payload)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    conversationId,
    telefono,
    direction,
    type,
    String(content || '').slice(0, 8000),
    JSON.stringify(payload)
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
    headers: { 'content-type': 'application/json' },
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
  return /(pedido (?:fue |ha sido )?(?:cargado|creado|tomado|confirmado)|pedido esta en camino|listo.{0,30}pedido|sale en \d+)/i.test(
    normalized
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
  const jid = String(message?.key?.remoteJid || '');
  // WhatsApp hoy suele entregar el chat como @lid y el teléfono real en
  // remoteJidAlt. Guardar el LID como teléfono rompe el historial y la ficha
  // del cliente, aunque responder al chat sí debe hacerse sobre remoteJid.
  const telefono = phoneFromMessage(message);
  const id = String(message?.key?.id || '');
  if (!telefono || !id || seen.has(id)) return;
  seen.add(id);
  if (seen.size > 2000) seen.delete(seen.values().next().value);

  const text = textFromMessage(message);
  const type = typeFromMessage(message);
  let usableText = text;
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

  const customer = syncCustomerFromWhatsapp(telefono, message?.pushName || '');
  const knownName = customer?.nombre || message?.pushName || '';
  const conversation = upsertConversation(telefono, knownName);
  const direction = message?.key?.fromMe ? 'saliente' : 'entrante';
  if (direction === 'entrante') {
    const duplicate = db
      .prepare(
        `SELECT id FROM whatsapp_mensajes
          WHERE telefono = ? AND direccion = 'entrante' AND contenido = ?
            AND datetime(creado_en) >= datetime('now', '-4 seconds')
          ORDER BY id DESC LIMIT 1`
      )
      .get(telefono, usableText);
    if (duplicate) return;
  }
  saveMessage(conversation.id, telefono, direction, type, usableText, {
    whatsapp_id: id,
    transcripto: type === 'audio' && !transcriptionError,
  });

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
  registrarRespuesta({ telefono, texto: usableText });
  const config = gatewayConfig();
  if (config.pausaTotal || !config.atencionIa || conversation.pausa_humana) return;

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
    const externalCatalog = usesExternalAgentCatalog();
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
    let output;
    try {
      output = await callAgent(agentPayload, config.webhook);
    } catch (primaryError) {
      if (!config.fallbackWebhook || config.fallbackWebhook === config.webhook) throw primaryError;
      logger.warn('WhatsApp Gateway: usando proveedor alternativo', {
        message: primaryError.message,
      });
      output = await callAgent(agentPayload, config.fallbackWebhook);
    }

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
    if (claimsOrderWasCreated(output) && !createdOrder && !createdExternalOrder) {
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
    ultimoError = error.message;
    ultimaActividad = `Error atendiendo a ${telefono}`;
    logger.error('WhatsApp Gateway: fallo la atencion IA', { message: error.message, telefono });
    const orderCreatedDuringFailure = createdWhatsappOrderAfter(telefono, previousOrder?.id);
    const transientProviderError =
      /\b(?:429|500|502|503|504)\b|high demand|service unavailable|timeout/i.test(
        String(error.message || '')
      );

    if (!orderCreatedDuringFailure) {
      const fallback = transientProviderError
        ? 'Estoy con mucha demora ahora. Mandame el mensaje otra vez en un momento y seguimos desde donde quedamos.'
        : 'Tuve un problema para responder ahora. Mandame el mensaje otra vez y seguimos; no se perdió ningún pedido.';
      try {
        await conexion.enviarPresencia(jid, 'paused');
        await conexion.enviarTexto(jid, fallback);
        saveMessage(conversation.id, telefono, 'saliente', 'texto', fallback, {
          origen: 'sistema',
          motivo: transientProviderError ? 'proveedor_ia_temporal' : 'error_agente_reintentable',
        });
        ultimaActividad = `Error recuperable de IA avisado a ${telefono}`;
      } catch (sendError) {
        logger.error('WhatsApp Gateway: no pudo avisar error recuperable', {
          message: sendError.message,
          telefono,
        });
      }
      return;
    }

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
    pedirUnaPersona(conversation, telefono, `Falló la atención automática: ${error.message}`);
    const fallback =
      'Tuve un problema al terminar de cargarlo. Ya te atiende una persona del local para verificar el pedido.';
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

function enqueueIncoming(message) {
  const key = phoneFromMessage(message) || String(message?.key?.remoteJid || 'desconocido');
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
  phoneFromMessage,
  asksForCarta,
  shouldAnswerMenuDayDirectly,
  requestedMenuDayKind,
  buildMenuDayReply,
  usableWhatsappName,
  claimsOrderWasCreated,
  enqueueIncoming,
  serializeByKey,
  safeWebhookUrl,
  closedBusinessMessage,
};
