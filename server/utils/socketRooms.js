/**
 * Gestion segura de Socket.IO con rooms por pedido y rol
 * Previene exposicion global de datos sensibles
 */

const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./authConfig');
const db = require('../db');
const { parsePedidoItems } = require('./pedidoItems');
const logger = require('./logger');

// Almacenamiento en memoria de tokens de seguimiento (podria moverse a Redis en el futuro)
const trackingTokens = new Map();

/**
 * Generar token unico de seguimiento para un pedido
 */
function generateTrackingToken(pedidoId) {
  const crypto = require('crypto');
  const token = crypto.randomBytes(16).toString('hex');
  trackingTokens.set(String(pedidoId), {
    token,
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Validar token de seguimiento
 */
function validateTrackingToken(pedidoId, token) {
  if (!pedidoId || !token) return false;

  // 1. Intentar validar desde memoria (rapido)
  const stored = trackingTokens.get(String(pedidoId));
  if (stored && stored.token === token) {
    // Validar expiracion (7 dias)
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - stored.createdAt <= MAX_AGE) {
      return true;
    }
    trackingTokens.delete(String(pedidoId));
  }

  // 2. Fallback: Validar contra Base de Datos (robusto ante reinicios)
  try {
    const pedido = db
      .prepare('SELECT id, tracking_token, creado_en FROM pedidos WHERE id = ?')
      .get(pedidoId);
    if (pedido && pedido.tracking_token === token) {
      // Re-hidratar memoria para proximas consultas
      trackingTokens.set(String(pedidoId), {
        token: pedido.tracking_token,
        createdAt: new Date(pedido.creado_en).getTime(),
      });
      return true;
    }
  } catch (error) {
    logger.error('Error validando tracking_token en DB', { message: error.message });
  }

  return false;
}

/**
 * Limpiar token de seguimiento (ej: cuando el pedido se entrega)
 */
function clearTrackingToken(pedidoId) {
  trackingTokens.delete(String(pedidoId));
  if (!pedidoId) return;

  try {
    db.prepare('UPDATE pedidos SET tracking_token = ? WHERE id = ?').run('', pedidoId);
  } catch (error) {
    logger.error('Error limpiando tracking_token en DB', { message: error.message });
  }
}

/**
 * Inicializar seguridad de sockets con autenticacion por cookie
 */
function initSocketSecurity(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.headers.cookie
        ?.split(';')
        .find((c) => c.trim().startsWith('auth_token='))
        ?.split('=')[1];

      if (token) {
        const user = jwt.verify(token, getJwtSecret());
        socket.user = user;
        socket.authenticated = true;
      } else {
        socket.authenticated = false;
        socket.user = null;
      }
      next();
    } catch (error) {
      socket.authenticated = false;
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    if (socket.authenticated && socket.user) {
      socket.join(`role_${socket.user.rol}`);
      socket.join('authenticated');
      socket.emit('authenticated', { success: true, rol: socket.user.rol });
    }

    // Evento de autenticacion legacy (para compatibilidad con clientes que usan token manual)
    socket.on('authenticate', (token) => {
      try {
        const user = jwt.verify(token, getJwtSecret());
        socket.user = user;
        socket.authenticated = true;
        socket.join(`role_${user.rol}`);
        socket.join('authenticated');
        socket.emit('authenticated', { success: true, rol: user.rol });
      } catch (error) {
        socket.emit('authenticated', { success: false, error: 'Token invalido' });
      }
    });

    // Unirse a room de seguimiento de pedido (publico)
    socket.on('join_tracking', ({ pedidoId, token }) => {
      if (!pedidoId || !token) {
        socket.emit('tracking_error', { message: 'Datos incompletos' });
        return;
      }

      if (!validateTrackingToken(pedidoId, token)) {
        socket.emit('tracking_error', { message: 'Token de seguimiento invalido' });
        return;
      }

      socket.join(`pedido_${pedidoId}`);
      socket.emit('tracking_joined', { pedidoId });
    });

    // Unirse como repartidor (autenticacion por codigo)
    socket.on('join_rider', ({ repartidorId, codigo }) => {
      if (!repartidorId || !codigo) {
        socket.emit('rider_error', { message: 'Datos incompletos' });
        return;
      }

      const repartidor = db
        .prepare('SELECT id, codigo_acceso FROM repartidores WHERE id = ?')
        .get(repartidorId);
      if (!repartidor || repartidor.codigo_acceso !== codigo) {
        socket.emit('rider_error', { message: 'Codigo de acceso invalido' });
        return;
      }

      socket.repartidorId = repartidorId;
      socket.join(`repartidor_${repartidorId}`);
      socket.emit('rider_joined', { repartidorId });
    });

    // Salir de rooms al desconectar
    socket.on('disconnect', () => {
      // Cleanup automatico por Socket.IO
    });
  });
}

/**
 * Emitir actualizacion de pedido SOLO a interesados autorizados
 */
