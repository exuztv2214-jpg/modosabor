const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { requirePermission } = require('../utils/permissions');
const { getCurrentShiftInfo, resolveShiftLabel } = require('../utils/shifts');
const {
  ensureOperationalCaja,
  getActiveCaja,
  getConfigMap,
  getOperationalShiftContext,
} = require('../utils/operationalCaja');
const {
  summarizePaymentRows,
  isMetodoEfectivo,
  isMetodoDigital,
  isPagoPagado,
  getPedidoPaymentBreakdown,
} = require('../utils/paymentStatus');
const { centsToPesos } = require('../utils/moneyConversion');

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function parseMoneyInput(value) {
  if (typeof value === 'number') return value;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s/g, '').replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function buildCajaResumen(desde, hasta = null, cierreId = null) {
  const database = db || require('../db');
  const config = getConfigMap(database);
  let query = `
    SELECT *
    FROM pedidos
    WHERE datetime(creado_en) >= datetime(?)
  `;
  const params = [desde];

  if (hasta) {
    query += ' AND datetime(creado_en) <= datetime(?)';
    params.push(hasta);
  }

  query += ' ORDER BY datetime(creado_en) DESC';
  const rows = database.prepare(query).all(...params);
  const validRows = rows.filter((row) => row.estado !== 'cancelado');
  const paymentSummary = summarizePaymentRows(validRows);

  const totalVentas = validRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
  const pedidos = validRows.length;
  const ticketPromedio = pedidos ? Math.round(totalVentas / pedidos) : 0;
  const efectivoVentas = Number(paymentSummary.efectivoCobrado || 0);
  const digitales = Number(paymentSummary.digitalesCobrados || 0);
  const totalCobrado = Number(paymentSummary.totalCobrado || 0);
  const totalPendienteCobro = Number(paymentSummary.totalPendiente || 0);

  // Calcular movimientos manuales (gastos/ingresos)
  let movimientosQuery = 'SELECT * FROM caja_movimientos WHERE (datetime(creado_en) >= datetime(?)';
  const movParams = [desde];
  if (hasta) {
    movimientosQuery += ' AND datetime(creado_en) <= datetime(?)';
    movParams.push(hasta);
  }
  movimientosQuery += ')';
  if (cierreId) {
    movimientosQuery += ' OR cierre_id = ?';
    movParams.push(cierreId);
  }
  const movimientos = database.prepare(movimientosQuery).all(...movParams);

  const totalIngresosManuales = movimientos
    .filter((m) => m.tipo === 'entrada')
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);
  const totalEgresosManuales = movimientos
    .filter((m) => m.tipo === 'salida')
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const efectivoNeto = efectivoVentas + totalIngresosManuales - totalEgresosManuales;

  const porMetodo = paymentSummary.byMethod;

  const porTipo = database
    .prepare(
      `
    SELECT tipo_entrega, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
    FROM pedidos
    WHERE datetime(creado_en) >= datetime(?)
      ${hasta ? 'AND datetime(creado_en) <= datetime(?)' : ''}
      AND estado != 'cancelado'
    GROUP BY tipo_entrega
    ORDER BY total DESC
  `
    )
    .all(...params);

  const entregados = rows.filter((row) => row.estado === 'entregado').length;
  const cancelados = rows.filter((row) => row.estado === 'cancelado').length;
  const activos = rows.filter((row) => !['entregado', 'cancelado'].includes(row.estado)).length;
  const porTurno = validRows.reduce((acc, row) => {
    const label = resolveShiftLabel(
      config,
      row.turno_operativo,
      new Date(String(row.creado_en || '').replace(' ', 'T'))
    );
    const current = acc.get(label) || {
      turno: label,
      pedidos: 0,
      total: 0,
      efectivo: 0,
      digitales: 0,
      pendiente: 0,
    };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    if (isPagoPagado(row.pago_estado, { metodoPago: row.metodo_pago, origen: row.origen })) {
      getPedidoPaymentBreakdown(row).forEach((entry) => {
        const amount = Number(entry.monto || 0);
        if (isMetodoEfectivo(entry.metodo_pago)) current.efectivo += amount;
        else if (isMetodoDigital(entry.metodo_pago)) current.digitales += amount;
      });
    } else {
      current.pendiente += Number(row.total || 0);
    }
    acc.set(label, current);
    return acc;
  }, new Map());
  const turnoActual = getCurrentShiftInfo(config);

  return {
    desde,
    hasta,
    turnoActual: turnoActual.turno_actual?.nombre || turnoActual.turno_actual?.id || '',
    totalVentas,
    pedidos,
    ticketPromedio,
    efectivoVentas,
    digitales,
    totalCobrado,
    totalPendienteCobro,
    totalIngresosManuales,
    totalEgresosManuales,
    efectivoNeto,
    entregados,
    cancelados,
    activos,
    porMetodo,
    porTipo,
    movimientos,
    porTurno: Array.from(porTurno.values())
      .map((item) => ({
        ...item,
        ticketPromedio: item.pedidos ? Math.round(item.total / item.pedidos) : 0,
      }))
      .sort((a, b) => b.total - a.total || b.pedidos - a.pedidos),
  };
}

