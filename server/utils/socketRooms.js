/**
 * Gestion segura de Socket.IO con rooms por pedido y rol
 * Previene exposicion global de datos sensibles
 */

/**
 * ── Sobre la plata que sale por el socket ──────────────────────────────────
 *
 * La base guarda centavos y el middleware de `index.js` los pasa a pesos, pero
 * **sólo en las respuestas JSON de Express**. Un mensaje de Socket.IO no pasa
 * por ahí: sale con el número crudo.
 *
 * Eso hacía que el tablero de Pedidos mostrara bien los pedidos al recargar la
 * página —esos vienen por HTTP— y cien veces más grandes los que entraban en
 * vivo. Un pedido de $13.000 aparecía como "$1.300.000" hasta que alguien
 * recargaba, y ahí se acomodaba solo. Justamente por eso era difícil de ver:
 * el error se borraba al ir a mirarlo.
 *
 * `paraElCliente` es la única puerta por la que un pedido entra al socket, así
 * que la conversión se hace acá una vez y no en cada `emit`.
 */
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('./authConfig');
const { parsePedidoItems } = require('./pedidoItems');
const { centsToPesos } = require('./moneyConversion');
const logger = require('./logger');
const { sendRiderAssignmentPush } = require('./firebasePush');

// Los mozos no deben recibir el stream global: contiene teléfonos, direcciones
// y pedidos de otros canales. Caja, Cocina, Delivery y Admin siguen viendo la
// operación completa como hasta ahora.
const BACKOFFICE_ROLES = ['admin', 'caja', 'cocina', 'delivery'];

