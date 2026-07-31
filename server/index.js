require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const db = require('./db');
const { startAutomaticBackups } = require('./utils/backupManager');
const { getConfigMap } = require('./utils/mercadoPago');
const {
  mergeRuntimeConfig,
  isPrivateNetworkUrl,
  isPublicHttpsUrl,
} = require('./utils/runtimeConfig');
const {
  uploadsDir,
  ensureStoragePaths,
  bootstrapUploadsFromBundle,
} = require('./utils/storagePaths');
const { initSocketSecurity } = require('./utils/socketRooms');
const {
  isUploadValidationError,
  formatUploadValidationError,
} = require('./utils/uploadValidation');
const { syncAllDeliveryPersonnel } = require('./utils/deliveryPersonnelSync');
const { createRateLimiter } = require('./utils/rateLimit');
const logger = require('./utils/logger');
const sanitizeMiddleware = require('./middleware/sanitize');

const app = express();
app.use(compression());
app.use(cookieParser());
const server = http.createServer(app);

// ============================================
// MONEY CONVERSION HELPERS
// ============================================
const MONEY_PATTERNS = [
  'precio',
  'costo',
  'total',
  'subtotal',
  'costo_envio',
  'descuento',
  'monto',
  'efectivo',
  'diferencia',
  'valor',
];

// Claves que matchean algun patron de arriba por el nombre pero NO son plata
// (son conteos, porcentajes o valores de condicion). Si se agrega un campo
// nuevo con un nombre parecido a estos, conviene sumarlo aca en vez de
// convertirlo por accidente.
const EXCLUDED_KEYS = new Set([
  'puntos_disponibles',
  'puntos_reconocimiento',
  'total_clientes',
  'total_pedidos',
  'totalPedidos',
  'total_items',
  'totalItems',
  'total_registros',
  'total_tables',
  'total_clientes_con_puntos',
  'condicion_valor',
  'descuento_empleado_pct',
  'descuento_ratio_pct',
]);

function isMoneyKey(key) {
  if (EXCLUDED_KEYS.has(key)) return false;
  const lower = String(key).toLowerCase();
  return MONEY_PATTERNS.some((pat) => lower.includes(pat));
}

// parentIsMoneyKey indica si el valor actual esta "colgado" de una clave de
// plata (ej: el 5000 dentro de items[].precio_unitario). Los objetos/arrays
// siempre se recorren; solo los numeros sueltos se convierten, y solo si la
// clave de la que dependen es realmente de plata.
function pesosToCents(obj, parentIsMoneyKey = false) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number' && Number.isFinite(obj)) {
    return parentIsMoneyKey ? Math.round(obj * 100) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => pesosToCents(item, parentIsMoneyKey));
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = pesosToCents(v, isMoneyKey(k));
    }
    return result;
  }
  return obj;
}

function centsToPesos(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(centsToPesos);
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isMoneyKey(k) && typeof v === 'number' && Number.isInteger(v)) {
        result[k] = v / 100;
      } else {
        result[k] = centsToPesos(v);
      }
    }
    return result;
  }
  return obj;
}

// pesosToCents/centsToPesos ahora respetan isMoneyKey (antes ese chequeo estaba
// sin usar y se convertía CUALQUIER número, lo que corrompía ids en JSON con
// arrays de objetos). /api/operacion/menu-dia se verificó end-to-end
// (comparando contra /api/productos, que sí pasa por el middleware) y ya
// puede sumarse a la conversión normal. /api/tpv/espera sigue afuera por
// prudencia hasta probarla de nuevo.
const MONEY_MIDDLEWARE_SKIP_PATHS = ['/api/tpv/espera'];
function shouldSkipMoneyMiddleware(req) {
  return MONEY_MIDDLEWARE_SKIP_PATHS.some((path) => req.path.startsWith(path));
}

