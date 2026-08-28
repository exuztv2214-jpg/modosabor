const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const db = require('../db');
const social = require('../services/socialService');
const vinculacion = require('../services/social/vinculacion');
const { uploadPublicPathToFile, dataDir, ensureDir } = require('../utils/storagePaths');

const router = express.Router();
const screenshotDir = path.join(dataDir, 'social-error-screenshots');
ensureDir(screenshotDir);
const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

function workerKey(req, res, next) {
  const expected = String(process.env.SOCIAL_WORKER_KEY || '');
  const received = String(req.get('x-social-worker-key') || '');
  if (
    !expected ||
    !received ||
    expected.length !== received.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  ) {
    return res.status(401).json({ error: 'Worker no autorizado' });
  }
  return next();
}

/**
 * Canjear el código de vinculación por la clave.
 *
 * ── Por qué va ANTES del control de la clave ───────────────────────────────
 *
 * Es la única ruta del router que no puede pedirla: el Worker viene justamente
 * a buscarla. Ponerla después de `router.use(workerKey)` sería pedirle la
 * llave a alguien que viene a que le den la llave.
 *
 * Lo que la protege es el código: dura cinco minutos, sirve una sola vez, y lo
 * generó alguien con sesión iniciada en el panel apretando un botón.
 */
router.post('/vincular', (req, res) => {
  try {
    const resultado = vinculacion.canjearCodigo(req.body?.codigo);
    if (!resultado) {
      return res.status(401).json({
        error: 'El código de vinculación venció o ya se usó. Generá uno nuevo desde el panel.',
      });
    }
    return res.json({ clave: resultado.clave });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.use(workerKey);

// Este router se autentica exclusivamente con la clave del worker. Nunca usa
// la cookie del panel ni expone clientes, pedidos, tokens o sesiones del local.
router.post('/heartbeat', (req, res) => {
  social.heartbeatWorker(req.body || {});
  res.json({ ok: true, servidor: new Date().toISOString() });
});
router.post('/claim', (req, res) =>
  res.json(
    social.claimWork({
      workerCode: String(req.get('x-social-worker-code') || ''),
      puedeSubirMedia: req.get('x-social-worker-media') === '1',
    }) || {
      kind: 'idle',
    }
  )
);
router.post('/publicaciones/:id/reportar', (req, res) => {
  try {
    return res.json(
      social.reportPublication({ targetId: Number(req.params.id), ...(req.body || {}) })
    );
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/comandos/:id/reportar', (req, res) => {
  try {
    social.reportCommand({ commandId: Number(req.params.id), ...(req.body || {}) });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/publicaciones/:id/screenshot', screenshotUpload.single('screenshot'), (req, res) => {
  const targetId = Number(req.params.id);
  const lockToken = String(req.get('x-social-lock-token') || '');
  const target = db
    .prepare(
      "SELECT id FROM social_post_targets WHERE id = ? AND lock_token = ? AND estado = 'processing'"
    )
    .get(targetId, lockToken);
  const file = req.file;
  if (!target || !file || file.mimetype !== 'image/png') {
    return res.status(400).json({ error: 'Captura no válida' });
  }
  const name = `target-${targetId}-${Date.now()}.png`;
  fs.writeFileSync(path.join(screenshotDir, name), file.buffer);
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  fs.readdirSync(screenshotDir).forEach((entry) => {
    const candidate = path.join(screenshotDir, entry);
    if (fs.statSync(candidate).mtimeMs < cutoff) fs.unlinkSync(candidate);
  });
  return res.status(201).json({ screenshotRuta: name });
});
router.get('/media/:id', (req, res) => {
  const media = db
    .prepare('SELECT nombre, ruta, mime FROM social_media WHERE id = ?')
    .get(Number(req.params.id));
  const file = media && uploadPublicPathToFile(media.ruta);
  if (!media || !file || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  res.type(media.mime || 'application/octet-stream');
  return res.sendFile(file);
});

module.exports = router;
