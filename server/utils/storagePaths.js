const fs = require('fs');
const path = require('path');

const serverRoot = path.join(__dirname, '..');
const defaultDataDir = path.join(serverRoot, 'data');
const defaultUploadsDir = path.join(serverRoot, 'uploads');

function resolvePath(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(serverRoot, raw);
}

const dataDir = resolvePath(process.env.DATA_DIR, defaultDataDir);
const uploadsDir = resolvePath(process.env.UPLOADS_DIR, defaultUploadsDir);
const backupsDir = resolvePath(process.env.BACKUPS_DIR, path.join(dataDir, 'backups'));
const dbFile = resolvePath(process.env.DB_FILE, path.join(dataDir, 'modosabor.db'));

function ensureDir(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function ensureStoragePaths() {
  ensureDir(dataDir);
  ensureDir(path.dirname(dbFile));
  ensureDir(uploadsDir);
  ensureDir(backupsDir);
}

/**
 * Uso del filesystem que contiene los datos operativos. No usa tamaños de
 * archivos a mano: SQLite, uploads y backups pueden crecer en subcarpetas que
 * no conocemos. `statfs` consulta el volumen real (por ejemplo el Volume de
 * Railway) y deja al control diario avisar antes de agotar el disco.
 *
 * Algunos entornos de desarrollo o adaptadores de filesystem no implementan
 * statfs. En ese caso devolvemos null: medir capacidad nunca debe impedir que
 * la API arranque ni convertir una limitación de diagnóstico en una alerta
 * falsa.
 */
function getStorageUsage(target = dataDir, statfsSync = fs.statfsSync) {
  if (typeof statfsSync !== 'function') return null;

  try {
    const stats = statfsSync(target);
    const blockSize = Number(stats?.bsize || 0);
    const totalBlocks = Number(stats?.blocks || 0);
    const availableBlocks = Number(stats?.bavail || 0);
    const totalBytes = blockSize * totalBlocks;
    const availableBytes = blockSize * availableBlocks;

    if (
      !Number.isFinite(totalBytes) ||
      !Number.isFinite(availableBytes) ||
      totalBytes <= 0 ||
      availableBytes < 0
    ) {
      return null;
    }

    const usedBytes = Math.max(0, totalBytes - availableBytes);
    return {
      totalBytes: Math.round(totalBytes),
      availableBytes: Math.round(availableBytes),
      usedBytes: Math.round(usedBytes),
      percentUsed: Math.min(100, Math.round((usedBytes / totalBytes) * 100)),
    };
  } catch {
    return null;
  }
}

function copyMissingEntries(sourceDir, targetDir) {
  ensureDir(targetDir);
  let copied = 0;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copied += copyMissingEntries(sourcePath, targetPath);
      continue;
    }

    if (fs.existsSync(targetPath)) {
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
    copied += 1;
  }

  return copied;
}

/**
 * Los uploads viven en un volumen persistente en producción. Eso es correcto
 * para fotos y comprobantes, pero dejaba congelado `rider-app/manifest.json`:
 * el bundle traía una versión nueva y la copia "solo si falta" conservaba el
 * manifiesto anterior para siempre. Para Rider el manifiesto de mayor
 * versionCode es la fuente de verdad y puede actualizarse sin tocar APKs
 * viejos ni otros uploads del negocio.
 */
function syncBundledRiderManifest(sourceUploadsDir, targetUploadsDir) {
  const relative = path.join('rider-app', 'manifest.json');
  const source = path.join(sourceUploadsDir, relative);
  const target = path.join(targetUploadsDir, relative);
  if (!fs.existsSync(source)) return false;

  try {
    const bundled = JSON.parse(fs.readFileSync(source, 'utf8'));
    const persisted = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
    const bundledVersion = Number(bundled?.versionCode || 0);
    const persistedVersion = Number(persisted?.versionCode || 0);
    if (bundledVersion <= persistedVersion) return false;
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
    return true;
  } catch {
    // Un manifest corrupto nunca debe impedir el inicio de la API.
    return false;
  }
}

/**
 * El manifiesto y su APK son una publicación atómica desde el punto de vista
 * del Rider: nunca se debe anunciar una versión si el archivo todavía no está
 * en el volumen persistente. `copyMissingEntries` cubre los uploads comunes,
 * pero una versión de Rider puede llegar mientras el directorio ya existe.
 * Por eso verificamos explícitamente el APK al que apunta el manifest.
 */
function syncBundledRiderRelease(sourceUploadsDir, targetUploadsDir) {
  const sourceManifest = path.join(sourceUploadsDir, 'rider-app', 'manifest.json');
  if (!fs.existsSync(sourceManifest)) return false;

  try {
    const manifest = JSON.parse(fs.readFileSync(sourceManifest, 'utf8'));
    const apkFile = path.basename(String(manifest?.apkFile || '').trim());
    if (!apkFile || !apkFile.toLowerCase().endsWith('.apk')) return false;

    const sourceApk = path.join(sourceUploadsDir, 'rider-app', apkFile);
    const targetApk = path.join(targetUploadsDir, 'rider-app', apkFile);
    if (!fs.existsSync(sourceApk)) return false;

    const sourceSize = fs.statSync(sourceApk).size;
    const targetSize = fs.existsSync(targetApk) ? fs.statSync(targetApk).size : -1;
    if (sourceSize === targetSize) return false;

    ensureDir(path.dirname(targetApk));
    fs.copyFileSync(sourceApk, targetApk);
    return true;
  } catch {
    // La sincronización de una actualización nunca puede impedir el inicio.
    return false;
  }
}

function bootstrapUploadsFromBundle() {
  if (path.resolve(defaultUploadsDir) === path.resolve(uploadsDir)) {
    return { copied: false, filesCopied: 0 };
  }
  if (!fs.existsSync(defaultUploadsDir)) {
    return { copied: false, filesCopied: 0 };
  }

  const filesCopied = copyMissingEntries(defaultUploadsDir, uploadsDir);
  const riderReleaseCopied = syncBundledRiderRelease(defaultUploadsDir, uploadsDir);
  const manifestUpdated = syncBundledRiderManifest(defaultUploadsDir, uploadsDir);
  return {
    copied: filesCopied > 0 || riderReleaseCopied || manifestUpdated,
    filesCopied: filesCopied + (riderReleaseCopied ? 1 : 0),
    manifestUpdated,
  };
}

function uploadPathFromFilename(filename = '') {
  return filename ? `/uploads/${filename}` : '';
}

function uploadPublicPathToFile(publicPath = '') {
  if (!publicPath) return null;
  const normalized = String(publicPath).replace(/\\/g, '/').trim();
  const relative = normalized.startsWith('/uploads/')
    ? normalized.slice('/uploads/'.length)
    : path.basename(normalized);
  return path.join(uploadsDir, relative);
}

module.exports = {
  dataDir,
  uploadsDir,
  backupsDir,
  dbFile,
  ensureDir,
  ensureStoragePaths,
  getStorageUsage,
  bootstrapUploadsFromBundle,
  uploadPathFromFilename,
  uploadPublicPathToFile,
};
