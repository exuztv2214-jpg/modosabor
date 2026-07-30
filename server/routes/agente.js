const express = require('express');
const router = express.Router();
const db = require('../db');
const { createRateLimiter } = require('../utils/rateLimit');
const { getConfigMap } = require('../utils/mercadoPago');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { logAudit } = require('../utils/audit');
const {
  getMenuOverview,
  getProductOptionsDetail,
  quoteProduct,
  getDeliveryInfo,
  getCustomerSnapshot,
  createRealOrder,
  getBusinessInfo,
} = require('../utils/systemClient');
const { createDraftFromCopilot } = require('../services/whatsappCopilotoService');

// ============================================
// API para el agente de WhatsApp (n8n)
// ============================================
// Ruta pensada para ser llamada por un flujo de n8n (u otra automatizacion),
// NO por navegadores ni por la web publica. Se protege con una clave
// compartida por header en vez del sistema de sesion admin, porque quien
// llama no es una persona logueada sino un servicio externo.
//
// Para habilitarla hay que definir AGENT_API_KEY en el entorno del servidor.
// Si no esta definida, todas las rutas devuelven 404 (no se revela que la
// funcionalidad existe) para no dejar una puerta abierta en instalaciones
// que no usan esto.

const agentApiKey = String(process.env.AGENT_API_KEY || '').trim();

function requireAgentKey(req, res, next) {
  if (!agentApiKey) {
    return res.status(404).json({ error: 'Agente deshabilitado' });
  }
  const providedKey = String(req.headers['x-agent-key'] || '').trim();
  if (!providedKey || providedKey !== agentApiKey) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// Limite generoso pero acotado: esto lo llama un servicio (n8n), no personas,
// pero si el flujo tiene un loop por error no queremos que tumbe el server.
const agentRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: 'Demasiadas solicitudes del agente. Intenta de nuevo en unos minutos.',
});

router.use(requireAgentKey, agentRateLimit);

// GET /api/agente/estado — negocio abierto ahora, turno actual, datos basicos
router.get('/estado', (req, res) => {
  try {
    const config = getConfigMap(db);
    const shift = getCurrentShiftInfo(config);
    res.json({
      negocio: getBusinessInfo(db),
      abierto_ahora: shift.abierto_ahora,
      turno_actual: shift.turno_actual,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/agente/menu?categoria=pizzas — catalogo completo o filtrado
router.get('/menu', (req, res) => {
  try {
    const data = getMenuOverview(db, {
      categoryQuery: req.query.categoria || '',
      limitPerCategory: req.query.limite ? Number(req.query.limite) : undefined,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/agente/producto/:id — detalle completo (variantes, extras, reglas)
router.get('/producto/:id', (req, res) => {
  try {
    const data = getProductOptionsDetail(db, req.params.id);
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// POST /api/agente/cotizar { query: "pizza muzzarella docena con extra queso" }
// Devuelve precio_total ya validado contra el catalogo real (nunca inventado
// por el agente) para un pedido descripto en lenguaje natural.
router.post('/cotizar', (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Falta query' });
    res.json(quoteProduct(db, query));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/agente/envio { direccion: "..." } — valida zona Monteros y cotiza
router.post('/envio', (req, res) => {
  try {
    const direccion = String(req.body?.direccion || '').trim();
    if (!direccion) return res.status(400).json({ error: 'Falta direccion' });
    res.json(getDeliveryInfo(db, direccion));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/agente/cliente/:telefono — historial rapido para personalizar
// Acepta el telefono por parametro de ruta O por query string (?telefono=...).
// La version por query existe porque algunos proveedores de IA (Gemini) exigen
// que cada tool declare sus parametros explicitamente, y un valor incrustado
// en la URL no queda declarado como tal.
router.get('/cliente/:telefono?', (req, res) => {
  try {
    const telefono = req.params.telefono || req.query.telefono;
    if (!telefono) {
      return res.status(400).json({ error: 'Falta telefono' });
    }
    res.json(getCustomerSnapshot(db, telefono));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/agente/copiloto/dale
// Modo humano primero: n8n solo debe llamar esta ruta cuando el operador del
// local escribio "#dale". La ruta no responde al cliente: crea un borrador
// revisable en el panel para que el local lo confirme.
router.post('/copiloto/dale', (req, res) => {
  try {
    const result = createDraftFromCopilot(db, req.body || {});
    const status = result?.needs_ai_payload ? 422 : 200;

    logAudit(db, {
      modulo: 'agente_whatsapp',
      accion: result?.ignored ? 'copiloto_ignorado' : 'copiloto_borrador',
      entidad: result?.borrador ? 'whatsapp_borrador' : 'whatsapp_conversacion',
      entidad_id: result?.borrador?.id || result?.conversacion?.id || null,
      actor_id: null,
      actor_nombre: 'Copiloto WhatsApp',
      detalle: {
        telefono: result?.conversacion?.telefono || req.body?.telefono || '',
        comando: '#dale',
        ignored: Boolean(result?.ignored),
        needs_ai_payload: Boolean(result?.needs_ai_payload),
      },
    });

    res.status(status).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo crear el borrador' });
  }
});

// POST /api/agente/pedido — crea el pedido real
// Body esperado:
// {
//   cliente_nombre, cliente_telefono, cliente_direccion,
//   tipo_entrega: 'delivery' | 'retiro',
//   metodo_pago: 'efectivo' | 'mercadopago' | ...,
//   notas: '',
//   items: [
//     { producto_id, cantidad, variantes: {grupo: {nombre}}, extras: [{nombre}], descripcion }
//   ]
// }
// El precio de cada item SIEMPRE se recalcula server-side desde el catalogo
// (ver enrichOrderItemsWithCatalog en systemClient.js) — el agente no puede
// fijar precios, solo elegir producto_id + variantes/extras por nombre.
router.post('/pedido', async (req, res) => {
  try {
    // Algunos proveedores de IA (Gemini) no arman bien el schema de una tool
    // cuando el body es un objeto libre con muchos campos anidados; para esos
    // casos n8n manda todo el pedido como un solo string JSON en
    // "pedido_json". Lo soportamos ademas del body plano de siempre.
    let payload = req.body;
    if (typeof req.body?.pedido_json === 'string') {
      try {
        payload = JSON.parse(req.body.pedido_json);
      } catch (parseError) {
        return res
          .status(400)
          .json({ error: 'pedido_json no es JSON valido: ' + parseError.message });
      }
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'El pedido necesita al menos un item' });
    }
    if (!String(payload?.cliente_telefono || '').trim()) {
      return res.status(400).json({ error: 'Falta cliente_telefono' });
    }

    const pedido = await createRealOrder(db, {
      ...payload,
      origen: 'whatsapp',
    });

    logAudit(db, {
      modulo: 'agente_whatsapp',
      accion: 'crear_pedido',
      entidad: 'pedido',
      entidad_id: pedido.id,
      actor_id: null,
      actor_nombre: 'Agente WhatsApp',
      detalle: { cliente_telefono: payload?.cliente_telefono, items_count: items.length },
    });

    res.json(pedido);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
