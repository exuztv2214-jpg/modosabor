const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const { requirePermission } = require('../utils/permissions');

const router = express.Router();

function validateCuponData(data) {
  const errors = [];

  if (!data.codigo || data.codigo.trim().length < 3) {
    errors.push('El código debe tener al menos 3 caracteres');
  }

  if (!['porcentaje', 'fijo'].includes(data.tipo_descuento)) {
    errors.push('Tipo de descuento inválido');
  }

  const valor = parseFloat(data.valor_descuento);
  if (isNaN(valor) || valor <= 0) {
    errors.push('El valor de descuento debe ser mayor a 0');
  }

  if (data.tipo_descuento === 'porcentaje' && valor > 100) {
    errors.push('El porcentaje no puede ser mayor a 100');
  }

  if (data.fecha_inicio && data.fecha_fin) {
    const start = new Date(data.fecha_inicio);
    const end = new Date(data.fecha_fin);
    if (end < start) {
      errors.push('La fecha de fin debe ser posterior a la fecha de inicio');
    }
  }

  return errors;
}

router.get('/', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const { activo, search } = req.query;
    let query = 'SELECT * FROM cupones WHERE 1=1';
    const params = [];

    if (activo !== undefined) {
      query += ' AND activo = ?';
      params.push(activo === '1' ? 1 : 0);
    }

    if (search) {
      query += ' AND (codigo LIKE ? OR descripcion LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY creado_en DESC';

    const cupones = db.prepare(query).all(...params);
    res.json(cupones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const cupon = db.prepare('SELECT * FROM cupones WHERE id = ?').get(req.params.id);
    if (!cupon) {
      return res.status(404).json({ error: 'Cupón no encontrado' });
    }

    const usos = db
      .prepare(
        `
      SELECT cu.*, p.numero as pedido_numero, c.nombre as cliente_nombre
      FROM cupones_usados cu
      LEFT JOIN pedidos p ON cu.pedido_id = p.id
      LEFT JOIN clientes c ON cu.cliente_id = c.id
      WHERE cu.cupon_id = ?
      ORDER BY cu.creado_en DESC
    `
      )
      .all(req.params.id);

    res.json({ ...cupon, usos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const errors = validateCuponData(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const {
      codigo,
      descripcion,
      tipo_descuento,
      valor_descuento,
      minimo_compra,
      descuento_maximo,
      fecha_inicio,
      fecha_fin,
      limite_usos,
      limite_por_cliente,
      activo,
    } = req.body;

    const existing = db
      .prepare('SELECT id FROM cupones WHERE codigo = ?')
      .get(codigo.trim().toUpperCase());
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un cupón con ese código' });
    }

    const result = db
      .prepare(
        `
      INSERT INTO cupones (
        codigo, descripcion, tipo_descuento, valor_descuento, minimo_compra,
        descuento_maximo, fecha_inicio, fecha_fin, limite_usos, limite_por_cliente, activo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        codigo.trim().toUpperCase(),
        descripcion || '',
        tipo_descuento,
        parseFloat(valor_descuento),
        parseFloat(minimo_compra || 0),
        parseFloat(descuento_maximo || 0),
        fecha_inicio || null,
        fecha_fin || null,
        parseInt(limite_usos || 0),
        parseInt(limite_por_cliente || 1),
        activo !== undefined ? (activo ? 1 : 0) : 1
      );

    const cupon = db.prepare('SELECT * FROM cupones WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(cupon);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const errors = validateCuponData(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const existing = db.prepare('SELECT * FROM cupones WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Cupón no encontrado' });
    }

    const {
      codigo,
      descripcion,
      tipo_descuento,
      valor_descuento,
      minimo_compra,
      descuento_maximo,
      fecha_inicio,
      fecha_fin,
      limite_usos,
      limite_por_cliente,
      activo,
    } = req.body;

    const duplicate = db
      .prepare('SELECT id FROM cupones WHERE codigo = ? AND id != ?')
      .get(codigo.trim().toUpperCase(), req.params.id);
    if (duplicate) {
      return res.status(400).json({ error: 'Ya existe otro cupón con ese código' });
    }

    db.prepare(
      `
      UPDATE cupones SET
        codigo = ?,
        descripcion = ?,
        tipo_descuento = ?,
        valor_descuento = ?,
        minimo_compra = ?,
        descuento_maximo = ?,
        fecha_inicio = ?,
        fecha_fin = ?,
        limite_usos = ?,
        limite_por_cliente = ?,
        activo = ?,
        actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(
      codigo.trim().toUpperCase(),
      descripcion || '',
      tipo_descuento,
      parseFloat(valor_descuento),
      parseFloat(minimo_compra || 0),
      parseFloat(descuento_maximo || 0),
      fecha_inicio || null,
      fecha_fin || null,
      parseInt(limite_usos || 0),
      parseInt(limite_por_cliente || 1),
      activo !== undefined ? (activo ? 1 : 0) : existing.activo,
      req.params.id
    );

    const cupon = db.prepare('SELECT * FROM cupones WHERE id = ?').get(req.params.id);
    res.json(cupon);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM cupones WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Cupón no encontrado' });
    }

    db.prepare('DELETE FROM cupones WHERE id = ?').run(req.params.id);
    res.json({ message: 'Cupón eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/validar', (req, res) => {
  try {
    const { codigo, subtotal, cliente_id, cliente_telefono } = req.body;

    if (!codigo || !subtotal) {
      return res.status(400).json({ error: 'Código y subtotal requeridos' });
    }

    const cupon = db
      .prepare('SELECT * FROM cupones WHERE codigo = ? AND activo = 1')
      .get(codigo.trim().toUpperCase());

    if (!cupon) {
      return res.status(400).json({ error: 'Cupón no válido o inactivo' });
    }

    const now = new Date().toISOString();
    if (cupon.fecha_inicio && now < cupon.fecha_inicio) {
      return res.status(400).json({ error: 'El cupón aún no está activo' });
    }
    if (cupon.fecha_fin && now > cupon.fecha_fin) {
      return res.status(400).json({ error: 'El cupón ha expirado' });
    }

    if (cupon.limite_usos > 0 && cupon.usos_actuales >= cupon.limite_usos) {
      return res.status(400).json({ error: 'El cupón ha alcanzado el límite de usos' });
    }

    const subtotalNum = parseFloat(subtotal);
    if (subtotalNum < cupon.minimo_compra) {
      return res.status(400).json({
        error: `El mínimo de compra para este cupón es $${cupon.minimo_compra.toLocaleString('es-AR')}`,
      });
    }

    if (cliente_id || cliente_telefono) {
      const usosCliente = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM cupones_usados 
        WHERE cupon_id = ? AND (cliente_id = ? OR cliente_telefono = ?)
      `
        )
        .get(cupon.id, cliente_id || 0, cliente_telefono || '');

      if (usosCliente.count >= cupon.limite_por_cliente) {
        return res
          .status(400)
          .json({ error: 'Ya has usado este cupón el máximo de veces permitido' });
      }
    }

    let montoDescuento = 0;
    if (cupon.tipo_descuento === 'porcentaje') {
      montoDescuento = subtotalNum * (cupon.valor_descuento / 100);
      if (cupon.descuento_maximo > 0) {
        montoDescuento = Math.min(montoDescuento, cupon.descuento_maximo);
      }
    } else {
      montoDescuento = cupon.valor_descuento;
    }

    montoDescuento = Math.min(montoDescuento, subtotalNum);

    res.json({
      valido: true,
      cupon: {
        id: cupon.id,
        codigo: cupon.codigo,
        descripcion: cupon.descripcion,
        tipo_descuento: cupon.tipo_descuento,
        valor_descuento: cupon.valor_descuento,
      },
      monto_descuento: Math.round(montoDescuento * 100) / 100,
      subtotal: subtotalNum,
      total: subtotalNum - montoDescuento,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
