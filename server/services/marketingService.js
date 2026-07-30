const db = require('../db');

const PROMO_TYPES = new Set([
  'descuento_fijo',
  'porcentaje',
  'envio_gratis',
  'combo_especial',
  'promo_producto',
]);

const CONTENT_STATES = new Set(['borrador', 'listo', 'publicado']);
const CALENDAR_STATES = new Set(['pendiente', 'listo', 'publicado', 'cancelado']);

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugify(value) {
  const normalized = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized || `campana-${Date.now()}`;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = normalizeText(value);
  if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  let normalized = String(value).trim();
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateTimeValue(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return '';
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function comparablePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
}

function mapPromo(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    valor: Number(row.valor || 0),
    activa: Number(row.activa) === 1,
    cupon_id: row.cupon_id ? Number(row.cupon_id) : null,
    producto_id: row.producto_id ? Number(row.producto_id) : null,
  };
}

function mapContenido(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
  };
}

function buildCampaignCta(campaign) {
  const code = cleanText(campaign?.tracking_slug || campaign?.marketing_campaign || '');
  if (!code) return '';
  return `Pedi desde la carta online usando el codigo ${code}`;
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    presupuesto_estimado: Number(row.presupuesto_estimado || 0),
    promo_id: row.promo_id ? Number(row.promo_id) : null,
    contenido_id: row.contenido_id ? Number(row.contenido_id) : null,
    activa: Number(row.activa) === 1,
    whatsapp_cta_texto: buildCampaignCta(row),
    whatsapp_mensaje_sugerido:
      cleanText(row.whatsapp_mensaje_sugerido || '') ||
      `Hola, vengo por ${cleanText(row.tracking_slug || '')}`,
  };
}

function mapCalendar(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    contenido_id: row.contenido_id ? Number(row.contenido_id) : null,
    promo_id: row.promo_id ? Number(row.promo_id) : null,
    campana_id: row.campana_id ? Number(row.campana_id) : null,
  };
}

function deriveMedium(channel) {
  const normalized = normalizeText(channel);
  if (!normalized || normalized === 'general') return 'social';
  if (normalized === 'whatsapp') return 'messaging';
  if (normalized === 'google' || normalized.includes('google')) return 'local-search';
  return 'social';
}

function ensureUniqueTrackingSlug(rawSlug, excludeId = null) {
  const baseSlug = slugify(rawSlug);
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const row = excludeId
      ? db
          .prepare('SELECT id FROM marketing_campanas WHERE tracking_slug = ? AND id != ? LIMIT 1')
          .get(candidate, excludeId)
      : db
          .prepare('SELECT id FROM marketing_campanas WHERE tracking_slug = ? LIMIT 1')
          .get(candidate);
    if (!row?.id) return candidate;
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
}

function isWithinWindow(row, now = new Date()) {
  if (!row) return false;
  if (Number(row.activa) !== 1 && row.activa !== true) return false;

  const nowTs = now.getTime();
  const startsAt = row.fecha_inicio ? new Date(row.fecha_inicio).getTime() : null;
  const endsAt = row.fecha_fin ? new Date(row.fecha_fin).getTime() : null;

  if (startsAt && !Number.isNaN(startsAt) && nowTs < startsAt) return false;
  if (endsAt && !Number.isNaN(endsAt) && nowTs > endsAt) return false;
  return true;
}

function getPromoById(id) {
  if (!id) return null;
  return mapPromo(
    db
      .prepare(
        `
    SELECT p.*, c.codigo AS cupon_codigo, c.descripcion AS cupon_descripcion, pr.nombre AS producto_nombre
    FROM marketing_promos p
    LEFT JOIN cupones c ON c.id = p.cupon_id
    LEFT JOIN productos pr ON pr.id = p.producto_id
    WHERE p.id = ?
  `
      )
      .get(Number(id))
  );
}

function getContenidoById(id) {
  if (!id) return null;
  return mapContenido(
    db.prepare('SELECT * FROM marketing_contenidos WHERE id = ?').get(Number(id))
  );
}

function getCampaignById(id) {
  if (!id) return null;
  return mapCampaign(
    db
      .prepare(
        `
    SELECT c.*, p.nombre AS promo_nombre, ct.titulo AS contenido_titulo
    FROM marketing_campanas c
    LEFT JOIN marketing_promos p ON p.id = c.promo_id
    LEFT JOIN marketing_contenidos ct ON ct.id = c.contenido_id
    WHERE c.id = ?
  `
      )
      .get(Number(id))
  );
}

function listPromos() {
  return db
    .prepare(
      `
    SELECT p.*, c.codigo AS cupon_codigo, c.descripcion AS cupon_descripcion, pr.nombre AS producto_nombre
    FROM marketing_promos p
    LEFT JOIN cupones c ON c.id = p.cupon_id
    LEFT JOIN productos pr ON pr.id = p.producto_id
    ORDER BY p.activa DESC, datetime(COALESCE(p.fecha_inicio, p.creado_en)) DESC, p.id DESC
  `
    )
    .all()
    .map(mapPromo);
}

function normalizePromoPayload(input = {}, current = null) {
  const nombre = cleanText(input.nombre || current?.nombre || '');
  if (!nombre) throw new Error('El nombre de la promo es obligatorio');

  const tipoPromo = (() => {
    const raw = normalizeText(input.tipo_promo || current?.tipo_promo || 'descuento_fijo');
    if (raw === 'descuento fijo' || raw === 'fijo') return 'descuento_fijo';
    if (raw === 'combo' || raw === 'combo especial') return 'combo_especial';
    if (raw === 'promo producto' || raw === 'producto') return 'promo_producto';
    return raw;
  })();

  if (!PROMO_TYPES.has(tipoPromo)) {
    throw new Error('El tipo de promo no es valido');
  }

  return {
    nombre,
    descripcion: cleanText(input.descripcion ?? current?.descripcion ?? ''),
    tipo_promo: tipoPromo,
    valor: toNumber(input.valor ?? current?.valor ?? 0, 0),
    fecha_inicio: toDateTimeValue(input.fecha_inicio ?? current?.fecha_inicio ?? ''),
    fecha_fin: toDateTimeValue(input.fecha_fin ?? current?.fecha_fin ?? ''),
    activa: toBool(input.activa ?? current?.activa, true) ? 1 : 0,
    canal_sugerido:
      cleanText(input.canal_sugerido ?? current?.canal_sugerido ?? 'general') || 'general',
    cupon_id: toNullableNumber(input.cupon_id ?? current?.cupon_id ?? null),
    producto_id: toNullableNumber(input.producto_id ?? current?.producto_id ?? null),
  };
}

