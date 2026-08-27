const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const auth = require('../middleware/auth');
const { getMe } = require('../utils/mercadoPago');
const { requirePermission, hasPermission } = require('../utils/permissions');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { quoteDelivery, serializeZones } = require('../utils/deliveryZones');
const { buildPrintTestDocument } = require('../utils/printTemplates');
const { obtenerAudio, vozIaHabilitada } = require('../services/vozIa');
const { createRateLimiter, createSqliteRateLimitStore } = require('../utils/rateLimit');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { mergeRuntimeConfig } = require('../utils/runtimeConfig');
const {
  uploadsDir,
  uploadPathFromFilename,
  bootstrapUploadsFromBundle,
} = require('../utils/storagePaths');
const logger = require('../utils/logger');
const {
  createFileFilter,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  ICON_EXTENSIONS,
  ICON_MIME_TYPES,
  SQLITE_EXTENSIONS,
} = require('../utils/uploadValidation');
const {
  listBackups,
  createDatabaseBackup,
  backupsDir,
  resetOperationalData,
  restoreDatabaseBackup,
} = require('../utils/backupManager');
const { importBaseDataPackage } = require('../utils/dataPackage');
const { encriptar } = require('../utils/encryptConfig');

const { fechaLocal } = require('../utils/fechaLocal');
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) =>
    cb(
      null,
      `${file.fieldname}-${Date.now()}${String(path.extname(file.originalname) || '').toLowerCase()}`
    ),
});
const backupStorage = multer.diskStorage({
  destination: backupsDir,
  filename: (_req, file, cb) =>
    cb(
      null,
      `import-${Date.now()}${String(path.extname(file.originalname) || '.sqlite').toLowerCase()}`
    ),
});
const imageAssetFilter = createFileFilter({
  allowedExtensions: IMAGE_EXTENSIONS,
  allowedMimeTypes: IMAGE_MIME_TYPES,
  message: 'El archivo debe ser una imagen JPG, PNG, WEBP o GIF',
});
const faviconAssetFilter = createFileFilter({
  allowedExtensions: ICON_EXTENSIONS,
  allowedMimeTypes: ICON_MIME_TYPES,
  message: 'El favicon debe ser ICO, JPG, PNG, WEBP o GIF',
});
const configAssetFilter = (req, file, cb) =>
  file.fieldname === 'favicon'
    ? faviconAssetFilter(req, file, cb)
    : imageAssetFilter(req, file, cb);
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: configAssetFilter,
});
const backupUpload = multer({
  storage: backupStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: createFileFilter({
    allowedExtensions: SQLITE_EXTENSIONS,
    message: 'El backup debe ser un archivo .sqlite',
  }),
});
const baseDataUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const uploadRestoreStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => cb(null, path.basename(String(file.originalname || ''))),
});
const uploadRestore = multer({
  storage: uploadRestoreStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 100 },
  fileFilter: createFileFilter({
    allowedExtensions: [...IMAGE_EXTENSIONS, '.jfif', '.svg'],
    allowedMimeTypes: [
      ...IMAGE_MIME_TYPES,
      'image/pjpeg',
      'image/svg+xml',
      'application/octet-stream',
    ],
    message: 'Los archivos deben ser imagenes validas para restaurar uploads',
  }),
});
const bootstrapImportKey = String(process.env.BOOTSTRAP_IMPORT_KEY || '').trim();
const bootstrapRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiados intentos de importación. Probá de nuevo más tarde.',
  store: createSqliteRateLimitStore(db, 'bootstrap-import'),
});

function requireBootstrapKey(req, res, next) {
  if (!bootstrapImportKey) {
    return res.status(404).json({ error: 'Bootstrap import deshabilitado' });
  }
  const providedKey = String(req.headers['x-bootstrap-key'] || '').trim();
  const expected = Buffer.from(bootstrapImportKey);
  const received = Buffer.from(providedKey);
  const valid = received.length === expected.length && crypto.timingSafeEqual(received, expected);
  if (!valid) return res.status(401).json({ error: 'No autorizado' });
  return next();
}

