const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission, hasPermission } = require('../utils/permissions');
const { getConfigMap, createPreference, getPayment } = require('../utils/mercadoPago');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { registrarEvento, calcularDuraciones } = require('../services/pedidoTrazabilidad');
const { geocodificarPedido } = require('../services/geocoding');
const { autoAssignPedido } = require('../utils/deliveryAssignment');
const { recalculateClienteStats } = require('../utils/loyalty');
const {
  procesarFidelidadPedido,
  getConfig: getFidelizacionConfig,
} = require('../services/fidelizacionService');
const { restoreInventoryForPedido } = require('../utils/inventory');
const { createRateLimiter, createSqliteRateLimitStore } = require('../utils/rateLimit');
const logger = require('../utils/logger');
const { validateBody } = require('../middleware/validate');
const { createPedidoSchema, updatePedidoSchema } = require('../schemas');
const { centsToPesos } = require('../utils/moneyConversion');
const { fechaLocal } = require('../utils/fechaLocal');
const {
  emitPedidoActualizado,
  emitDeliveryAssignment,
  emitNuevoPedido,
  emitRepartidorUbicacion,
  clearTrackingToken,
} = require('../utils/socketRooms');

const {
  getPedidoHydratedById,
  getPedidoOr404,
  getMesaPedidosAbiertos,
  hydratePedido,
  listPedidosHydrated,
  registerPrintJob,
  configuredCopies,
  createPedidoWithInventory,
  getActiveCaja,
  buildPedidoPayload,
  splitPedidoMesa,
  mergeMesaPedidosIntoTarget,
  updatePedidoPaymentStatus,
  logMercadoPagoEvent,
  syncPedidoMercadoPago,
  PedidoState,
  ESTADO_LABELS,
} = require('../services/pedidoService');
const {
  normalizeMetodoPago,
  normalizePagoEstado,
  resolveInitialPagoEstado,
  shouldAutoSettleOnEntrega,
} = require('../utils/paymentStatus');

const {
  validateTransition,
  canUserTransition,
  getValidTransitions,
  getAvailableTransitions,
  canUserTransitionWithContext,
} = require('../utils/pedidoStateMachine');

const publicOrderRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Demasiados pedidos desde este origen. Proba de nuevo en unos minutos.',
  store: createSqliteRateLimitStore(db, 'pedido-publico'),
});

function buildTrackingPayload(pedido) {
  const hydrated = hydratePedido(pedido);
  return {
    id: hydrated.id,
    numero: hydrated.numero,
    estado: hydrated.estado,
    tipo_entrega: hydrated.tipo_entrega,
    creado_en: hydrated.creado_en,
    actualizado_en: hydrated.actualizado_en,
    subtotal: hydrated.subtotal,
    costo_envio: hydrated.costo_envio,
    descuento: hydrated.descuento,
    total: hydrated.total,
    metodo_pago: hydrated.metodo_pago,
    pago_estado: hydrated.pago_estado,
    tiempo_estimado_min: hydrated.tiempo_estimado_min,
    delivery_zona: hydrated.delivery_zona,
    turno_operativo: hydrated.turno_operativo,
    eta_min_dinamico: hydrated.eta_min_dinamico,
    eta_origen: hydrated.eta_origen,
    distancia_repartidor_km: hydrated.distancia_repartidor_km,
    ubicacion_repartidor_atrasada: hydrated.ubicacion_repartidor_atrasada,
    cliente_nombre: hydrated.cliente_nombre,
    cliente_direccion: hydrated.cliente_direccion,
    cliente_latitud: hydrated.cliente_latitud,
    cliente_longitud: hydrated.cliente_longitud,
    cliente_ubicacion_exacta: Boolean(hydrated.cliente_ubicacion_exacta),
    cliente_geocodificado: Boolean(hydrated.cliente_geocodificado),
    cliente_geocoding_precision: hydrated.cliente_geocoding_precision,
    direccion_barrio_id: hydrated.direccion_barrio_id,
    direccion_barrio_nombre: hydrated.direccion_barrio_nombre,
    direccion_manzana_id: hydrated.direccion_manzana_id,
    direccion_manzana: hydrated.direccion_manzana,
    direccion_casa: hydrated.direccion_casa,
    direccion_origen: hydrated.direccion_origen,
    direccion_confianza: hydrated.direccion_confianza,
    entrega_pin: hydrated.entrega_pin,
    entrega_foto: hydrated.entrega_foto,
    entrega_foto_en: hydrated.entrega_foto_en,
    repartidor_id: hydrated.repartidor_id,
    repartidor_nombre: hydrated.repartidor_nombre,
    repartidor: hydrated.repartidor || null,
    items: hydrated.items,
  };
}

function publicPedidoError(error) {
  const message = String(error?.message || '').trim();
  const lower = message.toLowerCase();
  const technicalPatterns = [
    'receta',
    'insumo',
    'sqlite',
    'database',
    'constraint',
    'undefined',
    'null',
  ];

  if (lower.includes('stock')) {
    return 'No queda stock suficiente para completar ese pedido. Cambia el producto o avisanos por WhatsApp.';
  }

  if (technicalPatterns.some((pattern) => lower.includes(pattern))) {
    logger.error('[pedidos] Error interno al crear pedido publico', { message });
    return 'Perdon, hubo un problema al tomar ese pedido. Revisalo y mandalo de nuevo.';
  }

  return message || 'No se pudo crear el pedido';
}

function buildCheckoutPayload(pedido, extra = {}) {
  const hydrated = hydratePedido(pedido);
  return {
    id: hydrated.id,
    numero: hydrated.numero,
    subtotal: hydrated.subtotal,
    costo_envio: hydrated.costo_envio,
    descuento: hydrated.descuento,
    total: hydrated.total,
    tipo_entrega: hydrated.tipo_entrega,
    metodo_pago: hydrated.metodo_pago,
    pago_estado: hydrated.pago_estado,
    delivery_zona: hydrated.delivery_zona,
    tiempo_estimado_min: hydrated.tiempo_estimado_min,
    tracking_token: hydrated.tracking_token,
    hora_entrega: hydrated.hora_entrega,
    ...extra,
  };
}

