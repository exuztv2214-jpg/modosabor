/**
 * Middleware de sanitización de inputs.
 * - trim en strings
 * - escape HTML entities (<, >, &)  — NOTA: comillas (") NO se escapan
 * - prevenir null bytes
 * - limitar strings a 5000 chars
 *
 * CAMBIO 2026-08-06: Se eliminó el escape de comillas (") del middleware.
 * Escapar comillas en la ENTRADA a la API rompía datos válidos:
 * URLs con parámetros, JSONs stringificados, descripciones de productos,
 * direcciones de clientes, enlaces de Google Maps, contenido de marketing.
 *
 * La defensa contra XSS debe implementarse en la CAPA DE PRESENTACIÓN
 * (frontend), nunca mutando datos en la entrada a la API.
 */

const HTML_ESCAPE_MAP = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
};

function escapeHtml(str) {
  return str.replace(/[<>&]/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

function sanitizeValue(value) {
  if (typeof value === 'string') {
    // Prevenir null bytes
    let cleaned = value.replace(/\0/g, '');
    // Trim
    cleaned = cleaned.trim();
    // Limitar longitud
    if (cleaned.length > 5000) {
      cleaned = cleaned.slice(0, 5000);
    }
    // Escapar HTML (solo < > &, NO comillas)
    cleaned = escapeHtml(cleaned);
    return cleaned;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value !== null && typeof value === 'object') {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = sanitizeValue(value[key]);
    }
    return sanitized;
  }

  return value;
}

const SKIP_SANITIZE_PATHS = [
  '/api/agente',
  '/api/configuracion/bulk',
  '/api/pedidos/webhook/mercadopago',
];

function shouldSkip(req) {
  return SKIP_SANITIZE_PATHS.some((path) => req.path.startsWith(path));
}

function sanitizeMiddleware(req, res, next) {
  if (shouldSkip(req) || !req.body || typeof req.body !== 'object') {
    return next();
  }
  req.body = sanitizeValue(req.body);
  next();
}

module.exports = sanitizeMiddleware;
