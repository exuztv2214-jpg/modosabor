const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { requirePermission, hasPermission } = require('../utils/permissions');
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

  /*
    ── Propinas ───────────────────────────────────────────────────────────────

    No están adentro de `total` a propósito: `total` es lo que cuesta la comida
    y es de lo que salen los reportes de venta. La propina es plata del mozo.

    Pero en el cajón sí están. Si el cliente deja $500 de propina en efectivo,
    esos $500 están físicamente ahí, y si no se suman al esperado el arqueo
    cierra con $500 de más y parece un error de caja.

    Sólo se cuentan las de los pedidos ya cobrados: una propina anotada en un
    pedido que todavía no se pagó no está en ningún cajón.

    Y sólo las cobradas en efectivo suman al esperado. La propina de una tarjeta
    o una transferencia no pasa por el cajón.
  */
  const pedidosCobrados = validRows.filter((row) =>
    isPagoPagado(row.pago_estado, { metodoPago: row.metodo_pago, origen: row.origen })
  );
  const propinas = pedidosCobrados.reduce((acc, row) => acc + Number(row.propina || 0), 0);
  const propinasEfectivo = pedidosCobrados.reduce(
    (acc, row) => (isMetodoEfectivo(row.metodo_pago) ? acc + Number(row.propina || 0) : acc),
    0
  );
  const propinasDigitales = propinas - propinasEfectivo;

  /*
    Cuánto le toca a cada mozo. Es el motivo por el que se registran: al cerrar
    el turno hay que repartirlas, y hasta ahora eso se hacía de memoria.
  */
  const propinasPorMozo = Array.from(
    pedidosCobrados
      .filter((row) => Number(row.propina || 0) > 0)
      .reduce((acc, row) => {
        const nombre = String(row.mozo_nombre || '').trim() || 'Sin mozo asignado';
        const actual = acc.get(nombre) || { mozo: nombre, pedidos: 0, propinas: 0 };
        actual.pedidos += 1;
        actual.propinas += Number(row.propina || 0);
        acc.set(nombre, actual);
        return acc;
      }, new Map())
      .values()
  ).sort((a, b) => b.propinas - a.propinas);

  const efectivoNeto =
    efectivoVentas + propinasEfectivo + totalIngresosManuales - totalEgresosManuales;

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
    propinas,
    propinasEfectivo,
    propinasDigitales,
    propinasPorMozo,
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

/**
 * Revisa la caja contra el reloj operativo y registra cada transición una sola
 * vez. La usa tanto la pantalla como el proceso periódico del servidor: así
 * el cierre no depende de que alguien deje Caja abierta en el navegador.
 */
function sincronizarCajaOperativa({
  actorId = null,
  actorNombre = 'Sistema',
  autoOpen = true,
} = {}) {
  const operational = ensureOperationalCaja(db, {
    actor_id: actorId,
    actor_nombre: actorNombre,
    buildCajaResumen,
    autoOpen,
  });

  operational.events.forEach((event) => {
    const resumen = safeJsonParse(event.caja?.resumen_json, {});
    logAudit(db, {
      modulo: 'caja',
      accion: event.type === 'opened' ? 'apertura_automatica' : 'cierre_automatico',
      entidad: 'cierre_caja',
      entidad_id: event.caja?.id,
      actor_id: actorId,
      actor_nombre: actorNombre,
      detalle: {
        turno_id: event.caja?.turno_id || '',
        turno_nombre: event.caja?.turno_nombre || '',
        fecha_operativa: event.caja?.fecha_operativa || '',
        auto_abierta: Number(event.caja?.auto_abierta || 0) === 1,
        auto_cierre_motivo: event.caja?.auto_cierre_motivo || '',
        ...(event.type === 'closed'
          ? {
              reporte_detallado: {
                pedidos: Number(resumen?.pedidos || 0),
                total_ventas: Number(resumen?.totalVentas || 0),
                efectivo_neto: Number(resumen?.efectivoNeto || 0),
                digitales: Number(resumen?.digitales || 0),
                pendientes: Number(resumen?.totalPendienteCobro || 0),
              },
            }
          : {}),
      },
    });
  });

  return operational;
}