function normalizePedidoCreationError(error) {
  const message = String(error?.message || '').trim();
  if (/foreign key constraint failed/i.test(message)) {
    return 'Hay un dato vinculado que ya no existe en el sistema. Actualiza la pantalla y vuelve a intentar la venta.';
  }
  return message || 'No se pudo crear el pedido';
}

router.post('/webhook/mercadopago', async (req, res) => {
  const config = getConfigMap(db);
  if (!config.mercadopago_token) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  // MercadoPago puede notificar via querystring o body dependiendo del tipo
  const topic = String(req.query.topic || req.query.type || req.body?.type || '').trim();
  const id = String(req.query.id || req.body?.data?.id || req.body?.id || '').trim();

  if (!id) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'missing_id' });
  }

  try {
    const payment = await getPayment({ token: config.mercadopago_token, paymentId: id });
    const pedidoId = Number(payment?.external_reference || 0) || null;
    const pedido = pedidoId ? db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId) : null;

    logMercadoPagoEvent({
      pedidoId: pedido?.id || null,
      tipo: 'webhook',
      paymentId: String(payment?.id || id),
      estado: String(payment?.status || ''),
      detalle: String(payment?.status_detail || topic || ''),
      payload: { topic, notification: { query: req.query, body: req.body }, payment },
    });

    if (pedido) {
      const synced = await syncPedidoMercadoPago(db, pedido, config);
      const io = req.app.get('io');
      if (synced?.ok && io) {
        emitPedidoActualizado(io, synced.pedido);
      }
    }
  } catch (error) {
    // Siempre 200 para que MP no entre en retry infinito
    logger.error('MercadoPago webhook error', { message: error.message || String(error) });
  }

  return res.status(200).json({ ok: true });
});

router.get('/', auth, requirePermission('pedidos.view'), (req, res) => {
  const { estado, tipo_entrega, fecha_desde, fecha_hasta, page = 1, limit = 200 } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 200));
  const offset = (pageNum - 1) * limitNum;

  let q = 'SELECT * FROM pedidos WHERE 1=1';
  const params = [];
  if (estado) {
    q += ' AND estado = ?';
    params.push(estado);
  }
  // El panel de delivery traia los ultimos 100 pedidos de cualquier tipo y
  // despues descartaba en el navegador los de mostrador y mesa. En un dia
  // cargado de salon se quedaba sin pedidos de delivery que mostrar.
  if (tipo_entrega) {
    q += ' AND tipo_entrega = ?';
    params.push(tipo_entrega);
  }
  if (fecha_desde) {
    q += ` AND ${fechaLocal('creado_en')} >= ?`;
    params.push(fecha_desde);
  }
  if (fecha_hasta) {
    q += ` AND ${fechaLocal('creado_en')} <= ?`;
    params.push(fecha_hasta);
  }
  q += ' ORDER BY creado_en DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);
  res.json(listPedidosHydrated(q, params));
});

router.get('/activos', auth, requirePermission('pedidos.view'), (req, res) => {
  res.json(
    listPedidosHydrated(
      "SELECT * FROM pedidos WHERE estado NOT IN ('entregado','cancelado') ORDER BY creado_en ASC"
    )
  );
});

router.post('/mesa/:mesa/precuenta', auth, requirePermission('pedidos.print'), (req, res) => {
  const { buildMesaPrecuentaDocument } = require('../utils/printTemplates');
  const mesa = String(req.params.mesa || '').trim();
  if (!mesa) return res.status(400).json({ error: 'Mesa invalida' });

  const pedidosMesa = getMesaPedidosAbiertos(mesa);
  if (pedidosMesa.length === 0) {
    return res.status(404).json({ error: 'No hay pedidos abiertos para esa mesa' });
  }

  // Igual que en /:id/imprimir: convertir de centavos a pesos antes de
  // renderizar el HTML, porque el middleware global solo actua sobre JSON.
  /*
    Se hidrata cada pedido antes de convertir: `items` viene como texto JSON
    desde la base y el conversor no entra a un string, así que los renglones
    de la precuenta salían en centavos igual que en el ticket.
  */
  const pedidosEnPesos = pedidosMesa.map((pedido) =>
    centsToPesos(getPedidoHydratedById(pedido.id) || pedido)
  );
  const document = buildMesaPrecuentaDocument(db, mesa, pedidosEnPesos);
  const copias = Math.max(1, Number(req.body?.copias || configuredCopies('ticket_cliente')));
  const impresion = registerPrintJob(
    pedidosMesa[0].id,
    document.tipo,
    document.area,
    copias,
    document.payload,
    true
  );
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'impresiones',
    accion: 'precuenta_mesa',
    entidad: 'mesa',
    entidad_id: mesa,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      mesa,
      pedidos: pedidosMesa.map((pedido) => pedido.id),
      copias,
      impresion_id: impresion.id,
    },
  });

  res.json({
    mesa,
    pedidos: pedidosMesa.map((pedido) => hydratePedido(pedido)),
    total: pedidosMesa.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0),
    impresion,
    html: document.html,
  });
});

router.put('/mesa/:mesa/mover', auth, requirePermission('pedidos.edit'), (req, res) => {
  const origen = String(req.params.mesa || '').trim();
  const destino = String(req.body?.mesa_destino || '').trim();

  if (!origen || !destino) {
    return res.status(400).json({ error: 'Mesa origen y destino son requeridas' });
  }

  if (origen === destino) {
    return res.status(400).json({ error: 'La mesa destino debe ser distinta' });
  }

  const pedidosMesa = getMesaPedidosAbiertos(origen);
  if (pedidosMesa.length === 0) {
    return res.status(404).json({ error: 'No hay pedidos abiertos para esa mesa' });
  }

  db.prepare(
    `
    UPDATE pedidos
    SET mesa = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE tipo_entrega = 'mesa'
      AND TRIM(COALESCE(mesa, '')) = ?
      AND estado NOT IN ('entregado', 'cancelado')
  `
  ).run(destino, origen);

  const actualizados = getMesaPedidosAbiertos(destino);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'mover_mesa',
    entidad: 'mesa',
    entidad_id: origen,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      origen,
      destino,
      pedidos: pedidosMesa.map((pedido) => pedido.id),
    },
  });

  const io = req.app.get('io');
  if (io) {
    actualizados.forEach((pedido) => emitPedidoActualizado(io, hydratePedido(pedido)));
  }

  res.json({
    ok: true,
    origen,
    destino,
    pedidos: actualizados.map((pedido) => hydratePedido(pedido)),
  });
});