/*
  Claves que nunca salen del servidor.

  Se guardan en la base, pero al pedir la configuración se reemplazan por un
  cartelito que solo dice "hay algo cargado". La clave real no viaja al
  navegador nunca, ni siquiera al del dueño: no hay motivo para que ande dando
  vueltas por la red si el único que la usa es el servidor.

  Y cuando se guarda la configuración, si llega el cartelito en vez de una clave
  nueva, se ignora ese campo. Sin eso, cada vez que tocaras cualquier otra
  opción de la pantalla se borraría la clave.
*/
const SENSITIVE_KEYS = new Set([
  'mercadopago_token',
  // La voz de los avisos: siempre Gemini, con su propia clave.
  'gemini_api_key',
  // El asistente: una sola clave, la del proveedor que esté elegido. Son dos
  // claves separadas a propósito, para poder usar Gemini en la voz y otro
  // proveedor en el asistente sin que se pisen.
  'ia_api_key',
  // Respaldo exclusivo de Chispita. No comparte la clave con el asistente
  // interno ni con la voz para poder rotarlo sin afectar otros módulos.
  'whatsapp_emergencia_api_key',
]);
const SENSITIVE_PLACEHOLDER = '__CONFIGURED__';

function rowsToConfig(rows) {
  const config = {};
  rows.forEach((row) => {
    config[row.clave] = row.valor;
  });
  return config;
}

function getFullConfig() {
  const rows = db.prepare('SELECT * FROM configuracion').all();
  const config = mergeRuntimeConfig(rowsToConfig(rows));
  return {
    ...config,
    negocio_logo_url: config.negocio_logo || '',
    negocio_color_primario: config.color_primario || '',
    negocio_horarios: config.turnos_negocio || '[]',
    ...getCurrentShiftInfo(config),
  };
}

function sanitizeSensitiveConfig(
  config,
  { remove = false, includeFlags = false, placeholder = '' } = {}
) {
  const nextConfig = { ...config };

  SENSITIVE_KEYS.forEach((key) => {
    const configured = Boolean(nextConfig[key]);
    if (includeFlags) {
      nextConfig[`${key}_configured`] = configured;
    }
    if (remove) {
      delete nextConfig[key];
      return;
    }
    nextConfig[key] = configured ? placeholder : '';
  });

  return nextConfig;
}

function getAdminConfig() {
  return sanitizeSensitiveConfig(getFullConfig(), {
    includeFlags: true,
    placeholder: SENSITIVE_PLACEHOLDER,
  });
}

const PUBLIC_CONFIG_KEYS = new Set([
  'abierto_ahora',
  'color_primario',
  'delivery_activo',
  'delivery_zonas',
  'mercadopago_token_configured',
  'metodos_pago',
  'minimo_pedido',
  'negocio_color_primario',
  'negocio_descripcion',
  'negocio_direccion',
  'negocio_email',
  'negocio_facebook',
  'negocio_favicon',
  'negocio_horario',
  'negocio_horarios',
  'negocio_instagram',
  'negocio_localidad',
  'negocio_logo',
  'negocio_logo_url',
  'negocio_nombre',
  'negocio_telefono',
  'pedido_minimo',
  'retiro_activo',
  'tiempo_delivery',
  'tiempo_retiro',
  'turno_actual',
  'turnos',
]);

function getPanelConfig() {
  const full = getFullConfig();
  const config = sanitizeSensitiveConfig(full, { remove: true });
  config.mercadopago_token_configured = Boolean(full.mercadopago_token);
  config.gemini_api_key_configured = Boolean(full.gemini_api_key);
  config.ia_api_key_configured = Boolean(full.ia_api_key);
  config.whatsapp_emergencia_api_key_configured = Boolean(full.whatsapp_emergencia_api_key);
  return config;
}

function getPublicConfig() {
  const panel = getPanelConfig();
  const publicConfig = {};
  Object.entries(panel).forEach(([key, value]) => {
    if (key.startsWith('web_') || PUBLIC_CONFIG_KEYS.has(key)) publicConfig[key] = value;
  });
  return publicConfig;
}

function isSensitivePlaceholder(value) {
  return String(value || '').trim() === SENSITIVE_PLACEHOLDER;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('Las instrucciones por turno no tienen un formato válido');
  }
}

