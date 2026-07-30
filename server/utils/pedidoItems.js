function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const MONEY_PATTERNS = ['precio', 'costo', 'total', 'subtotal', 'descuento', 'monto', 'valor'];

function isMoneyKey(key = '') {
  const normalized = String(key || '').toLowerCase();
  return MONEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function scaleMoneyTreeToStorage(value, keyHint = '') {
  if (value === null || value === undefined || value === '') return value;

  if (Array.isArray(value)) {
    return value.map((entry) => scaleMoneyTreeToStorage(entry, keyHint));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, scaleMoneyTreeToStorage(entry, key)])
    );
  }

  if (typeof value === 'number' && Number.isFinite(value) && isMoneyKey(keyHint)) {
    return Math.round(value * 100);
  }

  return value;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(fallback) && Array.isArray(value)) return value;
  if (
    !Array.isArray(fallback) &&
    fallback &&
    typeof fallback === 'object' &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function cleanText(value = '') {
  return String(value || '').trim();
}

function normalizeText(value = '') {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function inferVariantsFromItem(base = {}) {
  const current = parseJson(base.variantes_json ?? base.variantes, {});
  if (
    current &&
    typeof current === 'object' &&
    !Array.isArray(current) &&
    Object.keys(current).length
  ) {
    return current;
  }

  const nombre = normalizeText(base.nombre || '');
  const descripcion = normalizeText(base.descripcion || '');
  const variants = {};

  if (descripcion.includes('entera')) variants.Presentacion = 'Entera';
  else if (descripcion.includes('mitad')) variants.Presentacion = 'Mitad';
  else if (nombre.includes('media docena')) variants.Presentacion = 'Media docena';
  else if (nombre.includes('docena')) variants.Presentacion = 'Docena';

  if (descripcion.includes('tipo: pollo')) variants.Tipo = 'Pollo';
  else if (descripcion.includes('tipo: ternera') || descripcion.includes('tipo: carne'))
    variants.Tipo = 'Ternera';

  return variants;
}

function normalizePedidoItem(rawItem = {}) {
  const base = rawItem && typeof rawItem === 'object' ? rawItem : {};
  const cantidad = Math.max(0, Number(base.cantidad || 0));
  const precioUnitario = roundAmount(base.precio_unitario ?? base.precio ?? 0);
  const subtotal = roundAmount(
    base.subtotal !== undefined && base.subtotal !== null
      ? base.subtotal
      : cantidad * precioUnitario
  );

  return {
    ...base,
    id: base.producto_id ?? base.id ?? null,
    producto_id: base.producto_id ?? base.id ?? null,
    categoria_id: base.categoria_id ?? null,
    nombre: String(base.nombre || '').trim(),
    cantidad,
    precio_unitario: precioUnitario,
    subtotal,
    descripcion: String(base.descripcion || '').trim(),
    variantes: inferVariantsFromItem(base),
    extras: parseJson(base.extras_json ?? base.extras, []),
  };
}

function parsePedidoItems(rawItems) {
  if (Array.isArray(rawItems)) {
    return rawItems
      .map(normalizePedidoItem)
      .filter((item) => item.nombre || Number(item.producto_id));
  }

  try {
    const parsed = JSON.parse(rawItems || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizePedidoItem).filter((item) => item.nombre || Number(item.producto_id))
      : [];
  } catch {
    return [];
  }
}

function scalePedidoItemsToStorage(items) {
  return parsePedidoItems(items).map((item) => scaleMoneyTreeToStorage(item));
}

function serializePedidoItems(items) {
  return JSON.stringify(
    parsePedidoItems(items).map((item) => {
      const { pedido_id, creado_en, variantes_json, extras_json, ...rest } = item;
      return rest;
    })
  );
}

function mapPedidoItemRow(row, fallback = {}) {
  const normalizedFallback = normalizePedidoItem(fallback);
  const normalizedRow = normalizePedidoItem({
    ...normalizedFallback,
    ...row,
    variantes: row?.variantes_json,
    extras: row?.extras_json,
    descripcion: row?.descripcion || normalizedFallback.descripcion || '',
  });

  return {
    ...normalizedFallback,
    ...normalizedRow,
    descripcion: normalizedRow.descripcion || normalizedFallback.descripcion || '',
  };
}

function getPedidoItemRows(db, pedidoId) {
  return db
    .prepare(
      `
    SELECT *
    FROM pedido_items
    WHERE pedido_id = ?
    ORDER BY id ASC
  `
    )
    .all(pedidoId);
}

function loadPedidoItems(db, pedidoOrId, options = {}) {
  const pedido =
    typeof pedidoOrId === 'object' && pedidoOrId
      ? pedidoOrId
      : db.prepare('SELECT id, items FROM pedidos WHERE id = ?').get(pedidoOrId);

  if (!pedido?.id) return [];

  const fallbackItems = parsePedidoItems(pedido.items);
  const rows = getPedidoItemRows(db, pedido.id);

  if (!rows.length) {
    if (options.backfill !== false && fallbackItems.length) {
      replacePedidoItems(db, pedido.id, fallbackItems);
    }
    return fallbackItems;
  }

  return rows.map((row, index) => mapPedidoItemRow(row, fallbackItems[index] || {}));
}

function replacePedidoItems(db, pedidoId, items = []) {
  const normalizedItems = parsePedidoItems(items);
  const deleteStmt = db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?');
  const findProductStmt = db.prepare('SELECT id, categoria_id FROM productos WHERE id = ?');
  const findCategoryStmt = db.prepare('SELECT id FROM categorias WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO pedido_items (
      pedido_id, producto_id, nombre, cantidad, precio_unitario, subtotal,
      variantes_json, extras_json, categoria_id, descripcion, creado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  deleteStmt.run(pedidoId);
  normalizedItems.forEach((item) => {
    const requestedProductId = Number(item.producto_id || 0);
    const product =
      Number.isFinite(requestedProductId) && requestedProductId > 0
        ? findProductStmt.get(requestedProductId)
        : null;
    const requestedCategoryId = Number(item.categoria_id || 0);
    const categoryCandidate =
      Number.isFinite(requestedCategoryId) && requestedCategoryId > 0
        ? requestedCategoryId
        : Number(product?.categoria_id || 0);
    const category =
      Number.isFinite(categoryCandidate) && categoryCandidate > 0
        ? findCategoryStmt.get(categoryCandidate)
        : null;

    insertStmt.run(
      pedidoId,
      product?.id || null,
      item.nombre || '',
      Number(item.cantidad || 0),
      Number(item.precio_unitario || 0),
      roundAmount(
        item.subtotal !== undefined
          ? item.subtotal
          : Number(item.cantidad || 0) * Number(item.precio_unitario || 0)
      ),
      JSON.stringify(item.variantes || {}),
      JSON.stringify(item.extras || []),
      category?.id || null,
      item.descripcion || ''
    );
  });

  return normalizedItems;
}

function backfillPedidoItems(db, options = {}) {
  const limit = Math.max(1, Number(options.limit || 5000));
  const rows = db
    .prepare(
      `
    SELECT p.id, p.items
    FROM pedidos p
    WHERE TRIM(COALESCE(p.items, '')) != ''
      AND NOT EXISTS (
        SELECT 1
        FROM pedido_items pi
        WHERE pi.pedido_id = p.id
      )
    ORDER BY p.id ASC
    LIMIT ?
  `
    )
    .all(limit);

  let synced = 0;
  rows.forEach((pedido) => {
    const items = parsePedidoItems(pedido.items);
    if (!items.length) return;
    replacePedidoItems(db, pedido.id, items);
    synced += 1;
  });

  return synced;
}

module.exports = {
  roundAmount,
  parsePedidoItems,
  scalePedidoItemsToStorage,
  serializePedidoItems,
  loadPedidoItems,
  replacePedidoItems,
  backfillPedidoItems,
};