router.post('/mesa/:mesa/fusionar', auth, requirePermission('pedidos.edit'), (req, res) => {
  const origen = String(req.params.mesa || '').trim();
  const destino = String(req.body?.mesa_destino || '').trim();

  if (!origen || !destino) {
    return res.status(400).json({ error: 'Mesa origen y destino son requeridas' });
  }

  if (origen === destino) {
    return res.status(400).json({ error: 'La mesa destino debe ser distinta' });
  }

  const origenPedidos = getMesaPedidosAbiertos(origen);
  if (origenPedidos.length === 0) {
    return res.status(404).json({ error: 'No hay pedidos abiertos en la mesa origen' });
  }

  const destinoPedidos = getMesaPedidosAbiertos(destino);
  const ordered = [...destinoPedidos, ...origenPedidos].sort(
    (a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime() || a.id - b.id
  );
  const targetPedido = ordered[0];
  const pedidosToMerge = ordered.slice(1);
  const merged = mergeMesaPedidosIntoTarget(targetPedido, pedidosToMerge, destino);

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'fusionar_mesa',
    entidad: 'mesa',
    entidad_id: origen,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      origen,
      destino,
      pedido_resultante: merged.id,
      pedidos_origen: origenPedidos.map((pedido) => pedido.id),
      pedidos_destino: destinoPedidos.map((pedido) => pedido.id),
    },
  });

  const io = req.app.get('io');
  const hydrated = hydratePedido(merged);
  if (io) emitPedidoActualizado(io, hydrated);

  res.json({
    ok: true,
    origen,
    destino,
    pedido: hydrated,
  });
});

router.get('/mesas/reservas', auth, requirePermission('mesas.view'), (req, res) => {
  const estado = String(req.query.estado || '').trim();
  let query = 'SELECT * FROM mesa_reservas WHERE 1 = 1';
  const params = [];

  if (estado) {
    query += ' AND estado = ?';
    params.push(estado);
  } else {
    query += " AND estado IN ('reservada', 'confirmada')";
  }

  query += ' ORDER BY datetime(horario_reserva) ASC, id ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/mesas/reservas', auth, requirePermission('pedidos.edit'), (req, res) => {
  const mesa = String(req.body?.mesa || '').trim();
  const clienteNombre = String(req.body?.cliente_nombre || '').trim();
  const clienteTelefono = String(req.body?.cliente_telefono || '').trim();
  const cantidadPersonas = Math.max(1, Number(req.body?.cantidad_personas || 1));
  const horarioReserva = String(req.body?.horario_reserva || '').trim();
  const notas = String(req.body?.notas || '').trim();

  if (!mesa || !clienteNombre || !horarioReserva) {
    return res.status(400).json({ error: 'Mesa, cliente y horario son obligatorios' });
  }

  const result = db
    .prepare(
      `
    INSERT INTO mesa_reservas (mesa, cliente_nombre, cliente_telefono, cantidad_personas, horario_reserva, notas)
    VALUES (?, ?, ?, ?, ?, ?)
  `
    )
    .run(mesa, clienteNombre, clienteTelefono, cantidadPersonas, horarioReserva, notas);

  const reserva = db
    .prepare('SELECT * FROM mesa_reservas WHERE id = ?')
    .get(result.lastInsertRowid);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'crear_reserva',
    entidad: 'reserva',
    entidad_id: reserva.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      mesa,
      cliente_nombre: clienteNombre,
      horario_reserva: horarioReserva,
      cantidad_personas: cantidadPersonas,
    },
  });

  res.json(reserva);
});

router.put('/mesas/reservas/:id', auth, requirePermission('pedidos.edit'), (req, res) => {
  const reserva = db.prepare('SELECT * FROM mesa_reservas WHERE id = ?').get(req.params.id);
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

  const estado = String(req.body?.estado || reserva.estado).trim();
  const validStates = ['reservada', 'confirmada', 'atendida', 'cancelada'];
  if (!validStates.includes(estado)) {
    return res.status(400).json({ error: 'Estado de reserva invalido' });
  }

  db.prepare(
    'UPDATE mesa_reservas SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(estado, reserva.id);

  const updated = db.prepare('SELECT * FROM mesa_reservas WHERE id = ?').get(reserva.id);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'mesas',
    accion: 'estado_reserva',
    entidad: 'reserva',
    entidad_id: updated.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { mesa: updated.mesa, desde: reserva.estado, hacia: estado },
  });

  res.json(updated);
});

router.get('/:id/pago/mercadopago', async (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (pedido.metodo_pago !== 'mercadopago') {
    return res.status(400).json({ error: 'Este pedido no usa MercadoPago' });
  }

  const config = getConfigMap(db);
  const paymentId = String(req.query.payment_id || '').trim();

  if (!config.mercadopago_token) {
    return res.json(
      buildCheckoutPayload(pedido, {
        ok: false,
        message: 'MercadoPago no esta configurado para sincronizacion',
      })
    );
  }

  try {
    const syncTarget = paymentId && !pedido.pago_id ? { ...pedido, pago_id: paymentId } : pedido;
    const synced = await syncPedidoMercadoPago(db, syncTarget, config);
    const finalPedido = synced.pedido || hydratePedido(pedido);

    if (synced.ok) {
      const io = req.app.get('io');
      if (io) emitPedidoActualizado(io, finalPedido);
    }

    return res.json(
      buildCheckoutPayload(finalPedido, {
        ok: synced.ok,
        message: synced.message,
      })
    );
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo verificar el pago' });
  }
});