function fallbackShiftName(id) {
  const normalized = String(id || 'turno')
    .replace(/[_-]+/g, ' ')
    .trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeTurnos(value) {
  return parseJsonArray(value)
    .map((turno, index) => {
      if (!turno || typeof turno !== 'object') return null;

      if (Object.prototype.hasOwnProperty.call(turno, 'dia')) {
        return {
          id: String(turno.dia || `turno_${index + 1}`),
          nombre: fallbackShiftName(turno.dia || `turno_${index + 1}`),
          desde: String(turno.inicio || '19:00'),
          hasta: String(turno.fin || '23:30'),
          activo: turno.activo !== false,
        };
      }

      return {
        id: String(turno.id || `turno_${index + 1}`),
        nombre: String(turno.nombre || fallbackShiftName(turno.id || `turno_${index + 1}`)),
        desde: String(turno.desde || turno.inicio || '19:00'),
        hasta: String(turno.hasta || turno.fin || '23:30'),
        activo: turno.activo !== false,
      };
    })
    .filter(Boolean);
}

function normalizeConfigUpdates(rawUpdates = {}) {
  const updates = { ...rawUpdates };

  SENSITIVE_KEYS.forEach((key) => {
    if (isSensitivePlaceholder(updates[key])) {
      delete updates[key];
    }
  });

  Object.keys(updates)
    .filter((key) => key.endsWith('_configured'))
    .forEach((key) => {
      delete updates[key];
    });

  if (updates.negocio_logo_url && !updates.negocio_logo) {
    updates.negocio_logo = updates.negocio_logo_url;
  }
  if (updates.negocio_color_primario && !updates.color_primario) {
    updates.color_primario = updates.negocio_color_primario;
  }

  if (updates.negocio_horarios !== undefined && updates.turnos_negocio === undefined) {
    updates.turnos_negocio = updates.negocio_horarios;
  }

  if (updates.turnos_negocio !== undefined) {
    updates.turnos_negocio = JSON.stringify(normalizeTurnos(updates.turnos_negocio));
  }

  if (updates.delivery_zonas !== undefined) {
    updates.delivery_zonas = serializeZones(parseJsonArray(updates.delivery_zonas));
  }

  if (updates.ia_fallback_activo !== undefined) {
    updates.ia_fallback_activo = String(updates.ia_fallback_activo) === '1' ? '1' : '0';
  }

  if (updates.whatsapp_emergencia_activa !== undefined) {
    updates.whatsapp_emergencia_activa =
      String(updates.whatsapp_emergencia_activa) === '1' ? '1' : '0';
  }

  if (updates.whatsapp_emergencia_base_url !== undefined) {
    const url = String(updates.whatsapp_emergencia_base_url || '')
      .trim()
      .replace(/\/+$/, '');
    const esLocalDeDesarrollo =
      String(process.env.NODE_ENV || '').trim() !== 'production' &&
      /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(url);
    if (url && !/^https:\/\//i.test(url) && !esLocalDeDesarrollo) {
      throw new Error(
        'La API de emergencia debe usar HTTPS. HTTP sólo se permite para localhost en desarrollo.'
      );
    }
    updates.whatsapp_emergencia_base_url = url;
  }

  for (const [key, max] of [
    ['whatsapp_emergencia_proveedor', 80],
    ['whatsapp_emergencia_modelo', 160],
  ]) {
    if (updates[key] === undefined) continue;
    const value = String(updates[key] || '').trim();
    if (value.length > max) throw new Error(`${key} supera el máximo de ${max} caracteres`);
    updates[key] = value;
  }

  if (updates.ia_base_url !== undefined) {
    const url = String(updates.ia_base_url || '').trim();
    const esLocalDeDesarrollo =
      String(process.env.NODE_ENV || '').trim() !== 'production' &&
      /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(url);
    if (url && !/^https:\/\//i.test(url) && !esLocalDeDesarrollo) {
      throw new Error(
        'La dirección de IA debe usar HTTPS. HTTP sólo se permite para localhost en desarrollo.'
      );
    }
    updates.ia_base_url = url;
  }

  const whatsappTrainingLimits = {
    whatsapp_agente_nombre: 80,
    whatsapp_agente_estilo: 2000,
    whatsapp_agente_reglas_generales: 6000,
    whatsapp_agente_reglas_turnos: 12000,
    whatsapp_agente_ejemplos: 6000,
    whatsapp_datos_transferencia: 1200,
  };
  Object.entries(whatsappTrainingLimits).forEach(([key, max]) => {
    if (updates[key] === undefined) return;
    const value = String(updates[key] || '')
      .replace(/\0/g, '')
      .trim();
    if (value.length > max) throw new Error(`${key} supera el máximo de ${max} caracteres`);
    if (key === 'whatsapp_agente_reglas_turnos') {
      const parsed = parseJsonObject(value);
      updates[key] = JSON.stringify(parsed);
      return;
    }
    updates[key] = value;
  });

  delete updates.negocio_horarios;

  // Limpiar claves calculadas que no deben persistirse
  delete updates.abierto_ahora;
  delete updates.turno_actual;
  delete updates.turnos;
  delete updates.negocio_logo_url;
  delete updates.negocio_color_primario;

  return updates;
}

function persistConfigUpdates(rawUpdates, req) {
  const updates = normalizeConfigUpdates(rawUpdates);
  const stmt = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)');

  // Claves sensibles que deben encriptarse antes de guardar en la base.
  const ENCRYPTED_KEYS = new Set(['ia_api_key', 'gemini_api_key', 'whatsapp_emergencia_api_key']);

  Object.entries(updates).forEach(([key, value]) => {
    // Asegurar que guardamos strings para evitar errores en SQLite
    let safeValue = value === null || value === undefined ? '' : String(value);
    if (ENCRYPTED_KEYS.has(key) && safeValue) {
      safeValue = encriptar(safeValue);
    }
    stmt.run(key, safeValue);
  });

  if (req) {
    const actor = actorFromRequest(req);
    logAudit(db, {
      modulo: 'configuracion',
      accion: 'actualizar',
      entidad: 'configuracion',
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: { claves: Object.keys(updates).sort() },
    });
  }

  return getAdminConfig();
}

