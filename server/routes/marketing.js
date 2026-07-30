const express = require('express');
const path = require('path');
const multer = require('multer');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const db = require('../db');
const { uploadsDir, ensureDir } = require('../utils/storagePaths');
const { getConfigMap } = require('../utils/mercadoPago');
const {
  autopublishFacebookGroup,
  autopublishFacebookQueue,
  captureFacebookGroupPreview,
  openFacebookLoginSession,
} = require('../services/facebookPublisherService');
const marketingService = require('../services/marketingService');

const router = express.Router();

const marketingUploadsDir = path.join(uploadsDir, 'marketing-publicador');
ensureDir(marketingUploadsDir);
const marketingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, marketingUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeBase =
        String(path.basename(file.originalname || 'pieza', ext))
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') || 'pieza';
      cb(null, `${Date.now()}-${safeBase}${ext}`);
    },
  }),
  limits: { fileSize: 64 * 1024 * 1024 },
});

router.use(auth, requirePermission('reportes.view'));

router.get('/dashboard', (_req, res) => {
  res.json(marketingService.getDashboard());
});

router.get('/references', (_req, res) => {
  res.json(marketingService.getReferences());
});

router.get('/promos', (_req, res) => {
  res.json(marketingService.listPromos());
});

router.post('/promos', (req, res) => {
  try {
    const created = marketingService.createPromo(req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo crear la promo' });
  }
});

router.put('/promos/:id', (req, res) => {
  try {
    const updated = marketingService.updatePromo(req.params.id, req.body || {});
    return res.json(updated);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrada')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo actualizar la promo' });
  }
});

router.delete('/promos/:id', (req, res) => {
  try {
    const deleted = marketingService.deletePromo(req.params.id);
    return res.json({ ok: true, deleted });
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrada')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo eliminar la promo' });
  }
});

router.post('/promos/:id/whatsapp', async (_req, res) => {
  return res.status(410).json({ error: 'Las difusiones automaticas fueron removidas del sistema' });
});

router.get('/contenidos', (_req, res) => {
  res.json(marketingService.listContenidos());
});

router.post('/contenidos', (req, res) => {
  try {
    const created = marketingService.createContenido(req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo crear el contenido' });
  }
});

router.put('/contenidos/:id', (req, res) => {
  try {
    const updated = marketingService.updateContenido(req.params.id, req.body || {});
    return res.json(updated);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrado')
      ? 404
      : 400;
    return res
      .status(status)
      .json({ error: error.message || 'No se pudo actualizar el contenido' });
  }
});

router.delete('/contenidos/:id', (req, res) => {
  try {
    const deleted = marketingService.deleteContenido(req.params.id);
    return res.json({ ok: true, deleted });
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrado')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo eliminar el contenido' });
  }
});

router.get('/campanas', (_req, res) => {
  res.json(marketingService.listCampanas());
});

router.post('/campanas', (req, res) => {
  try {
    const created = marketingService.createCampana(req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo crear la campaña' });
  }
});

router.put('/campanas/:id', (req, res) => {
  try {
    const updated = marketingService.updateCampana(req.params.id, req.body || {});
    return res.json(updated);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrada')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo actualizar la campaña' });
  }
});

router.delete('/campanas/:id', (req, res) => {
  try {
    const deleted = marketingService.deleteCampana(req.params.id);
    return res.json({ ok: true, deleted });
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrada')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo eliminar la campaña' });
  }
});

router.post('/campanas/:id/whatsapp', async (_req, res) => {
  return res.status(410).json({ error: 'Las difusiones automaticas fueron removidas del sistema' });
});

router.get('/calendario', (_req, res) => {
  res.json(marketingService.listCalendario());
});

router.post('/calendario', (req, res) => {
  try {
    const created = marketingService.createCalendario(req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || 'No se pudo crear el evento del calendario' });
  }
});

router.put('/calendario/:id', (req, res) => {
  try {
    const updated = marketingService.updateCalendario(req.params.id, req.body || {});
    return res.json(updated);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrado')
      ? 404
      : 400;
    return res
      .status(status)
      .json({ error: error.message || 'No se pudo actualizar el evento del calendario' });
  }
});

router.delete('/calendario/:id', (req, res) => {
  try {
    const deleted = marketingService.deleteCalendario(req.params.id);
    return res.json({ ok: true, deleted });
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrado')
      ? 404
      : 400;
    return res
      .status(status)
      .json({ error: error.message || 'No se pudo eliminar el evento del calendario' });
  }
});

router.get('/publicador/destinos', (_req, res) => {
  res.json(marketingService.listPublisherDestinations());
});

router.post('/publicador/destinos', (req, res) => {
  try {
    const created = marketingService.createPublisherDestination(req.body || {});
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo crear el destino' });
  }
});

router.put('/publicador/destinos/:id', (req, res) => {
  try {
    const updated = marketingService.updatePublisherDestination(req.params.id, req.body || {});
    return res.json(updated);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrado')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo actualizar el destino' });
  }
});

router.delete('/publicador/destinos/:id', (req, res) => {
  try {
    const deleted = marketingService.deletePublisherDestination(req.params.id);
    return res.json({ ok: true, deleted });
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrado')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo eliminar el destino' });
  }
});

