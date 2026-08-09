function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

/**
 * Persistencia SQLite para los límites. Mantenerla acá evita depender de
 * Redis en instalaciones chicas, pero no pierde los contadores al reiniciar
 * el servidor ni cuando Railway reemplaza el proceso.
 */
function createSqliteRateLimitStore(db, scope) {
  const normalizedScope = String(scope || 'api').trim() || 'api';
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_hits (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (scope, key)
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_reset_at ON rate_limit_hits(reset_at);
  `);

  // Un UPSERT único es esencial: una ventana vencida todavía tiene fila. Antes
  // se intentaba INSERT sobre ella y SQLite detenía la request con UNIQUE.
  const consumeHit = db.prepare(`
    INSERT INTO rate_limit_hits (scope, key, count, reset_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(scope, key) DO UPDATE SET
      count = CASE WHEN rate_limit_hits.reset_at <= ? THEN 1 ELSE rate_limit_hits.count + 1 END,
      reset_at = CASE WHEN rate_limit_hits.reset_at <= ? THEN excluded.reset_at ELSE rate_limit_hits.reset_at END,
      updated_at = CURRENT_TIMESTAMP
    RETURNING count, reset_at
  `);
  const cleanup = db.prepare('DELETE FROM rate_limit_hits WHERE reset_at <= ?');

  return {
    consume(key, now, windowMs) {
      // El borrado es probabilístico para no sumar una escritura extra en cada
      // request, pero mantiene chica la tabla aun con clientes efímeros.
      if (Math.random() < 0.01) cleanup.run(now);
      const nextResetAt = now + windowMs;
      const hit = consumeHit.get(normalizedScope, key, nextResetAt, now, now);
      return { count: Number(hit.count), resetAt: Number(hit.reset_at) };
    },
    cleanup(now) {
      cleanup.run(now);
    },
  };
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
  store = null,
} = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req) || clientKey(req));
    const current = store?.consume ? store.consume(key, now, windowMs) : hits.get(key);

    if (store?.consume) {
      if (current.count <= max) return next();
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

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
  createSqliteRateLimitStore,
  clientKey,
};
