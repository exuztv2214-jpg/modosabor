const defaultDb = require('../db');
const { restoreInventoryForPedido } = require('../utils/inventory');
const { PedidoState, canTransition } = require('../utils/pedidoStateMachine');
const { getLastOrderByPhone } = require('../utils/systemClient');
const { logAudit } = require('../utils/audit');
const { registrarEvento } = require('./pedidoTrazabilidad');

/**
 * Cancelar el pedido propio desde WhatsApp.
 *
 * ── Por qué hasta acá y no más ─────────────────────────────────────────────
 *
 * Cancelar es la única herramienta del cliente que toca un pedido que ya
 * existe: devuelve stock, saca plata del día y, si la cocina arrancó, tira
 * comida hecha. Por eso no alcanza con que el modelo decida que el cliente
 * quiere cancelar.
 *
 * El corte es el estado, no el reloj: mientras el pedido está `nuevo` o
 * `confirmado` nadie tocó una sartén todavía, y cancelar es gratis para el
 * local. Desde `preparando` en adelante ya hay comida en curso: eso lo decide
 * una persona, no la IA, así que la herramienta se niega y deriva.
 *
 * ── Lo que hace igual que el panel ─────────────────────────────────────────
 *
 * Devuelve el inventario, deja el motivo, registra la auditoría y la traza de
 * tiempos. Si esto se hiciera "más simple" que el panel, tendríamos dos formas
 * distintas de cancelar y los reportes dejarían de cerrar.
 */

const ESTADOS_QUE_PUEDE_CANCELAR_EL_CLIENTE = [PedidoState.NUEVO, PedidoState.CONFIRMADO];

function cancelarPedidoDeCliente(db, telefono, { motivo = '', mensajeId = '' } = {}) {
  const base = db || defaultDb;
  const ultimo = getLastOrderByPhone(base, telefono);
  if (!ultimo) throw new Error('No encontré un pedido tuyo para cancelar');

  const pedido = base.prepare('SELECT * FROM pedidos WHERE id = ?').get(ultimo.id);
  if (!pedido) throw new Error('No encontré un pedido tuyo para cancelar');

  if (pedido.estado === PedidoState.CANCELADO) {
    return { ok: true, yaEstaba: true, numero: pedido.numero, estado: pedido.estado };
  }

  if (!ESTADOS_QUE_PUEDE_CANCELAR_EL_CLIENTE.includes(pedido.estado)) {
    const error = new Error(
      `El pedido ya está en preparación (${pedido.estado}); esto lo tiene que resolver una persona del local`
    );
    error.requiereHumano = true;
    throw error;
  }

  if (!canTransition(pedido.estado, PedidoState.CANCELADO)) {
    const error = new Error('Ese pedido ya no se puede cancelar');
    error.requiereHumano = true;
    throw error;
  }

  const motivoLimpio =
    String(motivo || '')
      .trim()
      .slice(0, 300) || 'El cliente canceló por WhatsApp';

  const administraTransaccion = !base.inTransaction;
  try {
    if (administraTransaccion) base.exec('BEGIN IMMEDIATE');
    base
      .prepare(
        `UPDATE pedidos
            SET estado = ?, motivo_cancelacion = ?, actualizado_en = CURRENT_TIMESTAMP
          WHERE id = ? AND estado = ?`
      )
      .run(PedidoState.CANCELADO, motivoLimpio, pedido.id, pedido.estado);
    restoreInventoryForPedido(base, pedido, { motivo: 'Cancelacion por WhatsApp' });
    if (administraTransaccion) base.exec('COMMIT');
  } catch (error) {
    if (administraTransaccion) {
      try {
        base.exec('ROLLBACK');
      } catch {}
    }
    throw error;
  }

  // La auditoría y la traza van fuera de la transacción: son registros, y que
  // uno falle no puede dejar un pedido cancelado a medias.
  try {
    logAudit(base, {
      modulo: 'pedidos',
      accion: 'cambiar_estado',
      entidad: 'pedido',
      entidad_id: pedido.id,
      actor_id: null,
      actor_nombre: 'Chispita (WhatsApp)',
      detalle: {
        numero: pedido.numero,
        desde: pedido.estado,
        hacia: PedidoState.CANCELADO,
        motivo_cancelacion: motivoLimpio,
        mensaje_id: String(mensajeId || ''),
      },
    });
    registrarEvento({
      pedidoId: pedido.id,
      estado: PedidoState.CANCELADO,
      estadoAnterior: pedido.estado,
      actorTipo: 'ia',
      actorNombre: 'Chispita (WhatsApp)',
    });
  } catch {}

  return { ok: true, numero: pedido.numero, estado: PedidoState.CANCELADO };
}

module.exports = { cancelarPedidoDeCliente, ESTADOS_QUE_PUEDE_CANCELAR_EL_CLIENTE };
