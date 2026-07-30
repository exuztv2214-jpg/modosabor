const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { insertInventoryMovement, roundStock } = require('../utils/inventory');

router.get('/', auth, requirePermission('productos.edit'), (req, res) => {
  const compras = db
    .prepare('SELECT * FROM inventario_compras ORDER BY creado_en DESC LIMIT 100')
    .all();
  res.json(compras);
});

router.get('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const compra = db.prepare('SELECT * FROM inventario_compras WHERE id = ?').get(req.params.id);
  if (!compra) return res.status(404).json({ error: 'Compra no encontrada' });

  const items = db
    .prepare(
      `
    SELECT ci.*, i.nombre as insumo_nombre, i.unidad
    FROM inventario_compra_items ci
    JOIN inventario_insumos i ON ci.insumo_id = i.id
    WHERE ci.compra_id = ?
  `
    )
    .all(compra.id);

  res.json({ ...compra, items });
});

router.post('/', auth, requirePermission('productos.edit'), (req, res) => {
  const { proveedor, total, metodo_pago, referencia_pago, notas, items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debes incluir al menos un insumo en la compra' });
  }

  const actor = actorFromRequest(req);

  try {
    db.exec('BEGIN');

    // 1. Crear la cabecera de la compra
    const result = db
      .prepare(
        `
      INSERT INTO inventario_compras (proveedor, total, metodo_pago, referencia_pago, notas, actor_id, actor_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        proveedor || '',
        Number(total || 0),
        metodo_pago || 'efectivo',
        referencia_pago || '',
        notas || '',
        actor.actor_id,
        actor.actor_nombre
      );

    const compraId = result.lastInsertRowid;

    // 2. Procesar cada item
    const insItem = db.prepare(`
      INSERT INTO inventario_compra_items (compra_id, insumo_id, cantidad, costo_unitario, subtotal)
      VALUES (?, ?, ?, ?, ?)
    `);

    items.forEach((item) => {
      const cantidad = Number(item.cantidad || 0);
      const costo = Number(item.costo_unitario || 0);
      const subtotal = roundStock(cantidad * costo);

      insItem.run(compraId, item.insumo_id, cantidad, costo, subtotal);

      // 3. Actualizar stock y costo en la tabla de insumos
      // Usamos costo promedio ponderado simple o simplemente actualizamos al ultimo costo
      db.prepare(
        `
        UPDATE inventario_insumos 
        SET stock_actual = ROUND((stock_actual + ?) * 100) / 100,
            costo_unitario = ?,
            actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(cantidad, costo, item.insumo_id);

      // 4. Registrar movimiento de inventario
      insertInventoryMovement(db, {
        insumo_id: item.insumo_id,
        cantidad: cantidad,
        tipo: 'compra',
        motivo: `Ingreso por compra #${compraId} - Prov: ${proveedor || 'S/D'}`,
        detalle: { compra_id: compraId, proveedor },
      });
    });

    db.exec('COMMIT');

    logAudit(db, {
      modulo: 'inventario',
      accion: 'registrar_compra',
      entidad: 'compra',
      entidad_id: compraId,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: { proveedor, total, items_count: items.length },
    });

    res.json({ id: compraId, success: true });
  } catch (error) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
