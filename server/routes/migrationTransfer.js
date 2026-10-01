const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { dataDir, getStorageUsage } = require('../utils/storagePaths');

const router = express.Router();
const allowedRoots = new Set([
  'uploads',
  'backups',
  'whatsapp-sesion',
  'whatsapp-historial-legado',
  'facebook-automation-profile',
  'facebook-automation-profile-v2',
]);
const upload = multer({
  dest: os.tmpdir(),
  limits: { files: 50, fileSize: 32 * 1024 * 1024, fieldSize: 128 * 1024 },
});

function authorized(req) {
  const secret = String(process.env.BOOTSTRAP_IMPORT_KEY || '');
  const supplied = String(req.headers['x-bootstrap-key'] || '');
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) {
    throw new Error('Ruta inválida');
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..' || segment.includes(':')
    ) ||
    !allowedRoots.has(segments[0]) ||
    segments.length < 2
  ) {
    throw new Error('Ruta fuera del volumen permitido');
  }
  return segments;
}

function targetFor(segments) {
  let current = dataDir;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Ruta con enlace simbólico');
    }
  }
  const target = path.join(dataDir, ...segments);
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
    throw new Error('Destino con enlace simbólico');
  }
  return target;
}

router.get('/inventory', (req, res) => {
  if (!process.env.BOOTSTRAP_IMPORT_KEY) return res.sendStatus(404);
  if (!authorized(req)) return res.sendStatus(401);

  const entries = [];
  function walk(directory, relative) {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const child = path.join(directory, item.name);
      const childRelative = `${relative}/${item.name}`;
      if (item.isDirectory()) walk(child, childRelative);
      else if (item.isFile()) entries.push({ path: childRelative, bytes: fs.statSync(child).size });
    }
  }
  try {
    for (const root of allowedRoots) walk(path.join(dataDir, root), root);
    return res.json({ ok: true, storage: getStorageUsage(), entries });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo leer el inventario' });
  }
});

router.post(
  '/files',
  (req, res, next) => {
    if (!process.env.BOOTSTRAP_IMPORT_KEY) return res.sendStatus(404);
    if (!authorized(req)) return res.sendStatus(401);
    return next();
  },
  upload.array('files', 50),
  (req, res) => {
    const files = req.files || [];
    try {
      const paths = JSON.parse(String(req.body.paths || '[]'));
      if (!Array.isArray(paths) || paths.length !== files.length || files.length === 0) {
        return res.status(400).json({ error: 'Lista de archivos inválida' });
      }
      const targets = paths.map((item) => targetFor(relativePath(item)));
      let bytes = 0;
      for (let index = 0; index < files.length; index += 1) {
        const target = targets[index];
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const staged = `${target}.migration-${crypto.randomUUID()}`;
        try {
          fs.copyFileSync(files[index].path, staged);
          fs.renameSync(staged, target);
        } finally {
          if (fs.existsSync(staged)) fs.unlinkSync(staged);
        }
        bytes += files[index].size;
      }
      return res.json({ ok: true, files: files.length, bytes });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No se pudo importar el lote' });
    } finally {
      files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      });
    }
  }
);

module.exports = { router, relativePath };