router.get('/estado', auth, requirePermission('caja.view'), (req, res) => {
  const actor = actorFromRequest(req);
  const operational = ensureOperationalCaja(db, {
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre || 'Sistema',
    buildCajaResumen,
    autoOpen: true,
  });
  const activa = operational.activeCaja;
  const historial = db
    .prepare('SELECT * FROM cierres_caja ORDER BY abierta_en DESC LIMIT 20')
    .all()
    .map((item) => ({ ...item, resumen: safeJsonParse(item.resumen_json, {}) }));
  const auditoria = db
    .prepare('SELECT * FROM auditoria_eventos ORDER BY creado_en DESC LIMIT 40')
    .all()
    .map((item) => ({ ...item, detalle: safeJsonParse(item.detalle, {}) }));

  operational.events.forEach((event) => {
    logAudit(db, {
      modulo: 'caja',
      accion: event.type === 'opened' ? 'apertura_automatica' : 'cierre_automatico',
      entidad: 'cierre_caja',
      entidad_id: event.caja?.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre || 'Sistema',
      detalle: {
        turno_id: event.caja?.turno_id || '',
        turno_nombre: event.caja?.turno_nombre || '',
        fecha_operativa: event.caja?.fecha_operativa || '',
        auto_abierta: Number(event.caja?.auto_abierta || 0) === 1,
        auto_cierre_motivo: event.caja?.auto_cierre_motivo || '',
      },
    });
  });

  res.json({
    activa: activa ? { ...activa, resumen: safeJsonParse(activa.resumen_json, {}) } : null,
    resumen: activa ? buildCajaResumen(activa.abierta_en, null, activa.id) : null,
    historial,
    auditoria,
    turno_operativo: operational.context,
  });
});