/**
 * Corregir a mano la ubicacion de un pedido.
 *
 * El geocoding automatico acierta la mayoria de las veces, pero en
 * pueblos chicos la numeracion no siempre esta mapeada en OSM. Cuando
 * el rider avisa que el pin estaba mal, el operador puede pegar un link
 * de Google Maps (o coordenadas sueltas) y queda corregido.
 *
 * Al corregir a mano marcamos `cliente_ubicacion_exacta = 1`: es un
 * punto verificado por una persona, no una estimacion.
 */
router.put('/:id/ubicacion', auth, requirePermission('pedidos.edit'), (req, res) => {
  const pedido = db.prepare('SELECT id, numero FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const lat = Number(req.body?.latitud);
  const lng = Number(req.body?.longitud);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Coordenadas invalidas' });
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Coordenadas fuera de rango' });
  }
  // El (0,0) es un punto real en Africa: casi seguro es un error de carga.
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
    return res.status(400).json({ error: 'Coordenadas (0,0) no validas' });
  }

  db.prepare(
    `UPDATE pedidos
     SET cliente_latitud = ?, cliente_longitud = ?,
         cliente_ubicacion_exacta = 1,
         cliente_geocodificado = 0,
         cliente_geocoding_precision = 'manual',
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(lat, lng, pedido.id);

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'pedidos',
    accion: 'corregir_ubicacion',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { numero: pedido.numero, latitud: lat, longitud: lng },
  });

  const actualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
  const hydrated = hydratePedido(actualizado);
  const io = req.app.get('io');
  if (io) emitPedidoActualizado(io, hydrated);

  return res.json(hydrated);
});

/**
 * Forzar el geocoding de un pedido puntual (por si se cargo la direccion
 * despues de crear el pedido, o se corrigio un error de tipeo).
 */
router.post('/:id/geocodificar', auth, requirePermission('pedidos.edit'), async (req, res) => {
  const pedido = db
    .prepare('SELECT id, cliente_direccion FROM pedidos WHERE id = ?')
    .get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!pedido.cliente_direccion) {
    return res.status(400).json({ error: 'El pedido no tiene direccion cargada' });
  }

  // Limpiamos las coordenadas actuales para que geocodificarPedido no
  // las respete y vuelva a resolver.
  db.prepare(`UPDATE pedidos SET cliente_latitud = NULL, cliente_longitud = NULL WHERE id = ?`).run(
    pedido.id
  );

  const geo = await geocodificarPedido(pedido.id);
  if (!geo) {
    return res.status(422).json({
      error: 'No se pudo ubicar esa direccion. Corregila a mano o revisá cómo está escrita.',
    });
  }

  const actualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
  const hydrated = hydratePedido(actualizado);
  const io = req.app.get('io');
  if (io) emitPedidoActualizado(io, hydrated);

  return res.json({ ...hydrated, _geocoding: geo });
});

/**
 * Linea de tiempo del pedido: cada transicion de estado con quien la
 * hizo, mas las duraciones calculadas entre hitos.
 *
 * Sirve para responder "por que este pedido tardo 50 minutos" sin
 * tener que adivinar. Va ANTES de /:id para que Express no lo tome
 * como un id.
 */
router.get('/:id/trazabilidad', auth, (req, res) => {
  const pedido = db
    .prepare('SELECT id, numero, creado_en, estado FROM pedidos WHERE id = ?')
    .get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const { eventos, hitos, duraciones } = calcularDuraciones(pedido.id, pedido.creado_en);
  return res.json({
    pedido: { id: pedido.id, numero: pedido.numero, estado: pedido.estado },
    creado_en: pedido.creado_en,
    eventos,
    hitos,
    duraciones,
  });
});

/**
 * Recorrido del repartidor para el cliente que sigue su pedido.
 *
 * Los puntos ya se venían guardando en `repartidor_ubicaciones_log` desde
 * siempre —con precisión y velocidad— pero no había forma de que el cliente
 * los viera: el mapa de seguimiento mostraba un marcador que saltaba de una
 * posición a otra, sin el camino recorrido.
 *
 * Se protege con el mismo token de seguimiento que el resto del tracking, así
 * que sólo lo ve quien tiene el enlace de su propio pedido.
 *
 * Se limita a los últimos 200 puntos: en un viaje de Monteros son de sobra y
 * evita que un rider que se quedó con el GPS prendido devuelva miles de filas.
 */
router.get('/:id/recorrido', (req, res) => {
  const pedido = db
    .prepare('SELECT id, repartidor_id, estado FROM pedidos WHERE id = ?')
    .get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const { validateTrackingToken } = require('../utils/socketRooms');
  if (!validateTrackingToken(pedido.id, req.query.token)) {
    return res.status(403).json({ error: 'Enlace de seguimiento no válido' });
  }

  if (!pedido.repartidor_id) return res.json({ puntos: [] });

  const puntos = db
    .prepare(
      `
      SELECT latitud, longitud, precision, velocidad, creado_en
      FROM repartidor_ubicaciones_log
      WHERE pedido_id = ? AND repartidor_id = ?
      ORDER BY creado_en ASC
      LIMIT 200
    `
    )
    .all(pedido.id, pedido.repartidor_id);

  res.json({ puntos });
});

router.get('/:id', async (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const trackingToken = req.query.token;
  const authHeader = req.headers.authorization;
  let isAuthenticated = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../utils/authConfig');
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, getJwtSecret());
      isAuthenticated = true;
    } catch (err) {
      isAuthenticated = false;
    }
  }

  let isTrackingValid = false;
  if (trackingToken) {
    const { validateTrackingToken } = require('../utils/socketRooms');
    if (validateTrackingToken(pedido.id, trackingToken)) {
      isTrackingValid = true;
    }
  }

  if (!isAuthenticated && !isTrackingValid) {
    return res.json({
      id: pedido.id,
      numero: pedido.numero,
      estado: pedido.estado,
      tipo_entrega: pedido.tipo_entrega,
      creado_en: pedido.creado_en,
    });
  }

  const hydrated = hydratePedido(pedido);

  if (!isAuthenticated && isTrackingValid) {
    return res.json(buildTrackingPayload(hydrated));
  }

  res.json(hydrated);
});

router.get('/:id/impresiones', auth, requirePermission('pedidos.print'), (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM impresiones WHERE pedido_id = ? ORDER BY creado_en DESC, id DESC')
      .all(req.params.id)
  );
});

router.get('/:id/impresion/:tipo', auth, requirePermission('pedidos.print'), (req, res) => {
  const { buildPrintDocument } = require('../utils/printTemplates');
  /*
    Hidratado y no la fila cruda. `pedidos.items` es una columna de TEXTO con
    JSON adentro, y el conversor de centavos no puede ver adentro de un
    string: el total salía bien —es una columna numérica— pero cada renglón
    del ticket se imprimía en centavos. Dos milanesas de $7.000 figuraban
    como "$1.400.000" arriba de un total de "$14.000".

    `getPedidoHydratedById` devuelve los ítems como lista, y ahí sí el
    conversor entra y los pasa a pesos.
  */
  const pedido = getPedidoHydratedById(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const tipo =
    req.params.tipo === 'comanda'
      ? 'comanda_cocina'
      : req.params.tipo === 'delivery'
        ? 'delivery_ticket'
        : req.params.tipo === 'pack'
          ? 'tpv_pack'
          : 'ticket_cliente';
  const document = buildPrintDocument(db, centsToPesos(pedido), tipo);
  res.type('html').send(document.html);
});

router.get('/:id/notificacion/:tipo', auth, (req, res) => {
  if (!hasPermission(req.user, 'pedidos.edit') && !hasPermission(req.user, 'delivery.manage')) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  return res
    .status(410)
    .json({ error: 'Las notificaciones automaticas fueron removidas del sistema' });
});

router.get('/pagos/mercadopago/pendientes', auth, requirePermission('pedidos.view'), (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM pedidos WHERE metodo_pago = 'mercadopago' ORDER BY creado_en DESC LIMIT 100"
    )
    .all();
  res.json(rows.map(hydratePedido).filter((pedido) => pedido.pago_estado === 'pendiente'));
});

router.post(
  '/pagos/mercadopago/sync-pendientes',
  auth,
  requirePermission('pedidos.edit'),
  async (req, res) => {
    const config = getConfigMap(db);
    const pendingOrders = db
      .prepare(
        "SELECT * FROM pedidos WHERE metodo_pago = 'mercadopago' ORDER BY creado_en DESC LIMIT 100"
      )
      .all()
      .filter(
        (pedido) =>
          normalizePagoEstado(pedido.pago_estado, {
            metodoPago: pedido.metodo_pago,
            origen: pedido.origen,
          }) === 'pendiente'
      )
      .slice(0, 30);

    const results = [];
    for (const pedido of pendingOrders) {
      try {
        const synced = await syncPedidoMercadoPago(db, pedido, config);
        results.push({
          pedido_id: pedido.id,
          numero: pedido.numero,
          ok: synced.ok,
          message: synced.message,
        });
        if (synced.ok) {
          const io = req.app.get('io');
          if (io) emitPedidoActualizado(io, synced.pedido);
          if (pedido.estado !== synced.pedido.estado) {
          }
        }
      } catch (error) {
        results.push({
          pedido_id: pedido.id,
          numero: pedido.numero,
          ok: false,
          message: error.message,
        });
      }
    }
    res.json({ total: pendingOrders.length, synced: results.filter((r) => r.ok).length, results });
  }
);

router.put('/:id/pago', auth, requirePermission('pedidos.edit'), (req, res) => {
  const pedido = getPedidoOr404(req.params.id, res);
  if (!pedido) return;

  const metodoPago = normalizeMetodoPago(pedido.metodo_pago);
  if (metodoPago === 'mercadopago') {
    return res
      .status(400)
      .json({ error: 'Los pagos de MercadoPago se sincronizan desde el proveedor' });
  }

  const nextPagoEstado = normalizePagoEstado(req.body?.pago_estado, {
    metodoPago,
    origen: pedido.origen,
    tipoEntrega: pedido.tipo_entrega,
  });
  if (!['pendiente', 'pagado', 'rechazado', 'devuelto'].includes(nextPagoEstado)) {
    return res.status(400).json({ error: 'Estado de pago invalido' });
  }

  /*
    Cobrar y decir con qué se cobró son el mismo gesto.

    Esta ruta sólo aceptaba el estado, así que una mesa se marcaba cobrada
    arrastrando el método que se había elegido al cargar el pedido —una
    suposición hecha una hora antes, cuando el cliente todavía estaba mirando
    la carta—. Si pagaban distinto, el cierre de caja repartía mal entre
    efectivo y digital: el mismo problema que en el delivery, donde el
    repartidor sí puede corregirlo desde la app.

    Ahora se puede mandar el método junto con el cobro. Es opcional: si no
    viene, se conserva el que estaba, y las llamadas viejas siguen andando.
  */
  const metodoPedido = String(req.body?.metodo_pago || '').trim();
  let nextMetodoPago = metodoPago;
  if (metodoPedido) {
    const normalizado = normalizeMetodoPago(metodoPedido);
    if (normalizado === 'mercadopago') {
      return res.status(400).json({ error: 'No se puede pasar un cobro a MercadoPago a mano' });
    }
    nextMetodoPago = normalizado;
    db.prepare(
      'UPDATE pedidos SET metodo_pago = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(nextMetodoPago, pedido.id);
    pedido.metodo_pago = nextMetodoPago;
  }

  const detalle = String(req.body?.detalle || '').trim();
  const updated = hydratePedido(updatePedidoPaymentStatus(pedido, nextPagoEstado, { detalle }));
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'pagos',
    accion: 'actualizar_estado',
    entidad: 'pedido',
    entidad_id: updated.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      numero: updated.numero,
      metodo_pago: updated.metodo_pago,
      desde: normalizePagoEstado(pedido.pago_estado, { metodoPago, origen: pedido.origen }),
      hacia: updated.pago_estado,
      nota: detalle,
    },
  });

  const io = req.app.get('io');
  if (io) emitPedidoActualizado(io, updated);
  res.json(updated);
});

router.post('/:id/notificacion/:tipo/enviar', auth, async (req, res) => {
  if (!hasPermission(req.user, 'pedidos.edit') && !hasPermission(req.user, 'delivery.manage')) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  return res
    .status(410)
    .json({ error: 'Las notificaciones automaticas fueron removidas del sistema' });
});

router.post(
  '/:id/pago/mercadopago/sync',
  auth,
  requirePermission('pedidos.edit'),
  async (req, res) => {
    const pedido = getPedidoOr404(req.params.id, res);
    if (!pedido || pedido.metodo_pago !== 'mercadopago')
      return res.status(400).json({ error: 'Invalido' });

    const config = getConfigMap(db);
    try {
      const synced = await syncPedidoMercadoPago(db, pedido, config);
      const actor = actorFromRequest(req);
      logAudit(db, {
        modulo: 'pagos',
        accion: 'sync_mercadopago',
        entidad: 'pedido',
        entidad_id: pedido.id,
        actor_id: actor.actor_id,
        actor_nombre: actor.actor_nombre,
        detalle: {
          numero: pedido.numero,
          pago_estado: synced.pedido?.pago_estado,
          source: synced.source,
        },
      });
      if (synced.ok) {
        const io = req.app.get('io');
        if (io) emitPedidoActualizado(io, synced.pedido);
        if (pedido.estado !== synced.pedido.estado) {
        }
      }
      res.json(synced);
    } catch (error) {
      res.status(400).json({ error: publicPedidoError(error) });
    }
  }
);

router.post('/checkout/mercadopago', publicOrderRateLimit, async (req, res) => {
  const config = getConfigMap(db);
  if (!config.mercadopago_token)
    return res.status(400).json({ error: 'MercadoPago no configurado' });
  if (!req.body?.items) return res.status(400).json({ error: 'Items requeridos' });

  let pedido = null;
  try {
    const normalized = await buildPedidoPayload(
      { ...req.body, metodo_pago: 'mercadopago' },
      { config }
    );
    pedido = createPedidoWithInventory({
      ...normalized,
      pago_estado: resolveInitialPagoEstado({
        metodoPago: normalized.metodo_pago,
        origen: normalized.origen,
        tipoEntrega: normalized.tipo_entrega,
      }),
    });

    const appUrl = String(config.public_app_url || req.headers.origin || '').replace(/\/$/, '');
    const apiUrl = String(config.public_api_url || `${req.protocol}://${req.get('host')}`).replace(
      /\/$/,
      ''
    );

    const mpItems = normalized.items.map((item) => ({
      id: String(item.producto_id || item.id),
      title: item.nombre,
      quantity: Number(item.cantidad || 1),
      currency_id: 'ARS',
      unit_price: Number(item.precio_unitario || 0),
    }));
    if (normalized.costo_envio > 0) {
      mpItems.push({
        title: 'Envio',
        quantity: 1,
        currency_id: 'ARS',
        unit_price: normalized.costo_envio,
      });
    }

    const preference = await createPreference({
      token: config.mercadopago_token,
      body: {
        items: mpItems,
        external_reference: String(pedido.id),
        back_urls: {
          success: `${appUrl}/?pedido_id=${pedido.id}&mp=success`,
          failure: `${appUrl}/?pedido_id=${pedido.id}&mp=failure`,
          pending: `${appUrl}/?pedido_id=${pedido.id}&mp=pending`,
        },
        auto_return: 'approved',
        notification_url: `${apiUrl}/api/pedidos/webhook/mercadopago`,
      },
    });

    logMercadoPagoEvent({ pedidoId: pedido.id, tipo: 'preference_created', payload: preference });
    db.prepare('UPDATE pedidos SET mp_preference_id = ? WHERE id = ?').run(
      preference.id,
      pedido.id
    );

    const hydrated = getPedidoHydratedById(pedido.id);
    const io = req.app.get('io');
    if (io) emitNuevoPedido(io, hydrated);

    res.json({ pedido: hydrated, init_point: preference.init_point });
  } catch (error) {
    if (pedido?.id) {
      db.exec('BEGIN');
      restoreInventoryForPedido(db, pedido, { motivo: 'Error checkout MP' });
      db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedido.id);
      db.exec('COMMIT');
    }
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/interno',
  auth,
  requirePermission('tpv.use'),
  validateBody(createPedidoSchema),
  async (req, res) => {
    if (!req.body?.items) return res.status(400).json({ error: 'Items requeridos' });
    if (!getActiveCaja()) return res.status(400).json({ error: 'Caja cerrada' });

    try {
      const normalized = await buildPedidoPayload(req.body);
      const pedido = createPedidoWithInventory({
        ...normalized,
        pago_estado: resolveInitialPagoEstado({
          metodoPago: normalized.metodo_pago,
          origen: normalized.origen,
          tipoEntrega: normalized.tipo_entrega,
        }),
      });
      const actor = actorFromRequest(req, 'Caja');
      logAudit(db, {
        modulo: 'pedidos',
        accion: 'crear',
        entidad: 'pedido',
        entidad_id: pedido.id,
        actor_id: actor.actor_id,
        actor_nombre: actor.actor_nombre,
        detalle: { numero: pedido.numero, total: pedido.total, tipo_entrega: pedido.tipo_entrega },
      });
      const io = req.app.get('io');
      const hydrated = hydratePedido(pedido);
      if (io) emitNuevoPedido(io, hydrated);

      // Geocodificar la direccion en segundo plano: la mayoria de los
      // pedidos del TPV entran con la direccion escrita a mano y sin
      // punto GPS, y sin coordenadas el rider se queda sin mapa.
      if (normalized.tipo_entrega === 'delivery') {
        setImmediate(() => {
          geocodificarPedido(pedido.id)
            .then((geo) => {
              if (!geo || !io) return;
              const actualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
              if (actualizado) emitPedidoActualizado(io, hydratePedido(actualizado));
            })
            .catch(() => {});
        });
      }

      res.json(hydrated);
    } catch (error) {
      logger.error('[pedidos] Error al crear pedido interno', {
        message: error.message || String(error),
      });
      res.status(400).json({ error: normalizePedidoCreationError(error) });
    }
  }
);

