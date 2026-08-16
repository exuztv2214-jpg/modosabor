const crypto = require('crypto');

const db = require('../db');

const TARGET_STATES = new Set([
  'draft',
  'scheduled',
  'queued',
  'processing',
  'published',
  'requires_approval',
  'ambiguous',
  'failed',
  'cancelled',
]);
const DESTINATION_TYPES = new Set([
  'facebook_page',
  'facebook_profile',
  'facebook_group',
  'facebook_story',
  'facebook_reel',
  'instagram_feed',
  'instagram_story',
  'instagram_reel',
]);

function clean(value, max = 2000) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function json(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}
function parse(value, fallback = {}) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}
function nowSql() {
  return new Date().toISOString();
}
function token() {
  return crypto.randomUUID();
}

function log({
  campanaId = null,
  targetId = null,
  destinoId = null,
  nivel = 'info',
  codigo = '',
  mensaje,
  detalle = {},
  screenshotRuta = '',
}) {
  db.prepare(
    `INSERT INTO social_publication_logs
      (campana_id, target_id, destino_id, nivel, codigo, mensaje, detalle, screenshot_ruta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    campanaId,
    targetId,
    destinoId,
    nivel,
    clean(codigo, 80),
    clean(mensaje, 1000),
    json(detalle),
    clean(screenshotRuta, 300)
  );
}

function mapDestination(row) {
  return (
    row && {
      ...row,
      habilitada: Boolean(row.habilitada),
      favorita: Boolean(row.favorita),
      metadata: parse(row.metadata),
    }
  );
}
function mapCampaign(row) {
  return (
    row && {
      ...row,
      personalizaciones: parse(row.personalizaciones),
      total: Number(row.total || 0),
      publicados: Number(row.publicados || 0),
      fallidos: Number(row.fallidos || 0),
    }
  );
}

function listDestinations({ type = '', enabledOnly = false } = {}) {
  const conditions = [];
  const params = [];
  if (type) {
    conditions.push('d.tipo = ?');
    params.push(type);
  }
  if (enabledOnly) conditions.push('d.habilitada = 1');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT d.*, a.nombre AS cuenta_nombre, a.estado AS cuenta_estado
       FROM social_destinations d
       LEFT JOIN social_accounts a ON a.id = d.cuenta_id
       ${where}
       ORDER BY d.favorita DESC, d.nombre COLLATE NOCASE`
    )
    .all(...params)
    .map(mapDestination);
}

function createDestination({
  provider = 'facebook',
  tipo,
  nombre,
  url = '',
  identificadorExterno = '',
}) {
  const normalizedProvider = clean(provider, 40).toLowerCase();
  const normalizedType = clean(tipo, 60).toLowerCase();
  const normalizedName = clean(nombre, 200);
  if (!DESTINATION_TYPES.has(normalizedType) || !normalizedName)
    throw new Error('Destino inválido');
  if (!url && !identificadorExterno) throw new Error('Indicá la URL pública del destino');
  const externalId = clean(identificadorExterno || url, 500);
  db.prepare(
    `INSERT INTO social_destinations (provider, tipo, nombre, identificador_externo, url, habilitada, ultimo_estado)
     VALUES (?, ?, ?, ?, ?, 1, 'pendiente')
     ON CONFLICT(provider, tipo, identificador_externo) DO UPDATE SET nombre = excluded.nombre,
       url = excluded.url, habilitada = 1, actualizado_en = CURRENT_TIMESTAMP`
  ).run(normalizedProvider, normalizedType, normalizedName, externalId, clean(url, 1000));
  return db
    .prepare(
      'SELECT * FROM social_destinations WHERE provider = ? AND tipo = ? AND identificador_externo = ?'
    )
    .get(normalizedProvider, normalizedType, externalId);
}

function listSets() {
  return db
    .prepare(
      `SELECT s.*, COUNT(i.destino_id) AS total
       FROM social_destination_sets s
       LEFT JOIN social_destination_set_items i ON i.conjunto_id = s.id
       GROUP BY s.id ORDER BY s.nombre COLLATE NOCASE`
    )
    .all()
    .map((set) => ({ ...set, total: Number(set.total), destinos: listSetDestinations(set.id) }));
}
function listSetDestinations(setId) {
  return db
    .prepare(
      `SELECT d.* FROM social_destination_set_items i
      JOIN social_destinations d ON d.id = i.destino_id
      WHERE i.conjunto_id = ? ORDER BY d.nombre COLLATE NOCASE`
    )
    .all(setId)
    .map(mapDestination);
}

