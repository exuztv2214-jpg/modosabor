const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { insertInventoryMovement } = require('../utils/inventory');
const { getActiveCaja } = require('../utils/operationalCaja');

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

/**
 * Registra una compra: cabecera, items, stock y movimientos de inventario.
 *
 * Está separada de la ruta para que el asistente registre compras con
 * exactamente esta lógica. Si fueran dos implementaciones, en algún momento se
 * separarían y el stock quedaría distinto según por dónde se cargue la compra.
 *
 * Los montos llegan en centavos, como en toda la base. La ruta los recibe ya
 * convertidos por el middleware; quien la llame desde adentro tiene que
 * convertirlos por su cuenta.
 */
function registrarCompra({ proveedor, metodo_pago, referencia_pago, notas, items }, actor) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Debes incluir al menos un insumo en la compra');
  }

  const metodoPago = String(metodo_pago || 'efectivo')
    .trim()
    .toLowerCase();
  if (!['efectivo', 'transferencia', 'cuenta_corriente'].includes(metodoPago)) {
    throw new Error('El método de pago de la compra no es válido');
  }
  const normalizedItems = items.map((item) => ({
    insumo_id: Number(item?.insumo_id),
    cantidad: Number(item?.cantidad),
    costo_unitario: Number(item?.costo_unitario),
  }));
  const invalid = normalizedItems.find(
    (item) =>
      !Number.isInteger(item.insumo_id) ||
      item.insumo_id <= 0 ||
      !Number.isFinite(item.cantidad) ||
      item.cantidad <= 0 ||
      !Number.isFinite(item.costo_unitario) ||
      item.costo_unitario < 0
  );
  if (invalid) throw new Error('Hay insumos, cantidades o costos inválidos');

  const uniqueIds = new Set(normalizedItems.map((item) => item.insumo_id));
  if (uniqueIds.size !== normalizedItems.length) {
    throw new Error('Un mismo insumo no puede aparecer dos veces en la compra');
  }
  const placeholders = [...uniqueIds].map(() => '?').join(',');
  const existingCount = db
    .prepare(`SELECT COUNT(*) AS total FROM inventario_insumos WHERE id IN (${placeholders})`)
    .get(...uniqueIds).total;
  if (Number(existingCount) !== uniqueIds.size) {
    throw new Error('Uno de los insumos ya no existe');
  }

  const totalCalculado = normalizedItems.reduce(
    (sum, item) => sum + Math.round(item.cantidad * item.costo_unitario),
    0
  );
  const cajaActiva = metodoPago === 'efectivo' ? getActiveCaja(db) : null;
  if (metodoPago === 'efectivo' && !cajaActiva) {
    throw new Error('Debes abrir la caja antes de pagar una compra en efectivo');
  }

  db.exec('BEGIN');
  try {
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
        totalCalculado,
        metodoPago,
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

    normalizedItems.forEach((item) => {
      const cantidad = Number(item.cantidad || 0);
      const costo = Number(item.costo_unitario || 0);
      const subtotal = Math.round(cantidad * costo);

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

    if (metodoPago === 'efectivo') {
      db.prepare(
        `INSERT INTO caja_movimientos
          (cierre_id, tipo, monto, motivo, actor_id, actor_nombre)
         VALUES (?, 'salida', ?, ?, ?, ?)`
      ).run(
        cajaActiva.id,
        totalCalculado,
        `Compra de insumos #${compraId}${proveedor ? ` - ${proveedor}` : ''}`,
        actor.actor_id,
        actor.actor_nombre
      );
    }

    db.exec('COMMIT');

    logAudit(db, {
      modulo: 'inventario',
      accion: 'registrar_compra',
      entidad: 'compra',
      entidad_id: compraId,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: { proveedor, total: totalCalculado, items_count: normalizedItems.length },
    });

    return compraId;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

router.post('/', auth, requirePermission('productos.edit'), (req, res) => {
  try {
    const compraId = registrarCompra(req.body || {}, actorFromRequest(req));
    res.json({ id: compraId, success: true });
  } catch (error) {
    const esDeValidacion =
      /al menos un insumo|método de pago|inválid|no puede aparecer|ya no existe|abrir la caja/i.test(
        String(error.message || '')
      );
    res.status(esDeValidacion ? 400 : 500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.registrarCompra = registrarCompra;