router.post('/', publicOrderRateLimit, validateBody(createPedidoSchema), async (req, res) => {
  if (!req.body?.items) return res.status(400).json({ error: 'Items requeridos' });

  try {
    // Respetar el origen que viene en el body para flujos publicos compatibles.
    const origen = req.body.origen || 'web';
    const normalized = await buildPedidoPayload({ ...req.body, origen });
    const pedido = createPedidoWithInventory({
      ...normalized,
      pago_estado: resolveInitialPagoEstado({
        metodoPago: normalized.metodo_pago,
        origen: normalized.origen,
        tipoEntrega: normalized.tipo_entrega,
      }),
    });
    const actor = actorFromRequest(req, origen === 'web' ? 'Web publica' : 'Canal publico');
    logAudit(db, {
      modulo: 'pedidos',
      accion: 'crear',
      entidad: 'pedido',
      entidad_id: pedido.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: { numero: pedido.numero, total: pedido.total, origen },
    });
    const io = req.app.get('io');
    const hydrated = hydratePedido(pedido);
    if (io) {
      // Pequeño delay para asegurar que el pedido esté completamente guardado
      setTimeout(() => {
        emitNuevoPedido(io, hydrated);
        // También emitir como actualización admin para redundancia
        emitPedidoActualizado(io, hydrated);
        logger.info(
          `[pedidos] Nuevo pedido #${hydrated.numero} emitido via socket (origen: ${origen})`
        );
      }, 500);
    } else {
      logger.error('[pedidos] ERROR: io no disponible para emitir nuevo pedido');
    }

    // Geocodificar la direccion en segundo plano para que el rider tenga
    // mapa aunque el cliente no haya compartido su ubicacion.
    // Fire-and-forget a proposito: la respuesta al cliente no espera por
    // esto, y si Nominatim esta caido el pedido se crea igual.
    if (normalized.tipo_entrega === 'delivery') {
      setImmediate(() => {
        geocodificarPedido(pedido.id)
          .then((geo) => {
            if (!geo || !io) return;
            // Re-emitir para que la app rider reciba las coordenadas
            // sin tener que refrescar a mano.
            const actualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
            if (actualizado) emitPedidoActualizado(io, hydratePedido(actualizado));
          })
          .catch(() => {});
      });
    }

    res.json(hydrated);
  } catch (error) {
    logger.error('[pedidos] Error al crear pedido publico', {
      message: error.message || String(error),
    });
    res.status(400).json({ error: publicPedidoError(error) });
  }
});

