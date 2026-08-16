/**
 * API exclusiva de la app nativa de Mozo.
 *
 * No reutiliza /pedidos/interno: ese endpoint es del TPV y admite precios
 * manuales y operaciones de caja. Acá el servidor compone el pedido desde el
 * catálogo y un mozo sólo puede trabajar las mesas que tiene asignadas.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { decorateProductsWithInventory } = require('../utils/inventory');
const {
  buildPedidoPayload,
  createPedidoWithInventory,
  getActiveCaja,
  getMesaPedidosAbiertos,
  hydratePedido,
} = require('../services/pedidoService');
const { getOperationalShiftContext } = require('../utils/operationalCaja');
const { emitNuevoPedido } = require('../utils/socketRooms');
const { logAudit, actorFromRequest } = require('../utils/audit');
const {
  puedeTocarMesaDeOtro,
  normalizarPin,
  pinValido,
  hashearPin,
  LARGO_PIN,
} = require('../utils/pinMozo');

router.use(auth, requirePermission('mozo.use'));

function cleanText(value) {
  return String(value || '').trim();
}

function getConfig() {
  return db
    .prepare('SELECT clave, valor FROM configuracion')
    .all()
    .reduce((result, row) => ({ ...result, [row.clave]: row.valor }), {});
}

function mesasConfiguradas(config) {
  const cantidad = Math.max(1, Number(config.mesas_cantidad) || 12);
  const custom = cleanText(config.mesas_nombres)
    .split(/[\n,;]+/)
    .map(cleanText)
    .filter(Boolean);
  const base = custom.length
    ? custom
    : Array.from({ length: cantidad }, (_item, index) => String(index + 1));
  return [...new Set(base)];
}

function mesaValida(mesa, config) {
  return mesasConfiguradas(config).includes(mesa);
}

function pedidosAbiertosPorMesa() {
  return db
    .prepare(
      `
        SELECT mesa, COUNT(*) AS cantidad, MIN(creado_en) AS abierta_en
        FROM pedidos
        WHERE tipo_entrega = 'mesa'
          AND estado NOT IN ('entregado', 'cancelado')
          AND TRIM(COALESCE(mesa, '')) <> ''
        GROUP BY mesa
      `
    )
    .all()
    .reduce((result, row) => {
      result[String(row.mesa)] = {
        cantidad: Number(row.cantidad || 0),
        abierta_en: row.abierta_en,
      };
      return result;
    }, {});
}

function assignmentFor(mesa) {
  return db
    .prepare(
      `SELECT mesa, mozo_usuario_id, mozo_nombre, asignada_en, actualizada_en
       FROM mesas_asignaciones WHERE mesa = ?`
    )
    .get(mesa);
}

function requireOwnAssignment(req, res, mesa) {
  const assignment = assignmentFor(mesa);
  if (!assignment) {
    res.status(409).json({ error: 'Primero tomá esta mesa desde la app.' });
    return null;
  }

  /*
    La mesa de otro ya no es un 403 seco.

    Antes lo era, y en la práctica se destrabab por afuera: alguien entraba con
    el usuario del otro, o se cerraba la mesa desde el TPV a mano. Las dos son
    peores que el problema, porque además borran el rastro de quién hizo qué.

    Ahora hay una salida legítima: el PIN del mozo que la tomó, o un encargado.
    Y queda registrado con qué PIN se destrabó.
  */
  const permiso = puedeTocarMesaDeOtro(db, {
    usuario: req.user,
    duenoId: assignment.mozo_usuario_id,
    pin: req.body?.pin_mozo || req.query?.pin_mozo,
  });

  if (!permiso.ok) {
    res.status(403).json({ error: permiso.motivo, requiere_pin: permiso.requierePin === true });
    return null;
  }

  if (permiso.conPinDe || permiso.comoEncargado) {
    logAudit(db, {
      modulo: 'mozo',
      accion: 'trabajar_mesa_ajena',
      entidad: 'mesa',
      entidad_id: 0,
      actor_id: req.user?.id,
      actor_nombre: req.user?.nombre,
      detalle: {
        mesa,
        dueno: assignment.mozo_nombre,
        como: permiso.comoEncargado ? 'encargado' : `PIN de ${permiso.conPinDe}`,
      },
    });
  }

  return assignment;
}

function operationalStatus() {
  const config = getConfig();
  const turno = getOperationalShiftContext(config);
  const caja = getActiveCaja();
  const cajaCorrecta =
    caja &&
    String(caja.turno_id || '').trim() === String(turno.shiftId || '').trim() &&
    String(caja.fecha_operativa || '').trim() === String(turno.fechaOperativa || '').trim();
  return {
    config,
    abierto: Boolean(turno.abiertoAhora && cajaCorrecta),
    mensaje: !turno.abiertoAhora
      ? 'No hay un turno operativo abierto.'
      : !caja
        ? 'La caja está cerrada.'
        : !cajaCorrecta
          ? 'La caja abierta no corresponde al turno actual.'
          : '',
    turno: turno.shiftName,
  };
}