function moneyRequestMiddleware(req, res, next) {
  if (shouldSkipMoneyMiddleware(req)) return next();
  if (req.body && typeof req.body === 'object') {
    req.body = pesosToCents(req.body);
  }
  next();
}

function moneyResponseMiddleware(req, res, next) {
  if (shouldSkipMoneyMiddleware(req)) return next();
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (body !== undefined && body !== null) {
      return originalJson(centsToPesos(body));
    }
    return originalJson(body);
  };
  next();
}

function uniqueOrigins(...values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildAllowedOrigins() {
  const configuredOrigins = String(
    process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  const railwayUrl = railwayDomain ? `https://${railwayDomain}` : '';

  return uniqueOrigins(
    ...configuredOrigins,
    process.env.PUBLIC_APP_URL,
    process.env.PUBLIC_API_URL,
    process.env.FRONTEND_URL,
    process.env.BACKEND_URL,
    process.env.APP_URL,
    process.env.API_URL,
    railwayUrl
  );
}

// Vite (y otras herramientas de dev) pueden saltar de puerto si el
// default está ocupado (5173 -> 5174 -> ...). En desarrollo, en vez de
// mantener una lista fija de puertos en .env, aceptamos cualquier origen
// localhost/127.0.0.1/LAN privada para no romper CORS cada vez que cambia
// el puerto. En producción seguimos exigiendo un match exacto contra la
// lista configurada.
const LOCAL_DEV_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|(10|172|192)\.\d+\.\d+\.\d+)(:\d+)?$/i;
const NATIVE_APP_ORIGINS = new Set([
  // Capacitor Android usa http://localhost como origen del WebView.
  'http://localhost',
  'https://localhost',
  // Capacitor iOS y proyectos Ionic pueden usar estos esquemas.
  'capacitor://localhost',
  'ionic://localhost',
]);

function isLocalDevOrigin(origin) {
  return LOCAL_DEV_ORIGIN_RE.test(String(origin || ''));
}

function createOriginValidator(allowedOrigins, { allowLocalDev }) {
  return function originValidator(origin, callback) {
    // Sin header Origin (curl, health checks, same-origin) -> permitir.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (NATIVE_APP_ORIGINS.has(origin)) return callback(null, true);
    if (allowLocalDev && isLocalDevOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  };
}

function isMercadoPagoConfigured(tokenValue) {
  const token = String(tokenValue || '').trim();
  if (!token) return false;

  const normalized = token.toLowerCase();
  const placeholders = new Set([
    'admin123',
    'cambia-esta-clave',
    'cambia-esta-clave-inicial',
    'tu-token',
    'token',
  ]);

  if (placeholders.has(normalized)) return false;
  return token.length >= 20;
}

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = buildAllowedOrigins();
const validateOrigin = createOriginValidator(allowedOrigins, { allowLocalDev: !isProduction });

const io = new Server(server, {
  cors: { origin: validateOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE'], credentials: true },
});

initSocketSecurity(io);

const cspDirectives = {
  defaultSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  connectSrc: ["'self'", 'https:'],
  fontSrc: ["'self'", 'data:'],
  frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],
};
if (isProduction) {
  cspDirectives.upgradeInsecureRequests = [];
}
app.use(
  helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors({ origin: validateOrigin, credentials: true }));

// Rate limiter SOLO para rutas de API (no archivos estáticos ni health check)
const apiRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180,
  message: 'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
});
app.use((req, res, next) => {
  const isReadOnly = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (req.path.startsWith('/api') && !req.path.startsWith('/api/health') && !isReadOnly) {
    return apiRateLimit(req, res, next);
  }
  next();
});

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(moneyRequestMiddleware);
app.use(sanitizeMiddleware);

ensureStoragePaths();
bootstrapUploadsFromBundle();
syncAllDeliveryPersonnel(db);
app.use('/uploads', express.static(uploadsDir));

const clientDistDir = path.join(__dirname, '..', 'client', 'dist');
const clientIndexFile = path.join(clientDistDir, 'index.html');