router.post('/:id/imprimir', auth, requirePermission('pedidos.print'), (req, res) => {
  const { buildPrintDocument } = require('../utils/printTemplates');
  /*
    Hidratado y no la fila cruda. `pedidos.items` es una columna de TEXTO con
    JSON adentro, y el conversor de centavos no puede ver adentro de un
    string: el total salía bien —es una columna numérica— pero cada renglón
    del ticket se imprimía en centavos. Dos milanesas de $7.000 figuraban
    como "$1.400.000" arriba de un total de "$14.000".

    `getPedidoHydratedById` devuelve los ítems como lista, y ahí sí el
    conversor entra y los pasa a pesos.
  */
  const pedido = getPedidoHydratedById(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  const tipo = req.body.tipo || 'ticket_cliente';
  const copias = Math.max(1, Number(req.body.copias || configuredCopies(tipo)));
  // Convertir pedido de centavos a pesos antes de renderizar el HTML.
  // El middleware global centsToPesos solo actua sobre respuestas JSON —
  // el HTML del ticket se construye aca directamente y por eso no lo alcanza.
  const pedidoEnPesos = centsToPesos(pedido);
  const document = buildPrintDocument(db, pedidoEnPesos, tipo);
  const impresion = registerPrintJob(
    pedido.id,
    document.tipo,
    document.area,
    copias,
    document.payload,
    true
  );

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'impresiones',
    accion: 'imprimir',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { tipo, copias, impresion_id: impresion.id },
  });
  res.json({ impresion, html: document.html });
});