function serializeCatalogo() {
  const products = decorateProductsWithInventory(
    db,
    db
      .prepare(
        `SELECT p.*, c.nombre AS categoria_nombre, c.icono AS categoria_icono
         FROM productos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         WHERE p.activo = 1
         ORDER BY c.orden ASC, p.nombre ASC`
      )
      .all()
  );
  return products
    .filter((product) => Number(product.disponible_para_venta) !== 0)
    .map((product) => ({
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      precio: product.precio,
      categoria_id: product.categoria_id,
      categoria_nombre: product.categoria_nombre || 'Sin categoría',
      imagen: product.imagen,
      variantes: product.variantes,
      extras: product.extras,
      tiempo_preparacion: product.tiempo_preparacion,
    }));
}

/**
 * El mozo elige su propio PIN.
 *
 * Lo elige él y no el encargado: es lo que va a dictarle a un compañero cuando
 * tenga que irse antes, así que tiene que poder acordárselo. Un PIN asignado
 * por otro termina anotado en un papel al lado de la caja.
 *
 * Sólo puede cambiar el suyo. Para cambiar el de otro está el encargado, que
 * de todos modos no lo necesita: pasa sin PIN.
 */
router.put('/mi-pin', (req, res) => {
  const pin = normalizarPin(req.body?.pin);
  if (!pinValido(pin)) {
    return res.status(400).json({ error: `El PIN tiene que ser de ${LARGO_PIN} números` });
  }

  /*
    Cuatro dígitos repetidos o en fila —0000, 1234— no son un PIN: son el
    primero que prueba cualquiera. Se rechazan acá y no en la pantalla, porque
    la pantalla se puede saltear.
  */
  const todosIguales = new Set(pin).size === 1;
  const enFila = '0123456789'.includes(pin) || '9876543210'.includes(pin);
  if (todosIguales || enFila) {
    return res.status(400).json({ error: 'Elegí un PIN menos obvio que ese' });
  }

  db.prepare('UPDATE usuarios SET pin_mozo_hash = ? WHERE id = ?').run(
    hashearPin(pin),
    req.user.id
  );

  logAudit(db, {
    modulo: 'mozo',
    accion: 'cambiar_pin',
    entidad: 'usuario',
    entidad_id: req.user.id,
    actor_id: req.user.id,
    actor_nombre: req.user.nombre,
    // El PIN no se guarda en la auditoría, obviamente. Sólo que se cambió.
    detalle: {},
  });

  res.json({ ok: true });
});

router.get('/estado', (req, res) => {
  const operation = operationalStatus();
  const ocupacion = pedidosAbiertosPorMesa();
  const assignments = db
    .prepare('SELECT mesa, mozo_usuario_id, mozo_nombre, asignada_en FROM mesas_asignaciones')
    .all()
    .reduce((result, row) => ({ ...result, [String(row.mesa)]: row }), {});

  const mesas = mesasConfiguradas(operation.config).map((mesa) => {
    const assignment = assignments[mesa] || null;
    const own = Number(assignment?.mozo_usuario_id) === Number(req.user.id);
    return {
      mesa,
      ocupada: Boolean(ocupacion[mesa]),
      pedidos_abiertos: ocupacion[mesa]?.cantidad || 0,
      abierta_en: ocupacion[mesa]?.abierta_en || null,
      asignada_a_mi: own,
      asignada: Boolean(assignment),
      disponible: !assignment && !ocupacion[mesa],
    };
  });

  res.json({
    usuario: { id: req.user.id, nombre: req.user.nombre },
    operacion: { abierto: operation.abierto, mensaje: operation.mensaje, turno: operation.turno },
    mesas,
  });
});

router.get('/catalogo', (_req, res) => {
  res.json({ productos: serializeCatalogo() });
});

