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
const { createRateLimiter, createSqliteRateLimitStore } = require('./utils/rateLimit');
const { traducirErrorDeBase } = require('./utils/erroresDeBase');
const logger = require('./utils/logger');
const sanitizeMiddleware = require('./middleware/sanitize');

const app = express();
app.use(compression());
app.use(cookieParser());
const server = http.createServer(app);

// ============================================
// MONEY CONVERSION HELPERS
// ============================================
const { isMoneyKey, pesosToCents, centsToPesos } = require('./utils/moneyConversion');

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
const configuredTrustProxy = String(process.env.TRUST_PROXY || '').trim();
// En producción la API está detrás del proxy de Railway/Render. Express usa
// entonces la IP que el proxy validado entrega en `req.ip`; nunca leemos el
// header x-forwarded-for directamente desde el limiter.
const trustProxy = configuredTrustProxy
  ? configuredTrustProxy === 'true'
    ? 1
    : configuredTrustProxy === 'false'
      ? false
      : Number.isFinite(Number(configuredTrustProxy))
        ? Number(configuredTrustProxy)
        : configuredTrustProxy
  : isProduction
    ? 1
    : false;
app.set('trust proxy', trustProxy);
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
  store: createSqliteRateLimitStore(db, 'api'),
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
app.use('/api/opcion-listas', require('./routes/opcionListas'));
app.use('/api/inventario', require('./routes/inventario'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/mozo', require('./routes/mozo'));
app.use('/api/direcciones', require('./routes/direcciones'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/repartidores', require('./routes/repartidores'));
app.use('/api/rider-app', require('./routes/riderApp'));
app.use('/api/reportes-delivery', require('./routes/reportesDelivery'));
app.use('/api/personal', require('./routes/personal'));
app.use('/api/caja', require('./routes/caja'));
app.use('/api/cupones', require('./routes/cupones'));
app.use('/api/marketing', require('./routes/marketing'));
/*
  Envío masivo de WhatsApp. Vive adentro del sistema y no en una PC del local:
  usa Baileys, que habla el protocolo directo sin navegador, y guarda la
  sesión en el volumen para que un deploy no obligue a escanear el QR de nuevo.
*/
app.use('/api/whatsapp', require('./routes/whatsappMasivo'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/fidelizacion', require('./routes/fidelizacion'));
app.use('/api/operacion', require('./routes/operacion'));
app.use('/api/tpv', require('./routes/tpvEspera'));
app.use('/api/agente', require('./routes/agente'));
app.use('/api/asistente', require('./routes/asistente'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/whatsapp-copiloto', require('./routes/whatsappCopiloto'));
app.use('/api/whatsapp-copiloto', require('./routes/whatsappCopiloto'));

if (process.env.NODE_ENV === 'production' && fs.existsSync(clientIndexFile)) {
  /*
    Dos políticas de caché distintas, porque son dos clases de archivo.

    Todo lo de `/assets` lleva un hash del contenido en el nombre
    (`Operacion-UyuekIOu.js`). Si el archivo cambia, cambia el nombre. Eso
    significa que ese nombre nunca va a apuntar a otra cosa, y el navegador lo
    puede guardar para siempre sin volver a preguntar. Antes se servían con
    `max-age=0`, así que en cada carga el navegador revalidaba cada pedazo del
    sistema contra el servidor: decenas de viajes de red para recibir "no
    cambió nada".

    El `index.html` es lo contrario: el nombre es siempre el mismo y el
    contenido cambia en cada deploy, porque adentro tiene la lista de nombres
    con hash. Ese no se guarda nunca; es el que le avisa al navegador que hay
    una versión nueva.
  */
  app.use(
    express.static(clientDistDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }

    res.setHeader('Cache-Control', 'no-cache');
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

  /*
    Errores de la base, dichos en castellano y nombrando el campo.

    Antes cada uno tenía su mensaje fijo —"Ya existe un registro con ese
    valor"— y el detalle se guardaba sólo en desarrollo. En producción eso
    dejaba a quien atiende con un cartel que no dice nada, y obligaba a entrar
    a los registros del servidor para saber qué campo estaba repetido.

    El nombre del campo no es información sensible: es el mismo dato que la
    persona acaba de escribir en la pantalla. El valor sí lo es, y ese nunca
    viaja en el mensaje de SQLite.
  */
  const traducido = traducirErrorDeBase(error);
  if (traducido) {
    return res.status(traducido.status).json({
      error: traducido.error,
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

// One-time catalog import: if catalog-export.json exists inside the
// container, import it into the database and delete the file so it only
// runs once per deploy.
(() => {
  const catalogPath = path.join(__dirname, 'scripts', 'catalog-export.json');
  if (!fs.existsSync(catalogPath)) return;
  try {
    const { importBaseDataPackage } = require('./utils/dataPackage');
    const { createDatabaseBackup } = require('./utils/backupManager');
    const payload = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    createDatabaseBackup(db, { reason: 'pre-catalog-sync', maxFiles: 5 });
    const result = importBaseDataPackage(db, payload);
    logger.info('Catalog sync on startup:', JSON.stringify(result));
    fs.unlinkSync(catalogPath);
  } catch (err) {
    logger.error('Catalog sync failed:', err.message);
  }
})();

// One-time admin reset: if reset-admin-once.json exists, reset the admin
// user and delete the file.
(() => {
  const resetPath = path.join(__dirname, 'scripts', 'reset-admin-once.json');
  if (!fs.existsSync(resetPath)) return;
  try {
    const bcrypt = require('bcryptjs');
    const { email, password, nombre } = JSON.parse(fs.readFileSync(resetPath, 'utf-8'));
    const hash = bcrypt.hashSync(password, 10);
    const existing = db.prepare('SELECT id FROM usuarios WHERE lower(email) = lower(?)').get(email);
    if (existing) {
      db.prepare(
        'UPDATE usuarios SET nombre = ?, email = ?, password_hash = ?, rol = ?, activo = 1 WHERE id = ?'
      ).run(nombre, email, hash, 'admin', existing.id);
    } else {
      db.prepare(
        'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
      ).run(nombre, email, hash, 'admin');
    }
    logger.info('Admin reset on startup for', email);
    fs.unlinkSync(resetPath);
  } catch (err) {
    logger.error('Admin reset failed:', err.message);
  }
})();

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  logger.info(`Modo Sabor API corriendo en http://localhost:${PORT}`);
  // FCM no puede ejecutarse antes de que el servidor tenga configurada la
  // aplicación y la base lista. Pequeña demora y sin bloquear el arranque.
  const riderUpdateTimer = setTimeout(() => {
    require('./routes/riderApp')
      .notifyPublishedUpdateOnce()
      .catch((error) =>
        logger.warn('No se pudo avisar la actualización Rider', { message: error.message })
      );
  }, 1500);
  riderUpdateTimer.unref?.();
});