router.put('/:id/estado', auth, async (req, res) => {
  const { estado: nuevoEstado, pin } = req.body;
  const existing = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });

  const config = getConfigMap(db);
  const isManager = hasPermission(req.user, 'pedidos.edit');
  const simpleFlow = config.modulo_kds_activo === '0';
  const transitionContext = {
    simpleFlow,
    tipoEntrega: existing.tipo_entrega,
    repartidorId: existing.repartidor_id,
    requierePin: isManager ? false : Boolean(existing.entrega_pin),
    pinValidado: String(pin || '').trim() === String(existing.entrega_pin),
    requiereFoto: isManager ? false : config.delivery_requiere_foto_entrega === '1',
    fotoEntrega: Boolean(existing.entrega_foto),
  };
  const validation = validateTransition(existing.estado, nuevoEstado, {
    ...transitionContext,
  });

  if (!validation.valid) return res.status(400).json({ error: validation.reason });

  if (
    !canUserTransitionWithContext(
      req.user,
      existing.estado,
      nuevoEstado,
      existing.tipo_entrega,
      transitionContext
    )
  ) {
    return res.status(403).json({
      error: 'Sin permisos',
      validTransitions: getAvailableTransitions(existing.estado, transitionContext).filter((t) =>
        canUserTransitionWithContext(
          req.user,
          existing.estado,
          t,
          existing.tipo_entrega,
          transitionContext
        )
      ),
    });
  }

  let assignedForEnCamino = null;
  if (
    nuevoEstado === PedidoState.EN_CAMINO &&
    existing.tipo_entrega === 'delivery' &&
    !existing.repartidor_id
  ) {
    const autoAssigned = autoAssignPedido(db, existing.id, {
      onlyIfSingleAvailable: true,
      markEnCamino: false,
    });

    if (!autoAssigned.ok) {
      return res.status(400).json({
        error: 'No hay un repartidor disponible para enviar este pedido',
      });
    }

    assignedForEnCamino = autoAssigned.repartidor || null;
  }

  try {
    db.exec('BEGIN');
    const settleOnEntrega =
      nuevoEstado === PedidoState.ENTREGADO && shouldAutoSettleOnEntrega(existing);
    db.prepare(
      `
      UPDATE pedidos
      SET estado = ?,
          pago_estado = CASE WHEN ? THEN 'pagado' ELSE pago_estado END,
          pago_detalle = CASE
            WHEN ? AND TRIM(COALESCE(pago_detalle, '')) = '' THEN 'Cobrado al entregar'
            ELSE pago_detalle
          END,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(nuevoEstado, settleOnEntrega ? 1 : 0, settleOnEntrega ? 1 : 0, req.params.id);
    if (nuevoEstado === PedidoState.CANCELADO)
      restoreInventoryForPedido(db, existing, { motivo: 'Cancelacion' });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    return res.status(400).json({ error: error.message });
  }

  let pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'pedidos',
    accion: 'cambiar_estado',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { numero: pedido.numero, desde: existing.estado, hacia: nuevoEstado },
  });

  // Trazabilidad de tiempos: alimenta los reportes de delivery y permite
  // reconstruir por que un pedido tardo lo que tardo.
  registrarEvento({
    pedidoId: pedido.id,
    estado: nuevoEstado,
    estadoAnterior: existing.estado,
    actorTipo: 'admin',
    actorId: actor.actor_id,
    actorNombre: actor.actor_nombre,
  });

  let autoAssignedRepartidor = null;
  if (
    nuevoEstado === PedidoState.LISTO &&
    pedido.tipo_entrega === 'delivery' &&
    !pedido.repartidor_id &&
    config.delivery_autoasignar_activo === '1'
  ) {
    const autoAssigned = autoAssignPedido(db, pedido.id, {
      onlyIfSingleAvailable: true,
      markEnCamino: false,
    });
    if (autoAssigned.ok) {
      pedido = autoAssigned.pedido;
      autoAssignedRepartidor = autoAssigned.repartidor || null;
    }
  }

  try {
    if (pedido.cliente_id && existing.estado !== nuevoEstado) {
      recalculateClienteStats(db, pedido.cliente_id);
    }
  } catch (loyaltyError) {
    logger.error('[Loyalty Error]', { message: loyaltyError.message });
    // No bloqueamos el cambio de estado si falla la lealtad
  }

  // Acumular fidelidad (puntos y sellos) cuando se entrega un pedido
  let fidelidadActualizada = null;
  if (
    nuevoEstado === PedidoState.ENTREGADO &&
    existing.estado !== PedidoState.ENTREGADO &&
    pedido.cliente_id &&
    pedido.total > 0
  ) {
    try {
      const fidelizacionConfig = getFidelizacionConfig();
      if (fidelizacionConfig.activo) {
        fidelidadActualizada = procesarFidelidadPedido(pedido.cliente_id, pedido.id, pedido.total);
        if (fidelidadActualizada) {
          logger.info(
            `[Fidelizacion] Cliente #${pedido.cliente_id} actualizó fidelidad por pedido #${pedido.numero}`
          );
        }
      }
    } catch (fidelidadError) {
      logger.error('[Fidelizacion Error]', { message: fidelidadError.message });
      // No bloqueamos el cambio de estado si falla la fidelización
    }
  }

  let releasedRepartidorId = null;
  if ([PedidoState.ENTREGADO, PedidoState.CANCELADO].includes(nuevoEstado)) {
    if (pedido.repartidor_id) {
      db.prepare('UPDATE repartidores SET disponible = 1 WHERE id = ?').run(pedido.repartidor_id);
      releasedRepartidorId = pedido.repartidor_id;
    }
    clearTrackingToken(pedido.id);
  }

  const io = req.app.get('io');
  const hydrated = hydratePedido(pedido);
  if (io) {
    emitPedidoActualizado(io, hydrated);
    if (assignedForEnCamino) {
      emitDeliveryAssignment(io, {
        pedido: hydrated,
        repartidor: assignedForEnCamino,
        emitPedido: false,
      });
    }
    if (autoAssignedRepartidor) {
      emitDeliveryAssignment(io, {
        pedido: hydrated,
        repartidor: autoAssignedRepartidor,
        emitPedido: false,
      });
    }
    if (releasedRepartidorId) {
      emitDeliveryAssignment(io, {
        previousRepartidor: db
          .prepare('SELECT * FROM repartidores WHERE id = ?')
          .get(releasedRepartidorId),
        emitPedido: false,
      });
    }
  }

  if (fidelidadActualizada) {
    // La fidelizacion queda registrada en el sistema; no se envian avisos automaticos.
  }

  // Incluir info de fidelización en la respuesta si se actualizó
  const respuesta = fidelidadActualizada
    ? { ...hydrated, fidelizacion: fidelidadActualizada }
    : hydrated;
  res.json(respuesta);
});