router.post('/movimiento', auth, requirePermission('caja.manage'), (req, res) => {
  const activa = getActiveCaja(db);
  if (!activa) return res.status(400).json({ error: 'Debes abrir la caja primero' });

  const { tipo, monto, motivo } = req.body;
  if (!['entrada', 'salida'].includes(tipo))
    return res.status(400).json({ error: 'Tipo invalido' });
  const montoNormalizado = parseMoneyInput(monto);
  if (Number.isNaN(montoNormalizado) || montoNormalizado <= 0)
    return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
  if (!String(motivo || '').trim())
    return res.status(400).json({ error: 'Debes indicar un motivo' });

  const actor = actorFromRequest(req);
  const result = db
    .prepare(
      `
    INSERT INTO caja_movimientos (cierre_id, tipo, monto, motivo, actor_id, actor_nombre)
    VALUES (?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      activa.id,
      tipo,
      montoNormalizado,
      String(motivo || '').trim(),
      actor.actor_id,
      actor.actor_nombre
    );

  const movimiento = db
    .prepare('SELECT * FROM caja_movimientos WHERE id = ?')
    .get(result.lastInsertRowid);
  logAudit(db, {
    modulo: 'caja',
    accion: 'movimiento_manual',
    entidad: 'caja_movimiento',
    entidad_id: movimiento.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { tipo, monto: montoNormalizado, motivo },
  });

  res.json(movimiento);
});

router.post('/apertura', auth, requirePermission('caja.manage'), (req, res) => {
  const { monto_inicial = 0, notas = '' } = req.body;
  const montoInicial = parseMoneyInput(monto_inicial);
  if (Number.isNaN(montoInicial) || montoInicial < 0) {
    return res.status(400).json({ error: 'El monto inicial debe ser 0 o mayor' });
  }
  const actor = actorFromRequest(req);
  const config = getConfigMap(db);
  const operationalContext = getOperationalShiftContext(config);
  if (!operationalContext.abiertoAhora) {
    return res.status(400).json({ error: 'No hay un turno operativo abierto para abrir caja' });
  }
  if (getActiveCaja(db)) return res.status(400).json({ error: 'Ya hay una caja abierta' });
  const result = db
    .prepare(
      `
    INSERT INTO cierres_caja (
      estado, abierta_por_id, abierta_por_nombre, monto_inicial, notas_apertura,
      turno_id, turno_nombre, fecha_operativa, auto_abierta
    )
    VALUES ('abierta', ?, ?, ?, ?, ?, ?, ?, 0)
  `
    )
    .run(
      actor.actor_id,
      actor.actor_nombre,
      montoInicial,
      notas || '',
      operationalContext.shiftId,
      operationalContext.shiftName,
      operationalContext.fechaOperativa
    );

  const caja = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(result.lastInsertRowid);
  logAudit(db, {
    modulo: 'caja',
    accion: 'apertura',
    entidad: 'cierre_caja',
    entidad_id: caja.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { monto_inicial: montoInicial, notas: notas || '' },
  });

  res.json(caja);
});

router.post('/cierre', auth, requirePermission('caja.manage'), (req, res) => {
  const activa = getActiveCaja(db);
  if (!activa) return res.status(400).json({ error: 'No hay una caja abierta' });

  const { monto_final_declarado = 0, notas = '' } = req.body;
  const declarado = parseMoneyInput(monto_final_declarado);
  if (Number.isNaN(declarado) || declarado < 0) {
    return res.status(400).json({ error: 'El monto final declarado debe ser 0 o mayor' });
  }
  const actor = actorFromRequest(req);
  const resumen = buildCajaResumen(activa.abierta_en, null, activa.id);

  // El efectivo esperado ahora considera: Inicial + Ventas Efectivo + Entradas Manuales - Salidas (Gastos)
  const efectivoEsperado = Number(activa.monto_inicial || 0) + Number(resumen.efectivoNeto || 0);
  const diferencia = declarado - efectivoEsperado;

  db.prepare(
    `
    UPDATE cierres_caja
    SET estado = 'cerrada',
        cerrada_en = CURRENT_TIMESTAMP,
        cerrada_por_id = ?,
        cerrada_por_nombre = ?,
        monto_final_declarado = ?,
        efectivo_esperado = ?,
        diferencia = ?,
        resumen_json = ?,
        notas_cierre = ?
    WHERE id = ?
  `
  ).run(
    actor.actor_id,
    actor.actor_nombre,
    declarado,
    efectivoEsperado,
    diferencia,
    JSON.stringify(resumen),
    notas || '',
    activa.id
  );

  logAudit(db, {
    modulo: 'caja',
    accion: 'cierre',
    entidad: 'cierre_caja',
    entidad_id: activa.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      monto_final_declarado: declarado,
      efectivo_esperado: efectivoEsperado,
      diferencia,
      notas: notas || '',
    },
  });

  const caja = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(activa.id);
  const { buildCajaCierreDocument } = require('../utils/printTemplates');
  const document = buildCajaCierreDocument(db, centsToPesos(caja), centsToPesos(resumen));

  res.json({ ...caja, resumen, html: document.html });
});

router.get('/cierre/:id/ticket', auth, requirePermission('caja.view'), (req, res) => {
  const cierre = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(req.params.id);
  if (!cierre) return res.status(404).json({ error: 'Cierre no encontrado' });

  const resumen = safeJsonParse(cierre.resumen_json, {});
  const { buildCajaCierreDocument } = require('../utils/printTemplates');
  const document = buildCajaCierreDocument(db, centsToPesos(cierre), centsToPesos(resumen));

  res.type('html').send(document.html);
});

module.exports = router;