/**
 * Audio de un aviso, hablado con voz de IA.
 *
 * Lo consulta el panel y el KDS antes de cantar un pedido. Si devuelve una URL,
 * la reproducen; si devuelve `null`, usan la voz del navegador de siempre.
 *
 * No lleva autenticación a propósito: lo llama el KDS, que muchas veces corre
 * en una tablet de cocina sin sesión iniciada. Igual no expone nada — sólo
 * convierte a audio un texto corto que el propio sistema arma.
 */
/*
  ── Por qué esta ruta tiene freno ──────────────────────────────────────────

  Está abierta a propósito: la usan el panel, la cocina y **la app del rider**,
  que no tiene sesión de admin —se identifica con su código en la URL—. Cerrarla
  con login dejaría al rider sin los avisos hablados.

  Pero cada texto nuevo que entra dispara una generación de voz contra la API de
  Google, que se paga. Los audios se guardan por texto, así que repetir "pedido
  nuevo" no cuesta nada; mandar texto distinto cada vez, sí.

  Sin freno, cualquiera que encontrara la dirección podía dejarla llamando en
  bucle con texto al azar y quemar el crédito de la cuenta. No rompe el sistema
  ni roba datos: gasta plata, en silencio, hasta que la API deja de responder y
  el local se queda sin voz sin saber por qué.

  El techo es holgado para el uso real —un aviso por pedido— y ridículo para un
  bucle.
*/
const vozRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Demasiados pedidos de voz desde este origen.',
  store: createSqliteRateLimitStore(db, 'voz-ia'),
});

router.post('/voz', vozRateLimit, (req, res) => {
  const texto = String(req.body?.texto || '').trim();
  if (!texto) return res.json({ url: null });

  const url = obtenerAudio(texto);
  res.json({ url });
});

/** Para que la interfaz sepa si ofrecer la voz de IA o esconder la opción. */
router.get('/voz/estado', (req, res) => {
  res.json({ habilitada: vozIaHabilitada() });
});

router.get('/', (req, res) => {
  res.json(getPublicConfig());
});

// Configuración operativa sin secretos. La consumen caja, TPV y el resto del
// panel después de que /auth/me confirmó una sesión válida.
router.get('/panel', auth, (req, res) => {
  res.json(getPanelConfig());
});

router.get('/admin', auth, requirePermission('config.manage'), (req, res) => {
  res.json(getAdminConfig());
});

router.get('/map', auth, requirePermission('config.manage'), (req, res) => {
  res.json(getAdminConfig());
});