router.post('/mesas/:mesa/tomar', (req, res) => {
  const mesa = cleanText(req.params.mesa);
  const operation = operationalStatus();
  if (!mesaValida(mesa, operation.config)) {
    return res.status(404).json({ error: 'Mesa no configurada.' });
  }
  if (!operation.abierto) return res.status(409).json({ error: operation.mensaje });

  const ocupacion = pedidosAbiertosPorMesa()[mesa];
  const existing = assignmentFor(mesa);
  if (existing && Number(existing.mozo_usuario_id) === Number(req.user.id)) {
    return res.json({ ok: true, mesa, asignada_a_mi: true, already_assigned: true });
  }
  if (existing) return res.status(409).json({ error: 'Esta mesa ya está asignada a otro mozo.' });
  if (ocupacion) {
    return res.status(409).json({
      error: 'Esta mesa ya tiene consumo abierto sin asignación. Pedí a Caja que la regularice.',
    });
  }

  try {
    db.prepare(
      `INSERT INTO mesas_asignaciones (mesa, mozo_usuario_id, mozo_nombre, asignada_en, actualizada_en)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).run(mesa, req.user.id, req.user.nombre);
  } catch {
    return res.status(409).json({ error: 'La mesa acaba de ser tomada por otro mozo.' });
  }

  logAudit(db, {
    modulo: 'mozo',
    accion: 'tomar_mesa',
    entidad: 'mesa',
    entidad_id: mesa,
    ...actorFromRequest(req),
  });
  return res.status(201).json({ ok: true, mesa, asignada_a_mi: true });
});

router.get('/mesas/:mesa', (req, res) => {
  const mesa = cleanText(req.params.mesa);
  const operation = operationalStatus();
  if (!mesaValida(mesa, operation.config)) {
    return res.status(404).json({ error: 'Mesa no configurada.' });
  }
  if (!requireOwnAssignment(req, res, mesa)) return undefined;
  return res.json({ mesa, pedidos: getMesaPedidosAbiertos(mesa).map(hydratePedido) });
});

router.post('/pedidos', async (req, res) => {
  const mesa = cleanText(req.body?.mesa);
  const operation = operationalStatus();
  if (!mesaValida(mesa, operation.config)) {
    return res.status(404).json({ error: 'Mesa no configurada.' });
  }
  if (!operation.abierto) return res.status(409).json({ error: operation.mensaje });
  if (!requireOwnAssignment(req, res, mesa)) return undefined;
  if (!Array.isArray(req.body?.items) || req.body.items.length === 0) {
    return res.status(400).json({ error: 'Agregá al menos un producto a la comanda.' });
  }
  const idempotencyKey = cleanText(req.body?.idempotency_key);
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'La comanda no tiene una clave de envío válida.' });
  }
  const previous = db
    .prepare('SELECT * FROM pedidos WHERE mozo_usuario_id = ? AND idempotency_key = ?')
    .get(req.user.id, idempotencyKey);
  if (previous) {
    return res.json({ ...hydratePedido(previous), duplicate: true });
  }

  try {
    const payload = await buildPedidoPayload(
      {
        items: req.body.items,
        mesa,
        tipo_entrega: 'mesa',
        origen: 'mozo',
        metodo_pago: 'efectivo',
        cliente_nombre: cleanText(req.body?.cliente_nombre),
        notas: cleanText(req.body?.notas),
        // La app de mozo no maneja descuentos, cupones ni puntos.
        descuento: 0,
        mozo_usuario_id: req.user.id,
        mozo_nombre: req.user.nombre,
        idempotency_key: idempotencyKey,
      },
      { forceServerPrices: true, config: operation.config }
    );
    // Estos campos no vienen del cliente: identifican al usuario autenticado
    // y permiten deduplicar un reintento offline de la misma comanda.
    payload.mozo_usuario_id = req.user.id;
    payload.mozo_nombre = req.user.nombre;
    payload.idempotency_key = idempotencyKey;
    const created = createPedidoWithInventory(payload);
    const pedido = hydratePedido(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(created.id));

    logAudit(db, {
      modulo: 'mozo',
      accion: 'crear_comanda',
      entidad: 'pedido',
      entidad_id: pedido.id,
      ...actorFromRequest(req),
      detalle: { numero: pedido.numero, mesa, items: pedido.items.length },
    });
    const io = req.app.get('io');
    if (io) emitNuevoPedido(io, pedido);
    return res.status(201).json(pedido);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo enviar la comanda.' });
  }
});

router.delete('/mesas/:mesa/asignacion', (req, res) => {
  const mesa = cleanText(req.params.mesa);
  const operation = operationalStatus();
  if (!mesaValida(mesa, operation.config)) {
    return res.status(404).json({ error: 'Mesa no configurada.' });
  }
  if (!requireOwnAssignment(req, res, mesa)) return undefined;
  if (getMesaPedidosAbiertos(mesa).length > 0) {
    return res.status(409).json({ error: 'No podés liberar una mesa con consumo abierto.' });
  }
  db.prepare('DELETE FROM mesas_asignaciones WHERE mesa = ? AND mozo_usuario_id = ?').run(
    mesa,
    req.user.id
  );
  logAudit(db, {
    modulo: 'mozo',
    accion: 'liberar_mesa',
    entidad: 'mesa',
    entidad_id: mesa,
    ...actorFromRequest(req),
  });
  return res.json({ ok: true, mesa });
});

module.exports = router;
