const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const marketingService = require('../services/marketingService');

const router = express.Router();

const requireMarketingView = requirePermission('marketing.view');
const requireMarketingEdit = requirePermission('marketing.edit');

router.use(auth);
router.use((req, res, next) => {
  const enabled =
    db.prepare("SELECT valor FROM configuracion WHERE clave = 'modulo_marketing_activo'").get()
      ?.valor !== '0';
  if (!enabled) return res.status(404).json({ error: 'El módulo de Marketing está desactivado' });
  return (req.method === 'GET' ? requireMarketingView : requireMarketingEdit)(req, res, next);
});

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

// El publicador Playwright anterior quedó archivado. Social es la única fuente
// operativa para cuentas, destinos y publicaciones; las tablas viejas se
// conservan por ahora para no borrar historial durante el despliegue.
router.use('/publicador', (_req, res) =>
  res.status(410).json({
    error: 'El publicador anterior fue retirado. Usá el panel Modo Sabor Social.',
    ir_a: '/social',
  })
);

module.exports = router;
