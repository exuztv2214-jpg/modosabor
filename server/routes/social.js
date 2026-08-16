const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');

const auth = require('../middleware/auth');
const db = require('../db');
const { requirePermission } = require('../utils/permissions');
const { uploadsDir, ensureDir } = require('../utils/storagePaths');
const social = require('../services/socialService');

const router = express.Router();
const mediaDir = path.join(uploadsDir, 'social-media');
ensureDir(mediaDir);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, mediaDir),
    filename: (_req, file, done) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      done(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 256 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, done) => {
    const accepted = /^(image|video)\/(jpeg|png|webp|gif|mp4|quicktime)$/i.test(
      file.mimetype || ''
    );
    done(accepted ? null : new Error('Sólo se permiten imágenes o videos compatibles'), accepted);
  },
});

router.use(auth);
router.use(requirePermission('marketing.view'));

router.get('/dashboard', (_req, res) => res.json(social.dashboard()));
router.get('/destinos', (req, res) =>
  res.json(
    social.listDestinations({
      type: String(req.query.tipo || ''),
      enabledOnly: req.query.habilitados === '1',
    })
  )
);
router.get('/conjuntos', (_req, res) => res.json(social.listSets()));
router.get('/campanas', (req, res) => res.json(social.listCampaigns(req.query.limite)));
router.get('/campanas/:id', (req, res) => {
  const campaign = social.getCampaign(Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'No existe la campaña' });
  return res.json(campaign);
});

router.use(requirePermission('marketing.edit'));

router.post('/media', upload.array('archivos', 8), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Elegí al menos un archivo' });
  const insert = db.prepare(
    'INSERT INTO social_media (nombre, ruta, mime, tamano, tipo) VALUES (?, ?, ?, ?, ?)'
  );
  const created = files.map((file) => {
    const id = Number(
      insert.run(
        file.originalname,
        `/uploads/social-media/${file.filename}`,
        file.mimetype,
        file.size,
        file.mimetype.startsWith('video/') ? 'video' : 'imagen'
      ).lastInsertRowid
    );
    return {
      id,
      nombre: file.originalname,
      ruta: `/uploads/social-media/${file.filename}`,
      mime: file.mimetype,
      tamano: file.size,
    };
  });
  return res.status(201).json(created);
});

router.get('/media', (_req, res) => {
  res.json(db.prepare('SELECT * FROM social_media ORDER BY id DESC LIMIT 200').all());
});
router.get('/plantillas', (_req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM social_templates WHERE activa = 1 ORDER BY nombre COLLATE NOCASE')
      .all()
  );
});
router.post('/conjuntos', (req, res) => {
  try {
    return res.status(201).json(social.createSet(req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/destinos', (req, res) => {
  try {
    return res.status(201).json(social.createDestination(req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas', (req, res) => {
  try {
    return res
      .status(201)
      .json(social.createCampaign({ ...(req.body || {}), usuarioId: req.user.id }));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas/:id/encolar', (req, res) => {
  try {
    return res.json(social.queueCampaign(Number(req.params.id), { now: Boolean(req.body?.ahora) }));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas/:id/cancelar', (req, res) => {
  try {
    return res.json(social.cancelCampaign(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas/:id/reintentar-fallidos', (req, res) => {
  try {
    return res.json(social.retryFailedCampaign(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/grupos/sincronizar', (_req, res) => {
  try {
    return res.status(202).json({ comandoId: social.createWorkerCommand('sync_facebook_groups') });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/worker/health-check', (_req, res) =>
  res.status(202).json({ comandoId: social.createWorkerCommand('health_check') })
);
router.get('/logs', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limite) || 100, 1), 300);
  res.json(db.prepare('SELECT * FROM social_publication_logs ORDER BY id DESC LIMIT ?').all(limit));
});
router.get('/logs/:id/screenshot', (req, res) => {
  const entry = db
    .prepare('SELECT screenshot_ruta FROM social_publication_logs WHERE id = ?')
    .get(Number(req.params.id));
  const name = path.basename(String(entry?.screenshot_ruta || ''));
  const { dataDir } = require('../utils/storagePaths');
  const file = name && path.join(dataDir, 'social-error-screenshots', name);
  if (!file || !require('fs').existsSync(file))
    return res.status(404).json({ error: 'No hay captura para este evento' });
  return res.type('image/png').sendFile(file);
});

module.exports = router;