function createPromo(input = {}) {
  const payload = normalizePromoPayload(input);
  const result = db
    .prepare(
      `
    INSERT INTO marketing_promos (
      nombre, descripcion, tipo_promo, valor, fecha_inicio, fecha_fin, activa, canal_sugerido, cupon_id, producto_id, creado_en, actualizado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `
    )
    .run(
      payload.nombre,
      payload.descripcion,
      payload.tipo_promo,
      payload.valor,
      payload.fecha_inicio,
      payload.fecha_fin,
      payload.activa,
      payload.canal_sugerido,
      payload.cupon_id,
      payload.producto_id
    );
  return getPromoById(result.lastInsertRowid);
}

function updatePromo(id, input = {}) {
  const current = getPromoById(id);
  if (!current) throw new Error('Promo no encontrada');
  const payload = normalizePromoPayload(input, current);

  db.prepare(
    `
    UPDATE marketing_promos
    SET nombre = ?, descripcion = ?, tipo_promo = ?, valor = ?, fecha_inicio = ?, fecha_fin = ?, activa = ?, canal_sugerido = ?,
        cupon_id = ?, producto_id = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    payload.nombre,
    payload.descripcion,
    payload.tipo_promo,
    payload.valor,
    payload.fecha_inicio,
    payload.fecha_fin,
    payload.activa,
    payload.canal_sugerido,
    payload.cupon_id,
    payload.producto_id,
    Number(id)
  );

  return getPromoById(id);
}

function deletePromo(id) {
  const current = getPromoById(id);
  if (!current) throw new Error('Promo no encontrada');
  db.prepare('DELETE FROM marketing_promos WHERE id = ?').run(Number(id));
  return current;
}

function listContenidos() {
  return db
    .prepare(
      `
    SELECT *
    FROM marketing_contenidos
    ORDER BY CASE estado WHEN 'borrador' THEN 0 WHEN 'listo' THEN 1 WHEN 'publicado' THEN 2 ELSE 3 END,
             datetime(COALESCE(actualizado_en, creado_en)) DESC, id DESC
  `
    )
    .all()
    .map(mapContenido);
}

function normalizeContenidoPayload(input = {}, current = null) {
  const titulo = cleanText(input.titulo || current?.titulo || '');
  if (!titulo) throw new Error('El titulo interno es obligatorio');

  const estado = cleanText(input.estado || current?.estado || 'borrador').toLowerCase();
  if (!CONTENT_STATES.has(estado)) {
    throw new Error('El estado del contenido no es valido');
  }

  return {
    titulo,
    objetivo: cleanText(input.objetivo ?? current?.objetivo ?? ''),
    red_sugerida:
      cleanText(input.red_sugerida ?? current?.red_sugerida ?? 'instagram') || 'instagram',
    texto_corto: cleanText(input.texto_corto ?? current?.texto_corto ?? ''),
    texto_largo: cleanText(input.texto_largo ?? current?.texto_largo ?? ''),
    cta: cleanText(input.cta ?? current?.cta ?? ''),
    estado,
  };
}

function createContenido(input = {}) {
  const payload = normalizeContenidoPayload(input);
  const result = db
    .prepare(
      `
    INSERT INTO marketing_contenidos (
      titulo, objetivo, red_sugerida, texto_corto, texto_largo, cta, estado, creado_en, actualizado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `
    )
    .run(
      payload.titulo,
      payload.objetivo,
      payload.red_sugerida,
      payload.texto_corto,
      payload.texto_largo,
      payload.cta,
      payload.estado
    );
  return getContenidoById(result.lastInsertRowid);
}

function updateContenido(id, input = {}) {
  const current = getContenidoById(id);
  if (!current) throw new Error('Contenido no encontrado');
  const payload = normalizeContenidoPayload(input, current);

  db.prepare(
    `
    UPDATE marketing_contenidos
    SET titulo = ?, objetivo = ?, red_sugerida = ?, texto_corto = ?, texto_largo = ?, cta = ?, estado = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    payload.titulo,
    payload.objetivo,
    payload.red_sugerida,
    payload.texto_corto,
    payload.texto_largo,
    payload.cta,
    payload.estado,
    Number(id)
  );

  return getContenidoById(id);
}

function deleteContenido(id) {
  const current = getContenidoById(id);
  if (!current) throw new Error('Contenido no encontrado');
  db.prepare('DELETE FROM marketing_contenidos WHERE id = ?').run(Number(id));
  return current;
}

function listCampanas() {
  return db
    .prepare(
      `
    SELECT c.*, p.nombre AS promo_nombre, ct.titulo AS contenido_titulo
    FROM marketing_campanas c
    LEFT JOIN marketing_promos p ON p.id = c.promo_id
    LEFT JOIN marketing_contenidos ct ON ct.id = c.contenido_id
    ORDER BY c.activa DESC, datetime(COALESCE(c.fecha_inicio, c.creado_en)) DESC, c.id DESC
  `
    )
    .all()
    .map(mapCampaign);
}

function normalizeCampaignPayload(input = {}, current = null) {
  const nombre = cleanText(input.nombre || current?.nombre || '');
  if (!nombre) throw new Error('El nombre de la campaña es obligatorio');

  const canal = cleanText(input.canal ?? current?.canal ?? 'instagram') || 'instagram';
  const contenidoId = toNullableNumber(input.contenido_id ?? current?.contenido_id ?? null);
  const contenido = contenidoId ? getContenidoById(contenidoId) : null;
  const rawSlug = cleanText(input.tracking_slug ?? current?.tracking_slug ?? nombre);
  const trackingSlug = ensureUniqueTrackingSlug(rawSlug, current?.id || null);
  const marketingSource =
    cleanText(input.marketing_source ?? current?.marketing_source ?? canal) || canal;
  const marketingMedium =
    cleanText(input.marketing_medium ?? current?.marketing_medium ?? deriveMedium(canal)) ||
    deriveMedium(canal);
  const marketingCampaign =
    cleanText(input.marketing_campaign ?? current?.marketing_campaign ?? trackingSlug) ||
    trackingSlug;
  const marketingContent = cleanText(
    input.marketing_content ?? current?.marketing_content ?? contenido?.titulo ?? ''
  );

  return {
    nombre,
    objetivo: cleanText(input.objetivo ?? current?.objetivo ?? ''),
    canal,
    fecha_inicio: toDateTimeValue(input.fecha_inicio ?? current?.fecha_inicio ?? ''),
    fecha_fin: toDateTimeValue(input.fecha_fin ?? current?.fecha_fin ?? ''),
    presupuesto_estimado: toNumber(
      input.presupuesto_estimado ?? current?.presupuesto_estimado ?? 0,
      0
    ),
    promo_id: toNullableNumber(input.promo_id ?? current?.promo_id ?? null),
    contenido_id: contenidoId,
    activa: toBool(input.activa ?? current?.activa, true) ? 1 : 0,
    observaciones: cleanText(input.observaciones ?? current?.observaciones ?? ''),
    tracking_slug: trackingSlug,
    marketing_source: marketingSource,
    marketing_medium: marketingMedium,
    marketing_campaign: marketingCampaign,
    marketing_content: marketingContent,
    whatsapp_mensaje_sugerido: cleanText(
      input.whatsapp_mensaje_sugerido ??
        current?.whatsapp_mensaje_sugerido ??
        `Hola, vengo por ${trackingSlug}`
    ),
  };
}

function createCampana(input = {}) {
  const payload = normalizeCampaignPayload(input);
  const result = db
    .prepare(
      `
    INSERT INTO marketing_campanas (
      nombre, objetivo, canal, fecha_inicio, fecha_fin, presupuesto_estimado, promo_id, contenido_id,
      activa, observaciones, tracking_slug, marketing_source, marketing_medium, marketing_campaign, marketing_content,
      whatsapp_mensaje_sugerido, creado_en, actualizado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `
    )
    .run(
      payload.nombre,
      payload.objetivo,
      payload.canal,
      payload.fecha_inicio,
      payload.fecha_fin,
      payload.presupuesto_estimado,
      payload.promo_id,
      payload.contenido_id,
      payload.activa,
      payload.observaciones,
      payload.tracking_slug,
      payload.marketing_source,
      payload.marketing_medium,
      payload.marketing_campaign,
      payload.marketing_content,
      payload.whatsapp_mensaje_sugerido
    );
  return getCampaignById(result.lastInsertRowid);
}

function updateCampana(id, input = {}) {
  const current = getCampaignById(id);
  if (!current) throw new Error('Campaña no encontrada');
  const payload = normalizeCampaignPayload(input, current);

  db.prepare(
    `
    UPDATE marketing_campanas
    SET nombre = ?, objetivo = ?, canal = ?, fecha_inicio = ?, fecha_fin = ?, presupuesto_estimado = ?, promo_id = ?, contenido_id = ?,
        activa = ?, observaciones = ?, tracking_slug = ?, marketing_source = ?, marketing_medium = ?, marketing_campaign = ?,
        marketing_content = ?, whatsapp_mensaje_sugerido = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    payload.nombre,
    payload.objetivo,
    payload.canal,
    payload.fecha_inicio,
    payload.fecha_fin,
    payload.presupuesto_estimado,
    payload.promo_id,
    payload.contenido_id,
    payload.activa,
    payload.observaciones,
    payload.tracking_slug,
    payload.marketing_source,
    payload.marketing_medium,
    payload.marketing_campaign,
    payload.marketing_content,
    payload.whatsapp_mensaje_sugerido,
    Number(id)
  );

  return getCampaignById(id);
}

function deleteCampana(id) {
  const current = getCampaignById(id);
  if (!current) throw new Error('Campaña no encontrada');
  db.prepare('DELETE FROM marketing_campanas WHERE id = ?').run(Number(id));
  return current;
}

function listCalendario() {
  return db
    .prepare(
      `
    SELECT cal.*, ct.titulo AS contenido_titulo, p.nombre AS promo_nombre, c.nombre AS campana_nombre
    FROM marketing_calendario cal
    LEFT JOIN marketing_contenidos ct ON ct.id = cal.contenido_id
    LEFT JOIN marketing_promos p ON p.id = cal.promo_id
    LEFT JOIN marketing_campanas c ON c.id = cal.campana_id
    ORDER BY datetime(cal.fecha_programada) ASC, cal.id DESC
  `
    )
    .all()
    .map(mapCalendar);
}

function normalizeCalendarPayload(input = {}, current = null) {
  const fechaProgramada = toDateTimeValue(
    input.fecha_programada ?? current?.fecha_programada ?? ''
  );
  if (!fechaProgramada) throw new Error('La fecha sugerida de publicación es obligatoria');

  const estado = cleanText(input.estado ?? current?.estado ?? 'pendiente').toLowerCase();
  if (!CALENDAR_STATES.has(estado)) {
    throw new Error('El estado del calendario no es valido');
  }

  return {
    contenido_id: toNullableNumber(input.contenido_id ?? current?.contenido_id ?? null),
    promo_id: toNullableNumber(input.promo_id ?? current?.promo_id ?? null),
    campana_id: toNullableNumber(input.campana_id ?? current?.campana_id ?? null),
    fecha_programada: fechaProgramada,
    canal: cleanText(input.canal ?? current?.canal ?? 'instagram') || 'instagram',
    estado,
    observaciones: cleanText(input.observaciones ?? current?.observaciones ?? ''),
  };
}

function createCalendario(input = {}) {
  const payload = normalizeCalendarPayload(input);
  const result = db
    .prepare(
      `
    INSERT INTO marketing_calendario (
      contenido_id, promo_id, campana_id, fecha_programada, canal, estado, observaciones, creado_en, actualizado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `
    )
    .run(
      payload.contenido_id,
      payload.promo_id,
      payload.campana_id,
      payload.fecha_programada,
      payload.canal,
      payload.estado,
      payload.observaciones
    );
  return listCalendario().find((item) => item.id === Number(result.lastInsertRowid)) || null;
}

function updateCalendario(id, input = {}) {
  const current = db.prepare('SELECT * FROM marketing_calendario WHERE id = ?').get(Number(id));
  if (!current) throw new Error('Evento de calendario no encontrado');
  const payload = normalizeCalendarPayload(input, current);
  db.prepare(
    `
    UPDATE marketing_calendario
    SET contenido_id = ?, promo_id = ?, campana_id = ?, fecha_programada = ?, canal = ?, estado = ?, observaciones = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    payload.contenido_id,
    payload.promo_id,
    payload.campana_id,
    payload.fecha_programada,
    payload.canal,
    payload.estado,
    payload.observaciones,
    Number(id)
  );
  return listCalendario().find((item) => item.id === Number(id)) || null;
}

function deleteCalendario(id) {
  const current = db.prepare('SELECT * FROM marketing_calendario WHERE id = ?').get(Number(id));
  if (!current) throw new Error('Evento de calendario no encontrado');
  db.prepare('DELETE FROM marketing_calendario WHERE id = ?').run(Number(id));
  return current;
}

function getReferences() {
  const cupones = db
    .prepare(
      `
    SELECT id, codigo, descripcion, tipo_descuento, valor_descuento, activo
    FROM cupones
    WHERE activo = 1
    ORDER BY codigo ASC
  `
    )
    .all()
    .map((row) => ({
      ...row,
      id: Number(row.id),
      valor_descuento: Number(row.valor_descuento || 0),
      activo: Number(row.activo) === 1,
    }));

  const productos = db
    .prepare(
      `
    SELECT id, nombre, precio
    FROM productos
    WHERE activo = 1
    ORDER BY nombre ASC
  `
    )
    .all()
    .map((row) => ({
      id: Number(row.id),
      nombre: row.nombre || '',
      precio: Number(row.precio || 0),
    }));

  return {
    cupones,
    productos,
    promos: listPromos(),
    contenidos: listContenidos(),
    campanas: listCampanas(),
  };
}

function getDashboard() {
  const campaigns = listCampanas();
  const promos = listPromos();
  const calendario = listCalendario();

  const campañasActivas = campaigns.filter((item) => isWithinWindow(item)).length;
  const promosActivas = promos.filter((item) => isWithinWindow(item)).length;

  const conversacionesAtribuidas = 0;

  const pedidosAtribuidos =
    db
      .prepare(
        `
    SELECT COUNT(*) AS total
    FROM pedidos
    WHERE marketing_campana_id IS NOT NULL
       OR TRIM(COALESCE(marketing_codigo, '')) != ''
  `
      )
      .get()?.total || 0;

  const ventasAtribuidas = Number(
    db
      .prepare(
        `
    SELECT COALESCE(SUM(total), 0) AS total
    FROM pedidos
    WHERE estado != 'cancelado'
      AND (
        marketing_campana_id IS NOT NULL
        OR TRIM(COALESCE(marketing_codigo, '')) != ''
      )
  `
      )
      .get()?.total || 0
  );

  const attributedOrders = db
    .prepare(
      `
    SELECT id, cliente_id, cliente_telefono
    FROM pedidos
    WHERE estado != 'cancelado'
      AND (
        marketing_campana_id IS NOT NULL
        OR TRIM(COALESCE(marketing_codigo, '')) != ''
      )
    ORDER BY datetime(creado_en) ASC, id ASC
  `
    )
    .all();

  let clientesNuevosEstimados = 0;
  attributedOrders.forEach((order) => {
    const previousByClient = order.cliente_id
      ? db
          .prepare(
            `
        SELECT id
        FROM pedidos
        WHERE id < ?
          AND estado != 'cancelado'
          AND cliente_id = ?
        LIMIT 1
      `
          )
          .get(order.id, order.cliente_id)
      : null;

    const comparable = comparablePhone(order.cliente_telefono);
    const previousByPhone =
      !previousByClient && comparable
        ? db
            .prepare(
              `
        SELECT id
        FROM pedidos
        WHERE id < ?
          AND estado != 'cancelado'
          AND REPLACE(REPLACE(REPLACE(cliente_telefono, ' ', ''), '+', ''), '-', '') LIKE ?
        LIMIT 1
      `
            )
            .get(order.id, `%${comparable}`)
        : null;

    if (!previousByClient && !previousByPhone) {
      clientesNuevosEstimados += 1;
    }
  });

  const publicacionesPendientes = calendario.filter((item) =>
    ['pendiente', 'listo'].includes(item.estado)
  ).length;

  const attributionRows = db
    .prepare(
      `
    SELECT a.*, c.nombre AS campana_nombre, p.nombre AS promo_nombre
    FROM marketing_atribuciones a
    LEFT JOIN marketing_campanas c ON c.id = a.marketing_campana_id
    LEFT JOIN marketing_promos p ON p.id = a.marketing_promo_id
    ORDER BY datetime(a.creado_en) DESC, a.id DESC
    LIMIT 8
  `
    )
    .all();

  return {
    metrics: {
      campanas_activas: campañasActivas,
      promos_activas: promosActivas,
      conversaciones_atribuidas: Number(conversacionesAtribuidas || 0),
      pedidos_atribuidos: Number(pedidosAtribuidos || 0),
      ventas_atribuidas: ventasAtribuidas,
      clientes_nuevos_estimados: clientesNuevosEstimados,
      publicaciones_pendientes: publicacionesPendientes,
    },
    active_campaigns: campaigns.filter((item) => isWithinWindow(item)).slice(0, 6),
    pending_calendar: calendario
      .filter((item) => ['pendiente', 'listo'].includes(item.estado))
      .slice(0, 8),
    recent_attributions: attributionRows.map((row) => ({
      ...row,
      id: Number(row.id),
      marketing_campana_id: row.marketing_campana_id ? Number(row.marketing_campana_id) : null,
      marketing_promo_id: row.marketing_promo_id ? Number(row.marketing_promo_id) : null,
      conversacion_id: row.conversacion_id ? Number(row.conversacion_id) : null,
      borrador_id: row.borrador_id ? Number(row.borrador_id) : null,
      pedido_id: row.pedido_id ? Number(row.pedido_id) : null,
      cliente_id: row.cliente_id ? Number(row.cliente_id) : null,
    })),
  };
}

function buildAttributionFromCampaign(campaign) {
  if (!campaign) return null;
  return {
    marketing_campana_id: Number(campaign.id),
    marketing_promo_id: campaign.promo_id ? Number(campaign.promo_id) : null,
    marketing_origen: cleanText(campaign.canal || 'general') || 'general',
    marketing_codigo: cleanText(campaign.tracking_slug || ''),
    marketing_source:
      cleanText(campaign.marketing_source || campaign.canal || 'general') || 'general',
    marketing_medium:
      cleanText(campaign.marketing_medium || deriveMedium(campaign.canal)) ||
      deriveMedium(campaign.canal),
    marketing_campaign: cleanText(
      campaign.marketing_campaign || campaign.tracking_slug || campaign.nombre || ''
    ),
    marketing_content: cleanText(campaign.marketing_content || campaign.contenido_titulo || ''),
  };
}

function normalizeAttributionFields(input = {}) {
  const normalized = {
    marketing_campana_id: toNullableNumber(input.marketing_campana_id),
    marketing_promo_id: toNullableNumber(input.marketing_promo_id),
    marketing_origen: cleanText(input.marketing_origen || ''),
    marketing_codigo: cleanText(input.marketing_codigo || ''),
    marketing_source: cleanText(input.marketing_source || ''),
    marketing_medium: cleanText(input.marketing_medium || ''),
    marketing_campaign: cleanText(input.marketing_campaign || ''),
    marketing_content: cleanText(input.marketing_content || ''),
  };

  if (!normalized.marketing_promo_id && normalized.marketing_campana_id) {
    const campaign = getCampaignById(normalized.marketing_campana_id);
    const fromCampaign = buildAttributionFromCampaign(campaign);
    if (fromCampaign) {
      normalized.marketing_promo_id = fromCampaign.marketing_promo_id;
      normalized.marketing_origen = normalized.marketing_origen || fromCampaign.marketing_origen;
      normalized.marketing_codigo = normalized.marketing_codigo || fromCampaign.marketing_codigo;
      normalized.marketing_source = normalized.marketing_source || fromCampaign.marketing_source;
      normalized.marketing_medium = normalized.marketing_medium || fromCampaign.marketing_medium;
      normalized.marketing_campaign =
        normalized.marketing_campaign || fromCampaign.marketing_campaign;
      normalized.marketing_content = normalized.marketing_content || fromCampaign.marketing_content;
    }
  }

  return normalized;
}

function hasAttributionFields(input = {}) {
  return Boolean(
    input.marketing_campana_id ||
    input.marketing_promo_id ||
    cleanText(input.marketing_origen || '') ||
    cleanText(input.marketing_codigo || '') ||
    cleanText(input.marketing_source || '') ||
    cleanText(input.marketing_medium || '') ||
    cleanText(input.marketing_campaign || '') ||
    cleanText(input.marketing_content || '')
  );
}

function matchCampaignByTracking(messageText = '') {
  const normalizedMessage = normalizeText(messageText);
  if (!normalizedMessage) return null;
  const compactMessage = normalizedMessage.replace(/[^a-z0-9]/g, '');

  const campaigns = listCampanas().filter((item) => isWithinWindow(item));
  const candidates = campaigns
    .map((campaign) => {
      const code = cleanText(campaign.tracking_slug || '');
      if (!code) return null;
      const normalizedCode = normalizeText(code);
      const compactCode = normalizedCode.replace(/[^a-z0-9]/g, '');
      const matched =
        normalizedMessage.includes(normalizedCode) ||
        (compactCode && compactMessage.includes(compactCode));
      if (!matched) return null;
      return {
        campaign,
        score: normalizedCode.length,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.campaign || null;
}

function updateDraftAttributionByConversation(conversationId, attribution) {
  if (!conversationId || !hasAttributionFields(attribution)) return null;

  const draft = db
    .prepare(
      `
    SELECT id
    FROM whatsapp_pedidos_borrador
    WHERE conversacion_id = ? AND estado = 'abierto'
    ORDER BY id DESC
    LIMIT 1
  `
    )
    .get(Number(conversationId));

  if (!draft?.id) return null;

  db.prepare(
    `
    UPDATE whatsapp_pedidos_borrador
    SET marketing_campana_id = ?,
        marketing_promo_id = ?,
        marketing_origen = ?,
        marketing_codigo = ?,
        marketing_source = ?,
        marketing_medium = ?,
        marketing_campaign = ?,
        marketing_content = ?,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    attribution.marketing_campana_id,
    attribution.marketing_promo_id,
    attribution.marketing_origen,
    attribution.marketing_codigo,
    attribution.marketing_source,
    attribution.marketing_medium,
    attribution.marketing_campaign,
    attribution.marketing_content,
    draft.id
  );

  return Number(draft.id);
}

function registerAttributionEvent({
  eventType,
  attribution = {},
  conversacionId = null,
  borradorId = null,
  pedidoId = null,
  clienteId = null,
  telefono = '',
  amount = 0,
  metadata = {},
}) {
  if (!hasAttributionFields(attribution)) return null;
  const payload = normalizeAttributionFields(attribution);
  const result = db
    .prepare(
      `
    INSERT INTO marketing_atribuciones (
      event_type, marketing_campana_id, marketing_promo_id, marketing_origen, marketing_codigo,
      marketing_source, marketing_medium, marketing_campaign, marketing_content,
      conversacion_id, borrador_id, pedido_id, cliente_id, telefono, amount, metadata_json, creado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `
    )
    .run(
      cleanText(eventType || 'evento'),
      payload.marketing_campana_id,
      payload.marketing_promo_id,
      payload.marketing_origen,
      payload.marketing_codigo,
      payload.marketing_source,
      payload.marketing_medium,
      payload.marketing_campaign,
      payload.marketing_content,
      toNullableNumber(conversacionId),
      toNullableNumber(borradorId),
      toNullableNumber(pedidoId),
      toNullableNumber(clienteId),
      cleanText(telefono || ''),
      Number(amount || 0),
      safeJson(metadata)
    );
  return Number(result.lastInsertRowid);
}

function applyConversationAttribution({ conversationId, telefono = '', messageText = '' }) {
  const current = db
    .prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?')
    .get(Number(conversationId));
  if (!current) return null;

  const existingAttribution = normalizeAttributionFields(current);
  if (hasAttributionFields(existingAttribution)) {
    updateDraftAttributionByConversation(conversationId, existingAttribution);
    return current;
  }

  const campaign = matchCampaignByTracking(messageText);
  if (!campaign) {
    return current;
  }

  const attribution = buildAttributionFromCampaign(campaign);
  db.prepare(
    `
    UPDATE whatsapp_conversaciones
    SET marketing_campana_id = ?,
        marketing_promo_id = ?,
        marketing_origen = ?,
        marketing_codigo = ?,
        marketing_source = ?,
        marketing_medium = ?,
        marketing_campaign = ?,
        marketing_content = ?,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    attribution.marketing_campana_id,
    attribution.marketing_promo_id,
    attribution.marketing_origen,
    attribution.marketing_codigo,
    attribution.marketing_source,
    attribution.marketing_medium,
    attribution.marketing_campaign,
    attribution.marketing_content,
    Number(conversationId)
  );

  const borradorId = updateDraftAttributionByConversation(conversationId, attribution);
  registerAttributionEvent({
    eventType: 'conversacion_atribuida',
    attribution,
    conversacionId: conversationId,
    borradorId,
    telefono,
    metadata: {
      matched_tracking_slug: campaign.tracking_slug,
      campana_nombre: campaign.nombre,
      source_message: cleanText(messageText),
    },
  });

  return db
    .prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?')
    .get(Number(conversationId));
}

function syncDraftAttributionFromConversation({ conversationId, draftId }) {
  const conversation = db
    .prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?')
    .get(Number(conversationId));
  if (!conversation) return null;

  const attribution = normalizeAttributionFields(conversation);
  if (!hasAttributionFields(attribution)) return null;

  db.prepare(
    `
    UPDATE whatsapp_pedidos_borrador
    SET marketing_campana_id = ?,
        marketing_promo_id = ?,
        marketing_origen = ?,
        marketing_codigo = ?,
        marketing_source = ?,
        marketing_medium = ?,
        marketing_campaign = ?,
        marketing_content = ?,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    attribution.marketing_campana_id,
    attribution.marketing_promo_id,
    attribution.marketing_origen,
    attribution.marketing_codigo,
    attribution.marketing_source,
    attribution.marketing_medium,
    attribution.marketing_campaign,
    attribution.marketing_content,
    Number(draftId)
  );

  registerAttributionEvent({
    eventType: 'borrador_atribuido',
    attribution,
    conversacionId: conversationId,
    borradorId: draftId,
    telefono: conversation.telefono || '',
    metadata: {
      via: 'conversation_sync',
    },
  });

  return db.prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?').get(Number(draftId));
}

function registerPedidoAttribution({ pedidoId, payload = {}, clienteId = null, telefono = '' }) {
  const attribution = normalizeAttributionFields(payload);
  if (!hasAttributionFields(attribution) || !pedidoId) return null;

  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(Number(pedidoId));
  if (!pedido) return null;

  registerAttributionEvent({
    eventType: 'pedido_atribuido',
    attribution,
    pedidoId,
    clienteId: clienteId || pedido.cliente_id || null,
    telefono: telefono || pedido.cliente_telefono || '',
    amount: Number(pedido.total || 0),
    metadata: {
      numero: pedido.numero,
      origen: pedido.origen,
      total: Number(pedido.total || 0),
    },
  });

  const previousByClient = pedido.cliente_id
    ? db
        .prepare(
          `
      SELECT id
      FROM pedidos
      WHERE id < ?
        AND estado != 'cancelado'
        AND cliente_id = ?
      LIMIT 1
    `
        )
        .get(pedido.id, pedido.cliente_id)
    : null;

  const comparable = comparablePhone(pedido.cliente_telefono || telefono);
  const previousByPhone =
    !previousByClient && comparable
      ? db
          .prepare(
            `
      SELECT id
      FROM pedidos
      WHERE id < ?
        AND estado != 'cancelado'
        AND REPLACE(REPLACE(REPLACE(cliente_telefono, ' ', ''), '+', ''), '-', '') LIKE ?
      LIMIT 1
    `
          )
          .get(pedido.id, `%${comparable}`)
      : null;

  if (!previousByClient && !previousByPhone) {
    registerAttributionEvent({
      eventType: 'cliente_nuevo_estimado',
      attribution,
      pedidoId,
      clienteId: clienteId || pedido.cliente_id || null,
      telefono: telefono || pedido.cliente_telefono || '',
      amount: Number(pedido.total || 0),
      metadata: {
        numero: pedido.numero,
        reason: 'first_attributed_order',
      },
    });
  }

  return pedido;
}

function mapPublisherDestination(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    activo: Number(row.activo) === 1,
    orden: Number(row.orden || 0),
    preview_path: row.preview_path || '',
  };
}

function normalizePublisherUrl(value = '') {
  let url = cleanText(value).toLowerCase();
  if (!url) return '';
  url = url.replace(/^https?:\/\//, '');
  url = url.replace(/^www\./, '');
  url = url.replace(/\/+$/, '');
  return url;
}

function mapPublisherPost(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
  };
}

function mapPublisherQueueRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    publicacion_id: Number(row.publicacion_id),
    destino_id: Number(row.destino_id),
    orden: Number(row.orden || 0),
  };
}

function normalizePublisherDestinationPayload(input = {}, current = null) {
  const nombre = cleanText(input.nombre || current?.nombre || '');
  const url = cleanText(input.url || current?.url || '');
  if (!nombre) throw new Error('El nombre del destino es obligatorio');
  if (!url) throw new Error('La URL del destino es obligatoria');

  return {
    nombre,
    url,
    tipo: cleanText(input.tipo || current?.tipo || 'grupo_facebook') || 'grupo_facebook',
    activo: toBool(input.activo ?? current?.activo, true) ? 1 : 0,
    orden: Number(input.orden ?? current?.orden ?? 0) || 0,
    notas: cleanText(input.notas ?? current?.notas ?? ''),
  };
}

function findPublisherDestinationDuplicate(url, excludeId = null) {
  const normalized = normalizePublisherUrl(url);
  if (!normalized) return null;

  const rows = db.prepare('SELECT * FROM marketing_publicador_destinos').all();
  return (
    rows
      .map(mapPublisherDestination)
      .find(
        (item) =>
          Number(item.id) !== Number(excludeId || 0) &&
          normalizePublisherUrl(item.url) === normalized
      ) || null
  );
}

function listPublisherDestinations() {
  return db
    .prepare(
      `
    SELECT *
    FROM marketing_publicador_destinos
    ORDER BY activo DESC,
             CASE WHEN orden > 0 THEN 0 ELSE 1 END ASC,
             CASE WHEN orden > 0 THEN orden ELSE 999999 END ASC,
             datetime(creado_en) DESC,
             nombre COLLATE NOCASE ASC
  `
    )
    .all()
    .map(mapPublisherDestination);
}

function getPublisherDestinationById(id) {
  if (!id) return null;
  return mapPublisherDestination(
    db.prepare('SELECT * FROM marketing_publicador_destinos WHERE id = ?').get(Number(id))
  );
}

function createPublisherDestination(input = {}) {
  const payload = normalizePublisherDestinationPayload(input);
  const duplicate = findPublisherDestinationDuplicate(payload.url);
  if (duplicate) {
    throw new Error(`Ese destino ya existe: ${duplicate.nombre}`);
  }
  const result = db
    .prepare(
      `
    INSERT INTO marketing_publicador_destinos (nombre, url, tipo, activo, orden, notas, creado_en, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `
    )
    .run(payload.nombre, payload.url, payload.tipo, payload.activo, payload.orden, payload.notas);
  return getPublisherDestinationById(result.lastInsertRowid);
}

function updatePublisherDestination(id, input = {}) {
  const current = getPublisherDestinationById(id);
  if (!current) throw new Error('Destino no encontrado');
  const payload = normalizePublisherDestinationPayload(input, current);
  const duplicate = findPublisherDestinationDuplicate(payload.url, id);
  if (duplicate) {
    throw new Error(`Ese destino ya existe: ${duplicate.nombre}`);
  }
  db.prepare(
    `
    UPDATE marketing_publicador_destinos
    SET nombre = ?, url = ?, tipo = ?, activo = ?, orden = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    payload.nombre,
    payload.url,
    payload.tipo,
    payload.activo,
    payload.orden,
    payload.notas,
    Number(id)
  );
  return getPublisherDestinationById(id);
}

function deletePublisherDestination(id) {
  const current = getPublisherDestinationById(id);
  if (!current) throw new Error('Destino no encontrado');
  db.prepare('DELETE FROM marketing_publicador_destinos WHERE id = ?').run(Number(id));
  return current;
}

function updatePublisherDestinationPreview(id, previewPath = '') {
  const current = getPublisherDestinationById(id);
  if (!current) throw new Error('Destino no encontrado');
  db.prepare(
    `
    UPDATE marketing_publicador_destinos
    SET preview_path = ?, preview_actualizado_en = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(cleanText(previewPath || ''), Number(id));
  return getPublisherDestinationById(id);
}

function normalizePublisherPostPayload(input = {}, current = null) {
  const titulo = cleanText(input.titulo || current?.titulo || '');
  if (!titulo) throw new Error('El titulo de la publicacion es obligatorio');

  const estado =
    cleanText(input.estado || current?.estado || 'borrador').toLowerCase() || 'borrador';
  if (!new Set(['borrador', 'listo', 'publicando', 'publicado']).has(estado)) {
    throw new Error('El estado de la publicacion no es valido');
  }

  return {
    titulo,
    mensaje: String(input.mensaje ?? current?.mensaje ?? '').trim(),
    link_url: cleanText(input.link_url ?? current?.link_url ?? ''),
    media_path: cleanText(input.media_path ?? current?.media_path ?? ''),
    media_mime: cleanText(input.media_mime ?? current?.media_mime ?? ''),
    media_nombre: cleanText(input.media_nombre ?? current?.media_nombre ?? ''),
    estado,
  };
}

function listPublisherPosts() {
  return db
    .prepare(
      `
    SELECT p.*,
      (SELECT COUNT(*) FROM marketing_publicador_envios e WHERE e.publicacion_id = p.id) AS destinos_total,
      (SELECT COUNT(*) FROM marketing_publicador_envios e WHERE e.publicacion_id = p.id AND e.estado = 'publicado') AS destinos_publicados,
      (SELECT COUNT(*) FROM marketing_publicador_envios e WHERE e.publicacion_id = p.id AND e.estado IN ('pendiente', 'abierto', 'error')) AS destinos_pendientes
    FROM marketing_publicador_publicaciones p
    ORDER BY datetime(p.actualizado_en) DESC, p.id DESC
  `
    )
    .all()
    .map(mapPublisherPost);
}

function getPublisherPostById(id) {
  if (!id) return null;
  return mapPublisherPost(
    db
      .prepare(
        `
      SELECT p.*,
        (SELECT COUNT(*) FROM marketing_publicador_envios e WHERE e.publicacion_id = p.id) AS destinos_total,
        (SELECT COUNT(*) FROM marketing_publicador_envios e WHERE e.publicacion_id = p.id AND e.estado = 'publicado') AS destinos_publicados,
        (SELECT COUNT(*) FROM marketing_publicador_envios e WHERE e.publicacion_id = p.id AND e.estado IN ('pendiente', 'abierto', 'error')) AS destinos_pendientes
      FROM marketing_publicador_publicaciones p
      WHERE p.id = ?
    `
      )
      .get(Number(id))
  );
}

function createPublisherPost(input = {}) {
  const payload = normalizePublisherPostPayload(input);
  const result = db
    .prepare(
      `
    INSERT INTO marketing_publicador_publicaciones (
      titulo, mensaje, link_url, media_path, media_mime, media_nombre, estado, creado_en, actualizado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `
    )
    .run(
      payload.titulo,
      payload.mensaje,
      payload.link_url,
      payload.media_path,
      payload.media_mime,
      payload.media_nombre,
      payload.estado
    );
  return getPublisherPostById(result.lastInsertRowid);
}

function updatePublisherPost(id, input = {}) {
  const current = getPublisherPostById(id);
  if (!current) throw new Error('Publicacion no encontrada');
  const payload = normalizePublisherPostPayload(input, current);
  db.prepare(
    `
    UPDATE marketing_publicador_publicaciones
    SET titulo = ?, mensaje = ?, link_url = ?, media_path = ?, media_mime = ?, media_nombre = ?, estado = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    payload.titulo,
    payload.mensaje,
    payload.link_url,
    payload.media_path,
    payload.media_mime,
    payload.media_nombre,
    payload.estado,
    Number(id)
  );
  return getPublisherPostById(id);
}

function deletePublisherPost(id) {
  const current = getPublisherPostById(id);
  if (!current) throw new Error('Publicacion no encontrada');
  db.prepare('DELETE FROM marketing_publicador_publicaciones WHERE id = ?').run(Number(id));
  return current;
}

function buildPublisherText(post) {
  return [String(post?.mensaje || '').trim(), String(post?.link_url || '').trim()]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function listPublisherQueue(postId) {
  const post = getPublisherPostById(postId);
  if (!post) throw new Error('Publicacion no encontrada');
  const items = db
    .prepare(
      `
    SELECT e.*, d.nombre AS destino_nombre, d.url AS destino_url, d.tipo AS destino_tipo
    FROM marketing_publicador_envios e
    JOIN marketing_publicador_destinos d ON d.id = e.destino_id
    WHERE e.publicacion_id = ?
    ORDER BY e.orden ASC, e.id ASC
  `
    )
    .all(Number(postId))
    .map((row) => {
      const mapped = mapPublisherQueueRow(row);
      return {
        ...mapped,
        texto_preparado: buildPublisherText(post),
        media_path: post.media_path || '',
        media_nombre: post.media_nombre || '',
        media_mime: post.media_mime || '',
        open_url: row.destino_url || '',
      };
    });
  return { publicacion: post, items };
}

function getPublisherQueueItemById(id) {
  const row = db
    .prepare(
      `
    SELECT e.*,
      d.nombre AS destino_nombre,
      d.url AS destino_url,
      d.tipo AS destino_tipo,
      p.titulo AS publicacion_titulo,
      p.mensaje AS publicacion_mensaje,
      p.link_url AS publicacion_link_url,
      p.media_path AS publicacion_media_path,
      p.media_mime AS publicacion_media_mime,
      p.media_nombre AS publicacion_media_nombre
    FROM marketing_publicador_envios e
    JOIN marketing_publicador_destinos d ON d.id = e.destino_id
    JOIN marketing_publicador_publicaciones p ON p.id = e.publicacion_id
    WHERE e.id = ?
  `
    )
    .get(Number(id));
  if (!row) return null;
  const mapped = mapPublisherQueueRow(row);
  return {
    ...mapped,
    destino_nombre: row.destino_nombre || '',
    destino_url: row.destino_url || '',
    destino_tipo: row.destino_tipo || '',
    publicacion_titulo: row.publicacion_titulo || '',
    publicacion_mensaje: row.publicacion_mensaje || '',
    publicacion_link_url: row.publicacion_link_url || '',
    publicacion_media_path: row.publicacion_media_path || '',
    publicacion_media_mime: row.publicacion_media_mime || '',
    publicacion_media_nombre: row.publicacion_media_nombre || '',
    texto_preparado: buildPublisherText({
      mensaje: row.publicacion_mensaje || '',
      link_url: row.publicacion_link_url || '',
    }),
  };
}

function planPublisherQueue(postId, destinationIds = null) {
  const post = getPublisherPostById(postId);
  if (!post) throw new Error('Publicacion no encontrada');

  const allDestinations = listPublisherDestinations().filter((item) => item.activo);
  const requestedIds =
    Array.isArray(destinationIds) && destinationIds.length
      ? destinationIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : allDestinations.map((item) => item.id);

  const selectedDestinations = allDestinations.filter((item) => requestedIds.includes(item.id));
  const seenUrls = new Set();
  const ids = [];
  selectedDestinations.forEach((item) => {
    const normalizedUrl = normalizePublisherUrl(item.url || '');
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
    seenUrls.add(normalizedUrl);
    ids.push(item.id);
  });

  if (!ids.length) throw new Error('No hay destinos activos para preparar la cola');

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM marketing_publicador_envios WHERE publicacion_id = ?').run(
      Number(postId)
    );
    const insert = db.prepare(`
      INSERT INTO marketing_publicador_envios (publicacion_id, destino_id, estado, orden, creado_en, actualizado_en)
      VALUES (?, ?, 'pendiente', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    ids.forEach((id, index) => insert.run(Number(postId), id, index + 1));
    db.prepare(
      `
      UPDATE marketing_publicador_publicaciones
      SET estado = 'listo', actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(Number(postId));
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  }
  return listPublisherQueue(postId);
}

function updatePublisherQueueItemStatus(id, estado, notas = '') {
  const normalized = cleanText(estado).toLowerCase();
  if (!new Set(['pendiente', 'abierto', 'publicado', 'omitido', 'error']).has(normalized)) {
    throw new Error('Estado de envio no valido');
  }
  const current = db
    .prepare('SELECT * FROM marketing_publicador_envios WHERE id = ?')
    .get(Number(id));
  if (!current) throw new Error('Envio no encontrado');

  db.prepare(
    `
    UPDATE marketing_publicador_envios
    SET estado = ?,
        notas = ?,
        abierto_en = CASE WHEN ? = 'abierto' THEN CURRENT_TIMESTAMP ELSE abierto_en END,
        publicado_en = CASE WHEN ? = 'publicado' THEN CURRENT_TIMESTAMP ELSE publicado_en END,
        omitido_en = CASE WHEN ? = 'omitido' THEN CURRENT_TIMESTAMP ELSE omitido_en END,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(normalized, cleanText(notas), normalized, normalized, normalized, Number(id));

  const publicacionId = Number(current.publicacion_id);
  const pendingCount = Number(
    db
      .prepare(
        `
    SELECT COUNT(*) AS total
    FROM marketing_publicador_envios
    WHERE publicacion_id = ? AND estado IN ('pendiente', 'abierto')
  `
      )
      .get(publicacionId)?.total || 0
  );
  const publishedCount = Number(
    db
      .prepare(
        `
    SELECT COUNT(*) AS total
    FROM marketing_publicador_envios
    WHERE publicacion_id = ? AND estado = 'publicado'
  `
      )
      .get(publicacionId)?.total || 0
  );
  const errorCount = Number(
    db
      .prepare(
        `
    SELECT COUNT(*) AS total
    FROM marketing_publicador_envios
    WHERE publicacion_id = ? AND estado = 'error'
  `
      )
      .get(publicacionId)?.total || 0
  );

  let postStatus = 'publicando';
  if (pendingCount === 0 && publishedCount > 0 && errorCount === 0) postStatus = 'publicado';
  else if (pendingCount === 0 && errorCount > 0) postStatus = 'listo';
  else if (publishedCount === 0) postStatus = 'listo';

  db.prepare(
    `
    UPDATE marketing_publicador_publicaciones
    SET estado = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(postStatus, publicacionId);

  return listPublisherQueue(publicacionId);
}

module.exports = {
  PROMO_TYPES,
  CONTENT_STATES,
  CALENDAR_STATES,
  cleanText,
  normalizeText,
  slugify,
  buildCampaignCta,
  normalizeAttributionFields,
  hasAttributionFields,
  listPromos,
  createPromo,
  updatePromo,
  deletePromo,
  listContenidos,
  createContenido,
  updateContenido,
  deleteContenido,
  listCampanas,
  createCampana,
  updateCampana,
  deleteCampana,
  listCalendario,
  createCalendario,
  updateCalendario,
  deleteCalendario,
  getReferences,
  getDashboard,
  getPromoById,
  getCampaignById,
  matchCampaignByTracking,
  buildAttributionFromCampaign,
  applyConversationAttribution,
  syncDraftAttributionFromConversation,
  registerPedidoAttribution,
  listPublisherDestinations,
  getPublisherDestinationById,
  createPublisherDestination,
  updatePublisherDestination,
  deletePublisherDestination,
  updatePublisherDestinationPreview,
  listPublisherPosts,
  getPublisherPostById,
  createPublisherPost,
  updatePublisherPost,
  deletePublisherPost,
  listPublisherQueue,
  getPublisherQueueItemById,
  planPublisherQueue,
  updatePublisherQueueItemStatus,
};