router.get('/estado', auth, requirePermission('caja.view'), (req, res) => {
  const actor = actorFromRequest(req);
  const operational = sincronizarCajaOperativa({
    actorId: actor.actor_id,
    actorNombre: actor.actor_nombre || 'Sistema',
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

  /*
    ── Arqueo ciego ───────────────────────────────────────────────────────────

    Cuando está activado, el cajero cuenta la plata **sin ver cuánto debería
    haber**. Recién al cerrar se revela la diferencia.

    Para qué sirve: si el cajero ve que se esperan $61.000, cuenta $60.500 y
    sabe que le faltan $500, la tentación de declarar $61.000 y "ya va a
    aparecer" existe. Contando a ciegas, el número declarado es el que salió
    del cajón de verdad. Fudo lo tiene y es de las cosas que un dueño valora.

    Se resuelve **en el servidor y no escondiéndolo en pantalla**: ocultarlo
    sólo en el frontend lo deja a la vista de cualquiera que abra la pestaña de
    red del navegador, que es exactamente la persona de la que uno se querría
    cuidar.

    Se tapan los cuatro caminos para llegar al número: el neto, las ventas en
    efectivo, las propinas en efectivo y el desglose por método —de donde se
    podría sumar el efectivo a mano—.

    Quien tiene permiso de configurar la caja lo sigue viendo: el dueño no se
    audita a sí mismo.
  */
  const arqueoCiego =
    String(getConfigMap(db).caja_arqueo_ciego || '0') === '1' &&
    !hasPermission(req.user, 'config.manage');

  let resumen = activa ? buildCajaResumen(activa.abierta_en, null, activa.id) : null;
  if (resumen && arqueoCiego) {
    const { efectivoNeto, efectivoVentas, propinasEfectivo, porMetodo, ...visible } = resumen;
    resumen = { ...visible, arqueo_ciego: true };
  }

  res.json({
    activa: activa ? { ...activa, resumen: safeJsonParse(activa.resumen_json, {}) } : null,
    resumen,
    arqueo_ciego: arqueoCiego,
    historial,
    auditoria,
    turno_operativo: operational.context,
  });
});

router.post('/movimiento', auth, requirePermission('caja.manage'), (req, res) => {
  const activa = getActiveCaja(db);
  if (!activa) return res.status(400).json({ error: 'Debes abrir la caja primero' });

  const { tipo, monto, motivo } = req.body;
  if (!['entrada', 'salida'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo invalido' });
  }
  const montoNormalizado = parseMoneyInput(monto);
  if (Number.isNaN(montoNormalizado) || montoNormalizado <= 0) {
    return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
  }
  if (!String(motivo || '').trim()) {
    return res.status(400).json({ error: 'Debes indicar un motivo' });
  }

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
        arqueada_en = CURRENT_TIMESTAMP,
        arqueada_por_id = ?,
        arqueada_por_nombre = ?,
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
    actor.actor_id,
    actor.actor_nombre,
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

/*
  El cierre horario de las 15:00 congela ventas y genera el reporte, pero no
  puede inventar cuánto efectivo había físicamente en el cajón. Este endpoint
  completa ese arqueo más tarde, una sola vez, sin reabrir ni recalcular el
  turno ya cerrado.
*/
router.post('/cierre/:id/arqueo', auth, requirePermission('caja.manage'), (req, res) => {
  const cierreId = Number(req.params.id);
  if (!Number.isInteger(cierreId) || cierreId <= 0) {
    return res.status(400).json({ error: 'Cierre inválido' });
  }
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'monto_final_declarado')) {
    return res.status(400).json({ error: 'Indicá el efectivo contado' });
  }

  const declarado = parseMoneyInput(req.body.monto_final_declarado);
  if (Number.isNaN(declarado) || declarado < 0) {
    return res.status(400).json({ error: 'El efectivo contado debe ser 0 o mayor' });
  }

  const cierre = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(cierreId);
  if (!cierre) return res.status(404).json({ error: 'Cierre no encontrado' });
  if (cierre.estado !== 'cerrada') {
    return res.status(409).json({ error: 'La caja todavía no está cerrada' });
  }
  if (!String(cierre.auto_cierre_motivo || '').trim()) {
    return res.status(409).json({ error: 'Este cierre no requiere un arqueo posterior' });
  }
  if (cierre.monto_final_declarado !== null) {
    return res.status(409).json({ error: 'Este cierre ya fue arqueado' });
  }

  const actor = actorFromRequest(req);
  const efectivoEsperado = Number(cierre.efectivo_esperado || 0);
  const diferencia = declarado - efectivoEsperado;
  const notas = String(req.body.notas || '')
    .trim()
    .slice(0, 1000);
  const result = db
    .prepare(
      `
        UPDATE cierres_caja
        SET monto_final_declarado = ?,
            diferencia = ?,
            arqueada_en = CURRENT_TIMESTAMP,
            arqueada_por_id = ?,
            arqueada_por_nombre = ?,
            notas_cierre = CASE
              WHEN ? = '' THEN notas_cierre
              WHEN TRIM(COALESCE(notas_cierre, '')) = '' THEN ?
              ELSE notas_cierre || char(10) || ?
            END
        WHERE id = ? AND estado = 'cerrada' AND monto_final_declarado IS NULL
      `
    )
    .run(declarado, diferencia, actor.actor_id, actor.actor_nombre, notas, notas, notas, cierreId);

  if (result.changes !== 1) {
    return res.status(409).json({ error: 'Este cierre ya fue arqueado' });
  }

  logAudit(db, {
    modulo: 'caja',
    accion: 'arqueo_posterior',
    entidad: 'cierre_caja',
    entidad_id: cierreId,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      monto_final_declarado: declarado,
      efectivo_esperado: efectivoEsperado,
      diferencia,
      notas,
    },
  });

  const actualizado = db.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(cierreId);
  const resumen = safeJsonParse(actualizado.resumen_json, {});
  const { buildCajaCierreDocument } = require('../utils/printTemplates');
  const document = buildCajaCierreDocument(db, centsToPesos(actualizado), centsToPesos(resumen));
  return res.json({ ...actualizado, resumen, html: document.html });
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

/*
  Se expone para que el asistente calcule el efectivo esperado con exactamente
  la misma cuenta que el cierre de caja. Si usara una propia, tarde o temprano
  diría una cifra distinta a la de la pantalla y no habría forma de saber cuál
  es la buena.
*/
module.exports.buildCajaResumen = buildCajaResumen;
module.exports.sincronizarCajaOperativa = sincronizarCajaOperativa;
