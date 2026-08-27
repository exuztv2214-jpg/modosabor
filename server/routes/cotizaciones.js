const express = require('express');

const auth = require('../middleware/auth');
const db = require('../db');
const { requirePermission } = require('../utils/permissions');
const { actorFromRequest, logAudit } = require('../utils/audit');
const {
  actualizarCotizacion,
  crearCotizacion,
  hidratarCotizacion,
} = require('../services/cotizacionesService');

const router = express.Router();

router.get('/', auth, requirePermission('clientes.view'), (req, res) => {
  const search = String(req.query.search || '').trim();
  const estado = String(req.query.estado || '').trim();
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(c.numero LIKE ? OR c.cliente_empresa LIKE ? OR c.cliente_contacto LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (estado) {
    conditions.push('c.estado = ?');
    params.push(estado);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT c.*, COUNT(i.id) AS renglones
         FROM cotizaciones c
         LEFT JOIN cotizacion_items i ON i.cotizacion_id = c.id
         ${where}
        GROUP BY c.id
        ORDER BY date(c.fecha_emision) DESC, c.id DESC
        LIMIT 250`
    )
    .all(...params);
  res.json(rows);
});

router.get('/:id', auth, requirePermission('clientes.view'), (req, res) => {
  const cotizacion = hidratarCotizacion(db, Number(req.params.id));
  if (!cotizacion) return res.status(404).json({ error: 'Cotizacion no encontrada' });
  return res.json(cotizacion);
});

router.post('/', auth, requirePermission('clientes.edit'), (req, res) => {
  try {
    const cotizacion = crearCotizacion(db, req.body, req.user?.id);
    logAudit(db, {
      modulo: 'cotizaciones',
      accion: 'crear',
      entidad: 'cotizacion',
      entidad_id: cotizacion.id,
      ...actorFromRequest(req),
      detalle: { numero: cotizacion.numero, cliente: cotizacion.cliente_empresa },
    });
    return res.status(201).json(cotizacion);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.put('/:id', auth, requirePermission('clientes.edit'), (req, res) => {
  try {
    const cotizacion = actualizarCotizacion(db, Number(req.params.id), req.body);
    if (!cotizacion) return res.status(404).json({ error: 'Cotizacion no encontrada' });
    logAudit(db, {
      modulo: 'cotizaciones',
      accion: 'editar',
      entidad: 'cotizacion',
      entidad_id: cotizacion.id,
      ...actorFromRequest(req),
      detalle: {
        numero: cotizacion.numero,
        cliente: cotizacion.cliente_empresa,
        estado: cotizacion.estado,
      },
    });
    return res.json(cotizacion);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = router;