router.get('/audit', auth, requirePermission('config.manage'), (req, res) => {
  const desde = String(req.query.desde || '').trim();
  const hasta = String(req.query.hasta || '').trim();
  const hasDateRange = Boolean(desde || hasta);
  const maxLimit = hasDateRange ? 500 : 200;
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit || 50)));

  const conditions = [];
  const params = [];
  if (desde) {
    conditions.push(`${fechaLocal('creado_en')} >= ?`);
    params.push(desde);
  }
  if (hasta) {
    conditions.push(`${fechaLocal('creado_en')} <= ?`);
    params.push(hasta);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const rows = db
    .prepare(
      `
    SELECT *
    FROM auditoria_eventos
    ${whereClause}
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT ?
  `
    )
    .all(...params);

  res.json(
    rows.map((row) => {
      try {
        return { ...row, detalle: JSON.parse(row.detalle || '{}') };
      } catch {
        return row;
      }
    })
  );
});

router.get('/mercadopago/status', auth, requirePermission('config.manage'), async (req, res) => {
  const config = getFullConfig();
  const appUrl = config.public_app_url || '';
  const apiUrl = config.public_api_url || '';
  const token = config.mercadopago_token || '';
  const appUrlIsHttp = /^https?:\/\//.test(appUrl);
  const apiUrlIsHttp = /^https?:\/\//.test(apiUrl);
  const appUrlIsHttps = /^https:\/\//.test(appUrl);
  const apiUrlIsHttps = /^https:\/\//.test(apiUrl);
  const baseStatus = {
    configured: Boolean(token),
    app_url: appUrl,
    api_url: apiUrl,
    webhook_url: apiUrl
      ? `${String(apiUrl).replace(/\/$/, '')}/api/pedidos/webhook/mercadopago`
      : '',
    checks: {
      token: Boolean(token),
      app_url: appUrlIsHttp,
      api_url: apiUrlIsHttp,
    },
    production_checks: {
      app_https: appUrlIsHttps,
      api_https: apiUrlIsHttps,
      webhook_public: apiUrlIsHttps && !/localhost|127\.0\.0\.1/i.test(apiUrl),
    },
  };

  if (!token) {
    return res.json({
      ...baseStatus,
      ready: false,
      account: null,
      message: 'Falta configurar el access token de MercadoPago',
    });
  }

  try {
    const account = await getMe({ token });
    const checks = {
      ...baseStatus.checks,
      account: true,
    };
    const ready = Object.values(checks).every(Boolean);
    const productionReady = Object.values(baseStatus.production_checks).every(Boolean);
    return res.json({
      ...baseStatus,
      checks,
      ready,
      production_ready: productionReady,
      account: {
        id: account.id,
        nickname: account.nickname,
        email: account.email,
        site_id: account.site_id,
      },
      message: ready
        ? 'MercadoPago listo para probar'
        : 'MercadoPago conectado, pero faltan URLs publicas validas',
      production_message: productionReady
        ? 'Listo para produccion'
        : 'Para produccion conviene usar URLs https publicas y webhook accesible desde internet',
    });
  } catch (error) {
    return res.json({
      ...baseStatus,
      ready: false,
      production_ready: false,
      account: null,
      checks: {
        ...baseStatus.checks,
        account: false,
      },
      message: error.message || 'No se pudo validar la cuenta de MercadoPago',
      production_message: 'No se pudo validar la cuenta de MercadoPago',
    });
  }
});

