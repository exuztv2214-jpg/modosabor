function clientKey(req) {
  return String(
    req.headers['x-forwarded-for']?.split(',')[0] ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown'
  ).trim();
}

/**
 * @param {object} [opciones]
 * @param {Function} [opciones.keyGenerator] Con qué agrupar los intentos.
 *   Por defecto la IP, que es lo correcto para rutas públicas.
 *
 *   En rutas donde todos están logueados conviene agrupar por usuario: varias
 *   personas del local comparten la misma conexión, y con la IP el límite de
 *   una las frena a todas.
 */
function createRateLimiter({
  windowMs = 60 * 1000,
  max = 60,
  message = 'Demasiados intentos. Proba de nuevo en unos minutos.',
  keyGenerator = clientKey,
} = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req) || clientKey(req));
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    if (hits.size > 10000) {
      for (const [entryKey, entry] of hits.entries()) {
        if (entry.resetAt <= now) hits.delete(entryKey);
      }
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
  clientKey,
};