function createSet({ nombre, descripcion = '', destinoIds = [] }) {
  const name = clean(nombre, 100);
  if (!name) throw new Error('El conjunto necesita un nombre');
  const ids = [...new Set((destinoIds || []).map(Number).filter(Boolean))];
  const result = db
    .prepare('INSERT INTO social_destination_sets (nombre, descripcion) VALUES (?, ?)')
    .run(name, clean(descripcion, 500));
  const insert = db.prepare(
    'INSERT OR IGNORE INTO social_destination_set_items (conjunto_id, destino_id) VALUES (?, ?)'
  );
  db.transaction(() => ids.forEach((id) => insert.run(result.lastInsertRowid, id)))();
  return listSets().find((set) => Number(set.id) === Number(result.lastInsertRowid));
}

function destinationIds({ destinoIds = [], conjuntoIds = [] }) {
  const direct = (destinoIds || []).map(Number).filter(Boolean);
  const sets = (conjuntoIds || []).map(Number).filter(Boolean);
  if (!sets.length) return [...new Set(direct)];
  const placeholders = sets.map(() => '?').join(',');
  const fromSets = db
    .prepare(
      `SELECT destino_id FROM social_destination_set_items WHERE conjunto_id IN (${placeholders})`
    )
    .all(...sets)
    .map((row) => Number(row.destino_id));
  return [...new Set([...direct, ...fromSets])];
}

function createCampaign({
  nombre,
  texto,
  personalizaciones = {},
  mediaIds = [],
  destinoIds = [],
  conjuntoIds = [],
  programadaPara = '',
  usuarioId = null,
}) {
  const name = clean(nombre, 160);
  const content = String(texto || '')
    .trim()
    .slice(0, 8000);
  if (!name) throw new Error('La publicación necesita un nombre interno');
  if (!content && !(mediaIds || []).length)
    throw new Error('Escribí un texto o adjuntá multimedia');
  const ids = destinationIds({ destinoIds, conjuntoIds });
  const testMode = Boolean(personalizaciones?.modo_prueba);
  if (testMode && ((conjuntoIds || []).length || ids.length !== 1)) {
    throw new Error(
      'Modo de prueba: elegí manualmente un único destino: una Page o un grupo. No uses conjuntos.'
    );
  }
  if (!ids.length) throw new Error('Elegí al menos un destino o conjunto');
  const destinations = db
    .prepare(
      `SELECT id FROM social_destinations WHERE habilitada = 1 AND id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids);
  if (!destinations.length) throw new Error('Los destinos elegidos no están habilitados');
  const scheduledAt = programadaPara ? new Date(programadaPara) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime()))
    throw new Error('La fecha programada no es válida');
  const state = scheduledAt ? 'scheduled' : 'draft';
  const result = db
    .prepare(
      `INSERT INTO social_campaigns (nombre, texto, personalizaciones, estado, programada_para, creado_por)
     VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      content,
      json(personalizaciones),
      state,
      scheduledAt?.toISOString() || null,
      usuarioId
    );
  const campaignId = Number(result.lastInsertRowid);
  const insertTarget = db.prepare(
    `INSERT INTO social_post_targets (campana_id, destino_id, estado, programada_para)
     VALUES (?, ?, ?, ?)`
  );
  const insertMedia = db.prepare(
    'INSERT OR IGNORE INTO social_campaign_media (campana_id, media_id, orden) VALUES (?, ?, ?)'
  );
  db.transaction(() => {
    destinations.forEach((destination) =>
      insertTarget.run(campaignId, destination.id, state, scheduledAt?.toISOString() || null)
    );
    [...new Set((mediaIds || []).map(Number).filter(Boolean))].forEach((mediaId, index) =>
      insertMedia.run(campaignId, mediaId, index)
    );
  })();
  log({
    campanaId: campaignId,
    mensaje: state === 'scheduled' ? 'Campaña programada' : 'Borrador creado',
  });
  return getCampaign(campaignId);
}

