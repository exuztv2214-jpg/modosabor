const db = require('../db');
const { log } = require('./socialService');

function recoverAndQueueSocialWork() {
  const recovered = db
    .prepare(
      `UPDATE social_post_targets SET estado = 'ambiguous', lock_token = '', lock_hasta = NULL,
     ultimo_error = 'La ejecución se interrumpió después de reclamar el destino. No se reintenta automáticamente para evitar una publicación duplicada.',
     actualizado_en = CURRENT_TIMESTAMP
     WHERE estado = 'processing' AND lock_hasta < CURRENT_TIMESTAMP`
    )
    .run().changes;
  const queued = db
    .prepare(
      `UPDATE social_post_targets SET estado = 'queued', actualizado_en = CURRENT_TIMESTAMP
     WHERE estado = 'scheduled' AND programada_para <= CURRENT_TIMESTAMP`
    )
    .run().changes;
  if (recovered || queued)
    log({
      nivel: recovered ? 'warn' : 'info',
      codigo: recovered ? 'PUBLICATION_AMBIGUOUS' : '',
      mensaje: `Cola Social actualizada: ${queued} programadas, ${recovered} marcadas ambiguas`,
    });
}

function startSocialScheduler() {
  recoverAndQueueSocialWork();
  const timer = setInterval(recoverAndQueueSocialWork, 30_000);
  timer.unref?.();
  return timer;
}

module.exports = { startSocialScheduler, recoverAndQueueSocialWork };