router.post('/publicador/destinos/:id/capturar-preview', async (req, res) => {
  try {
    const destino = marketingService.getPublisherDestinationById(req.params.id);
    if (!destino) {
      return res.status(404).json({ error: 'Destino no encontrado' });
    }
    const captured = await captureFacebookGroupPreview({
      url: destino.url,
      slug: destino.nombre || `destino-${destino.id}`,
    });
    const updated = marketingService.updatePublisherDestinationPreview(
      destino.id,
      captured.preview_path
    );
    return res.json(updated);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || 'No se pudo capturar la vista previa del grupo' });
  }
});

router.post('/publicador/facebook/login', async (_req, res) => {
  try {
    const result = await openFacebookLoginSession();
    return res.json(result);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || 'No se pudo iniciar la sesion de Facebook en Chrome' });
  }
});

router.get('/publicador/publicaciones', (_req, res) => {
  res.json(marketingService.listPublisherPosts());
});

router.post('/publicador/publicaciones', marketingUpload.single('media'), (req, res) => {
  try {
    const created = marketingService.createPublisherPost({
      ...(req.body || {}),
      media_path: req.file ? `/uploads/marketing-publicador/${req.file.filename}` : '',
      media_mime: req.file?.mimetype || '',
      media_nombre: req.file?.originalname || '',
    });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo crear la publicacion' });
  }
});

router.put('/publicador/publicaciones/:id', marketingUpload.single('media'), (req, res) => {
  try {
    const current = marketingService.getPublisherPostById(req.params.id);
    if (!current) {
      return res.status(404).json({ error: 'Publicacion no encontrada' });
    }
    const updated = marketingService.updatePublisherPost(req.params.id, {
      ...(req.body || {}),
      media_path: req.file
        ? `/uploads/marketing-publicador/${req.file.filename}`
        : current.media_path,
      media_mime: req.file?.mimetype || current.media_mime || '',
      media_nombre: req.file?.originalname || current.media_nombre || '',
    });
    return res.json(updated);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrada')
      ? 404
      : 400;
    return res
      .status(status)
      .json({ error: error.message || 'No se pudo actualizar la publicacion' });
  }
});

router.delete('/publicador/publicaciones/:id', (req, res) => {
  try {
    const deleted = marketingService.deletePublisherPost(req.params.id);
    return res.json({ ok: true, deleted });
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrada')
      ? 404
      : 400;
    return res
      .status(status)
      .json({ error: error.message || 'No se pudo eliminar la publicacion' });
  }
});

router.post('/publicador/publicaciones/:id/preparar-cola', (req, res) => {
  try {
    const queue = marketingService.planPublisherQueue(req.params.id, req.body?.destino_ids || null);
    return res.json(queue);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo preparar la cola' });
  }
});

router.post('/publicador/publicaciones/:id/autopublicar-cola', async (req, res) => {
  try {
    const queue = marketingService.listPublisherQueue(req.params.id);
    const pendingItems = (queue.items || []).filter((item) =>
      ['pendiente', 'abierto', 'error'].includes(item.estado)
    );
    if (!pendingItems.length) {
      return res.status(400).json({ error: 'No hay destinos pendientes para autopublicar' });
    }

    const batch = await autopublishFacebookQueue(
      pendingItems.map((item) => ({
        id: item.id,
        url: item.destino_url,
        text: item.texto_preparado,
        mediaPublicPath: item.media_path,
      }))
    );

    const results = [];
    for (const item of pendingItems) {
      const outcome = (batch.results || []).find((entry) => Number(entry.id) === Number(item.id));
      if (outcome?.ok) {
        results.push({ id: item.id, ok: true, destino: item.destino_nombre });
        marketingService.updatePublisherQueueItemStatus(
          item.id,
          'publicado',
          'Publicado automaticamente en cola'
        );
      } else {
        const message = outcome?.error || 'Error autopublicando';
        results.push({ id: item.id, ok: false, destino: item.destino_nombre, error: message });
        marketingService.updatePublisherQueueItemStatus(item.id, 'error', message);
      }
    }

    const updatedQueue = marketingService.listPublisherQueue(req.params.id);
    return res.json({ queue: updatedQueue, results });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo autopublicar la cola' });
  }
});

router.get('/publicador/publicaciones/:id/cola', (req, res) => {
  try {
    const queue = marketingService.listPublisherQueue(req.params.id);
    return res.json(queue);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrada')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo cargar la cola' });
  }
});

router.post('/publicador/envios/:id/estado', (req, res) => {
  try {
    const queue = marketingService.updatePublisherQueueItemStatus(
      req.params.id,
      req.body?.estado,
      req.body?.notas || ''
    );
    return res.json(queue);
  } catch (error) {
    const status = String(error.message || '')
      .toLowerCase()
      .includes('no encontrado')
      ? 404
      : 400;
    return res.status(status).json({ error: error.message || 'No se pudo actualizar el envio' });
  }
});

router.post('/publicador/envios/:id/autopublicar', async (req, res) => {
  try {
    const item = marketingService.getPublisherQueueItemById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Envio no encontrado' });
    }

    await autopublishFacebookGroup({
      url: item.destino_url,
      text: item.texto_preparado,
      mediaPublicPath: item.publicacion_media_path,
    });

    const queue = marketingService.updatePublisherQueueItemStatus(
      req.params.id,
      'publicado',
      'Publicado automaticamente'
    );
    return res.json(queue);
  } catch (error) {
    try {
      marketingService.updatePublisherQueueItemStatus(
        req.params.id,
        'error',
        error.message || 'Error autopublicando'
      );
    } catch {}
    return res.status(400).json({ error: error.message || 'No se pudo autopublicar en Facebook' });
  }
});

module.exports = router;