function getCampaign(id) {
  const campaign = db
    .prepare(
      `SELECT c.*, COUNT(t.id) AS total,
      SUM(CASE WHEN t.estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS publicados,
      SUM(CASE WHEN t.estado = 'failed' THEN 1 ELSE 0 END) AS fallidos
     FROM social_campaigns c LEFT JOIN social_post_targets t ON t.campana_id = c.id
     WHERE c.id = ? GROUP BY c.id`
    )
    .get(id);
  if (!campaign) return null;
  return {
    ...mapCampaign(campaign),
    targets: db
      .prepare(
        `SELECT t.*, d.nombre AS destino_nombre, d.tipo AS destino_tipo, d.provider, d.metadata AS destino_metadata
       FROM social_post_targets t JOIN social_destinations d ON d.id = t.destino_id
       WHERE t.campana_id = ? ORDER BY d.nombre COLLATE NOCASE`
      )
      .all(id)
      .map((target) => ({ ...target, destino_metadata: parse(target.destino_metadata) })),
    media: db
      .prepare(
        `SELECT m.* FROM social_campaign_media cm JOIN social_media m ON m.id = cm.media_id
       WHERE cm.campana_id = ? ORDER BY cm.orden, m.id`
      )
      .all(id),
  };
}

function listCampaigns(limit = 100) {
  return db
    .prepare(
      `SELECT c.*, COUNT(t.id) AS total,
      SUM(CASE WHEN t.estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS publicados,
      SUM(CASE WHEN t.estado = 'failed' THEN 1 ELSE 0 END) AS fallidos
     FROM social_campaigns c LEFT JOIN social_post_targets t ON t.campana_id = c.id
     GROUP BY c.id ORDER BY COALESCE(c.programada_para, c.creado_en) DESC LIMIT ?`
    )
    .all(Math.min(Math.max(Number(limit) || 50, 1), 200))
    .map(mapCampaign);
}

