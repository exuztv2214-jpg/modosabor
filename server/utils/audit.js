const logger = require('./logger');

function safeActorId(db, actorId) {
  if (!actorId) return null;
  try {
    const exists = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(actorId);
    return exists ? actorId : null;
  } catch {
    return null;
  }
}

function logAudit(db, payload) {
  const {
    modulo,
    accion,
    entidad = '',
    entidad_id = '',
    actor_id = null,
    actor_nombre = 'Sistema',
    detalle = {},
  } = payload;

  try {
    const safeId = safeActorId(db, actor_id);
    db.prepare(
      `
      INSERT INTO auditoria_eventos (modulo, accion, entidad, entidad_id, actor_id, actor_nombre, detalle)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      modulo,
      accion,
      entidad,
      String(entidad_id || ''),
      safeId,
      actor_nombre,
      JSON.stringify(detalle || {})
    );
  } catch (err) {
    logger.error('[audit] Error al registrar evento', {
      message: err.message,
      modulo,
      accion,
      entidad,
      entidad_id,
    });
  }
}

function actorFromRequest(req, fallbackName = 'Sistema') {
  if (req?.user) {
    return {
      actor_id: req.user.id || null,
      actor_nombre: req.user.nombre || req.user.email || fallbackName,
    };
  }

  return {
    actor_id: null,
    actor_nombre: fallbackName,
  };
}

module.exports = {
  logAudit,
  actorFromRequest,
};
