const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const {
  listBarrios,
  listCasas,
  resolverDireccionEstructurada,
  guardarCasaManual,
  guardarCentroBarrio,
  guardarCentroManzana,
} = require('../services/direccionesEstructuradas');

router.get('/barrios', auth, requirePermission('pedidos.edit'), (_req, res) => {
  res.json({ barrios: listBarrios() });
});

router.get('/barrios/:id/manzanas', auth, requirePermission('pedidos.edit'), (req, res) => {
  const barrio = listBarrios().find((item) => Number(item.id) === Number(req.params.id));
  if (!barrio) return res.status(404).json({ error: 'Barrio no encontrado' });
  return res.json({ barrio, manzanas: barrio.manzanas || [] });
});

router.get(
  '/barrios/:id/manzanas/:manzana/casas',
  auth,
  requirePermission('pedidos.edit'),
  (req, res) => {
    const casas = listCasas({ barrio_id: req.params.id, manzana: req.params.manzana });
    return res.json({ casas });
  }
);

router.post('/resolver', auth, requirePermission('pedidos.edit'), (req, res) => {
  const resolved = resolverDireccionEstructurada(req.body || {});
  if (!resolved) return res.status(404).json({ error: 'No se encontro esa direccion conocida' });
  return res.json(resolved);
});

router.put('/barrios/:id/centro', auth, requirePermission('pedidos.edit'), (req, res) => {
  try {
    const barrio = guardarCentroBarrio({ ...(req.body || {}), barrio_id: req.params.id });
    return res.json({ ok: true, barrio });
  } catch (error) {
    return res
      .status(400)
      .json({ error: error.message || 'No se pudo guardar el centro del barrio' });
  }
});

router.put(
  '/barrios/:id/manzanas/:manzana/centro',
  auth,
  requirePermission('pedidos.edit'),
  (req, res) => {
    try {
      const direccion = guardarCentroManzana({
        ...(req.body || {}),
        barrio_id: req.params.id,
        manzana: req.params.manzana,
      });
      return res.json({ ok: true, direccion });
    } catch (error) {
      return res
        .status(400)
        .json({ error: error.message || 'No se pudo guardar el centro de manzana' });
    }
  }
);
router.post('/casas', auth, requirePermission('pedidos.edit'), (req, res) => {
  try {
    const resolved = guardarCasaManual(req.body || {});
    return res.json({ ok: true, direccion: resolved });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo guardar la casa' });
  }
});

module.exports = router;
