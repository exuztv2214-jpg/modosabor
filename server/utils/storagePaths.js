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

function bootstrapUploadsFromBundle() {
  if (path.resolve(defaultUploadsDir) === path.resolve(uploadsDir)) {
    return { copied: false, filesCopied: 0 };
  }
  if (!fs.existsSync(defaultUploadsDir)) {
    return { copied: false, filesCopied: 0 };
  }

  const filesCopied = copyMissingEntries(defaultUploadsDir, uploadsDir);
  const manifestUpdated = syncBundledRiderManifest(defaultUploadsDir, uploadsDir);
  return {
    copied: filesCopied > 0 || manifestUpdated,
    filesCopied,
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
  bootstrapUploadsFromBundle,
  uploadPathFromFilename,
  uploadPublicPathToFile,
};