function queueCampaign(id, { now = false } = {}) {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error('No existe la campaña');
  if (campaign.estado === 'cancelled') throw new Error('La campaña fue cancelada');
  const when = now ? nowSql() : campaign.programada_para || nowSql();
  db.transaction(() => {
    db.prepare(
      `UPDATE social_campaigns SET estado = 'queued', programada_para = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(when, id);
    db.prepare(
      `UPDATE social_post_targets SET estado = 'queued', programada_para = ?, ultimo_error = '', actualizado_en = CURRENT_TIMESTAMP
       WHERE campana_id = ? AND estado IN ('draft', 'scheduled', 'failed')`
    ).run(when, id);
  })();
  log({
    campanaId: id,
    mensaje: now ? 'Campaña enviada a la cola' : 'Campaña programada en la cola',
  });
  return getCampaign(id);
}

function cancelCampaign(id) {
  const result = db.transaction(() => {
    const campaign = db
      .prepare(
        "UPDATE social_campaigns SET estado = 'cancelled', actualizado_en = CURRENT_TIMESTAMP WHERE id = ? AND estado NOT IN ('published', 'cancelled')"
      )
      .run(id);
    if (!campaign.changes) return false;
    db.prepare(
      "UPDATE social_post_targets SET estado = 'cancelled', actualizado_en = CURRENT_TIMESTAMP WHERE campana_id = ? AND estado IN ('draft', 'scheduled', 'queued')"
    ).run(id);
    return true;
  })();
  if (!result) throw new Error('La campaña no se puede cancelar en su estado actual');
  log({ campanaId: id, mensaje: 'Campaña cancelada', nivel: 'warn' });
  return getCampaign(id);
}

function retryFailedCampaign(id) {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error('No existe la campaña');
  const result = db.transaction(() => {
    const changed = db
      .prepare(
        `UPDATE social_post_targets SET estado = 'queued', lock_token = '', lock_hasta = NULL,
       proximo_reintento_en = NULL, ultimo_error = '', actualizado_en = CURRENT_TIMESTAMP
       WHERE campana_id = ? AND estado = 'failed' AND intentos < max_intentos`
      )
      .run(id).changes;
    if (changed)
      db.prepare(
        "UPDATE social_campaigns SET estado = 'queued', finalizada_en = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(id);
    return changed;
  })();
  if (!result)
    throw new Error(
      'No hay destinos fallidos que puedan reintentarse. Los resultados ambiguos no se repiten automáticamente.'
    );
  log({
    campanaId: id,
    nivel: 'warn',
    codigo: 'MANUAL_RETRY',
    mensaje: `Reintento manual de ${result} destino(s) fallido(s)`,
  });
  return getCampaign(id);
}

function claimWork() {
  const lock = token();
  const item = db.transaction(() => {
    const command = db
      .prepare(
        `SELECT * FROM social_worker_commands WHERE estado = 'pending'
       OR (estado = 'processing' AND lock_hasta < CURRENT_TIMESTAMP)
       ORDER BY id LIMIT 1`
      )
      .get();
    if (command) {
      db.prepare(
        "UPDATE social_worker_commands SET estado = 'processing', lock_token = ?, lock_hasta = datetime('now', '+10 minutes') WHERE id = ?"
      ).run(lock, command.id);
      return { kind: 'command', lock, item: { ...command, payload: parse(command.payload) } };
    }
    const target = db
      .prepare(
        `SELECT t.*, c.nombre AS campana_nombre, c.texto, c.personalizaciones,
              d.nombre AS destino_nombre, d.provider, d.tipo AS destino_tipo, d.url AS destino_url, d.metadata AS destino_metadata
         FROM social_post_targets t
         JOIN social_campaigns c ON c.id = t.campana_id
         JOIN social_destinations d ON d.id = t.destino_id
        WHERE t.estado IN ('queued', 'scheduled')
          AND COALESCE(t.programada_para, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
          AND d.habilitada = 1
        ORDER BY COALESCE(t.programada_para, t.creado_en), t.id LIMIT 1`
      )
      .get();
    if (!target) return null;
    db.prepare(
      `UPDATE social_post_targets SET estado = 'processing', lock_token = ?, lock_hasta = datetime('now', '+10 minutes'),
       intentos = intentos + 1, iniciado_en = COALESCE(iniciado_en, CURRENT_TIMESTAMP), actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(lock, target.id);
    db.prepare(
      "UPDATE social_campaigns SET estado = 'processing', iniciada_en = COALESCE(iniciada_en, CURRENT_TIMESTAMP), actualizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(target.campana_id);
    const media = db
      .prepare(
        `SELECT m.id, m.nombre, m.ruta, m.mime FROM social_campaign_media cm JOIN social_media m ON m.id = cm.media_id
       WHERE cm.campana_id = ? ORDER BY cm.orden, m.id`
      )
      .all(target.campana_id);
    return {
      kind: 'publication',
      lock,
      item: {
        ...target,
        personalizaciones: parse(target.personalizaciones),
        destino_metadata: parse(target.destino_metadata),
        media,
      },
    };
  })();
  return item;
}

function refreshCampaignState(campaignId) {
  const summary = db
    .prepare(
      `SELECT COUNT(*) AS total,
      SUM(CASE WHEN estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN estado = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN estado IN ('queued', 'scheduled', 'processing') THEN 1 ELSE 0 END) AS pending
     FROM social_post_targets WHERE campana_id = ?`
    )
    .get(campaignId);
  let state = 'processing';
  if (!summary.pending)
    state =
      (summary.failed || summary.ok < summary.total) && summary.ok
        ? 'partial'
        : summary.failed || summary.ok < summary.total
          ? 'failed'
          : 'published';
  db.prepare(
    `UPDATE social_campaigns SET estado = ?, finalizada_en = CASE WHEN ? IN ('published','partial','failed') THEN CURRENT_TIMESTAMP ELSE finalizada_en END, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(state, state, campaignId);
  return state;
}

function reportPublication({
  targetId,
  lockToken,
  estado,
  error = '',
  externalPostUrl = '',
  codigo = '',
  detalle = {},
  screenshotRuta = '',
}) {
  if (!TARGET_STATES.has(estado)) throw new Error('Estado de destino inválido');
  const target = db
    .prepare('SELECT * FROM social_post_targets WHERE id = ? AND lock_token = ? AND estado = ?')
    .get(targetId, lockToken, 'processing');
  if (!target) throw new Error('El trabajo no está reclamado por este worker');
  db.prepare(
    `UPDATE social_post_targets SET estado = ?, lock_token = '', lock_hasta = NULL, finalizado_en = CURRENT_TIMESTAMP,
     external_post_url = ?, ultimo_error = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(estado, clean(externalPostUrl, 1000), clean(error, 1200), targetId);
  log({
    campanaId: target.campana_id,
    targetId,
    destinoId: target.destino_id,
    nivel: ['failed', 'ambiguous'].includes(estado)
      ? 'error'
      : estado === 'requires_approval'
        ? 'warn'
        : 'info',
    codigo,
    mensaje: error || `Destino ${estado}`,
    detalle,
    screenshotRuta,
  });
  return { campaign: refreshCampaignState(target.campana_id) };
}

function createWorkerCommand(tipo, payload = {}) {
  const allowed = new Set(['sync_facebook_groups', 'health_check']);
  if (!allowed.has(tipo)) throw new Error('Comando de worker inválido');
  const result = db
    .prepare('INSERT INTO social_worker_commands (tipo, payload) VALUES (?, ?)')
    .run(tipo, json(payload));
  return Number(result.lastInsertRowid);
}

function reportCommand({ commandId, lockToken, estado, resultado = {}, error = '' }) {
  const command = db
    .prepare('SELECT * FROM social_worker_commands WHERE id = ? AND lock_token = ? AND estado = ?')
    .get(commandId, lockToken, 'processing');
  if (!command) throw new Error('El comando no está reclamado por este worker');
  if (estado === 'done' && command.tipo === 'sync_facebook_groups') {
    const upsert = db.prepare(
      `INSERT INTO social_destinations (provider, tipo, nombre, identificador_externo, url, metadata, habilitada, ultimo_estado)
       VALUES ('facebook', 'facebook_group', ?, ?, ?, ?, 1, 'detectado')
       ON CONFLICT(provider, tipo, identificador_externo) DO UPDATE SET nombre = excluded.nombre, url = excluded.url, metadata = excluded.metadata, actualizado_en = CURRENT_TIMESTAMP`
    );
    (resultado.grupos || []).forEach((group) => {
      const id = clean(group.id, 200);
      if (!id) return;
      upsert.run(
        clean(group.nombre || 'Grupo de Facebook', 200),
        id,
        clean(group.url, 1000),
        json({ source: 'worker', detectedAt: nowSql() })
      );
    });
  }
  db.prepare(
    `UPDATE social_worker_commands SET estado = ?, resultado = ?, error = ?, lock_token = '', lock_hasta = NULL, finalizado_en = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(estado, json(resultado), clean(error, 1200), commandId);
  log({
    nivel: estado === 'done' ? 'info' : 'error',
    codigo: command.tipo,
    mensaje: error || `Worker completó ${command.tipo}`,
    detalle: resultado,
  });
}

function dashboard() {
  const queued = db
    .prepare(
      "SELECT COUNT(*) AS c FROM social_post_targets WHERE estado IN ('queued','scheduled','processing')"
    )
    .get().c;
  const failed = db
    .prepare("SELECT COUNT(*) AS c FROM social_post_targets WHERE estado = 'failed'")
    .get().c;
  const groups = db
    .prepare(
      "SELECT COUNT(*) AS c FROM social_destinations WHERE tipo = 'facebook_group' AND habilitada = 1"
    )
    .get().c;
  const worker = db
    .prepare('SELECT * FROM social_workers ORDER BY ultimo_heartbeat_en DESC LIMIT 1')
    .get();
  const health = db
    .prepare(
      "SELECT resultado, error, finalizado_en FROM social_worker_commands WHERE tipo = 'health_check' AND estado IN ('done','failed') ORDER BY id DESC LIMIT 1"
    )
    .get();
  return {
    queued,
    failed,
    groups,
    worker: worker ? { ...worker, detalle: parse(worker.detalle) } : null,
    health: health ? { ...health, resultado: parse(health.resultado) } : null,
    campaigns: listCampaigns(8),
    logs: db
      .prepare('SELECT * FROM social_publication_logs ORDER BY id DESC LIMIT 12')
      .all()
      .map((item) => ({ ...item, detalle: parse(item.detalle) })),
  };
}

function heartbeatWorker({
  codigo = 'windows-local',
  nombre = 'Worker Social Windows',
  version = '',
  estado = 'online',
  detalle = {},
}) {
  db.prepare(
    `INSERT INTO social_workers (codigo, nombre, estado, version, detalle, ultimo_heartbeat_en)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(codigo) DO UPDATE SET nombre = excluded.nombre, estado = excluded.estado,
      version = excluded.version, detalle = excluded.detalle, ultimo_heartbeat_en = CURRENT_TIMESTAMP,
      actualizado_en = CURRENT_TIMESTAMP`
  ).run(
    clean(codigo, 80),
    clean(nombre, 120),
    clean(estado, 40),
    clean(version, 80),
    json(detalle)
  );
}

module.exports = {
  DESTINATION_TYPES,
  listDestinations,
  createDestination,
  listSets,
  createSet,
  createCampaign,
  getCampaign,
  listCampaigns,
  queueCampaign,
  cancelCampaign,
  retryFailedCampaign,
  claimWork,
  reportPublication,
  createWorkerCommand,
  reportCommand,
  heartbeatWorker,
  dashboard,
  log,
};
