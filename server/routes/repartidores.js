const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission, hasPermission } = require('../utils/permissions');
const { fechaLocal, hoyLocal, hoyArgentina } = require('../utils/fechaLocal');
const { parseTurnos } = require('../utils/shifts');

/*
  Argentina es UTC-3 fijo: no tiene horario de verano desde 2009.

  Se usa para calcular "hoy" desde el lado de Node. El servidor corre en UTC,
  así que sin este desfase después de las 21:00 hora local ya estaría contando
  el día siguiente.
*/
const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const {
  assignPedidoToRepartidor,
  autoAssignPedido,
  getRepartidorById,
  listActiveRepartidores,
  filterRepartidoresByCurrentShift,
} = require('../utils/deliveryAssignment');
const { uploadsDir, uploadPathFromFilename } = require('../utils/storagePaths');
const {
  emitPedidoActualizado,
  emitDeliveryAssignment,
  emitRepartidorUbicacion,
  clearTrackingToken,
} = require('../utils/socketRooms');
const {
  createFileFilter,
  PHOTO_EXTENSIONS,
  PHOTO_MIME_TYPES,
} = require('../utils/uploadValidation');
const { getPedidoHydratedById } = require('../services/pedidoService');
const { registrarEvento } = require('../services/pedidoTrazabilidad');
const { syncPersonalFromDeliveryRepartidor } = require('../utils/deliveryPersonnelSync');
const { checkAndNotifyLlegando } = require('../utils/deliveryNotifications');
const { getConfigMap } = require('../utils/mercadoPago');
const { logAudit } = require('../utils/audit');
const { sendRiderUpdatePushToRider } = require('../utils/firebasePush');
const {
  isPagoPagado,
  normalizeMetodoPago,
  normalizePagoEstado,
  shouldAutoSettleOnEntrega,
} = require('../utils/paymentStatus');

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) =>
    cb(null, `entrega-${Date.now()}${String(path.extname(file.originalname) || '').toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: createFileFilter({
    allowedExtensions: PHOTO_EXTENSIONS,
    allowedMimeTypes: PHOTO_MIME_TYPES,
    message: 'La foto de entrega debe ser JPG, PNG, WEBP, GIF o HEIC',
  }),
});

const DELIVERY_PHOTO_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * La app nativa captura la foto como data URL. No podemos depender de
 * multipart para esa ruta: una entrega encolada offline se persiste como JSON
 * y debe poder sincronizarse igual cuando vuelve la señal.
 */
function saveDeliveryPhotoDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(raw);
  if (!match) throw new Error('La foto de entrega no tiene un formato válido');

  const mime = String(match[1] || '').toLowerCase();
  const extension = DELIVERY_PHOTO_MIME_EXTENSIONS[mime];
  if (!extension) throw new Error('La foto de entrega debe ser JPG, PNG, WEBP o GIF');

  const content = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!content.length || content.length > 5 * 1024 * 1024) {
    throw new Error('La foto de entrega supera el tamaño permitido');
  }

  const filename = `entrega-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(uploadsDir, filename), content, { flag: 'wx' });
  return uploadPathFromFilename(filename);
}

function generateAccessCode() {
  return crypto.randomBytes(4).toString('hex');
}

function normalizeAccessCode(value) {
  return String(value || '').trim();
}

function ensureUniqueAccessCode(codigo, excludeId = null) {
  const normalized = normalizeAccessCode(codigo);
  if (!normalized) return null;
  const existing = excludeId
    ? db
        .prepare('SELECT id FROM repartidores WHERE codigo_acceso = ? AND id != ?')
        .get(normalized, excludeId)
    : db.prepare('SELECT id FROM repartidores WHERE codigo_acceso = ?').get(normalized);
  if (existing) {
    throw new Error('Ese PIN de rider ya esta en uso');
  }
  return normalized;
}

function hydrateRepartidor(id) {
  const repartidor = db
    .prepare(
      `SELECT r.*, p.turno_preferido, p.activo AS personal_activo
       FROM repartidores r
       LEFT JOIN personal p ON p.id = r.personal_id
       WHERE r.id = ?`
    )
    .get(id);
  if (!repartidor) return null;
  if (repartidor.codigo_acceso) return repartidor;

  const codigo = generateAccessCode();
  db.prepare('UPDATE repartidores SET codigo_acceso = ? WHERE id = ?').run(codigo, id);
  return db
    .prepare(
      `SELECT r.*, p.turno_preferido, p.activo AS personal_activo
       FROM repartidores r
       LEFT JOIN personal p ON p.id = r.personal_id
       WHERE r.id = ?`
    )
    .get(id);
}

function normalizeRiderShift(value) {
  const turno = String(value || '')
    .trim()
    .toLowerCase();
  if (!turno) throw new Error('Seleccioná el turno de trabajo del rider');

  const config = getConfigMap(db);
  const permitidos = new Set(
    parseTurnos(config.turnos_negocio)
      .filter((item) => item?.activo !== false && item?.id)
      .map((item) => String(item.id).trim().toLowerCase())
  );
  if (!permitidos.size) {
    permitidos.add('manana');
    permitidos.add('noche');
  }
  permitidos.add('doble');
  if (!permitidos.has(turno)) throw new Error('El turno seleccionado no es válido');
  return turno;
}

function validateRiderAccess(req, res) {
  const repartidor = hydrateRepartidor(req.params.id);
  if (!repartidor) {
    res.status(404).json({ error: 'Repartidor no encontrado' });
    return null;
  }

  if (Number(repartidor.activo) !== 1 || Number(repartidor.personal_activo ?? 1) !== 1) {
    res.status(403).json({ error: 'Este acceso de rider fue desactivado' });
    return null;
  }

  if (req.params.codigo !== repartidor.codigo_acceso) {
    res.status(401).json({ error: 'Acceso invalido' });
    return null;
  }

  return repartidor;
}

// ── Haversine distance (metros) ──
function haversineMeters(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c * 1000; // metros
}

const RIDER_LOCATION_MAX_ACCURACY_METERS = 100;
const RIDER_LOCATION_MAX_REALISTIC_SPEED_MPS = 35;
const RIDER_LOCATION_HARD_JUMP_METERS = 300;

function parseSqliteTimestamp(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value).replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
}

