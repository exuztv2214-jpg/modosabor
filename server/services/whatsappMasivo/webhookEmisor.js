/**
 * Webhooks internos de WhatsApp Masivo.
 *
 * El motor de Baileys ya emite eventos via EventEmitter. Este módulo los
 * escucha y los retransmite por Socket.IO a los paneles conectados,
 * para que el frontend se actualice en tiempo real sin refrescar.
 *
 * ── Eventos que emite ──────────────────────────────────────────────────────
 *
 *  wa:motor:estado   — cambio en el motor (corriendo, pausado, stats)
 *  wa:motor:linea    — log de una línea enviada/error/simulacro
 *  wa:motor:espera   — el motor espera por cupo
 *  wa:respuesta      — llegó una respuesta nueva (o baja)
 *  wa:campana        — cambio en una campaña (inicio, fin, avance)
 *  wa:conexion       — el estado de WhatsApp cambió
 *
 * ── A quién le llega ───────────────────────────────────────────────────────
 *
 *  A todos los sockets autenticados en la room 'authenticated'.
 *  No filtra por rol: cualquier usuario logueado del back-office recibe
 *  los eventos, porque el panel de WhatsApp masivo está disponible para
 *  admin, caja y marketing.
 */

const logger = require('../../utils/logger');
const { motor } = require('./motor');
const { conexion } = require('./conexion');

let io = null;
let activo = false;

function emitir(evento, payload) {
  if (!io) return;
  try {
    io.to('authenticated').emit(evento, payload);
  } catch (error) {
    logger.warn('[webhook-emisor] No se pudo emitir evento', {
      evento,
      message: error.message,
    });
  }
}

function iniciarWebhookEmisor(socketIo) {
  if (activo) return;
  io = socketIo;
  activo = true;

  // ── Eventos del motor ───────────────────────────────────────────────────
  motor.on('estado', (resumen) => {
    emitir('wa:motor:estado', resumen);
  });

  motor.on('linea', (linea) => {
    emitir('wa:motor:linea', linea);
  });

  motor.on('espera', (info) => {
    emitir('wa:motor:espera', info);
  });

  motor.on('respuesta', (respuesta) => {
    emitir('wa:respuesta', respuesta);
  });

  // ── Eventos de conexión ─────────────────────────────────────────────────
  conexion.on('estado', (estado) => {
    emitir('wa:conexion', estado);
  });

  logger.info('[webhook-emisor] WhatsApp Masivo escuchando eventos para Socket.IO');
}

module.exports = { iniciarWebhookEmisor };
