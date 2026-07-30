const db = require('../db');
const { recalculateClienteStats } = require('../utils/loyalty');
const { buildPrintDocument, buildMesaPrecuentaDocument } = require('../utils/printTemplates');
const {
  getConfigMap,
  createPreference,
  getPayment,
  searchPayments,
} = require('../utils/mercadoPago');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { requirePermission, hasPermission } = require('../utils/permissions');
const { quoteDelivery } = require('../utils/deliveryZones');
const { autoAssignPedido, assignPedidoToRepartidor } = require('../utils/deliveryAssignment');
const { estimateDeliveryEta } = require('../utils/deliveryEta');
const { getShiftForDate } = require('../utils/shifts');
const { applyInventoryToPedido, restoreInventoryForPedido } = require('../utils/inventory');
const {
  getActiveCaja: getActiveCajaFromDb,
  getConfigMap: getOperationalConfigMap,
  getOperationalShiftContext,
} = require('../utils/operationalCaja');
const {
  generateTrackingToken,
  emitPedidoActualizado,
  emitNuevoPedido,
  clearTrackingToken,
} = require('../utils/socketRooms');
const {
  validateTransition,
  canUserTransition,
  getValidTransitions,
  isTerminal,
  PedidoState,
} = require('../utils/pedidoStateMachine');
const { ensureClienteDireccion } = require('../utils/clienteAddresses');
const {
  normalizeMetodoPago,
  normalizePagoEstado,
  resolveInitialPagoEstado,
} = require('../utils/paymentStatus');
const {
  parsePedidoItems: parseStoredPedidoItems,
  scalePedidoItemsToStorage,
  serializePedidoItems,
  loadPedidoItems,
  replacePedidoItems,
} = require('../utils/pedidoItems');
const { geocodeClienteDireccion } = require('../utils/geocode');
const { asegurarCodigoTarjeta } = require('./fidelizacionService');

const ESTADO_LABELS = {
  [PedidoState.NUEVO]: 'recibido',
  [PedidoState.CONFIRMADO]: 'confirmado',
  [PedidoState.PREPARANDO]: 'preparando',
  [PedidoState.LISTO]: 'listo',
  [PedidoState.EN_CAMINO]: 'en camino',
  [PedidoState.ENTREGADO]: 'entregado',
  [PedidoState.CANCELADO]: 'cancelado',
};

function getNextNumero() {
  const config = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'numero_pedido_actual'")
    .get();
  const num = parseInt(config?.valor || '1', 10);
  db.prepare(
    "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('numero_pedido_actual', ?)"
  ).run(String(num + 1));
  return num;
}

function getPedidoOr404(id, res) {
  const pedido = getPedidoById(id);
  if (!pedido) {
    if (res) res.status(404).json({ error: 'Pedido no encontrado' });
    return null;
  }
  return pedido;
}

function getPedidoById(id) {
  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
}

function getPedidoHydratedById(id) {
  return hydratePedido(getPedidoById(id));
}

function listPedidosHydrated(query, params = []) {
  return db
    .prepare(query)
    .all(...params)
    .map(hydratePedido);
}

function getMesaPedidosAbiertos(mesa) {
  const mesaNormalizada = String(mesa || '').trim();
  return db
    .prepare(
      `
    SELECT *
    FROM pedidos
    WHERE tipo_entrega = 'mesa'
      AND TRIM(COALESCE(mesa, '')) = ?
      AND estado NOT IN ('entregado', 'cancelado')
    ORDER BY datetime(creado_en) ASC, id ASC
  `
    )
    .all(mesaNormalizada);
}

function hydratePedido(pedido) {
  if (!pedido) return null;
  const config = getConfigMap(db);
  const metodoPago = normalizeMetodoPago(pedido.metodo_pago);
  const pagoEstado = normalizePagoEstado(pedido.pago_estado, {
    metodoPago,
    origen: pedido.origen,
  });
  let repartidor = null;
  if (pedido.repartidor_id) {
    repartidor = db
      .prepare(
        'SELECT id, nombre, telefono, vehiculo, latitud, longitud, ultima_ubicacion_en, zona_preferida FROM repartidores WHERE id = ?'
      )
      .get(pedido.repartidor_id);
  }

  const eta = estimateDeliveryEta({ ...pedido, repartidor }, config);

  return {
    ...pedido,
    items: loadPedidoItems(db, pedido, { backfill: false }),
    metodo_pago: metodoPago,
    pago_estado: pagoEstado,
    repartidor: repartidor || null,
    eta_min_dinamico: eta.minutes,
    eta_origen: eta.source,
    distancia_repartidor_km: eta.distance_km,
    ubicacion_repartidor_atrasada: eta.stale_location,
  };
}