function validateRiderLocationUpdate({ repartidor, latitud, longitud, precision }) {
  const lat = Number(latitud);
  const lng = Number(longitud);
  const accuracy = Number(precision);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'coords_invalidas' };
  }

  if (Number.isFinite(accuracy) && accuracy > RIDER_LOCATION_MAX_ACCURACY_METERS) {
    return {
      ok: false,
      reason: 'precision_baja',
      accuracy,
    };
  }

  const prevLat = Number(repartidor.latitud);
  const prevLng = Number(repartidor.longitud);
  const prevAt = parseSqliteTimestamp(repartidor.ultima_ubicacion_en);
  if (Number.isFinite(prevLat) && Number.isFinite(prevLng) && prevAt) {
    const distance = haversineMeters(prevLat, prevLng, lat, lng);
    const elapsedSeconds = Math.max(1, (Date.now() - prevAt) / 1000);
    const requiredSpeed = distance / elapsedSeconds;

    if (
      distance > RIDER_LOCATION_HARD_JUMP_METERS &&
      requiredSpeed > RIDER_LOCATION_MAX_REALISTIC_SPEED_MPS
    ) {
      return {
        ok: false,
        reason: 'salto_brusco',
        distance,
        elapsedSeconds,
        requiredSpeed,
      };
    }
  }

  return {
    ok: true,
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

router.get('/', auth, (req, res) => {
  if (!hasPermission(req.user, 'delivery.view') && !hasPermission(req.user, 'tpv.use')) {
    return res.status(403).json({ error: 'Sin permisos para ver repartidores' });
  }
  const soloTurnoActual = ['1', 'true'].includes(
    String(req.query?.turno_actual || '').toLowerCase()
  );
  if (soloTurnoActual) {
    return res.json(filterRepartidoresByCurrentShift(db, listActiveRepartidores(db)));
  }

  const enTurnoActual = new Set(
    filterRepartidoresByCurrentShift(db, listActiveRepartidores(db)).map((row) => Number(row.id))
  );
  const rows = db.prepare('SELECT id FROM repartidores ORDER BY nombre ASC').all();
  res.json(
    rows.map((row) => {
      const repartidor = hydrateRepartidor(row.id);
      return {
        ...repartidor,
        en_turno_actual: enTurnoActual.has(Number(row.id)),
      };
    })
  );
});

router.get('/rider-diagnostics', auth, requirePermission('delivery.manage'), (_req, res) => {
  const riders = db
    .prepare(
      `SELECT id, nombre, activo, fcm_platform, fcm_device_id, fcm_device_label,
              fcm_permission, fcm_actualizado_en,
              CASE WHEN TRIM(COALESCE(fcm_token, '')) <> '' THEN 1 ELSE 0 END AS push_registrado
       FROM repartidores
       WHERE activo = 1
       ORDER BY nombre COLLATE NOCASE ASC`
    )
    .all();
  res.json(riders);
});

router.post('/:id/revocar-acceso-rider', auth, requirePermission('delivery.manage'), (req, res) => {
  const repartidor = hydrateRepartidor(req.params.id);
  if (!repartidor) return res.status(404).json({ error: 'Repartidor no encontrado' });
  const nuevoCodigo = generateAccessCode();
  db.prepare(
    `UPDATE repartidores
     SET codigo_acceso = ?, fcm_token = '', fcm_platform = '', fcm_device_id = '',
         fcm_device_label = '', fcm_permission = '', fcm_actualizado_en = NULL
     WHERE id = ?`
  ).run(nuevoCodigo, repartidor.id);
  logAudit(db, {
    modulo: 'delivery',
    accion: 'revocar_acceso_rider',
    entidad: 'repartidor',
    entidad_id: repartidor.id,
    actor_id: req.user?.id,
    actor_nombre: req.user?.nombre || '',
    detalle: { nombre: repartidor.nombre },
  });
  res.json({ success: true, codigo_acceso: nuevoCodigo });
});

router.post('/', auth, requirePermission('delivery.manage'), (req, res) => {
  const {
    nombre,
    telefono = '',
    vehiculo = '',
    zona_preferida = '',
    codigo_acceso = '',
    direccion = '',
    latitud_casa = null,
    longitud_casa = null,
    avatar_url = '',
    notas = '',
    fecha_ingreso = '',
    turno_preferido = '',
  } = req.body;

  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  let turnoFinal = '';
  try {
    turnoFinal = normalizeRiderShift(turno_preferido);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  let codigoFinal = '';
  try {
    codigoFinal = ensureUniqueAccessCode(codigo_acceso) || generateAccessCode();
  } catch (error) {
    return res.status(400).json({ error: error.message || 'PIN de rider invalido' });
  }

  const r = db
    .prepare(
      `
    INSERT INTO repartidores (
      nombre, telefono, vehiculo, zona_preferida, codigo_acceso,
      direccion, latitud_casa, longitud_casa, avatar_url, notas, fecha_ingreso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      nombre,
      telefono,
      vehiculo,
      zona_preferida,
      codigoFinal,
      direccion,
      latitud_casa,
      longitud_casa,
      avatar_url,
      notas,
      fecha_ingreso || hoyArgentina()
    );
  const hydrated = hydrateRepartidor(r.lastInsertRowid);
  syncPersonalFromDeliveryRepartidor(db, {
    ...hydrated,
    turno_preferido: turnoFinal,
  });
  res.json(hydrateRepartidor(r.lastInsertRowid));
});

router.put('/:id', auth, requirePermission('delivery.manage'), (req, res) => {
  const {
    nombre,
    telefono,
    vehiculo,
    zona_preferida,
    activo,
    disponible,
    codigo_acceso,
    direccion,
    latitud_casa,
    longitud_casa,
    avatar_url,
    notas,
    fecha_ingreso,
    turno_preferido,
  } = req.body;

  const current = hydrateRepartidor(req.params.id);
  if (!current) return res.status(404).json({ error: 'Repartidor no encontrado' });

  let turnoFinal = '';
  try {
    turnoFinal = normalizeRiderShift(turno_preferido ?? current.turno_preferido);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  let codigoFinal = current.codigo_acceso || generateAccessCode();
  try {
    codigoFinal = ensureUniqueAccessCode(codigo_acceso, req.params.id) || codigoFinal;
  } catch (error) {
    return res.status(400).json({ error: error.message || 'PIN de rider invalido' });
  }

  db.prepare(
    `
    UPDATE repartidores 
    SET nombre=?, telefono=?, vehiculo=?, zona_preferida=?, codigo_acceso=?, activo=?, disponible=?,
        direccion=?, latitud_casa=?, longitud_casa=?, avatar_url=?, notas=?, fecha_ingreso=?
    WHERE id=?
  `
  ).run(
    nombre,
    telefono,
    vehiculo,
    zona_preferida || '',
    codigoFinal,
    activo,
    disponible,
    direccion || '',
    latitud_casa,
    longitud_casa,
    avatar_url || '',
    notas || '',
    fecha_ingreso || '',
    req.params.id
  );
  const hydrated = hydrateRepartidor(req.params.id);
  syncPersonalFromDeliveryRepartidor(db, {
    ...hydrated,
    turno_preferido: turnoFinal,
  });
  res.json(hydrateRepartidor(req.params.id));
});

router.delete('/:id', auth, requirePermission('delivery.manage'), (req, res) => {
  const repartidor = hydrateRepartidor(req.params.id);
  if (!repartidor) return res.status(404).json({ error: 'Repartidor no encontrado' });

  const pedidosActivos = db
    .prepare(
      `SELECT id FROM pedidos
       WHERE repartidor_id = ? AND estado NOT IN ('entregado', 'cancelado')`
    )
    .all(repartidor.id);

  const retirar = db.transaction(() => {
    if (pedidosActivos.length) {
      db.prepare(
        `UPDATE pedidos
         SET repartidor_id = NULL, repartidor_nombre = '', actualizado_en = CURRENT_TIMESTAMP
         WHERE repartidor_id = ? AND estado NOT IN ('entregado', 'cancelado')`
      ).run(repartidor.id);
    }

    db.prepare(
      `UPDATE repartidores
       SET activo = 0, disponible = 0, latitud = NULL, longitud = NULL,
           ultima_ubicacion_en = NULL, fcm_token = '', fcm_platform = '',
           fcm_device_id = '', fcm_device_label = '', fcm_permission = '',
           fcm_actualizado_en = NULL
       WHERE id = ?`
    ).run(repartidor.id);

    let personalId = Number(repartidor.personal_id || 0);
    if (!personalId) {
      const linked = db
        .prepare(
          `SELECT id FROM personal
           WHERE rol_operativo = 'delivery'
             AND (
               (TRIM(COALESCE(?, '')) <> '' AND telefono = ?)
               OR lower(trim(nombre)) = lower(trim(?))
             )
           ORDER BY activo DESC, id ASC LIMIT 1`
        )
        .get(repartidor.telefono, repartidor.telefono, repartidor.nombre);
      personalId = Number(linked?.id || 0);
    }
    if (personalId) {
      db.prepare(
        `UPDATE personal
         SET activo = 0, actualizado_en = CURRENT_TIMESTAMP
         WHERE id = ? AND rol_operativo = 'delivery'`
      ).run(personalId);
    }
  });

  retirar();
  logAudit(db, {
    modulo: 'delivery',
    accion: 'retirar_rider',
    entidad: 'repartidor',
    entidad_id: repartidor.id,
    actor_id: req.user?.id,
    actor_nombre: req.user?.nombre || '',
    detalle: {
      nombre: repartidor.nombre,
      pedidos_desasignados: pedidosActivos.map((pedido) => pedido.id),
      personal_id: repartidor.personal_id || null,
    },
  });
  res.json({ success: true, pedidos_desasignados: pedidosActivos.length });
});

router.put('/:id/ubicacion', auth, requirePermission('delivery.manage'), (req, res) => {
  const { latitud, longitud } = req.body;
  const rep = hydrateRepartidor(req.params.id);
  if (!rep) return res.status(404).json({ error: 'Repartidor no encontrado' });

  db.prepare(
    'UPDATE repartidores SET latitud = ?, longitud = ?, ultima_ubicacion_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(Number(latitud), Number(longitud), req.params.id);

  const updated = hydrateRepartidor(req.params.id);
  const io = req.app.get('io');
  if (io) {
    // Buscar si este repartidor tiene un pedido activo para emitir al cliente también
    const pedidoActivo = db
      .prepare("SELECT id FROM pedidos WHERE repartidor_id = ? AND estado = 'en_camino' LIMIT 1")
      .get(rep.id);
    emitRepartidorUbicacion(io, updated, pedidoActivo?.id);
  }
  res.json(updated);
});

router.delete('/:id/ubicacion', auth, requirePermission('delivery.manage'), (req, res) => {
  const rep = hydrateRepartidor(req.params.id);
  if (!rep) return res.status(404).json({ error: 'Repartidor no encontrado' });

  db.prepare(
    'UPDATE repartidores SET latitud = NULL, longitud = NULL, ultima_ubicacion_en = NULL WHERE id = ?'
  ).run(req.params.id);

  const updated = hydrateRepartidor(req.params.id);
  const io = req.app.get('io');
  if (io) emitRepartidorUbicacion(io, updated);
  res.json(updated);
});

router.get('/:id/rider/:codigo', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const pedidos = db
    .prepare(
      "SELECT * FROM pedidos WHERE repartidor_id = ? AND estado NOT IN ('entregado', 'cancelado') ORDER BY datetime(actualizado_en) DESC"
    )
    .all(repartidor.id);
  const historial = db
    .prepare(
      `SELECT id
       FROM pedidos
       WHERE repartidor_id = ?
         AND estado = 'entregado'
         AND date(actualizado_en, '-3 hours') = date('now', '-3 hours')
       ORDER BY datetime(actualizado_en) DESC
       LIMIT 50`
    )
    .all(repartidor.id)
    .map((row) => getPedidoHydratedById(row.id))
    .filter(Boolean);

  const configRows = db
    .prepare(
      `SELECT clave, valor
       FROM configuracion
       WHERE clave LIKE 'rider_app_%'
          OR clave LIKE 'alertas_%'
          OR clave IN (
            'delivery_requiere_foto_entrega',
            'delivery_validacion_activa',
            'negocio_nombre',
            'negocio_logo',
            'negocio_telefono',
            'negocio_localidad',
            'negocio_provincia',
            'metodos_pago',
            'monteros_min_lat',
            'monteros_max_lat',
            'monteros_min_lng',
            'monteros_max_lng',
            'delivery_min_lat',
            'delivery_max_lat',
            'delivery_min_lng',
            'delivery_max_lng'
          )`
    )
    .all();
  const settings = Object.fromEntries(configRows.map((r) => [r.clave, r.valor]));

  res.json({
    repartidor,
    pedidos: pedidos.map((p) => getPedidoHydratedById(p.id)).filter(Boolean),
    historial,
    settings,
  });
});

// ── Rate limiting en memoria para ubicaciones ──
const riderRateLimit = new Map(); // repartidorId → { lastUpdate, lastLog }
const RIDER_UPDATE_MIN_MS = 3000; // mínimo 3 segundos entre updates
const RIDER_LOG_MIN_MS = 5000; // mínimo 5 segundos entre inserts en log

// ── Tracking de proximidad por pedido (para no repetir eventos) ──
const proximityState = new Map(); // pedidoId → { cerca500: bool, cerca150: bool }

router.put('/:id/rider/:codigo/ubicacion', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const { latitud, longitud, precision, velocidad, pedidoId } = req.body;
  const now = Date.now();
  const limit = riderRateLimit.get(repartidor.id);
  const validatedLocation = validateRiderLocationUpdate({
    repartidor,
    latitud,
    longitud,
    precision,
  });

  if (!validatedLocation.ok) {
    return res.status(202).json({
      success: true,
      ignored: true,
      reason: validatedLocation.reason,
      accuracy: validatedLocation.accuracy,
      distance: validatedLocation.distance ? Math.round(validatedLocation.distance) : undefined,
    });
  }

  // Rechazar si viene muy rápido (DoS / batería)
  if (limit && now - limit.lastUpdate < RIDER_UPDATE_MIN_MS) {
    return res.status(429).json({
      success: false,
      error: 'Too many updates',
      retryAfter: Math.ceil((RIDER_UPDATE_MIN_MS - (now - limit.lastUpdate)) / 1000),
    });
  }

  // Actualizar repartidor
  db.prepare(
    'UPDATE repartidores SET latitud = ?, longitud = ?, ultima_ubicacion_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(validatedLocation.lat, validatedLocation.lng, repartidor.id);

  // Si hay un pedido activo, actualizarlo también para el tracking del cliente
  if (pedidoId) {
    db.prepare(
      'UPDATE pedidos SET repartidor_latitud = ?, repartidor_longitud = ?, repartidor_ubicacion_en = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(validatedLocation.lat, validatedLocation.lng, pedidoId);
  }

  // Log historial (throttled: máximo 1 insert cada 5 segundos por rider)
  const shouldLog = !limit || now - limit.lastLog >= RIDER_LOG_MIN_MS;
  if (shouldLog) {
    db.prepare(
      'INSERT INTO repartidor_ubicaciones_log (repartidor_id, pedido_id, latitud, longitud, precision, velocidad) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      repartidor.id,
      pedidoId || null,
      validatedLocation.lat,
      validatedLocation.lng,
      validatedLocation.accuracy,
      Number.isFinite(Number(velocidad)) ? Number(velocidad) : null
    );
  }

  riderRateLimit.set(repartidor.id, {
    lastUpdate: now,
    lastLog: shouldLog ? now : limit?.lastLog || now,
  });

  const io = req.app.get('io');
  let distanciaMetros = null;

  // ── Calcular distancia y emitir eventos de proximidad ──
  if (pedidoId && io) {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
    if (pedido && pedido.estado === 'en_camino') {
      const rLat = validatedLocation.lat;
      const rLng = validatedLocation.lng;
      const cLat = Number(pedido.cliente_latitud);
      const cLng = Number(pedido.cliente_longitud);

      if (pedido.cliente_ubicacion_exacta && cLat && cLng) {
        distanciaMetros = haversineMeters(rLat, rLng, cLat, cLng);

        // Inicializar estado de proximidad para este pedido
        if (!proximityState.has(pedidoId)) {
          proximityState.set(pedidoId, { cerca500: false, cerca150: false });
        }
        const state = proximityState.get(pedidoId);

        // Umbral 500m: repartidor_cerca
        if (distanciaMetros < 500 && !state.cerca500) {
          state.cerca500 = true;
          io.to(`pedido_${pedidoId}`).emit('repartidor_cerca', {
            pedidoId,
            repartidorId: repartidor.id,
            distancia: Math.round(distanciaMetros),
            timestamp: new Date().toISOString(),
          });
        }

        // Umbral 150m: repartidor_llegando
        if (distanciaMetros < 150 && !state.cerca150) {
          state.cerca150 = true;
          io.to(`pedido_${pedidoId}`).emit('repartidor_llegando', {
            pedidoId,
            repartidorId: repartidor.id,
            distancia: Math.round(distanciaMetros),
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Notificación WhatsApp/SMS legacy (ya existente)
      const config = getConfigMap(db);
      checkAndNotifyLlegando({
        pedidoId: pedido.id,
        repartidorId: repartidor.id,
        repartidorNombre: repartidor.nombre,
        riderLat: validatedLocation.lat,
        riderLng: validatedLocation.lng,
        clientLat: pedido.cliente_latitud,
        clientLng: pedido.cliente_longitud,
        clienteTelefono: pedido.cliente_telefono,
        entregaPin: pedido.entrega_pin,
        negocioNombre: config.negocio_nombre || 'Modo Sabor',
      });
    }
  }

  const updatedRepartidor = hydrateRepartidor(repartidor.id);
  if (io) {
    emitRepartidorUbicacion(io, updatedRepartidor, pedidoId);
    if (pedidoId) {
      const pedido = getPedidoHydratedById(pedidoId);
      if (pedido) emitPedidoActualizado(io, pedido);
    }
  }

  res.json({ success: true, distancia_metros: distanciaMetros });
});

/**
 * FCM: guarda el token del device del rider para poder mandarle push
 * cuando le asignan un pedido. Un rider = 1 token activo; si cambia
 * de celular, el token nuevo pisa el viejo automatico.
 *
 * Este endpoint funciona incluso si FCM aun no esta activo en el server:
 * simplemente guarda el token. Cuando actives Firebase Admin SDK y
 * agregues el sender, el token estara ahi listo para usar.
 */
router.post('/:id/rider/:codigo/fcm-token', async (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const token = String(req.body?.token || '').trim();
  const platform = String(req.body?.platform || 'android')
    .trim()
    .toLowerCase();
  const deviceId = String(req.body?.device_id || '')
    .trim()
    .slice(0, 120);
  const deviceLabel = String(req.body?.device_label || '')
    .trim()
    .slice(0, 120);
  const permission = String(req.body?.permission || 'granted')
    .trim()
    .slice(0, 30);

  if (!token || token.length < 20) {
    return res.status(400).json({ success: false, error: 'Token FCM invalido' });
  }

  try {
    db.prepare(
      `UPDATE repartidores
       SET fcm_token = ?, fcm_platform = ?, fcm_device_id = ?, fcm_device_label = ?,
           fcm_permission = ?, fcm_actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(token, platform, deviceId, deviceLabel, permission, repartidor.id);

    // Si el teléfono consiguió FCM después de publicada una versión, no tiene
    // que esperar al próximo reinicio de Railway para enterarse.
    let updateSent = false;
    try {
      const manifestPath = path.join(uploadsDir, 'rider-app', 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        updateSent = Boolean((await sendRiderUpdatePushToRider(db, repartidor.id, manifest)).sent);
      }
    } catch {
      // El registro del teléfono nunca falla por no poder avisar una update.
    }
    return res.json({ success: true, update_sent: updateSent });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/rider/:codigo/soporte', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;
  const mensaje = String(req.body?.mensaje || '')
    .trim()
    .slice(0, 1000);
  const tipo = String(req.body?.tipo || 'ayuda')
    .trim()
    .slice(0, 40);
  if (!mensaje) return res.status(400).json({ error: 'Contanos qué necesitás' });
  const pedidoId = Number(req.body?.pedido_id) || null;
  const latitud = Number.isFinite(Number(req.body?.latitud)) ? Number(req.body.latitud) : null;
  const longitud = Number.isFinite(Number(req.body?.longitud)) ? Number(req.body.longitud) : null;
  const result = db
    .prepare(
      `INSERT INTO rider_solicitudes_soporte (repartidor_id, pedido_id, tipo, mensaje, latitud, longitud)
     VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(repartidor.id, pedidoId, tipo, mensaje, latitud, longitud);
  logAudit(db, {
    modulo: 'delivery',
    accion: 'solicitud_soporte_rider',
    entidad: 'repartidor',
    entidad_id: repartidor.id,
    actor_nombre: repartidor.nombre || '',
    detalle: { pedido_id: pedidoId, tipo },
  });
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.get('/soporte/pendientes', auth, requirePermission('delivery.manage'), (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT s.*, r.nombre AS repartidor_nombre, p.numero AS pedido_numero
     FROM rider_solicitudes_soporte s
     JOIN repartidores r ON r.id = s.repartidor_id
     LEFT JOIN pedidos p ON p.id = s.pedido_id
     WHERE s.estado = 'abierta' ORDER BY datetime(s.creado_en) DESC`
      )
      .all()
  );
});

router.post('/soporte/:id/resolver', auth, requirePermission('delivery.manage'), (req, res) => {
  const result = db
    .prepare(
      "UPDATE rider_solicitudes_soporte SET estado = 'resuelta', resuelto_en = CURRENT_TIMESTAMP WHERE id = ? AND estado = 'abierta'"
    )
    .run(req.params.id);
  if (!result.changes) {
    return res.status(404).json({ error: 'Solicitud no encontrada o ya resuelta' });
  }
  res.json({ success: true });
});

router.put('/:id/rider/:codigo/pedido/:pedidoId/estado', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const { estado } = req.body;
  const validStates = ['aceptado', 'en_camino', 'incidencia', 'cancelado'];
  if (!validStates.includes(estado)) {
    return res.status(400).json({ error: 'Estado no valido' });
  }

  const pedido = db
    .prepare('SELECT * FROM pedidos WHERE id = ? AND repartidor_id = ?')
    .get(req.params.pedidoId, repartidor.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  // Si rechaza/cancela, liberar repartidor
  if (estado === 'cancelado') {
    db.prepare('UPDATE repartidores SET disponible = 1 WHERE id = ?').run(repartidor.id);
    db.prepare(
      'UPDATE pedidos SET estado = ?, repartidor_id = NULL, repartidor_nombre = "" WHERE id = ?'
    ).run(estado, pedido.id);
  } else {
    db.prepare(
      'UPDATE pedidos SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(estado, pedido.id);
  }

  // Trazabilidad: dejar registro de quien cambio el estado y cuando.
  registrarEvento({
    pedidoId: pedido.id,
    estado,
    estadoAnterior: pedido.estado,
    actorTipo: 'rider',
    actorId: repartidor.id,
    actorNombre: repartidor.nombre || '',
    motivo: String(req.body?.motivo || ''),
  });

  const updatedPedido = getPedidoHydratedById(pedido.id);
  const io = req.app.get('io');
  if (io) emitPedidoActualizado(io, updatedPedido);

  res.json(updatedPedido);
});

/**
 * Minutos desde que el pedido se marcó entregado.
 *
 * Se prefiere el evento de trazabilidad y se cae a `actualizado_en` para los
 * pedidos viejos. La fecha viene de SQLite en UTC sin declararlo, por eso el
 * sufijo Z explícito: sin él el cálculo se corre 3 horas.
 *
 * @returns {number} Infinito si no se puede determinar, para pecar de cauto.
 */
function minutosDesdeEntrega(pedido) {
  const evento = db
    .prepare(
      `SELECT creado_en FROM pedido_eventos
       WHERE pedido_id = ? AND estado = 'entregado'
       ORDER BY datetime(creado_en) DESC, id DESC LIMIT 1`
    )
    .get(pedido.id);
  const marcadoEn = evento?.creado_en || pedido.actualizado_en;
  const ms = new Date(String(marcadoEn).replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(ms) ? (Date.now() - ms) / 60000 : Number.POSITIVE_INFINITY;
}

/** Ventana de corrección configurable, la misma que usa deshacer entrega. */
function ventanaCorreccionMin() {
  return (
    Number(
      db
        .prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_ventana_deshacer_min'")
        .get()?.valor
    ) || 5
  );
}

router.put('/:id/rider/:codigo/pedido/:pedidoId/pago', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const pedido = db
    .prepare('SELECT * FROM pedidos WHERE id = ? AND repartidor_id = ?')
    .get(req.params.pedidoId, repartidor.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  /*
    ── Por qué se puede corregir después de entregar ──────────────────────

    Antes el cambio se bloqueaba apenas el pedido pasaba a entregado. En la
    calle el orden real es al revés: el cliente dice "te pago por
    transferencia" cuando ya tenés la bolsa en la mano, y el rider marca
    entregado por costumbre antes de acordarse de corregir el medio. A partir
    de ahí el sistema quedaba con "efectivo" para siempre, y la caja cerraba
    con un faltante que no existía.

    Se le da la misma ventana de gracia que ya tiene deshacer una entrega
    (`delivery_ventana_deshacer_min`, 5 minutos por defecto). Pasado ese rato
    lo corrige el local, que es quien tiene el panel a mano.

    El cambio queda auditado siempre: es plata, y tiene que poder rastrearse
    quién lo tocó.
  */
  if (pedido.estado === 'entregado') {
    const minutos = minutosDesdeEntrega(pedido);
    const ventana = ventanaCorreccionMin();
    if (minutos > ventana) {
      return res.status(400).json({
        error: `Pasaron más de ${ventana} minutos desde la entrega. Pedile al local que corrija el medio de pago.`,
        expirado: true,
      });
    }
  } else if (isPagoPagado(pedido.pago_estado)) {
    return res.status(400).json({ error: 'El cobro ya fue confirmado y no puede modificarse' });
  }

  const nextMetodo = normalizeMetodoPago(req.body?.metodo_pago);
  const config = getConfigMap(db);
  let enabledMethods = [];
  try {
    enabledMethods = JSON.parse(config.metodos_pago || '[]').map(normalizeMetodoPago);
  } catch {
    enabledMethods = [];
  }
  if (!enabledMethods.length) {
    enabledMethods = ['efectivo', 'transferencia', 'modo', 'uala'];
  }
  const riderMethods = enabledMethods.filter((method) => method !== 'mercadopago');
  if (!riderMethods.includes(nextMetodo)) {
    return res.status(400).json({ error: 'Ese medio de pago no está habilitado para el rider' });
  }

  const previousMethod = normalizeMetodoPago(pedido.metodo_pago);

  /*
    Al corregir el medio de un pedido ya entregado no hay que volver el cobro
    a "pendiente": la plata está cobrada, lo único que cambia es en qué forma.
    Pasarlo a pendiente le abriría un faltante falso al cierre de caja, que es
    justamente lo que este cambio viene a evitar.
  */
  const nuevoPagoEstado = pedido.estado === 'entregado' ? pedido.pago_estado : 'pendiente';

  db.prepare(
    `UPDATE pedidos
     SET metodo_pago = ?, pago_estado = ?,
         pago_detalle = ?, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    nextMetodo,
    nuevoPagoEstado,
    JSON.stringify({
      actualizado_por: 'rider',
      repartidor_id: repartidor.id,
      repartidor_nombre: repartidor.nombre,
      metodo_anterior: previousMethod,
      metodo_nuevo: nextMetodo,
      actualizado_en: new Date().toISOString(),
    }),
    pedido.id
  );

  const updatedPedido = getPedidoHydratedById(pedido.id);
  logAudit(db, {
    modulo: 'pagos',
    accion: 'cambiar_metodo_rider',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_nombre: `Rider ${repartidor.nombre}`,
    detalle: {
      numero: pedido.numero,
      desde: previousMethod,
      hacia: nextMetodo,
      pago_estado: 'pendiente',
    },
  });

  const io = req.app.get('io');
  if (io) emitPedidoActualizado(io, updatedPedido);
  res.json(updatedPedido);
});

/**
 * Estadísticas personales del rider para el home de la app.
 *
 * Devuelve lo del día, la comparación con ayer, los últimos 7 días para
 * el mini gráfico, la racha de días trabajados y los totales históricos
 * (que alimentan los niveles bronce/plata/oro del perfil).
 *
 * Todo sale de `pedidos` con `estado = 'entregado'`, así que sobrevive
 * a que el rider borre el historial local o cambie de celular.
 */
/**
 * Datos del propio rider y edición de los campos seguros.
 *
 * ── Por qué no puede editar todo ───────────────────────────────────────────
 *
 * El repartidor es parte del equipo, no un usuario independiente: su nombre
 * sale del legajo con el que se le liquida, y además **es lo que ve el cliente**
 * en la pantalla de seguimiento. Si pudiera cambiarlo libre, un día aparece un
 * apodo en el seguimiento de un cliente y encima se desincroniza de Personal.
 *
 * Por eso se parte en dos:
 *
 *   Sólo lectura  → nombre (lo cambia el local en Personal)
 *   Editable      → teléfono de contacto y vehículo
 *
 * El teléfono y el vehículo son datos operativos que el propio rider conoce
 * mejor que nadie —cambió de moto, cambió de número— y que no afectan a la
 * liquidación. Igual quedan auditados: todo lo que toca el legajo deja rastro.
 */
router.get('/:id/rider/:codigo/perfil', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  res.json({
    id: repartidor.id,
    nombre: repartidor.nombre,
    telefono: repartidor.telefono || '',
    vehiculo: repartidor.vehiculo || '',
    // Le decimos al cliente qué puede tocar, para no repetir la regla en la app.
    editables: ['telefono', 'vehiculo'],
  });
});

router.put('/:id/rider/:codigo/perfil', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const limpiar = (valor, max) =>
    String(valor ?? '')
      .trim()
      .slice(0, max);
  const telefono = limpiar(req.body?.telefono, 30);
  const vehiculo = limpiar(req.body?.vehiculo, 60);

  /*
    El nombre se ignora aunque venga en el cuerpo: que la app no lo mande no
    alcanza como control, porque cualquiera puede armar la petición a mano.
  */
  db.prepare('UPDATE repartidores SET telefono = ?, vehiculo = ? WHERE id = ?').run(
    telefono,
    vehiculo,
    repartidor.id
  );

  logAudit(db, {
    modulo: 'personal',
    accion: 'editar_perfil_rider',
    entidad: 'repartidor',
    entidad_id: repartidor.id,
    actor_nombre: `Rider ${repartidor.nombre}`,
    detalle: {
      telefono_anterior: repartidor.telefono || '',
      telefono_nuevo: telefono,
      vehiculo_anterior: repartidor.vehiculo || '',
      vehiculo_nuevo: vehiculo,
    },
  });

  res.json({
    id: repartidor.id,
    nombre: repartidor.nombre,
    telefono,
    vehiculo,
    editables: ['telefono', 'vehiculo'],
  });
});

router.get('/:id/rider/:codigo/stats', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  /*
    ── Por qué no se usa `new Date()` a secas ────────────────────────────────

    El servidor corre en UTC (Railway). A las 22:41 de Argentina son las 01:41
    UTC del día siguiente, así que `new Date().getDate()` devolvía mañana: el
    gráfico de la semana marcaba viernes un jueves a la noche, y todas las
    entregas de después de las 21:00 se le contaban al rider en el día
    equivocado.

    Restando el desfase argentino, "hoy" es el mismo día que ve el rider en su
    celular.
  */
  const hoy = new Date(Date.now() + OFFSET_ARGENTINA_MS);
  const iso = (d) => d.toISOString().slice(0, 10);

  try {
    // Serie de los ultimos 7 dias (incluye hoy). Rellenamos los dias sin
    // entregas con ceros para que el grafico no tenga huecos.
    const desde = new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000);
    const filas = db
      .prepare(
        // `fechaLocal` aplica el desfase argentino dentro de SQLite, igual que en
        // los reportes y en la caja. Sin esto, un pedido entregado a las 22:00 se
        // agrupa en el día siguiente.
        `SELECT ${fechaLocal('actualizado_en')} AS fecha,
                COUNT(*) AS entregas,
                COALESCE(SUM(total), 0) AS facturado
         FROM pedidos
         WHERE repartidor_id = ?
           AND estado = 'entregado'
           AND ${fechaLocal('actualizado_en')} BETWEEN ? AND ?
         GROUP BY fecha`
      )
      .all(repartidor.id, iso(desde), iso(hoy));

    const porFecha = new Map(filas.map((f) => [f.fecha, f]));
    const serie = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(hoy.getTime() - i * 24 * 60 * 60 * 1000);
      const key = iso(d);
      const f = porFecha.get(key);
      serie.push({
        fecha: key,
        entregas: Number(f?.entregas || 0),
        facturado: Number(f?.facturado || 0),
      });
    }

    const hoyStats = serie[serie.length - 1] || { entregas: 0, facturado: 0 };
    const ayerStats = serie[serie.length - 2] || { entregas: 0, facturado: 0 };

    // Variacion porcentual vs ayer. Si ayer fue 0 no calculamos un
    // porcentaje infinito: devolvemos null y el UI lo omite.
    const variacion =
      ayerStats.facturado > 0
        ? Math.round(((hoyStats.facturado - ayerStats.facturado) / ayerStats.facturado) * 100)
        : null;

    // Racha: dias consecutivos con al menos una entrega, contando hacia
    // atras. Si hoy todavia no entrego nada arrancamos desde ayer, para
    // no romperle la racha a media mañana.
    const diasConEntregas = db
      .prepare(
        `SELECT DISTINCT ${fechaLocal('actualizado_en')} AS fecha
         FROM pedidos
         WHERE repartidor_id = ? AND estado = 'entregado'
         ORDER BY fecha DESC
         LIMIT 120`
      )
      .all(repartidor.id)
      .map((r) => r.fecha);

    const setDias = new Set(diasConEntregas);
    let racha = 0;
    let cursor = new Date(hoy);
    if (!setDias.has(iso(cursor))) cursor = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
    while (setDias.has(iso(cursor))) {
      racha += 1;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    }

    // Totales historicos para los niveles del perfil.
    const historico = db
      .prepare(
        `SELECT COUNT(*) AS entregas, COALESCE(SUM(total), 0) AS facturado
         FROM pedidos
         WHERE repartidor_id = ? AND estado = 'entregado'`
      )
      .get(repartidor.id);

    // Mes actual.
    const mes = db
      .prepare(
        `SELECT COUNT(*) AS entregas, COALESCE(SUM(total), 0) AS facturado
         FROM pedidos
         WHERE repartidor_id = ? AND estado = 'entregado'
           AND strftime('%Y-%m', ${fechaLocal('actualizado_en')}) =
               strftime('%Y-%m', ${hoyLocal()})`
      )
      .get(repartidor.id);

    // Mejor dia historico: es el record real de entregas en una jornada.
    const mejorDia = db
      .prepare(
        `SELECT ${fechaLocal('actualizado_en')} AS fecha, COUNT(*) AS entregas
         FROM pedidos
         WHERE repartidor_id = ? AND estado = 'entregado'
         GROUP BY fecha
         ORDER BY entregas DESC
         LIMIT 1`
      )
      .get(repartidor.id);

    return res.json({
      hoy: { entregas: hoyStats.entregas, facturado: hoyStats.facturado },
      ayer: { entregas: ayerStats.entregas, facturado: ayerStats.facturado },
      variacionFacturado: variacion,
      serie7dias: serie,
      racha,
      mes: { entregas: Number(mes?.entregas || 0), facturado: Number(mes?.facturado || 0) },
      historico: {
        entregas: Number(historico?.entregas || 0),
        facturado: Number(historico?.facturado || 0),
      },
      mejorDia: mejorDia ? { fecha: mejorDia.fecha, entregas: Number(mejorDia.entregas) } : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Deshacer una entrega marcada por error.
 *
 * Escenario real: el rider desliza el swipe sin querer, o marca el
 * pedido equivocado cuando lleva varios. Hasta ahora no habia vuelta
 * atras y el local quedaba con un pedido "entregado" que en realidad
 * seguia en la moto.
 *
 * Reglas:
 *  - Ventana de 5 minutos desde que se marco entregado (configurable
 *    con `delivery_ventana_deshacer_min`). Pasado ese tiempo tiene que
 *    corregirlo el local desde el admin, para que no se use como
 *    forma de "editar la historia" a posteriori.
 *  - El pedido vuelve a `en_camino` y el rider vuelve a quedar ocupado.
 *  - Queda registro en `pedido_eventos` Y en la auditoria: la correccion
 *    es visible, no se borra el hecho de que se marco mal.
 */
router.post('/:id/rider/:codigo/deshacer-entrega/:pedidoId', (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const pedido = db
    .prepare('SELECT * FROM pedidos WHERE id = ? AND repartidor_id = ?')
    .get(req.params.pedidoId, repartidor.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  if (pedido.estado !== 'entregado') {
    return res.status(400).json({ error: 'El pedido no figura como entregado' });
  }

  const ventanaMin =
    Number(
      db
        .prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_ventana_deshacer_min'")
        .get()?.valor
    ) || 5;

  // Buscamos cuando se marco entregado. Preferimos el evento de
  // trazabilidad; si no existe (pedido viejo) caemos a actualizado_en.
  const eventoEntrega = db
    .prepare(
      `SELECT creado_en FROM pedido_eventos
       WHERE pedido_id = ? AND estado = 'entregado'
       ORDER BY datetime(creado_en) DESC, id DESC LIMIT 1`
    )
    .get(pedido.id);
  const marcadoEn = eventoEntrega?.creado_en || pedido.actualizado_en;
  const marcadoMs = new Date(String(marcadoEn).replace(' ', 'T') + 'Z').getTime();
  const minutosDesde = Number.isFinite(marcadoMs)
    ? (Date.now() - marcadoMs) / 60000
    : Number.POSITIVE_INFINITY;

  if (minutosDesde > ventanaMin) {
    return res.status(400).json({
      error: `Pasaron mas de ${ventanaMin} minutos. Pedile al local que lo corrija.`,
      expirado: true,
    });
  }

  const motivo = String(req.body?.motivo || 'Marcado por error').slice(0, 200);

  db.prepare(
    `UPDATE pedidos
     SET estado = 'en_camino', actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(pedido.id);
  db.prepare('UPDATE repartidores SET disponible = 0 WHERE id = ?').run(repartidor.id);

  registrarEvento({
    pedidoId: pedido.id,
    estado: 'en_camino',
    estadoAnterior: 'entregado',
    actorTipo: 'rider',
    actorId: repartidor.id,
    actorNombre: repartidor.nombre || '',
    motivo,
    metadata: { reversion: true, minutos_desde_entrega: Math.round(minutosDesde * 10) / 10 },
  });

  logAudit(db, {
    modulo: 'pedidos',
    accion: 'deshacer_entrega',
    entidad: 'pedido',
    entidad_id: pedido.id,
    actor_nombre: `Rider ${repartidor.nombre}`,
    detalle: { numero: pedido.numero, motivo, minutos_desde_entrega: Math.round(minutosDesde) },
  });

  const updatedPedido = getPedidoHydratedById(pedido.id);
  const io = req.app.get('io');
  if (io) emitPedidoActualizado(io, updatedPedido);

  return res.json({ success: true, pedido: updatedPedido });
});

router.post('/:id/rider/:codigo/entregar/:pedidoId', upload.single('foto'), (req, res) => {
  const repartidor = validateRiderAccess(req, res);
  if (!repartidor) return;

  const pedido = db
    .prepare('SELECT * FROM pedidos WHERE id = ? AND repartidor_id = ?')
    .get(req.params.pedidoId, repartidor.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado para este repartidor' });
  const validacionActiva =
    db.prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_validacion_activa'").get()
      ?.valor === '1';
  const requiereFoto =
    db
      .prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_requiere_foto_entrega'")
      .get()?.valor === '1';
  let entregaFoto = '';
  try {
    entregaFoto = req.file
      ? uploadPathFromFilename(req.file.filename)
      : saveDeliveryPhotoDataUrl(req.body?.entrega_foto);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || 'No se pudo guardar la foto de entrega' });
  }
  if (
    validacionActiva &&
    pedido.entrega_pin &&
    String(req.body?.pin || '').trim() !== String(pedido.entrega_pin)
  ) {
    return res.status(400).json({ error: 'PIN de entrega invalido' });
  }
  if (requiereFoto && !entregaFoto) {
    return res.status(400).json({ error: 'Debes adjuntar una foto de entrega' });
  }

  const pagoEstadoEntrega = shouldAutoSettleOnEntrega(pedido)
    ? 'pagado'
    : normalizePagoEstado(pedido.pago_estado, {
        metodoPago: pedido.metodo_pago,
        origen: pedido.origen,
      });
  db.prepare(
    `
    UPDATE pedidos
    SET estado = 'entregado',
        pago_estado = ?,
        entrega_foto = COALESCE(NULLIF(?, ''), entrega_foto),
        entrega_foto_en = CASE WHEN ? != '' THEN CURRENT_TIMESTAMP ELSE entrega_foto_en END,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(pagoEstadoEntrega, entregaFoto, entregaFoto, pedido.id);
  db.prepare('UPDATE repartidores SET disponible = 1 WHERE id = ?').run(repartidor.id);
  if (pagoEstadoEntrega !== normalizePagoEstado(pedido.pago_estado)) {
    logAudit(db, {
      modulo: 'pagos',
      accion: 'cobrar_en_entrega',
      entidad: 'pedido',
      entidad_id: pedido.id,
      actor_nombre: `Rider ${repartidor.nombre}`,
      detalle: {
        numero: pedido.numero,
        metodo_pago: normalizeMetodoPago(pedido.metodo_pago),
        desde: normalizePagoEstado(pedido.pago_estado),
        hacia: pagoEstadoEntrega,
      },
    });
  }

  // Trazabilidad de la entrega. Guardamos si hubo foto y si se valido
  // PIN, que es la evidencia ante un reclamo "no me llego".
  registrarEvento({
    pedidoId: pedido.id,
    estado: 'entregado',
    estadoAnterior: pedido.estado,
    actorTipo: 'rider',
    actorId: repartidor.id,
    actorNombre: repartidor.nombre || '',
    metadata: {
      con_foto: Boolean(entregaFoto),
      pin_validado: Boolean(validacionActiva && pedido.entrega_pin),
      pago_estado: pagoEstadoEntrega,
    },
  });

  // Limpiar estado de proximidad del pedido entregado
  proximityState.delete(pedido.id);

  const updatedPedido = getPedidoHydratedById(pedido.id);
  const updatedRepartidor = hydrateRepartidor(repartidor.id);
  const io = req.app.get('io');
  if (io) {
    emitPedidoActualizado(io, updatedPedido);
    emitRepartidorUbicacion(io, updatedRepartidor);
    clearTrackingToken(pedido.id);
  }

  res.json({
    repartidor: updatedRepartidor,
    pedido: updatedPedido,
  });
});

router.post('/:id/asignar/:pedidoId', auth, requirePermission('delivery.manage'), (req, res) => {
  try {
    const assigned = assignPedidoToRepartidor(db, req.params.pedidoId, req.params.id);
    const pedido = getPedidoHydratedById(assigned.pedido.id);
    const io = req.app.get('io');
    if (io) {
      emitDeliveryAssignment(io, {
        pedido,
        repartidor: getRepartidorById(db, assigned.repartidor.id),
        previousRepartidor: assigned.previousRepartidorId
          ? getRepartidorById(db, assigned.previousRepartidorId)
          : null,
      });
    }
    return res.json(pedido);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo asignar el repartidor' });
  }
});

router.post('/auto-asignar/:pedidoId', auth, requirePermission('delivery.manage'), (req, res) => {
  try {
    const assigned = autoAssignPedido(db, req.params.pedidoId);
    if (!assigned.ok) {
      return res.status(400).json({ error: 'No hay repartidores disponibles en este momento' });
    }

    const pedido = getPedidoHydratedById(assigned.pedido.id);
    const io = req.app.get('io');
    if (io) {
      emitDeliveryAssignment(io, {
        pedido,
        repartidor: getRepartidorById(db, assigned.repartidor.id),
      });
    }
    return res.json({
      pedido,
      repartidor: hydrateRepartidor(assigned.repartidor.id),
      auto: true,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo autoasignar el pedido' });
  }
});

router.get('/:id/ruta/:pedidoId', auth, requirePermission('delivery.view'), (req, res) => {
  const repartidor = hydrateRepartidor(req.params.id);
  if (!repartidor) return res.status(404).json({ error: 'Repartidor no encontrado' });

  const pedido = db
    .prepare('SELECT id FROM pedidos WHERE id = ? AND repartidor_id = ?')
    .get(req.params.pedidoId, req.params.id);
  if (!pedido) {
    return res.status(404).json({ error: 'Pedido no encontrado para este repartidor' });
  }

  const rows = db
    .prepare(
      `
      SELECT latitud, longitud, precision, velocidad, creado_en
      FROM repartidor_ubicaciones_log
      WHERE repartidor_id = ? AND pedido_id = ?
      ORDER BY creado_en ASC
    `
    )
    .all(req.params.id, req.params.pedidoId);

  res.json({
    repartidor_id: Number(req.params.id),
    pedido_id: Number(req.params.pedidoId),
    puntos: rows,
    total: rows.length,
  });
});

module.exports = router;
