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

// Guarda (o actualiza si ya existe el mismo id) UN pedido en espera. Se usa
// una operacion por item -en vez de reemplazar la lista completa- para que
// dos terminales de TPV puedan guardar/borrar pedidos en espera al mismo
// tiempo sin pisarse: si mandaramos la lista entera en cada sync, una
// terminal con datos un poco viejos podia resucitar un pedido que la otra
// ya habia borrado momentos antes.
router.post('/espera', (req, res) => {
  const item = req.body || {};
  const id = String(item?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Falta id del pedido en espera' });

  try {
    db.prepare(
      `
      INSERT INTO tpv_pedidos_espera (id, label, total, total_items, snapshot, creado_en)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        total = excluded.total,
        total_items = excluded.total_items,
        snapshot = excluded.snapshot
    `
    ).run(
      id,
      String(item?.label || '').slice(0, 200),
      Number(item?.total || 0),
      Number(item?.totalItems || 0),
      JSON.stringify(item?.snapshot || {}),
      String(item?.createdAt || new Date().toISOString())
    );

    // Mantenemos como maximo MAX_ORDERS pedidos en espera; si se paso el
    // limite, se descartan los mas viejos.
    const excedentes = db
      .prepare(
        'SELECT id FROM tpv_pedidos_espera ORDER BY creado_en DESC, rowid DESC LIMIT -1 OFFSET ?'
      )
      .all(MAX_ORDERS);
    if (excedentes.length > 0) {
      const del = db.prepare('DELETE FROM tpv_pedidos_espera WHERE id = ?');
      excedentes.forEach((row) => del.run(row.id));
    }

    const saved = db.prepare('SELECT * FROM tpv_pedidos_espera WHERE id = ?').get(id);
    res.json(rowToOrder(saved));
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo guardar la venta en espera' });
  }
});

router.delete('/espera/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Falta id del pedido en espera' });
  db.prepare('DELETE FROM tpv_pedidos_espera WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