function emitPedidoActualizado(io, pedido, options = {}) {
  const normalizedPedido = {
    ...pedido,
    items: parsePedidoItems(pedido?.items),
  };
  const pedidoId = normalizedPedido.id;
  const includeRepartidor = options.includeRepartidor !== false;

  // Datos publicos (para tracking)
  const publicData = {
    id: normalizedPedido.id,
    numero: normalizedPedido.numero,
    estado: normalizedPedido.estado,
    tipo_entrega: normalizedPedido.tipo_entrega,
    creado_en: normalizedPedido.creado_en,
    actualizado_en: normalizedPedido.actualizado_en,
    subtotal: normalizedPedido.subtotal,
    costo_envio: normalizedPedido.costo_envio,
    descuento: normalizedPedido.descuento,
    total: normalizedPedido.total,
    metodo_pago: normalizedPedido.metodo_pago,
    pago_estado: normalizedPedido.pago_estado,
    delivery_zona: normalizedPedido.delivery_zona,
    tiempo_estimado_min: normalizedPedido.tiempo_estimado_min,
    turno_operativo: normalizedPedido.turno_operativo,
    eta_min_dinamico: normalizedPedido.eta_min_dinamico,
    eta_origen: normalizedPedido.eta_origen,
    distancia_repartidor_km: normalizedPedido.distancia_repartidor_km,
    ubicacion_repartidor_atrasada: normalizedPedido.ubicacion_repartidor_atrasada,
    cliente_nombre: normalizedPedido.cliente_nombre,
    cliente_direccion: normalizedPedido.cliente_direccion,
    cliente_latitud: normalizedPedido.cliente_latitud,
    cliente_longitud: normalizedPedido.cliente_longitud,
    cliente_ubicacion_exacta: Boolean(normalizedPedido.cliente_ubicacion_exacta),
    entrega_pin: normalizedPedido.entrega_pin,
    entrega_foto: normalizedPedido.entrega_foto,
    repartidor_id: normalizedPedido.repartidor_id,
    repartidor_nombre: normalizedPedido.repartidor_nombre,
    items: normalizedPedido.items,
  };

  // Datos para repartidor asignado
  const riderData =
    includeRepartidor && normalizedPedido.repartidor
      ? {
          id: normalizedPedido.repartidor.id,
          nombre: normalizedPedido.repartidor.nombre,
          latitud: normalizedPedido.repartidor.latitud,
          longitud: normalizedPedido.repartidor.longitud,
          ultima_ubicacion_en: normalizedPedido.repartidor.ultima_ubicacion_en,
        }
      : null;

  // Datos completos para admin
  const fullData = normalizedPedido;

  // 1. Emitir a la room del pedido (cliente haciendo tracking)
  io.to(`pedido_${pedidoId}`).emit('pedido_actualizado', {
    ...publicData,
    repartidor: riderData,
  });

  // 2. Emitir version completa a usuarios autenticados (admin)
  io.to('authenticated').emit('pedido_actualizado_admin', fullData);

  // 3. Si tiene repartidor, notificar solo a ese repartidor
  if (normalizedPedido.repartidor_id) {
    io.to(`repartidor_${normalizedPedido.repartidor_id}`).emit('pedido_actualizado', fullData);
  }
}

function emitDeliveryAssignment(
  io,
  { pedido = null, repartidor = null, previousRepartidor = null, emitPedido = true } = {}
) {
  if (pedido && emitPedido) {
    emitPedidoActualizado(io, pedido);
  }

  if (pedido?.repartidor_id) {
    emitPedidoAsignado(io, pedido);
  }

  if (repartidor) {
    emitRepartidorUbicacion(io, repartidor, pedido?.id);
  }

  if (previousRepartidor) {
    emitRepartidorUbicacion(io, previousRepartidor);
  }
}

function emitPedidoAsignado(io, pedido) {
  if (!pedido?.repartidor_id) return;
  const payload = {
    ...pedido,
    items: parsePedidoItems(pedido?.items),
  };
  io.to(`repartidor_${pedido.repartidor_id}`).emit('pedido_asignado', payload);
}

/**
 * Emitir ubicacion de repartidor (solo a cliente del pedido asignado)
 */
function emitRepartidorUbicacion(io, repartidor, pedidoId) {
  const publicLocation = {
    id: repartidor.id,
    nombre: repartidor.nombre,
    latitud: repartidor.latitud,
    longitud: repartidor.longitud,
    ultima_ubicacion_en: repartidor.ultima_ubicacion_en,
  };

  // Solo enviar ubicacion al cliente que tiene un pedido con este repartidor
  if (pedidoId) {
    io.to(`pedido_${pedidoId}`).emit('repartidor_ubicacion', publicLocation);
  }

  // Admins ven ubicacion completa
  io.to('authenticated').emit('repartidor_ubicacion_admin', repartidor);
}

/**
 * Emitir nuevo pedido (solo a admins autenticados)
 */
function emitNuevoPedido(io, pedido) {
  const room = io.to('authenticated');
  const payload = {
    ...pedido,
    items: parsePedidoItems(pedido?.items),
  };
  room.emit('nuevo_pedido', payload);
  room.emit('system_nuevo_pedido', payload);
  emitPedidoAsignado(io, payload);

  // Logging para debugging de alarmas
  const stats = getRoomStats(io);
  logger.info(
    `[socket] nuevo_pedido #${pedido?.numero} emitido. Origen: ${pedido?.origen}. Sockets en 'authenticated': ${stats['authenticated'] || 0}`
  );
}

/**
 * Obtener estadisticas de rooms (para debugging)
 */
function getRoomStats(io) {
  const rooms = io.sockets.adapter.rooms;
  const stats = {};

  for (const [roomName, sockets] of rooms) {
    if (
      !roomName.startsWith('role_') &&
      !roomName.startsWith('pedido_') &&
      !roomName.startsWith('repartidor_') &&
      roomName !== 'authenticated'
    ) {
      continue;
    }
    stats[roomName] = sockets.size;
  }

  return stats;
}

module.exports = {
  initSocketSecurity,
  generateTrackingToken,
  validateTrackingToken,
  clearTrackingToken,
  emitPedidoActualizado,
  emitDeliveryAssignment,
  emitPedidoAsignado,
  emitRepartidorUbicacion,
  emitNuevoPedido,
  getRoomStats,
};
