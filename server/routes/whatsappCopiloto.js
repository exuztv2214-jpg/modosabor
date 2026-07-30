const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { emitNuevoPedido } = require('../utils/socketRooms');
const {
  listDrafts,
  getDraft,
  confirmDraft,
  discardDraft,
} = require('../services/whatsappCopilotoService');

router.use(auth, requirePermission('pedidos.view'));

router.get('/borradores', (req, res) => {
  try {
    res.json(
      listDrafts(db, {
        estado: req.query.estado || 'abierto',
        limit: req.query.limit || 100,
      })
    );
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudieron cargar los borradores' });
  }
});

router.get('/borradores/:id', (req, res) => {
  try {
    const draft = getDraft(db, req.params.id);
    if (!draft) return res.status(404).json({ error: 'Borrador no encontrado' });
    res.json(draft);
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo cargar el borrador' });
  }
});

router.post('/borradores/:id/confirmar', requirePermission('tpv.use'), async (req, res) => {
  try {
    const result = await confirmDraft(db, req.params.id);
    const actor = actorFromRequest(req);

    logAudit(db, {
      modulo: 'whatsapp_copiloto',
      accion: 'confirmar_borrador',
      entidad: 'pedido',
      entidad_id: result.pedido.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        borrador_id: result.borrador.id,
        telefono: result.borrador.telefono,
        total: result.pedido.total,
      },
    });

    const io = req.app.get('io');
    if (io) emitNuevoPedido(io, result.pedido);

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo confirmar el borrador' });
  }
});

router.post('/borradores/:id/descartar', requirePermission('tpv.use'), (req, res) => {
  try {
    const draft = discardDraft(db, req.params.id);
    const actor = actorFromRequest(req);

    logAudit(db, {
      modulo: 'whatsapp_copiloto',
      accion: 'descartar_borrador',
      entidad: 'whatsapp_borrador',
      entidad_id: draft.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        telefono: draft.telefono,
        total: draft.total,
      },
    });

    res.json(draft);
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo descartar el borrador' });
  }
});

module.exports = router;