function emitToBackOffice(io, event, payload) {
  BACKOFFICE_ROLES.forEach((role) => io.to(`role_${role}`).emit(event, payload));
}

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
    } catch (_error) {
      socket.authenticated = false;
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    if (socket.authenticated && socket.user) {
      socket.join(`role_${socket.user.rol}`);
      if (socket.user.rol === 'mozo') socket.join(`mozo_${socket.user.id}`);
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
        if (user.rol === 'mozo') socket.join(`mozo_${user.id}`);
        socket.join('authenticated');
        socket.emit('authenticated', { success: true, rol: user.rol });
      } catch (_error) {
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
 * Deja un pedido listo para mandarlo por socket.
 *
 * Dos cosas: los ítems pasan de texto JSON a lista, y toda la plata de
 * centavos a pesos. Sin lo segundo, el panel muestra los importes cien veces
 * más grandes hasta que se recarga la página.
 */
function paraElCliente(pedido) {
  return centsToPesos({
    ...pedido,
    items: parsePedidoItems(pedido?.items),
  });
}

/**
 * Emitir actualizacion de pedido SOLO a interesados autorizados
 */
function emitPedidoActualizado(io, pedido, options = {}) {
  const normalizedPedido = paraElCliente(pedido);
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

  // 2. Versión completa para back-office, nunca para el rol Mozo.
  emitToBackOffice(io, 'pedido_actualizado_admin', fullData);

  // 3. El mozo que creó la comanda sólo recibe su propio pedido.
  if (normalizedPedido.mozo_usuario_id) {
    io.to(`mozo_${normalizedPedido.mozo_usuario_id}`).emit('mozo_pedido_actualizado', fullData);
  }

  // 4. Si tiene repartidor, notificar solo a ese repartidor
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
    // FCM complementa al socket cuando la Rider está cerrada. No se espera ni
    // se propaga un error: la asignación ya quedó confirmada en la base.
    void sendRiderAssignmentPush(db, pedido);
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
  const payload = paraElCliente(pedido);
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

  // Back-office ve ubicación completa; Mozo no necesita rastreo de delivery.
  emitToBackOffice(io, 'repartidor_ubicacion_admin', repartidor);
}

/**
 * Emitir nuevo pedido (solo a admins autenticados)
 */
function emitNuevoPedido(io, pedido) {
  const payload = paraElCliente(pedido);
  emitToBackOffice(io, 'nuevo_pedido', payload);
  emitToBackOffice(io, 'system_nuevo_pedido', payload);
  if (payload.mozo_usuario_id) {
    io.to(`mozo_${payload.mozo_usuario_id}`).emit('mozo_nuevo_pedido', payload);
  }
  emitPedidoAsignado(io, payload);

  // Logging para debugging de alarmas
  const stats = getRoomStats(io);
  logger.info(
    `[socket] nuevo_pedido #${pedido?.numero} emitido. Origen: ${pedido?.origen}. Sockets back-office: ${BACKOFFICE_ROLES.reduce((total, role) => total + (stats[`role_${role}`] || 0), 0)}`
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
      !roomName.startsWith('mozo_') &&
      roomName !== 'authenticated'
    ) {
      continue;
    }
    stats[roomName] = sockets.size;
  }

  return stats;
}

/**
 * Un chat de WhatsApp que la IA no pudo seguir y necesita una persona.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * Cuando la IA se traba, escribía una marca en la base y le decía al cliente
 * "ya te atiende una persona del local"… y no le avisaba a nadie. No había
 * sonido, ni cartel, ni pantalla de conversaciones: lo único que existe es una
 * lista de las últimas doce adentro de Configuración, donde nadie entra en
 * pleno servicio.
 *
 * Hubo un cliente que escribió "Confirmar", quedó **42 minutos sin respuesta**
 * y escribió "Hola" tres veces mientras esperaba.
 *
 * La salida de emergencia existía pero no tenía a nadie del otro lado.
 */
function emitAtencionHumana(io, datos) {
  emitToBackOffice(io, 'whatsapp_necesita_persona', {
    telefono: datos?.telefono || '',
    nombre: datos?.nombre || '',
    motivo: datos?.motivo || '',
    conversacion_id: datos?.conversacionId || null,
    en: new Date().toISOString(),
  });
  logger.warn(
    `[socket] WhatsApp pide una persona para ${datos?.telefono} (${datos?.motivo || 'sin motivo'})`
  );
}

/**
 * Avisarle al mozo que su plato está listo para retirar de la cocina.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 *
 * Hoy la cocina marca "listo" y eso aparece en la pantalla del KDS. El mozo se
 * entera si pasa por la cocina y mira. En un servicio con mesas eso significa ir
 * a mirar cada tanto, o que la comida se enfríe esperando a que alguien la vea.
 *
 * Fudo tiene "aviso al camarero de orden lista para entregar" y es de las cosas
 * que se notan todos los días.
 *
 * ── A quién le llega ───────────────────────────────────────────────────────
 *
 * **Sólo al mozo que tomó la mesa**, por su sala `mozo_<id>`. Avisarles a todos
 * haría que en un turno con cuatro mozos cada uno reciba cuatro veces más
 * avisos de los que le importan, y a los tres días nadie los mira.
 *
 * Si el pedido no tiene mozo asignado —un delivery, un mostrador— no se manda
 * nada: no hay a quién.
 */
function emitPedidoListo(io, pedido) {
  if (!io || !pedido) return;
  const mozoId = Number(pedido.mozo_usuario_id || 0);
  if (!mozoId) return;

  io.to(`mozo_${mozoId}`).emit('pedido_listo', {
    pedido_id: pedido.id,
    numero: pedido.numero,
    mesa: pedido.mesa || '',
    // El nombre del mozo va en el evento para poder mostrarlo en el aviso sin
    // otra consulta, y para que quede en el log de quién debía retirarlo.
    mozo_nombre: pedido.mozo_nombre || '',
    en: new Date().toISOString(),
  });

  logger.info(
    `[socket] Pedido #${pedido.numero} listo, avisado a ${pedido.mozo_nombre || `mozo ${mozoId}`}`
  );
}

module.exports = {
  initSocketSecurity,
  emitAtencionHumana,
  emitPedidoListo,
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
