const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');

const MAX_ORDERS = 20;

router.use(auth, requirePermission('tpv.use'));

function parseSnapshot(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function rowToOrder(row) {
  return {
    id: row.id,
    label: row.label || '',
    total: Number(row.total || 0),
    totalItems: Number(row.total_items || 0),
    createdAt: row.creado_en || '',
    snapshot: parseSnapshot(row.snapshot),
  };
}

router.get('/espera', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM tpv_pedidos_espera ORDER BY creado_en DESC LIMIT ?')
    .all(MAX_ORDERS);
  res.json(rows.map(rowToOrder));
});

// Reemplaza la lista completa de pedidos en espera. El cliente maneja el
// arreglo en memoria (crear, restaurar, duplicar, borrar) y sincroniza el
// estado final acá para que se comparta entre terminales del TPV.
router.put('/espera', (req, res) => {
  const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];

  const insert = db.prepare(`
    INSERT INTO tpv_pedidos_espera (id, label, total, total_items, snapshot, creado_en)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const trx = db.transaction((items) => {
    db.prepare('DELETE FROM tpv_pedidos_espera').run();
    items.slice(0, MAX_ORDERS).forEach((item) => {
      const id = String(item?.id || '').trim();
      if (!id) return;
      insert.run(
        id,
        String(item?.label || '').slice(0, 200),
        Number(item?.total || 0),
        Number(item?.totalItems || 0),
        JSON.stringify(item?.snapshot || {}),
        String(item?.createdAt || new Date().toISOString())
      );
    });
  });

  try {
    trx(orders);
    const rows = db
      .prepare('SELECT * FROM tpv_pedidos_espera ORDER BY creado_en DESC LIMIT ?')
      .all(MAX_ORDERS);
    res.json(rows.map(rowToOrder));
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo guardar la venta en espera' });
  }
});

module.exports = router;