function money(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function parsePedidoItems(items) {
  return parseStoredPedidoItems(items);
}

function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const OPTIONAL_FOREIGN_KEY_LOOKUPS = {
  repartidores: db.prepare('SELECT id FROM repartidores WHERE id = ?'),
  cupones: db.prepare('SELECT id FROM cupones WHERE id = ?'),
  marketing_campanas: db.prepare('SELECT id FROM marketing_campanas WHERE id = ?'),
  marketing_promos: db.prepare('SELECT id FROM marketing_promos WHERE id = ?'),
};

function resolveOptionalForeignKey(table, value) {
  const id = optionalNumber(value);
  if (!id) return null;
  const statement = OPTIONAL_FOREIGN_KEY_LOOKUPS[table];
  if (!statement) return null;
  return statement.get(id)?.id || null;
}

function sanitizePedidoReferences(payload = {}) {
  const repartidorId = resolveOptionalForeignKey('repartidores', payload.repartidor_id);
  const cuponId = resolveOptionalForeignKey('cupones', payload.cupon_id);
  const marketingCampanaId = resolveOptionalForeignKey(
    'marketing_campanas',
    payload.marketing_campana_id
  );
  const marketingPromoId = resolveOptionalForeignKey(
    'marketing_promos',
    payload.marketing_promo_id
  );

  return {
    ...payload,
    repartidor_id: repartidorId,
    cupon_id: cuponId,
    cupon_codigo: cuponId ? payload.cupon_codigo : null,
    marketing_campana_id: marketingCampanaId,
    marketing_promo_id: marketingPromoId,
  };
}

function generateEntregaPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function subtotalFromItems(items) {
  return roundAmount(
    items.reduce(
      (acc, item) => acc + Number(item.precio_unitario || 0) * Number(item.cantidad || 0),
      0
    )
  );
}

function estimateText(pedido, config) {
  if (pedido.tipo_entrega === 'delivery') {
    return `${Number(pedido.eta_min_dinamico || pedido.tiempo_estimado_min || config.tiempo_delivery || 30)} min`;
  }
  if (pedido.tipo_entrega === 'retiro') {
    return `${Number(config.tiempo_retiro || 20)} min`;
  }
  return 'a confirmar';
}

function buildTrackingUrl(baseUrl, pedidoId, trackingToken = '') {
  const cleanedBase = String(baseUrl || '').replace(/\/$/, '');
  const path = cleanedBase ? `${cleanedBase}/seguimiento/${pedidoId}` : `/seguimiento/${pedidoId}`;
  return trackingToken ? `${path}?token=${encodeURIComponent(trackingToken)}` : path;
}

function registerPrintJob(pedidoId, tipo, area, copias, payload, printed = false) {
  const result = db
    .prepare(
      `
      INSERT INTO impresiones (pedido_id, tipo, area, estado, copias, intentos, payload, impreso_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      pedidoId,
      tipo,
      area,
      printed ? 'impreso' : 'pendiente',
      Math.max(1, Number(copias || 1)),
      printed ? 1 : 0,
      JSON.stringify(payload),
      printed ? new Date().toISOString() : null
    );

  return db.prepare('SELECT * FROM impresiones WHERE id = ?').get(result.lastInsertRowid);
}

function configuredCopies(tipo) {
  const clave = tipo === 'comanda_cocina' ? 'impresion_copias_comanda' : 'impresion_copias_ticket';
  const value = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return Math.max(1, Number(value?.valor || 1));
}

function canNotifyPedido(user) {
  return hasPermission(user, 'pedidos.edit') || hasPermission(user, 'delivery.manage');
}

function canTransitionPedido(user, pedido, nextEstado) {
  if (hasPermission(user, 'pedidos.edit')) return true;

  if (hasPermission(user, 'pedidos.kitchen')) {
    if (pedido.estado === 'confirmado' && nextEstado === 'preparando') return true;
    if (pedido.estado === 'preparando' && nextEstado === 'listo') return true;
    if (
      pedido.estado === 'listo' &&
      pedido.tipo_entrega === 'delivery' &&
      nextEstado === 'en_camino'
    )
      return true;
    if (
      pedido.estado === 'listo' &&
      pedido.tipo_entrega !== 'delivery' &&
      nextEstado === 'entregado'
    )
      return true;
    return false;
  }

  if (hasPermission(user, 'delivery.manage')) {
    return (
      pedido.tipo_entrega === 'delivery' &&
      pedido.estado === 'en_camino' &&
      nextEstado === 'entregado'
    );
  }

  return false;
}

function createPedidoRecord(payload) {
  const safePayload = sanitizePedidoReferences(payload);
  const {
    cliente_id: cliente_id_input = null,
    cliente_nombre = '',
    cliente_telefono = '',
    cliente_direccion = '',
    items,
    subtotal,
    costo_envio = 0,
    descuento = 0,
    total,
    tipo_entrega = 'delivery',
    mesa = '',
    hora_entrega = '',
    metodo_pago = 'efectivo',
    notas = '',
    origen = 'web',
    pago_estado = undefined,
    pago_id = '',
    mp_preference_id = '',
    pago_detalle = '',
    delivery_zona = '',
    tiempo_estimado_min = 0,
    turno_operativo = '',
    entrega_pin = '',
    cliente_latitud = null,
    cliente_longitud = null,
    entrega_foto = '',
    entrega_foto_en = null,
    cupon_id = null,
    cupon_codigo = null,
    repartidor_id = null,
    marketing_campana_id = null,
    marketing_promo_id = null,
    marketing_origen = '',
    marketing_codigo = '',
    marketing_source = '',
    marketing_medium = '',
    marketing_campaign = '',
    marketing_content = '',
  } = safePayload;
  const metodoPago = normalizeMetodoPago(metodo_pago);
  const pagoEstado = resolveInitialPagoEstado({
    metodoPago,
    origen,
    pagoEstado: pago_estado,
  });

  const numero = getNextNumero();
  let cliente_id = null;
  const clienteIdExplicit = optionalNumber(cliente_id_input);

  if (clienteIdExplicit) {
    const existing = db
      .prepare('SELECT id, nombre, telefono FROM clientes WHERE id = ?')
      .get(clienteIdExplicit);
    if (existing) {
      cliente_id = existing.id;
      db.prepare('UPDATE clientes SET nombre = ?, telefono = ?, direccion = ? WHERE id = ?').run(
        cliente_nombre || existing.nombre || '',
        cliente_telefono || existing.telefono || '',
        cliente_direccion || '',
        existing.id
      );
      ensureClienteDireccion(
        db,
        existing.id,
        {
          etiqueta: 'Delivery',
          direccion: cliente_direccion || '',
          latitud: cliente_latitud,
          longitud: cliente_longitud,
        },
        { makePrimaryIfEmpty: true }
      );
      asegurarCodigoTarjeta(existing.id);
    }
  }

  if (!cliente_id && cliente_telefono) {
    const existing = db.prepare('SELECT id FROM clientes WHERE telefono = ?').get(cliente_telefono);
    if (existing) {
      cliente_id = existing.id;
      db.prepare('UPDATE clientes SET nombre = ? WHERE id = ?').run(
        cliente_nombre || '',
        existing.id
      );
      ensureClienteDireccion(
        db,
        existing.id,
        {
          etiqueta: 'Delivery',
          direccion: cliente_direccion || '',
          latitud: cliente_latitud,
          longitud: cliente_longitud,
        },
        { makePrimaryIfEmpty: true }
      );
      asegurarCodigoTarjeta(existing.id);
    } else if (cliente_nombre) {
      const created = db
        .prepare('INSERT INTO clientes (nombre, telefono, direccion) VALUES (?, ?, ?)')
        .run(cliente_nombre, cliente_telefono, cliente_direccion || '');
      cliente_id = created.lastInsertRowid;
      asegurarCodigoTarjeta(cliente_id);
      ensureClienteDireccion(
        db,
        cliente_id,
        {
          etiqueta: 'Principal',
          direccion: cliente_direccion || '',
          latitud: cliente_latitud,
          longitud: cliente_longitud,
          principal: true,
        },
        { makePrimaryIfEmpty: true }
      );
    }
  }

  const itemsArray = parsePedidoItems(items);
  const itemsStr = serializePedidoItems(itemsArray);
  const result = db
    .prepare(
      `INSERT INTO pedidos (
        numero, cliente_id, cliente_nombre, cliente_telefono, cliente_direccion, items,
        subtotal, costo_envio, descuento, total, tipo_entrega, mesa, hora_entrega, metodo_pago,
        notas, origen, pago_estado, pago_id, mp_preference_id, pago_detalle, delivery_zona, tiempo_estimado_min,
        turno_operativo, entrega_pin, cliente_latitud, cliente_longitud, entrega_foto, entrega_foto_en,
        repartidor_id, marketing_campana_id, marketing_promo_id, marketing_origen, marketing_codigo,
        marketing_source, marketing_medium, marketing_campaign, marketing_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      numero,
      cliente_id,
      cliente_nombre,
      cliente_telefono,
      cliente_direccion,
      itemsStr,
      subtotal,
      costo_envio,
      descuento,
      total,
      tipo_entrega,
      mesa,
      hora_entrega || '',
      metodoPago,
      notas,
      origen,
      pagoEstado,
      pago_id,
      mp_preference_id,
      pago_detalle,
      delivery_zona,
      Number(tiempo_estimado_min || 0),
      turno_operativo || '',
      entrega_pin || '',
      optionalNumber(cliente_latitud),
      optionalNumber(cliente_longitud),
      entrega_foto || '',
      entrega_foto_en || null,
      optionalNumber(repartidor_id),
      optionalNumber(marketing_campana_id),
      optionalNumber(marketing_promo_id),
      String(marketing_origen || ''),
      String(marketing_codigo || ''),
      String(marketing_source || ''),
      String(marketing_medium || ''),
      String(marketing_campaign || ''),
      String(marketing_content || '')
    );

  const pedidoId = result.lastInsertRowid;
  const tracking_token = generateTrackingToken(pedidoId);

  // Actualizar el pedido con su tracking token
  db.prepare('UPDATE pedidos SET tracking_token = ? WHERE id = ?').run(tracking_token, pedidoId);

  replacePedidoItems(db, pedidoId, itemsArray);

  // Registrar uso del cupón si existe
  if (cupon_id) {
    db.prepare(
      `
      INSERT INTO cupones_usados (cupon_id, pedido_id, cliente_id, cliente_telefono, monto_descuento)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(cupon_id, pedidoId, cliente_id, cliente_telefono || '', descuento);

    // Incrementar contador de usos del cupón
    db.prepare(
      `
      UPDATE cupones SET usos_actuales = usos_actuales + 1, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(cupon_id);
  }

  if (
    marketing_campana_id ||
    marketing_promo_id ||
    marketing_origen ||
    marketing_codigo ||
    marketing_source ||
    marketing_medium ||
    marketing_campaign ||
    marketing_content
  ) {
    const { registerPedidoAttribution } = require('./marketingService');
    registerPedidoAttribution({
      pedidoId,
      payload: safePayload,
      clienteId: cliente_id,
      telefono: cliente_telefono || '',
    });
  }

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
}

function createPedidoWithInventory(payload) {
  // Validar caja abierta para pedidos internos/tpv
  if (['tpv', 'interno', 'mesa', 'caja'].includes(payload.origen || 'web')) {
    const operationalContext = getOperationalShiftContext(getOperationalConfigMap(db));
    if (!operationalContext.abiertoAhora) {
      throw new Error('No se puede registrar el pedido porque no hay un turno operativo abierto.');
    }
    const caja = getActiveCajaFromDb(db);
    if (!caja) {
      throw new Error('Debes abrir la caja antes de registrar ventas.');
    }
    const sameShift =
      String(caja.turno_id || '').trim() === String(operationalContext.shiftId || '').trim();
    const sameDate =
      String(caja.fecha_operativa || '').trim() ===
      String(operationalContext.fechaOperativa || '').trim();
    if (!sameShift || !sameDate) {
      throw new Error(
        'La caja abierta no corresponde al turno operativo actual. Cerrala y abrí la del turno correcto.'
      );
    }
  }

  try {
    db.exec('BEGIN');
    const safePayload = sanitizePedidoReferences(payload);
    let pedido = createPedidoRecord(safePayload);

    // Aplicar descuento de stock (basado en recetas o stock directo)
    applyInventoryToPedido(db, pedido);

    if (pedido.tipo_entrega === 'delivery') {
      if (safePayload.repartidor_id) {
        pedido = assignPedidoToRepartidor(db, pedido.id, safePayload.repartidor_id, {
          markEnCamino: false,
        }).pedido;
      } else {
        const assigned = autoAssignPedido(db, pedido.id, {
          markEnCamino: false,
        });
        if (assigned.ok) pedido = assigned.pedido;
      }
    }

    db.exec('COMMIT');
    return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  }
}

function getActiveCaja() {
  return getActiveCajaFromDb(db);
}

function validateAndApplyCupon(codigo, subtotal, clienteId, clienteTelefono) {
  if (!codigo) return { valido: false, descuento: 0, cupon: null };

  const cupon = db
    .prepare('SELECT * FROM cupones WHERE codigo = ? AND activo = 1')
    .get(codigo.trim().toUpperCase());

  if (!cupon)
    return { valido: false, error: 'Cupón no válido o inactivo', descuento: 0, cupon: null };

  const now = new Date().toISOString();
  if (cupon.fecha_inicio && now < cupon.fecha_inicio) {
    return { valido: false, error: 'El cupón aún no está activo', descuento: 0, cupon: null };
  }
  if (cupon.fecha_fin && now > cupon.fecha_fin) {
    return { valido: false, error: 'El cupón ha expirado', descuento: 0, cupon: null };
  }

  if (cupon.limite_usos > 0 && cupon.usos_actuales >= cupon.limite_usos) {
    return {
      valido: false,
      error: 'El cupón ha alcanzado el límite de usos',
      descuento: 0,
      cupon: null,
    };
  }

  if (subtotal < cupon.minimo_compra) {
    return {
      valido: false,
      error: `El mínimo de compra para este cupón es $${cupon.minimo_compra.toLocaleString('es-AR')}`,
      descuento: 0,
      cupon: null,
    };
  }

  if (clienteId || clienteTelefono) {
    const usosCliente = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM cupones_usados 
      WHERE cupon_id = ? AND (cliente_id = ? OR cliente_telefono = ?)
    `
      )
      .get(cupon.id, clienteId || 0, clienteTelefono || '');

    if (usosCliente.count >= cupon.limite_por_cliente) {
      return {
        valido: false,
        error: 'Ya has usado este cupón el máximo de veces permitido',
        descuento: 0,
        cupon: null,
      };
    }
  }

  let montoDescuento = 0;
  if (cupon.tipo_descuento === 'porcentaje') {
    montoDescuento = subtotal * (cupon.valor_descuento / 100);
    if (cupon.descuento_maximo > 0) {
      montoDescuento = Math.min(montoDescuento, cupon.descuento_maximo);
    }
  } else {
    montoDescuento = cupon.valor_descuento;
  }

  montoDescuento = Math.min(montoDescuento, subtotal);

  return {
    valido: true,
    descuento: Math.round(montoDescuento * 100) / 100,
    cupon: {
      id: cupon.id,
      codigo: cupon.codigo,
      descripcion: cupon.descripcion,
      tipo_descuento: cupon.tipo_descuento,
      valor_descuento: cupon.valor_descuento,
    },
  };
}

async function buildPedidoPayload(body, options = {}) {
  const config = options.config || getConfigMap(db);
  const tipoEntrega = body.tipo_entrega || 'delivery';
  const shift = getShiftForDate(config, new Date());
  const origen = body.origen || 'web';
  // 'whatsapp' (agente de IA) tiene que respetar el mismo control de turno
  // que la web publica: sin esto, un pedido armado fuera de horario por el
  // agente se cargaria igual, sin que nadie en cocina lo espere.
  const isPublicFlow = ['web', 'canal_publico', 'whatsapp'].includes(origen);
  const parsedItems = scalePedidoItemsToStorage(body.items);
  const subtotal = subtotalFromItems(parsedItems);

  // Validar cupón si se proporciona
  const cuponData = body.cupon_codigo
    ? validateAndApplyCupon(body.cupon_codigo, subtotal, body.cliente_id, body.cliente_telefono)
    : { valido: false, descuento: 0, cupon: null };

  const descuentoSolicitado = cuponData.valido
    ? cuponData.descuento
    : roundAmount(body.descuento || 0);

  let costoEnvio = 0;
  let deliveryZona = '';
  let tiempoEstimadoMin = 0;

  if (isPublicFlow && !shift) {
    throw new Error(
      'Ahora mismo estamos fuera de turno. Podes dejar el pedido para el siguiente horario o pedir por el local.'
    );
  }

  if (tipoEntrega === 'delivery') {
    if (!String(body.cliente_direccion || '').trim()) {
      throw new Error('Falta la direccion para delivery');
    }
    const quote = quoteDelivery(config, body.cliente_direccion || '');
    if (!quote.available) {
      throw new Error(quote.message || 'La direccion no pertenece a una zona de delivery valida');
    }
    costoEnvio = roundAmount(quote.costo_envio || 0);
    deliveryZona = quote.zone_name || '';
    tiempoEstimadoMin = Number(quote.tiempo_estimado_min || config.tiempo_delivery || 30);
  } else if (tipoEntrega === 'retiro') {
    tiempoEstimadoMin = Number(config.tiempo_retiro || 20);
  }

  if (tipoEntrega === 'mesa' && !String(body.mesa || '').trim()) {
    throw new Error('Mesa requerida para pedido de salon');
  }

  // ── GEOCODIFICACIÓN AUTOMÁTICA ──
  // Si no hay coordenadas del cliente pero hay dirección, intentamos geocodificar
  let clienteLatitud = optionalNumber(body.cliente_latitud);
  let clienteLongitud = optionalNumber(body.cliente_longitud);

  if (
    tipoEntrega === 'delivery' &&
    (clienteLatitud === null || clienteLongitud === null) &&
    String(body.cliente_direccion || '').trim()
  ) {
    try {
      const geo = await geocodeClienteDireccion(body.cliente_direccion, config);
      if (geo && geo.lat && geo.lng) {
        clienteLatitud = geo.lat;
        clienteLongitud = geo.lng;
      }
    } catch (e) {
      // Silencioso: si falla la geocodificación, el pedido se crea sin coordenadas
    }
  }

  const descuento = Math.min(descuentoSolicitado, roundAmount(subtotal));
  const marketingCampanaId = optionalNumber(body.marketing_campana_id);
  const marketingPromoId = optionalNumber(body.marketing_promo_id);
  const marketingOrigen = String(body.marketing_origen || '').trim();
  const marketingCodigo = String(body.marketing_codigo || '').trim();
  const marketingSource = String(body.marketing_source || '').trim();
  const marketingMedium = String(body.marketing_medium || '').trim();
  const marketingCampaign = String(body.marketing_campaign || '').trim();
  const marketingContent = String(body.marketing_content || '').trim();

  return {
    cliente_nombre: body.cliente_nombre || '',
    cliente_telefono: body.cliente_telefono || '',
    cliente_direccion: body.cliente_direccion || '',
    items: parsedItems,
    subtotal,
    costo_envio: costoEnvio,
    descuento,
    total: roundAmount(subtotal + costoEnvio - descuento),
    tipo_entrega: tipoEntrega,
    mesa: body.mesa || '',
    hora_entrega: String(body.hora_entrega || '').trim(),
    metodo_pago: normalizeMetodoPago(body.metodo_pago || 'efectivo'),
    notas: body.notas || '',
    origen,
    delivery_zona: deliveryZona,
    tiempo_estimado_min: tiempoEstimadoMin,
    turno_operativo: shift?.nombre || '',
    entrega_pin:
      tipoEntrega === 'delivery' && String(config.delivery_validacion_activa || '0') === '1'
        ? generateEntregaPin()
        : '',
    cliente_latitud: clienteLatitud,
    cliente_longitud: clienteLongitud,
    cupon_id: cuponData.cupon?.id || null,
    cupon_codigo: cuponData.cupon?.codigo || null,
    cupon_validacion: cuponData,
    repartidor_id: optionalNumber(body.repartidor_id),
    marketing_campana_id: marketingCampanaId,
    marketing_promo_id: marketingPromoId,
    marketing_origen: marketingOrigen,
    marketing_codigo: marketingCodigo,
    marketing_source: marketingSource,
    marketing_medium: marketingMedium,
    marketing_campaign: marketingCampaign,
    marketing_content: marketingContent,
  };
}

function splitPedidoMesa(pedido, splitItems, mesaDestino) {
  const originalItems = loadPedidoItems(db, pedido);
  const selectedItems = [];
  const remainingItems = [];

  originalItems.forEach((item, index) => {
    const requestedQty = Math.max(0, Number(splitItems[index] || 0));
    const currentQty = Math.max(0, Number(item.cantidad || 0));

    if (requestedQty > currentQty) {
      throw new Error(`La cantidad para "${item.nombre}" supera lo cargado en el pedido`);
    }

    if (requestedQty > 0) {
      selectedItems.push({
        ...item,
        cantidad: requestedQty,
      });
    }

    if (currentQty - requestedQty > 0) {
      remainingItems.push({
        ...item,
        cantidad: currentQty - requestedQty,
      });
    }
  });

  if (selectedItems.length === 0) {
    throw new Error('Selecciona al menos un item para dividir');
  }

  if (remainingItems.length === 0) {
    throw new Error(
      'No puedes dividir el pedido completo. Usa mover pedido si quieres pasarlo entero'
    );
  }

  const originalSubtotal = subtotalFromItems(originalItems);
  const selectedSubtotal = subtotalFromItems(selectedItems);
  const remainingSubtotal = subtotalFromItems(remainingItems);
  const originalDiscount = roundAmount(pedido.descuento || 0);
  const selectedDiscount =
    originalSubtotal > 0
      ? roundAmount(originalDiscount * (selectedSubtotal / originalSubtotal))
      : 0;
  const remainingDiscount = roundAmount(originalDiscount - selectedDiscount);

  const nuevoPedido = createPedidoRecord({
    cliente_nombre: pedido.cliente_nombre,
    cliente_telefono: pedido.cliente_telefono,
    cliente_direccion: pedido.cliente_direccion,
    items: selectedItems,
    subtotal: selectedSubtotal,
    costo_envio: 0,
    descuento: selectedDiscount,
    total: roundAmount(selectedSubtotal - selectedDiscount),
    tipo_entrega: 'mesa',
    mesa: mesaDestino,
    metodo_pago: pedido.metodo_pago,
    notas: pedido.notas || '',
    origen: 'division_mesa',
    pago_estado: pedido.pago_estado || 'pendiente',
  });

  db.prepare(
    `
    UPDATE pedidos
    SET items = ?, subtotal = ?, descuento = ?, total = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    serializePedidoItems(remainingItems),
    remainingSubtotal,
    remainingDiscount,
    roundAmount(remainingSubtotal - remainingDiscount),
    pedido.id
  );
  replacePedidoItems(db, pedido.id, remainingItems);

  return {
    original: db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id),
    nuevo: nuevoPedido,
  };
}

function normalizeForKey(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function mergePedidoItems(items) {
  const merged = [];
  const indexMap = new Map();

  items.forEach((item) => {
    const key = [
      item.producto_id || '',
      item.nombre || '',
      Number(item.precio_unitario || 0),
      item.descripcion || '',
      normalizeForKey(item.variantes || {}),
      normalizeForKey(item.extras || []),
    ].join('|');

    if (indexMap.has(key)) {
      const targetIndex = indexMap.get(key);
      merged[targetIndex].cantidad += Number(item.cantidad || 0);
      return;
    }

    indexMap.set(key, merged.length);
    merged.push({
      ...item,
      cantidad: Number(item.cantidad || 0),
    });
  });

  return merged;
}

function mergeMesaPedidosIntoTarget(targetPedido, pedidosToMerge, mesaDestino) {
  const allPedidos = [targetPedido, ...pedidosToMerge];
  const allItems = allPedidos.flatMap((pedido) => loadPedidoItems(db, pedido));
  const mergedItems = mergePedidoItems(allItems);
  const subtotal = roundAmount(
    allPedidos.reduce((acc, pedido) => acc + Number(pedido.subtotal || 0), 0)
  );
  const descuento = roundAmount(
    allPedidos.reduce((acc, pedido) => acc + Number(pedido.descuento || 0), 0)
  );
  const total = roundAmount(allPedidos.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0));
  const notas = allPedidos
    .map((pedido) => String(pedido.notas || '').trim())
    .filter(Boolean)
    .filter((note, index, array) => array.indexOf(note) === index)
    .join(' | ');

  db.prepare(
    `
    UPDATE pedidos
    SET mesa = ?, items = ?, subtotal = ?, descuento = ?, total = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    mesaDestino,
    serializePedidoItems(mergedItems),
    subtotal,
    descuento,
    total,
    notas,
    targetPedido.id
  );
  replacePedidoItems(db, targetPedido.id, mergedItems);

  const idsToDelete = pedidosToMerge.map((pedido) => pedido.id);
  if (idsToDelete.length > 0) {
    const placeholders = idsToDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM pedidos WHERE id IN (${placeholders})`).run(...idsToDelete);
  }

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(targetPedido.id);
}

function syncPaymentIntoPedido(pedido, payment) {
  if (!pedido || !payment) return null;

  const rawStatus = String(payment.status || 'pending')
    .trim()
    .toLowerCase();
  const nextPagoEstado = normalizePagoEstado(rawStatus, {
    metodoPago: 'mercadopago',
    origen: pedido.origen,
  });
  const detail = [rawStatus, payment.status_detail].filter(Boolean).join(' · ');
  const shouldConfirm = nextPagoEstado === 'pagado' && pedido.estado === 'nuevo';

  db.prepare(
    `
      UPDATE pedidos
      SET pago_estado = ?, pago_id = ?, pago_detalle = ?, estado = CASE WHEN ? THEN 'confirmado' ELSE estado END,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  ).run(nextPagoEstado, String(payment.id || ''), detail, shouldConfirm ? 1 : 0, pedido.id);

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
}

function updatePedidoPaymentStatus(pedido, nextPagoEstado, options = {}) {
  if (!pedido) return null;

  const metodoPago = normalizeMetodoPago(pedido.metodo_pago);
  const pagoEstado = normalizePagoEstado(nextPagoEstado, {
    metodoPago,
    origen: pedido.origen,
  });
  const detalle = String(options.detalle || '').trim();
  const pagoId =
    options.pagoId !== undefined
      ? String(options.pagoId || '').trim()
      : String(pedido.pago_id || '').trim();

  db.prepare(
    `
    UPDATE pedidos
    SET pago_estado = ?,
        pago_id = ?,
        pago_detalle = CASE
          WHEN ? != '' THEN ?
          ELSE pago_detalle
        END,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(pagoEstado, pagoId, detalle, detalle, pedido.id);

  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
}

function logMercadoPagoEvent({
  pedidoId = null,
  tipo = '',
  paymentId = '',
  estado = '',
  detalle = '',
  payload = {},
}) {
  db.prepare(
    `
    INSERT INTO mercadopago_eventos (pedido_id, tipo, payment_id, estado, detalle, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    pedidoId,
    tipo,
    String(paymentId || ''),
    String(estado || ''),
    String(detalle || ''),
    JSON.stringify(payload || {})
  );
}

async function syncPedidoMercadoPago(dbInstance, pedido, config) {
  if (!config.mercadopago_token) {
    throw new Error('Falta configurar MercadoPago en el sistema');
  }

  let payment = null;
  let source = '';
  const paymentId = pedido.pago_id || '';

  if (paymentId) {
    payment = await getPayment({ token: config.mercadopago_token, paymentId });
    source = 'payment_id';
  } else {
    const search = await searchPayments({
      token: config.mercadopago_token,
      externalReference: pedido.id,
      limit: 1,
    });
    payment = search?.results?.[0] || null;
    source = 'external_reference';
  }

  if (!payment) {
    return {
      ok: false,
      source,
      pedido: hydratePedido(pedido),
      message: 'No se encontro un pago en MercadoPago para este pedido',
    };
  }

  const synced = syncPaymentIntoPedido(pedido, payment);
  return {
    ok: true,
    source,
    payment,
    pedido: hydratePedido(synced),
    message: 'Pago sincronizado correctamente',
  };
}

module.exports = {
  ESTADO_LABELS,
  getNextNumero,
  getPedidoById,
  getPedidoHydratedById,
  listPedidosHydrated,
  getPedidoOr404,
  getMesaPedidosAbiertos,
  hydratePedido,
  money,
  parsePedidoItems,
  roundAmount,
  optionalNumber,
  generateEntregaPin,
  subtotalFromItems,
  estimateText,
  buildTrackingUrl,
  registerPrintJob,
  configuredCopies,
  canNotifyPedido,
  canTransitionPedido,
  createPedidoRecord,
  createPedidoWithInventory,
  getActiveCaja,
  validateAndApplyCupon,
  buildPedidoPayload,
  splitPedidoMesa,
  mergePedidoItems,
  mergeMesaPedidosIntoTarget,
  syncPaymentIntoPedido,
  updatePedidoPaymentStatus,
  logMercadoPagoEvent,
  syncPedidoMercadoPago,
  PedidoState,
};
