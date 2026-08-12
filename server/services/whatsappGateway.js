const db = require('../db');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { conexion } = require('./whatsappMasivo/conexion');
const { deJid } = require('./whatsappMasivo/telefono');
const { registrarRespuesta } = require('./whatsappMasivo/motor');
const { buildAgentTraining } = require('./whatsappAgentTraining');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { getConfigMap } = require('../utils/mercadoPago');
const { uploadsDir } = require('../utils/storagePaths');
const { findClienteByPhone, getLastOrderByPhone, cleanText } = require('../utils/systemClient');
const { transcribeWhatsappAudio } = require('./whatsappAudioTranscription');

const DEFAULT_WEBHOOK = 'http://127.0.0.1:5678/webhook/modosabor-atencion-web';
const DEFAULT_FALLBACK_WEBHOOK = 'http://127.0.0.1:5678/webhook/modosabor-atencion-web-fallback';
const seen = new Set();
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

function gatewayConfig() {
  return {
    pausaTotal: enabled('whatsapp_gateway_pausa_total', false),
    atencionIa: enabled('whatsapp_atencion_ia_activa', false),
    masivos: enabled('whatsapp_masivos_activo', false),
    webhook:
      String(process.env.WHATSAPP_AGENT_WEBHOOK_URL || '').trim() ||
      configValue('whatsapp_agente_webhook_url', DEFAULT_WEBHOOK),
    fallbackWebhook:
      String(process.env.WHATSAPP_AGENT_FALLBACK_WEBHOOK_URL || '').trim() ||
      configValue('whatsapp_agente_fallback_webhook_url', DEFAULT_FALLBACK_WEBHOOK),
  };
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
              CASE WHEN bot_silenciado_hasta > CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS pausa_humana
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
        ORDER BY id DESC LIMIT 30`
    )
    .all(conversationId)
    .reverse()
    .map((item) => `${item.direccion === 'entrante' ? 'Cliente' : 'Chispita'}: ${item.contenido}`)
    .join('\n');
}

async function callAgent(payload, webhook) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
    }
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000),
      });
      const raw = await response.text();
      if (!response.ok) {
        const error = new Error(`n8n ${response.status}: ${raw.slice(0, 240)}`);
        error.transient = response.status === 429 || response.status >= 500;
        throw error;
      }
      const data = JSON.parse(raw);
      const output = String(data.output || data.text || '').trim();
      if (!output) throw new Error('n8n no devolvio una respuesta');
      return output;
    } catch (error) {
      lastError = error;
      const transient =
        error.transient ||
        /\b(?:429|500|502|503|504)\b|high demand|service unavailable|timeout/i.test(
          String(error.message || '')
        );
      if (!transient || attempt === 2) throw error;
      logger.warn('WhatsApp Gateway: reintentando proveedor de IA', {
        intento: attempt + 2,
        message: error.message,
      });
    }
  }
  throw lastError;
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

  try {
    await conexion.enviarPresencia(jid, 'composing');
    if (type === 'texto' && asksForCarta(usableText)) {
      await sendCarta(jid, conversation, telefono);
      await conexion.enviarPresencia(jid, 'paused');
      respondidos += 1;
      ultimoError = '';
      ultimaActividad = `Carta enviada a ${telefono}`;
      return;
    }
    const businessConfig = getConfigMap(db);
    const currentShift = getCurrentShiftInfo(businessConfig);
    const previousOrder = getLastOrderByPhone(db, telefono);
    const agentPayload = {
      // Versionar la memoria descarta las reglas viejas de conversaciones
      // abiertas antes de este cambio operativo.
      sessionId: `wa:v3:${telefono}`,
      mensaje_id: id,
      telefono,
      nombre: knownName || conversation.nombre || '',
      tipo: type,
      texto: usableText,
      historial: historyFor(conversation.id),
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
    if (claimsOrderWasCreated(output) && !createdOrder) {
      // La frase del modelo no es evidencia: el pedido debe existir realmente.
      // Si no existe, nunca se confirma al cliente y se entrega el chat a una
      // persona para evitar pérdida de ventas o preparación fantasma.
      db.prepare(
        `UPDATE whatsapp_conversaciones
            SET bot_silenciado = 1,
                escalado_humano = 1,
                bot_silenciado_hasta = datetime('now', '+30 minutes'),
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id = ?`
      ).run(conversation.id);
      output =
        'Todavía no pude registrar el pedido en el sistema. No quedó confirmado; ya te atiende una persona del local para cargarlo bien.';
      ultimoError = `La IA afirmo crear un pedido inexistente para ${telefono}`;
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
    ultimoError = '';
    ultimaActividad = `IA respondio a ${telefono}`;
  } catch (error) {
    ultimoError = error.message;
    ultimaActividad = `Error atendiendo a ${telefono}`;
    logger.error('WhatsApp Gateway: fallo la atencion IA', { message: error.message, telefono });
    const transientProviderError =
      /\b(?:429|500|502|503|504)\b|high demand|service unavailable|timeout/i.test(
        String(error.message || '')
      );
    if (transientProviderError) {
      const fallback =
        'Estoy con mucha demora ahora. Mandame el mensaje otra vez en un momento y seguimos desde donde quedamos.';
      try {
        await conexion.enviarPresencia(jid, 'paused');
        await conexion.enviarTexto(jid, fallback);
        saveMessage(conversation.id, telefono, 'saliente', 'texto', fallback, {
          origen: 'sistema',
          motivo: 'proveedor_ia_temporal',
        });
        ultimaActividad = `Demora temporal de IA avisada a ${telefono}`;
      } catch (sendError) {
        logger.error('WhatsApp Gateway: no pudo avisar demora temporal', {
          message: sendError.message,
          telefono,
        });
      }
      return;
    }

    // Un error después de la confirmación es ambiguo: la tool podría haber
    // alcanzado a crear el pedido y fallar al devolver la respuesta. Nunca
    // reintentamos automáticamente porque duplicaría pedidos. En su lugar,
    // avisamos al cliente y entregamos el chat a una persona del local.
    db.prepare(
      `UPDATE whatsapp_conversaciones
          SET bot_silenciado = 1,
              escalado_humano = 1,
              bot_silenciado_hasta = datetime('now', '+30 minutes'),
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(conversation.id);
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

function iniciarWhatsappGateway() {
  if (iniciado) return;
  iniciado = true;
  conexion.on('mensaje', (message) => {
    handleIncoming(message).catch((error) => {
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
  usableWhatsappName,
  claimsOrderWasCreated,
};
