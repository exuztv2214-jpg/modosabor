const db = require('../db');
const logger = require('./logger');

/**
 * Utilidad para enviar notificaciones de "llegando" al cliente
 * cuando el repartidor está a menos de 150 metros del destino.
 *
 * Como no hay push notifications web configuradas, usamos:
 * 1. WhatsApp (primario)
 * 2. SMS fallback (si no hay WhatsApp)
 *
 * Se guarda estado en notificaciones_envios para evitar duplicados.
 */

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c * 1000; // metros
}

function normalizePhone(telefono) {
  const cleaned = String(telefono || '').replace(/\D/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('54')) return cleaned;
  if (cleaned.startsWith('0')) return `54${cleaned.slice(1)}`;
  return `549${cleaned}`;
}

function hasWhatsApp(telefono) {
  // Verificar si existe conversación de WhatsApp para este número
  const normalized = normalizePhone(telefono);
  if (!normalized) return false;
  const conv = db
    .prepare('SELECT id FROM whatsapp_conversaciones WHERE telefono = ? LIMIT 1')
    .get(normalized);
  return Boolean(conv);
}

function alreadyNotified(pedidoId, tipo = 'llegando') {
  const row = db
    .prepare('SELECT id FROM notificaciones_envios WHERE pedido_id = ? AND tipo = ? LIMIT 1')
    .get(pedidoId, tipo);
  return Boolean(row);
}

function recordNotification(
  pedidoId,
  repartidorId,
  clienteTelefono,
  canal,
  mensaje,
  estado,
  error = ''
) {
  try {
    db.prepare(
      `
      INSERT INTO notificaciones_envios
      (pedido_id, repartidor_id, cliente_telefono, tipo, canal, mensaje, estado, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      pedidoId,
      repartidorId || null,
      clienteTelefono,
      'llegando',
      canal,
      mensaje,
      estado,
      error
    );
  } catch (e) {
    logger.error('[notificaciones] Error guardando notificacion', { message: e.message });
  }
}

function sendWhatsAppMessage(telefono, mensaje) {
  // Por ahora guardamos en whatsapp_envios para que un proceso externo
  // o worker lo envíe. No hay API de WhatsApp Business directa configurada.
  try {
    db.prepare(
      `
      INSERT INTO whatsapp_envios (pedido_id, tipo, telefono, mensaje, proveedor, estado)
      VALUES (NULL, 'notificacion', ?, ?, 'sistema', 'pendiente')
    `
    ).run(telefono, mensaje);
    return { ok: true };
  } catch (e) {
    logger.error('[notificaciones] Error encolando WhatsApp', { message: e.message });
    return { ok: false, error: e.message };
  }
}

function sendSMS(telefono, mensaje) {
  // No hay proveedor de SMS configurado. Se registra como pendiente
  // para que un worker externo o integración futura lo procese.
  logger.info('[notificaciones] SMS no configurado. Se requiere integración con proveedor SMS.', {
    telefono,
    mensajePreview: mensaje.slice(0, 50),
  });
  return { ok: false, error: 'SMS no configurado' };
}

function buildMessage(negocio, repartidorNombre, distanciaMetros, pin) {
  const metros = Math.round(distanciaMetros);
  return `¡Tu pedido de ${negocio} está llegando! ${repartidorNombre} está a ${metros} metros. PIN de entrega: ${pin}`;
}

/**
 * Verificar si debe enviarse notificación "llegando" al cliente.
 * Llamar desde la actualización de ubicación del repartidor.
 */
function checkAndNotifyLlegando({
  pedidoId,
  repartidorId,
  repartidorNombre,
  riderLat,
  riderLng,
  clientLat,
  clientLng,
  clienteTelefono,
  entregaPin,
  negocioNombre = 'Modo Sabor',
}) {
  const rLat = toNumber(riderLat);
  const rLng = toNumber(riderLng);
  const cLat = toNumber(clientLat);
  const cLng = toNumber(clientLng);

  if (
    rLat === null ||
    rLng === null ||
    cLat === null ||
    cLng === null ||
    !pedidoId ||
    !clienteTelefono
  ) {
    return { notified: false, reason: 'datos_incompletos' };
  }

  const distancia = haversineMeters(rLat, rLng, cLat, cLng);
  if (distancia >= 150) {
    return { notified: false, reason: 'fuera_de_rango', distancia };
  }

  if (alreadyNotified(pedidoId)) {
    return { notified: false, reason: 'ya_notificado' };
  }

  const mensaje = buildMessage(
    negocioNombre,
    repartidorNombre || 'El repartidor',
    distancia,
    entregaPin || '----'
  );

  const telefono = normalizePhone(clienteTelefono);
  const tieneWhatsApp = hasWhatsApp(telefono);

  let resultado;
  if (tieneWhatsApp) {
    resultado = sendWhatsAppMessage(telefono, mensaje);
    recordNotification(
      pedidoId,
      repartidorId,
      telefono,
      'whatsapp',
      mensaje,
      resultado.ok ? 'enviado' : 'error',
      resultado.error || ''
    );
  } else {
    resultado = sendSMS(telefono, mensaje);
    recordNotification(
      pedidoId,
      repartidorId,
      telefono,
      'sms',
      mensaje,
      resultado.ok ? 'enviado' : 'pendiente',
      resultado.error || ''
    );
  }

  logger.info('[notificaciones] Notificacion llegando enviada', {
    pedidoId,
    canal: tieneWhatsApp ? 'whatsapp' : 'sms',
    distancia: Math.round(distancia),
    ok: resultado.ok,
  });

  return {
    notified: true,
    canal: tieneWhatsApp ? 'whatsapp' : 'sms',
    distancia,
    mensaje,
  };
}

module.exports = {
  checkAndNotifyLlegando,
  haversineMeters,
  normalizePhone,
  hasWhatsApp,
  alreadyNotified,
  buildMessage,
};
