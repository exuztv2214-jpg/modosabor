const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { normalizeAgentOrderPayload } = require('../utils/agentOrderPayload');
const db = require('../db');
const { createRateLimiter, createSqliteRateLimitStore } = require('../utils/rateLimit');
const { getConfigMap } = require('../utils/mercadoPago');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { buildAgentTraining } = require('../services/whatsappAgentTraining');
const { logAudit } = require('../utils/audit');
const { emitNuevoPedido } = require('../utils/socketRooms');
const {
  getMenuOverview,
  getMenuDiaToday,
  getProductOptionsDetail,
  quoteProduct,
  getDeliveryInfo,
  getCustomerSnapshot,
  getCurrentOrderSnapshot,
  createRealOrder,
  getBusinessInfo,
} = require('../utils/systemClient');

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
  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(agentApiKey);
  const valid =
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  if (!valid) {
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
  store: createSqliteRateLimitStore(db, 'agente'),
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
      horarios: shift.turnos.map((turno) => ({
        id: turno.id,
        nombre: turno.nombre,
        desde: turno.desde,
        hasta: turno.hasta,
      })),
      horarios_texto: shift.turnos
        .map((turno) => `${turno.nombre}: ${turno.desde} a ${turno.hasta}`)
        .join(' · '),
      atencion: buildAgentTraining(config, shift.turno_actual),
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

// GET /api/agente/menu-dia — solamente lo disponible hoy y solamente durante
// el turno de la manana. La carta comun sigue disponible en ambos turnos.
router.get('/menu-dia', (req, res) => {
  try {
    const config = getConfigMap(db);
    const shift = getCurrentShiftInfo(config);
    const isMorning = shift.abierto_ahora && shift.turno_actual?.id === 'manana';
    res.json({
      status: isMorning ? 'ok' : 'fuera_de_turno',
      disponible_ahora: isMorning,
      turno_actual: shift.turno_actual,
      productos: isMorning ? getMenuDiaToday(db) : [],
      mensaje: isMorning
        ? 'Menu del dia disponible ahora. La carta habitual tambien esta disponible.'
        : 'El menu del dia se vende solamente en el turno de la manana. Ofrecer la carta habitual.',
    });
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

// GET /api/agente/pedido-actual?telefono=... — permite responder "¿cómo va?"
// con el estado real del sistema, sin que el modelo lo deduzca del chat.
router.get('/pedido-actual', (req, res) => {
  try {
    const telefono = String(req.query.telefono || '').trim();
    if (!telefono) return res.status(400).json({ error: 'Falta telefono' });
    res.json(getCurrentOrderSnapshot(db, telefono));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/agente/derivar — la IA puede retirarse cuando el cliente pide una
// persona, reclama o plantea algo que no puede resolver con datos confiables.
router.post('/derivar', (req, res) => {
  try {
    const telefono = String(req.body?.telefono || '').trim();
    const motivo = String(req.body?.motivo || 'Derivación solicitada por el agente')
      .trim()
      .slice(0, 300);
    if (!telefono) return res.status(400).json({ error: 'Falta telefono' });
    const result = db
      .prepare(
        `UPDATE whatsapp_conversaciones
            SET bot_silenciado = 1,
                escalado_humano = 1,
                bot_silenciado_hasta = NULL,
                ultimo_estado = 'esperando_humano',
                ultimo_contexto = ?,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE telefono = ?`
      )
      .run(motivo, telefono);
    if (!result.changes) {
      return res.status(404).json({ error: 'No encontré la conversación para derivar' });
    }
    logAudit(db, {
      modulo: 'agente_whatsapp',
      accion: 'derivar_humano',
      entidad: 'whatsapp_conversacion',
      actor_nombre: 'Agente WhatsApp',
      detalle: { telefono, motivo },
    });
    res.json({ ok: true, estado: 'esperando_humano' });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    let payload;
    try {
      payload = normalizeAgentOrderPayload(req.body);
    } catch (parseError) {
      return res.status(400).json({ error: parseError.message });
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'El pedido necesita al menos un item' });
    }
    if (!String(payload?.cliente_telefono || '').trim()) {
      return res.status(400).json({ error: 'Falta cliente_telefono' });
    }

    const idempotencyKey = String(payload?.idempotency_key || '').trim();
    const existingBefore = idempotencyKey
      ? db
          .prepare("SELECT id FROM pedidos WHERE origen = 'whatsapp' AND idempotency_key = ?")
          .get(idempotencyKey)
      : null;

    const pedido = await createRealOrder(db, {
      ...payload,
      origen: 'whatsapp',
    });

    if (!existingBefore) {
      logAudit(db, {
        modulo: 'agente_whatsapp',
        accion: 'crear_pedido',
        entidad: 'pedido',
        entidad_id: pedido.id,
        actor_id: null,
        actor_nombre: 'Agente WhatsApp',
        detalle: { cliente_telefono: payload?.cliente_telefono, items_count: items.length },
      });

      // Esta ruta no pasa por /api/pedidos, por eso debe publicar explícitamente
      // el alta. Sin este evento el TPV nunca ve el pedido hasta recargar y no
      // puede ejecutar ni la voz ni la impresión automática.
      const io = req.app.get('io');
      if (io) emitNuevoPedido(io, pedido);
    }

    res.json(pedido);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
