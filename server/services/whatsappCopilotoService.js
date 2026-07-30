const {
  cleanText,
  enrichOrderItemsWithCatalog,
  createRealOrder,
  getDeliveryInfo,
} = require('../utils/systemClient');

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeJsonStringify(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function normalizePhone(value) {
  return String(value || '')
    .replace(/[^\d+]/g, '')
    .trim();
}

function moneyToStorage(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  // Si viene desde pedido_json string, n8n normalmente manda pesos.
  // Si ya paso por middleware o viene de DB, ya llega en centavos.
  return Math.abs(number) > 10000 ? Math.round(number) : Math.round(number * 100);
}

function normalizeCommand(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isDaleCommand(value) {
  const normalized = normalizeCommand(value);
  return normalized === 'dale' || normalized === '#dale' || normalized === '# dale';
}

function extractPayload(input = {}) {
  if (typeof input.pedido_json === 'string') {
    return safeJsonParse(input.pedido_json, {});
  }
  if (input.pedido_json && typeof input.pedido_json === 'object') {
    return input.pedido_json;
  }
  if (typeof input.pedido === 'string') {
    return safeJsonParse(input.pedido, {});
  }
  return input.pedido || input.order || input;
}

function normalizeMessages(input) {
  const messages = Array.isArray(input) ? input : [];
  return messages
    .map((message) => ({
      id: cleanText(message.id || message.whatsapp_message_id || ''),
      direccion: cleanText(message.direccion || message.direction || 'cliente').toLowerCase(),
      tipo: cleanText(message.tipo || message.type || 'text').toLowerCase(),
      contenido: cleanText(message.contenido || message.text || message.body || ''),
      payload: message.payload || message,
    }))
    .filter((message) => message.contenido || message.id);
}

function commandWasSentByOperator({ comando = '', mensajes = [] } = {}) {
  if (isDaleCommand(comando)) return true;
  return normalizeMessages(mensajes).some((message) => {
    const direction = message.direccion;
    const isOperator = ['local', 'operador', 'operator', 'out', 'outbound', 'sent'].includes(
      direction
    );
    return isOperator && isDaleCommand(message.contenido);
  });
}

function upsertConversation(db, { telefono, nombre = '', estado = 'copiloto' }) {
  const phone = normalizePhone(telefono);
  if (!phone) throw new Error('Falta telefono');

  const existing = db
    .prepare('SELECT * FROM whatsapp_conversaciones WHERE telefono = ?')
    .get(phone);
  if (existing) {
    db.prepare(
      `
      UPDATE whatsapp_conversaciones
      SET nombre = COALESCE(NULLIF(?, ''), nombre),
          ultimo_estado = ?,
          bot_silenciado = 1,
          ultimo_mensaje_en = CURRENT_TIMESTAMP,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(cleanText(nombre), estado, existing.id);
    return db.prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?').get(existing.id);
  }

  const result = db
    .prepare(
      `
      INSERT INTO whatsapp_conversaciones (
        telefono, nombre, ultimo_estado, bot_silenciado, ultimo_mensaje_en, creado_en, actualizado_en
      ) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `
    )
    .run(phone, cleanText(nombre), estado);

  return db
    .prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?')
    .get(result.lastInsertRowid);
}

function registerMessages(db, conversationId, telefono, mensajes = []) {
  const normalized = normalizeMessages(mensajes);
  const hasMessageIdColumn = Boolean(
    db
      .prepare('PRAGMA table_info(whatsapp_mensajes)')
      .all()
      .find((column) => column.name === 'whatsapp_message_id')
  );
  const insert = hasMessageIdColumn
    ? db.prepare(
        `
        INSERT OR IGNORE INTO whatsapp_mensajes (
          conversacion_id, telefono, direccion, tipo, contenido, payload, whatsapp_message_id, creado_en
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      )
    : null;

  const insertLegacy = !hasMessageIdColumn
    ? db.prepare(
        `
        INSERT INTO whatsapp_mensajes (
          conversacion_id, telefono, direccion, tipo, contenido, payload, creado_en
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      )
    : null;

  const transaction = db.transaction(() => {
    normalized.forEach((message) => {
      const args = [
        conversationId,
        telefono,
        message.direccion || 'cliente',
        message.tipo || 'text',
        message.contenido || '',
        safeJsonStringify(message.payload, {}),
      ];
      if (hasMessageIdColumn) {
        insert.run(...args, message.id || '');
      } else {
        insertLegacy.run(...args);
      }
    });
  });
  transaction();

  return normalized.length;
}

function hydrateDraft(db, draft) {
  if (!draft) return null;
  const items = db
    .prepare('SELECT * FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ? ORDER BY id ASC')
    .all(draft.id)
    .map((item) => ({
      ...item,
      variantes: safeJsonParse(item.variantes, {}),
      extras: safeJsonParse(item.extras, []),
    }));
  return {
    ...draft,
    items,
  };
}

function listDrafts(db, { estado = 'abierto', limit = 100 } = {}) {
  const params = [];
  let query = `
    SELECT d.*, c.nombre AS conversacion_nombre, c.ultimo_estado, c.actualizado_en AS conversacion_actualizada_en
    FROM whatsapp_pedidos_borrador d
    LEFT JOIN whatsapp_conversaciones c ON c.id = d.conversacion_id
    WHERE 1 = 1
  `;

  if (estado && estado !== 'todos') {
    query += ' AND d.estado = ?';
    params.push(estado);
  }

  query += ' ORDER BY datetime(d.actualizado_en) DESC, d.id DESC LIMIT ?';
  params.push(Math.min(200, Math.max(1, Number(limit) || 100)));

  return db
    .prepare(query)
    .all(...params)
    .map((draft) => hydrateDraft(db, draft));
}

function getDraft(db, draftId) {
  const draft = db
    .prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?')
    .get(Number(draftId));
  return hydrateDraft(db, draft);
}

function createDraftFromCopilot(db, input = {}) {
  const telefono = normalizePhone(input.telefono || input.cliente_telefono || input.from);
  const nombre = cleanText(input.nombre || input.cliente_nombre || '');
  const mensajes = normalizeMessages(input.mensajes || input.messages || []);

  if (!commandWasSentByOperator({ comando: input.comando || input.command, mensajes })) {
    return {
      ok: true,
      ignored: true,
      reason: 'sin_comando_dale',
      message: 'No se detecto #dale escrito por el operador.',
    };
  }

  const payload = extractPayload(input);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) {
    const conversation = upsertConversation(db, {
      telefono,
      nombre: nombre || payload?.cliente_nombre || '',
      estado: 'esperando_resumen_ia',
    });
    registerMessages(db, conversation.id, conversation.telefono, mensajes);
    return {
      ok: false,
      needs_ai_payload: true,
      error: 'Falta pedido_json con items para crear el borrador.',
      comando: '#dale',
      instruction:
        'Cuando detectes #dale, resume la conversacion y envia pedido_json con cliente_nombre, cliente_telefono, cliente_direccion, tipo_entrega, metodo_pago, notas e items.',
      conversacion: conversation,
    };
  }

  const conversation = upsertConversation(db, {
    telefono: telefono || payload?.cliente_telefono,
    nombre: nombre || payload?.cliente_nombre,
    estado: 'borrador_generado',
  });
  registerMessages(db, conversation.id, conversation.telefono, mensajes);

  const enrichedItems = enrichOrderItemsWithCatalog(db, items);
  const subtotal = enrichedItems.reduce(
    (sum, item) => sum + Number(item.precio_unitario || 0) * Number(item.cantidad || 1),
    0
  );
  let costoEnvio = moneyToStorage(payload?.costo_envio || 0);
  let deliveryZona = cleanText(payload?.delivery_zona || '');
  let tiempoEstimadoMin = Number(payload?.tiempo_estimado_min || 0);
  if (!costoEnvio && cleanText(payload?.tipo_entrega || 'delivery') === 'delivery') {
    try {
      const quote = getDeliveryInfo(db, payload?.cliente_direccion || '');
      if (quote?.available) {
        costoEnvio = Number(quote.costo_envio || 0);
        deliveryZona = cleanText(quote.zona || quote.zone_name || '');
        tiempoEstimadoMin = Number(quote.tiempo_estimado_min || tiempoEstimadoMin || 0);
      }
    } catch {}
  }
  const descuento = moneyToStorage(payload?.descuento || 0);
  const total = Math.max(0, subtotal + costoEnvio - descuento);

  const transaction = db.transaction(() => {
    db.prepare(
      `
      UPDATE whatsapp_pedidos_borrador
      SET estado = 'reemplazado', actualizado_en = CURRENT_TIMESTAMP
      WHERE conversacion_id = ? AND estado = 'abierto'
    `
    ).run(conversation.id);

    const result = db
      .prepare(
        `
        INSERT INTO whatsapp_pedidos_borrador (
          conversacion_id, telefono, cliente_nombre, cliente_direccion, tipo_entrega,
          metodo_pago, notas, estado, subtotal, costo_envio, total, delivery_zona,
          tiempo_estimado_min, creado_en, actualizado_en
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'abierto', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `
      )
      .run(
        conversation.id,
        conversation.telefono,
        cleanText(payload?.cliente_nombre || nombre || conversation.nombre || ''),
        cleanText(payload?.cliente_direccion || ''),
        cleanText(payload?.tipo_entrega || 'delivery') || 'delivery',
        cleanText(payload?.metodo_pago || 'efectivo') || 'efectivo',
        cleanText(payload?.notas || input.resumen || ''),
        subtotal,
        costoEnvio,
        total,
        deliveryZona,
        tiempoEstimadoMin
      );

    const draftId = Number(result.lastInsertRowid);
    const insertItem = db.prepare(
      `
      INSERT INTO whatsapp_pedidos_borrador_items (
        borrador_id, producto_id, nombre, cantidad, precio_unitario, descripcion, variantes, extras, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
    );

    enrichedItems.forEach((item) => {
      insertItem.run(
        draftId,
        item.producto_id || null,
        cleanText(item.nombre || ''),
        Number(item.cantidad || 1),
        Number(item.precio_unitario || 0),
        cleanText(item.descripcion || ''),
        safeJsonStringify(item.variantes || {}, {}),
        safeJsonStringify(item.extras || [], [])
      );
    });

    return draftId;
  });

  const draftId = transaction();
  return {
    ok: true,
    ignored: false,
    comando: '#dale',
    conversacion: conversation,
    borrador: getDraft(db, draftId),
  };
}

async function confirmDraft(db, draftId) {
  const draft = getDraft(db, draftId);
  if (!draft) throw new Error('Borrador no encontrado');
  if (draft.estado !== 'abierto') throw new Error('Este borrador ya no esta abierto');
  if (!draft.items.length) throw new Error('El borrador no tiene items');

  const pedido = await createRealOrder(db, {
    cliente_nombre: draft.cliente_nombre,
    cliente_telefono: draft.telefono,
    cliente_direccion: draft.cliente_direccion,
    tipo_entrega: draft.tipo_entrega,
    metodo_pago: draft.metodo_pago || 'efectivo',
    notas: draft.notas,
    items: draft.items.map((item) => ({
      producto_id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      variantes: item.variantes || {},
      extras: item.extras || [],
      descripcion: item.descripcion || '',
    })),
    origen: 'whatsapp',
  });

  const hasPedidoIdColumn = Boolean(
    db
      .prepare('PRAGMA table_info(whatsapp_pedidos_borrador)')
      .all()
      .find((column) => column.name === 'pedido_id')
  );

  if (hasPedidoIdColumn) {
    db.prepare(
      `
      UPDATE whatsapp_pedidos_borrador
      SET estado = 'confirmado', pedido_id = ?, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(pedido.id, draft.id);
  } else {
    db.prepare(
      `
      UPDATE whatsapp_pedidos_borrador
      SET estado = 'confirmado', actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(draft.id);
  }

  db.prepare(
    `
    UPDATE whatsapp_conversaciones
    SET ultimo_estado = 'pedido_confirmado', actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(draft.conversacion_id);

  return {
    pedido,
    borrador: getDraft(db, draft.id),
  };
}

function discardDraft(db, draftId) {
  const draft = getDraft(db, draftId);
  if (!draft) throw new Error('Borrador no encontrado');
  if (draft.estado !== 'abierto') throw new Error('Este borrador ya no esta abierto');

  db.prepare(
    `
    UPDATE whatsapp_pedidos_borrador
    SET estado = 'descartado', actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(draft.id);

  return getDraft(db, draft.id);
}

module.exports = {
  isDaleCommand,
  normalizePhone,
  createDraftFromCopilot,
  listDrafts,
  getDraft,
  confirmDraft,
  discardDraft,
};