router.get('/mercadopago/eventos', auth, requirePermission('config.manage'), (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT *
    FROM mercadopago_eventos
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 30
  `
    )
    .all();
  res.json(rows);
});

router.post('/delivery/cotizar', (req, res) => {
  const config = getPublicConfig();
  const direccion = String(req.body?.direccion || '').trim();
  const quote = quoteDelivery(config, direccion);
  res.json({
    ...quote,
    direccion,
  });
});

/**
 * Documento de prueba y vista previa de impresión.
 *
 * `?tipo=ticket|comanda|delivery` elige cuál generar. Es el mismo HTML que
 * sale por la impresora: el panel lo muestra dentro de un iframe, así que la
 * vista previa no puede quedar desincronizada del resultado real.
 */
router.get('/impresion/test', auth, requirePermission('config.manage'), (req, res) => {
  const tipo = ['comanda', 'delivery', 'ticket'].includes(req.query.tipo)
    ? req.query.tipo
    : 'ticket';
  const document = buildPrintTestDocument(db, tipo);
  res.json(document);
});

router.get('/backups', auth, requirePermission('config.manage'), (_req, res) => {
  res.json({
    dir: backupsDir,
    backups: listBackups(),
  });
});

router.post('/backups', auth, requirePermission('config.manage'), (req, res) => {
  const maxFiles = Number(req.body?.maxFiles || getFullConfig().backup_max_archivos || 14);
  const backup = createDatabaseBackup(db, { reason: 'manual', maxFiles });
  res.json(backup);
});

router.get('/backup/export', auth, requirePermission('config.manage'), (req, res) => {
  const backup = createDatabaseBackup(db, {
    reason: 'manual-export',
    maxFiles: Number(getFullConfig().backup_max_archivos || 14),
  });
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'configuracion',
    accion: 'backup_export',
    entidad: 'backup',
    entidad_id: backup.file,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { archivo: backup.file, tamano: backup.size },
  });
  return res.download(path.join(backupsDir, backup.file), backup.file);
});

router.get('/backups/:file/download', auth, requirePermission('config.manage'), (req, res) => {
  const target = listBackups().find((entry) => entry.file === req.params.file);
  if (!target) {
    return res.status(404).json({ error: 'Backup no encontrado' });
  }
  return res.download(path.join(backupsDir, target.file));
});

router.post('/backups/:file/restore', auth, requirePermission('config.manage'), (req, res) => {
  if (
    String(req.body?.confirmacion || '')
      .trim()
      .toUpperCase() !== 'RESTAURAR'
  ) {
    return res.status(400).json({ error: 'Debes escribir RESTAURAR para confirmar' });
  }

  const target = listBackups().find((entry) => entry.file === req.params.file);
  if (!target) {
    return res.status(404).json({ error: 'Backup no encontrado' });
  }

  const safetyBackup = createDatabaseBackup(db, {
    reason: 'pre-restore',
    maxFiles: Number(getFullConfig().backup_max_archivos || 14),
  });
  const restored = restoreDatabaseBackup(db, target.file, { mode: 'full' });

  return res.json({
    ok: true,
    message: 'Backup restaurado correctamente',
    restored,
    safety_backup: safetyBackup,
    backups: listBackups(),
  });
});

router.post(
  '/backup/import',
  auth,
  requirePermission('config.manage'),
  backupUpload.single('backup'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar un backup .sqlite' });
    }

    if (path.extname(req.file.filename).toLowerCase() !== '.sqlite') {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(400).json({ error: 'El archivo debe ser .sqlite' });
    }

    const safetyBackup = createDatabaseBackup(db, {
      reason: 'pre-import',
      maxFiles: Number(getFullConfig().backup_max_archivos || 14),
    });
    const restored = restoreDatabaseBackup(db, req.file.filename, { mode: 'full' });
    const actor = actorFromRequest(req);
    logAudit(db, {
      modulo: 'configuracion',
      accion: 'backup_import',
      entidad: 'backup',
      entidad_id: req.file.filename,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: { archivo: req.file.filename },
    });

    return res.json({
      ok: true,
      message: 'Backup restaurado correctamente',
      restored,
      safety_backup: safetyBackup,
      backups: listBackups(),
    });
  }
);

router.post(
  '/base-data/import',
  auth,
  requirePermission('config.manage'),
  baseDataUpload.single('data'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar un paquete JSON de datos base' });
    }

    let payload;
    try {
      payload = JSON.parse(req.file.buffer.toString('utf-8'));
    } catch {
      return res.status(400).json({ error: 'El paquete de datos base no es JSON valido' });
    }

    const safetyBackup = createDatabaseBackup(db, {
      reason: 'pre-base-data-import',
      maxFiles: Number(getFullConfig().backup_max_archivos || 14),
    });
    const imported = importBaseDataPackage(db, payload);
    const actor = actorFromRequest(req);
    logAudit(db, {
      modulo: 'configuracion',
      accion: 'base_data_import',
      entidad: 'base_data',
      entidad_id: imported.imported_at,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        source: payload.source || '',
        exported_at: payload.exported_at || '',
        results: imported.results,
      },
    });

    return res.json({
      ...imported,
      safety_backup: safetyBackup,
    });
  }
);

router.post(
  '/backup/bootstrap-import',
  bootstrapRateLimit,
  requireBootstrapKey,
  backupUpload.single('backup'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar un backup .sqlite' });
    }

    if (path.extname(req.file.filename).toLowerCase() !== '.sqlite') {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(400).json({ error: 'El archivo debe ser .sqlite' });
    }

    const safetyBackup = createDatabaseBackup(db, {
      reason: 'pre-bootstrap-import',
      maxFiles: Number(getFullConfig().backup_max_archivos || 14),
    });
    const restored = restoreDatabaseBackup(db, req.file.filename, { mode: 'full' });

    return res.json({
      ok: true,
      message: 'Backup bootstrap importado correctamente',
      restored,
      safety_backup: safetyBackup,
      backups: listBackups(),
    });
  }
);

router.post('/uploads/bootstrap-import', bootstrapRateLimit, requireBootstrapKey, (req, res) => {
  const bootstrap = bootstrapUploadsFromBundle();
  const uploaded = fs.readdirSync(uploadsDir).map((file) => ({
    file,
    url: uploadPathFromFilename(file),
  }));

  return res.json({
    ok: true,
    copied: bootstrap.copied,
    filesCopied: bootstrap.filesCopied,
    total: uploaded.length,
    uploaded,
  });
});

router.post(
  '/uploads/import',
  auth,
  requirePermission('config.manage'),
  uploadRestore.array('files', 100),
  (req, res) => {
    const files = req.files || [];
    return res.json({
      ok: true,
      uploaded: files.map((file) => ({
        file: file.filename,
        url: uploadPathFromFilename(file.filename),
        size: file.size,
      })),
    });
  }
);

router.post(
  '/web-publica/upload',
  auth,
  (req, res, next) => {
    if (hasPermission(req.user, 'config.manage') || hasPermission(req.user, 'delivery.manage')) {
      return next();
    }
    return res.status(403).json({ error: 'Sin permisos para subir imágenes' });
  },
  upload.single('asset'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar una imagen' });
    }

    return res.json({
      ok: true,
      url: uploadPathFromFilename(req.file.filename),
      file: req.file.filename,
    });
  }
);

router.post('/reset', auth, requirePermission('config.manage'), (req, res) => {
  if (
    String(req.body?.confirmacion || '')
      .trim()
      .toUpperCase() !== 'RESET'
  ) {
    return res.status(400).json({ error: 'Debes escribir RESET para confirmar' });
  }

  const backup = createDatabaseBackup(db, {
    reason: 'pre-reset',
    maxFiles: Number(getFullConfig().backup_max_archivos || 14),
  });

  resetOperationalData(db);

  return res.json({
    ok: true,
    message:
      'Se resetearon los datos operativos. Configuracion, menu, usuarios y personal se conservaron.',
    backup,
  });
});

router.post('/reset-operativo', auth, requirePermission('config.manage'), (req, res) => {
  const backup = createDatabaseBackup(db, {
    reason: 'pre-reset',
    maxFiles: Number(getFullConfig().backup_max_archivos || 14),
  });

  resetOperationalData(db);
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'configuracion',
    accion: 'reset_operativo',
    entidad: 'sistema',
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { backup: backup.file },
  });

  return res.json({
    ok: true,
    message:
      'Se resetearon los datos operativos. Configuracion, menu, usuarios y personal se conservaron.',
    backup,
  });
});

router.post('/bulk', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const payload =
      req.body?.config && typeof req.body.config === 'object' ? req.body.config : req.body;
    return res.json(persistConfigUpdates(payload, req));
  } catch (error) {
    logger.error('[Config Bulk Error]', { message: error.message });
    return res.status(400).json({ error: error.message || 'No se pudo guardar la configuracion' });
  }
});

router.put(
  '/',
  auth,
  requirePermission('config.manage'),
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 },
    { name: 'tarjeta_fidelidad_fondo', maxCount: 1 },
  ]),
  (req, res) => {
    const updates = { ...req.body };
    const logoFile = req.files?.logo?.[0];
    const faviconFile = req.files?.favicon?.[0];
    const tarjetaFondoFile = req.files?.tarjeta_fidelidad_fondo?.[0];
    if (logoFile) updates.negocio_logo = uploadPathFromFilename(logoFile.filename);
    if (faviconFile) updates.negocio_favicon = uploadPathFromFilename(faviconFile.filename);
    if (tarjetaFondoFile) {
      updates.tarjeta_fidelidad_fondo = uploadPathFromFilename(tarjetaFondoFile.filename);
    }
    try {
      return res.json(persistConfigUpdates(updates, req));
    } catch (error) {
      return res
        .status(400)
        .json({ error: error.message || 'No se pudo guardar la configuracion' });
    }
  }
);

module.exports = router;