try {
  const productsCount = db.prepare('SELECT COUNT(*) AS total FROM productos').get()?.total || 0;
  if (productsCount === 0) {
    logger.info('Base vacia detectada. Cargando menu inicial de Modo Sabor...');
    require('./scripts/seedMenuModoSabor');
  }
} catch (error) {
  logger.error('No se pudo cargar el menu inicial automaticamente', { message: error.message });
}

app.set('io', io);

app.use(moneyResponseMiddleware);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/inventario', require('./routes/inventario'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/repartidores', require('./routes/repartidores'));
app.use('/api/personal', require('./routes/personal'));
app.use('/api/caja', require('./routes/caja'));
app.use('/api/cupones', require('./routes/cupones'));
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/fidelizacion', require('./routes/fidelizacion'));
app.use('/api/operacion', require('./routes/operacion'));
app.use('/api/tpv', require('./routes/tpvEspera'));
app.use('/api/agente', require('./routes/agente'));
app.use('/api/whatsapp-copiloto', require('./routes/whatsappCopiloto'));

if (process.env.NODE_ENV === 'production' && fs.existsSync(clientIndexFile)) {
  app.use(express.static(clientDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }

    return res.sendFile(clientIndexFile);
  });
}

app.get('/api/health', (_req, res) => {
  try {
    const config = mergeRuntimeConfig(getConfigMap(db));
    const dbCheck = db.prepare('SELECT 1 AS ok').get();

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        db: dbCheck?.ok === 1,
        publicAppUrl: Boolean(config.public_app_url),
        publicApiUrl: Boolean(config.public_api_url),
        lanAppUrl: Boolean(config.public_app_url) && isPrivateNetworkUrl(config.public_app_url),
        lanApiUrl: Boolean(config.public_api_url) && isPrivateNetworkUrl(config.public_api_url),
        publicHttpsAppUrl: isPublicHttpsUrl(config.public_app_url),
        publicHttpsApiUrl: isPublicHttpsUrl(config.public_api_url),
        mercadoPagoConfigured: isMercadoPagoConfigured(config.mercadopago_token),
      },
    });
  } catch (error) {
    logger.error('Health check fallo', { message: error.message });
    res.status(500).json({
      ok: false,
      error: 'Error interno al verificar la salud del sistema',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use((error, _req, res, next) => {
  if (!error) return next();
  if (isUploadValidationError(error)) {
    return res.status(400).json({ error: formatUploadValidationError(error) });
  }

  logger.error('Error no manejado', {
    message: error.message,
    stack: error.stack,
    type: error.constructor?.name,
    code: error.code,
  });

  const isDev = process.env.NODE_ENV !== 'production';

  // Errores específicos de SQLite
  const message = String(error.message || '').toLowerCase();
  if (message.includes('unique constraint failed')) {
    return res.status(409).json({
      error: 'Ya existe un registro con ese valor. Probá con otro.',
      ...(isDev ? { detail: error.message } : {}),
    });
  }
  if (message.includes('foreign key constraint failed')) {
    return res.status(400).json({
      error: 'No se puede eliminar o vincular porque el dato relacionado ya no existe.',
      ...(isDev ? { detail: error.message } : {}),
    });
  }
  if (message.includes('not null constraint failed')) {
    return res.status(400).json({
      error: 'Faltan datos obligatorios. Revisá los campos requeridos.',
      ...(isDev ? { detail: error.message } : {}),
    });
  }
  if (message.includes('check constraint failed')) {
    return res.status(400).json({
      error: 'El valor ingresado no cumple con las reglas del sistema.',
      ...(isDev ? { detail: error.message } : {}),
    });
  }

  if (isDev) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }

  return res.status(500).json({ error: 'Error interno del servidor' });
});

io.on('connection', () => {});

startAutomaticBackups(db);

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  logger.info(`Modo Sabor API corriendo en http://localhost:${PORT}`);
});