router.put('/:id', auth, requirePermission('pedidos.edit'), (req, res) => {
  const {
    cliente_nombre,
    cliente_telefono,
    cliente_direccion,
    notas,
    metodo_pago,
    tipo_entrega,
    mesa,
    hora_entrega,
    descuento,
  } = req.body;
  const existing = getPedidoOr404(req.params.id, res);
  if (!existing) return;
  const nextMetodoPago = normalizeMetodoPago(metodo_pago ?? existing.metodo_pago);
  const nextPagoEstado = normalizePagoEstado(existing.pago_estado, {
    metodoPago: nextMetodoPago,
    origen: existing.origen,
  });

  db.prepare(
    `
    UPDATE pedidos
    SET cliente_nombre=?,
        cliente_telefono=?,
        cliente_direccion=?,
        notas=?,
        metodo_pago=?,
        pago_estado=?,
        tipo_entrega=?,
        mesa=?,
        hora_entrega=?,
        descuento=?,
        actualizado_en=CURRENT_TIMESTAMP
    WHERE id=?
  `
  ).run(
    cliente_nombre,
    cliente_telefono,
    cliente_direccion,
    notas,
    nextMetodoPago,
    nextPagoEstado,
    tipo_entrega,
    mesa,
    hora_entrega ?? existing.hora_entrega ?? '',
    descuento,
    req.params.id
  );

  const updated = getPedidoHydratedById(req.params.id);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'pedidos',
    accion: 'editar',
    entidad: 'pedido',
    entidad_id: updated.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { numero: updated.numero },
  });
  res.json(updated);
});

module.exports = router;
