const express = require('express');

const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { logAudit, actorFromRequest } = require('../utils/audit');
const {
  saldoDeCliente,
  puedeFiar,
  anotarConsumo,
  registrarPago,
  deudores,
} = require('../utils/cuentaCorriente');

/**
 * Cuenta corriente de clientes.
 *
 * La lógica vive en `utils/cuentaCorriente.js`; acá sólo están las rutas.
 */

/** Quiénes deben, ordenados por cuánto. */
router.get('/', auth, requirePermission('clientes.view'), (_req, res) => {
  const lista = deudores(db);
  res.json({
    clientes: lista,
    total_adeudado: lista.reduce((acc, cliente) => acc + Number(cliente.saldo || 0), 0),
  });
});

/** El detalle de un cliente: saldo y todos sus movimientos. */
router.get('/:clienteId', auth, requirePermission('clientes.view'), (req, res) => {
  const cliente = db
    .prepare('SELECT id, nombre, telefono, limite_credito FROM clientes WHERE id = ?')
    .get(req.params.clienteId);
  if (!cliente) return res.status(404).json({ error: 'No existe ese cliente' });

  const movimientos = db
    .prepare(
      `SELECT m.*, p.numero AS pedido_numero
         FROM cliente_cuenta_movimientos m
         LEFT JOIN pedidos p ON p.id = m.pedido_id
        WHERE m.cliente_id = ?
        ORDER BY m.creado_en DESC, m.id DESC`
    )
    .all(cliente.id);

  const saldo = saldoDeCliente(db, cliente.id);
  res.json({
    ...cliente,
    saldo,
    disponible: Math.max(0, Number(cliente.limite_credito || 0) - saldo),
    movimientos,
  });
});

/** Habilitar o cambiar el límite. Cero deshabilita la cuenta. */
router.put('/:clienteId/limite', auth, requirePermission('clientes.edit'), (req, res) => {
  const cliente = db
    .prepare('SELECT id, nombre, limite_credito FROM clientes WHERE id = ?')
    .get(req.params.clienteId);
  if (!cliente) return res.status(404).json({ error: 'No existe ese cliente' });

  const limite = Math.round(Number(req.body?.limite_credito || 0));
  if (!Number.isFinite(limite) || limite < 0) {
    return res.status(400).json({ error: 'El límite no puede ser negativo' });
  }

  /*
    Bajar el límite por debajo de lo que ya debe se permite: puede ser
    justamente la reacción a que alguien se pasó. Pero se avisa, porque a
    partir de ahí no va a poder consumir hasta ponerse al día.
  */
  const saldo = saldoDeCliente(db, cliente.id);
  db.prepare('UPDATE clientes SET limite_credito = ? WHERE id = ?').run(limite, cliente.id);

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'clientes',
    accion: limite === 0 ? 'deshabilitar_cuenta_corriente' : 'cambiar_limite_credito',
    entidad: 'cliente',
    entidad_id: cliente.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { nombre: cliente.nombre, desde: cliente.limite_credito, hacia: limite, saldo },
  });

  res.json({
    limite_credito: limite,
    saldo,
    aviso:
      limite > 0 && saldo > limite
        ? `Ya debe más que el límite nuevo: no va a poder consumir hasta ponerse al día.`
        : '',
  });
});

/** Registrar que el cliente pagó parte o todo lo que debe. */
router.post('/:clienteId/pago', auth, requirePermission('caja.manage'), (req, res) => {
  const resultado = registrarPago(db, {
    clienteId: Number(req.params.clienteId),
    monto: req.body?.monto,
    nota: req.body?.nota,
    usuario: req.user,
  });
  if (!resultado.ok) {
    return res.status(400).json({ error: resultado.motivo, saldo: resultado.saldo });
  }

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'clientes',
    accion: 'cobrar_cuenta_corriente',
    entidad: 'cliente',
    entidad_id: Number(req.params.clienteId),
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { monto: Math.round(Number(req.body?.monto || 0)), saldo_despues: resultado.saldo },
  });

  res.json(resultado);
});

/**
 * Cargar un pedido a la cuenta.
 *
 * Va después de que el pedido existe y no en su creación: si algo falla acá, el
 * pedido igual entró a la cocina. Al revés —crear el pedido sólo si la cuenta
 * lo permite— dejaría al cliente esperando por un problema administrativo.
 */
router.post('/:clienteId/consumo', auth, requirePermission('pedidos.edit'), (req, res) => {
  const clienteId = Number(req.params.clienteId);
  const monto = Math.round(Number(req.body?.monto || 0));
  const pedidoId = Number(req.body?.pedido_id || 0) || null;

  const permiso = puedeFiar(db, clienteId, monto);
  if (!permiso.ok) return res.status(400).json({ error: permiso.motivo, saldo: permiso.saldo });

  const resultado = anotarConsumo(db, {
    clienteId,
    monto,
    pedidoId,
    nota: req.body?.nota,
    usuario: req.user,
  });

  if (resultado.duplicado) {
    // No es un error: es un reintento. Se devuelve el estado actual en vez de
    // fallar, para que quien reintenta no crea que algo salió mal.
    return res.json({ ya_estaba: true, saldo: saldoDeCliente(db, clienteId) });
  }

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'clientes',
    accion: 'fiar',
    entidad: 'cliente',
    entidad_id: clienteId,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { monto, pedido_id: pedidoId, saldo_despues: resultado.saldo },
  });

  res.json(resultado);
});

module.exports = router;
