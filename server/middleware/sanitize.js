/**
 * Middleware de sanitización de inputs.
 * - trim en strings
 * - escape HTML entities (<, >, &, ")
 * - prevenir null bytes
 * - limitar strings a 5000 chars
 */

const HTML_ESCAPE_MAP = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
};

const JSON_STRING_KEYS = new Set([
  'items',
  'variantes',
  'extras',
  'pagos',
  'split_payments',
  'metodos_pago',
]);

function escapeHtml(str) {
  return str.replace(/[<>&"]/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

function isJsonStringField(keyHint, value) {
  const key = String(keyHint || '')
    .trim()
    .toLowerCase();
  if (!JSON_STRING_KEYS.has(key)) return false;
  const cleaned = String(value || '').trim();
  if (!cleaned || !['[', '{'].includes(cleaned[0])) return false;
  try {
    JSON.parse(cleaned);
    return true;
  } catch {
    return false;
  }
}

function sanitizeValue(value, keyHint = '') {
  if (typeof value === 'string') {
    // Prevenir null bytes
    let cleaned = value.replace(/\0/g, '');
    // Trim
    cleaned = cleaned.trim();
    // Limitar longitud
    if (cleaned.length > 5000) {
      cleaned = cleaned.slice(0, 5000);
    }
    if (isJsonStringField(keyHint, cleaned)) {
      return cleaned;
    }
    // Escapar HTML
    cleaned = escapeHtml(cleaned);
    return cleaned;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, keyHint));
  }

  if (value !== null && typeof value === 'object') {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = sanitizeValue(value[key], key);
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
