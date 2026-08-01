/**
 * Endpoints públicos para actualización de la app Rider Android.
 *
 * Flujo: la app rider (Capacitor Android) al abrir hace GET /api/rider-app/version
 * y compara el versionCode devuelto contra el versionCode instalado. Si el server
 * tiene una versión más nueva, la app le muestra un modal al rider con la opción
 * de descargar el APK y instalarlo.
 *
 * Para publicar una nueva versión:
 *   1. Copiar el APK release a  server/uploads/rider-app/<archivo>.apk
 *   2. Editar server/uploads/rider-app/manifest.json con la info nueva
 *   3. Deploy (Railway auto)
 *
 * El endpoint es público (sin auth) porque el rider aún no está logueado
 * cuando arranca la app; y además la info que devuelve no es sensible
 * (número de versión + link de descarga público).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { uploadsDir } = require('../utils/storagePaths');

const RIDER_APP_DIR = path.join(uploadsDir, 'rider-app');
const MANIFEST_PATH = path.join(RIDER_APP_DIR, 'manifest.json');

function ensureRiderAppDir() {
  if (!fs.existsSync(RIDER_APP_DIR)) {
    fs.mkdirSync(RIDER_APP_DIR, { recursive: true });
  }
}

/**
 * Fallback: si no hay manifest.json aún, calcula la versión desde el
 * client/package.json que se buildeó junto al server. Así el endpoint nunca
 * queda vacío y devuelve al menos la versión "actual" que el rider ya tiene.
 */
function readFallbackFromPackageJson() {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'client', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const versionName = String(pkg.version || '1.0.0');
    const parts = versionName.split('.').map((n) => parseInt(n, 10) || 0);
    const [major = 0, minor = 0, patch = 0] = parts;
    return {
      versionCode: major * 10000 + minor * 100 + patch,
      versionName,
    };
  } catch {
    return { versionCode: 10000, versionName: '1.0.0' };
  }
}

/**
 * Construye la URL absoluta del APK basado en el host actual. Así funciona
 * tanto en local (http://localhost:4000/...) como en Railway
 * (https://modosabor-api-production.up.railway.app/...) sin hardcodear nada.
 */
function absoluteUrl(req, relativePath) {
  // Respeta X-Forwarded-Proto / Host cuando estamos detrás de proxy (Railway).
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .toString()
    .split(',')[0]
    .trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .toString()
    .split(',')[0]
    .trim();
  if (!host) return relativePath;
  return `${proto}://${host}${relativePath}`;
}

router.get('/version', (req, res) => {
  ensureRiderAppDir();

  let manifest = null;
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (error) {
      // manifest corrupto: caemos al fallback pero avisamos
      manifest = null;
    }
  }

  const fallback = readFallbackFromPackageJson();
  const versionCode = Number(manifest?.versionCode) || fallback.versionCode;
  const versionName = String(manifest?.versionName || fallback.versionName);
  const apkFile = String(manifest?.apkFile || '').trim();

  // Verificar que el archivo APK existe físicamente. Si no, no ofrecemos
  // update (mejor no update que uno roto).
  let downloadUrl = null;
  let sizeBytes = null;
  if (apkFile) {
    const apkPath = path.join(RIDER_APP_DIR, apkFile);
    if (fs.existsSync(apkPath)) {
      const relative = `/uploads/rider-app/${encodeURIComponent(apkFile)}`;
      downloadUrl = absoluteUrl(req, relative);
      try {
        sizeBytes = fs.statSync(apkPath).size;
      } catch {
        sizeBytes = null;
      }
    }
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    versionCode,
    versionName,
    apkFile: apkFile || null,
    downloadUrl,
    sizeBytes,
    sizeMB: sizeBytes ? Math.round((sizeBytes / (1024 * 1024)) * 10) / 10 : null,
    changelog: String(manifest?.changelog || ''),
    forceUpdate: Boolean(manifest?.forceUpdate),
    minVersionCode: Number(manifest?.minVersionCode) || 0,
    releasedAt: manifest?.releasedAt || null,
    hasBinary: Boolean(downloadUrl),
  });
});

/**
 * Endpoint alternativo para el manifest crudo (útil para debug/monitoring).
 */
router.get('/manifest', (_req, res) => {
  ensureRiderAppDir();
  if (!fs.existsSync(MANIFEST_PATH)) {
    return res.status(404).json({ error: 'No hay manifest publicado todavía' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    res.set('Cache-Control', 'no-store');
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Manifest corrupto', message: error.message });
  }
});

module.exports = router;
