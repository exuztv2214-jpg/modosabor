const PAID_STATUSES = new Set(['pagado', 'paid', 'approved']);
const MISSING_STATUSES = new Set(['']);
const PENDING_STATUSES = new Set([
  'pendiente',
  'pending',
  'in_process',
  'authorized',
  'en_proceso',
]);
const REJECTED_STATUSES = new Set([
  'rechazado',
  'rejected',
  'cancelled',
  'canceled',
  'denied',
  'failed',
]);
const REFUNDED_STATUSES = new Set(['devuelto', 'refund', 'refunded', 'charged_back']);
const INTERNAL_ORIGINS = new Set(['tpv', 'interno', 'mesa', 'caja']);
const CASH_METHODS = new Set(['efectivo']);

/**
 * Tipos de entrega donde el pedido se despacha antes de que entre la plata.
 *
 * Es la distinción que hacen todos los sistemas del rubro. Fudo la resuelve
 * con dos modos separados: "cuentas abiertas por mesa" para el salón y
 * "Mostrador Express" para cobrar sin usar mesas. Toast usa tres estados de
 * comanda, y define la abierta como "check activo, sin pagos aplicados, con
 * saldo pendiente" — un pedido puede estar hecho, servido y comido sin tener
 * un solo peso aplicado encima.
 *
 * Acá pasa lo mismo por dos motivos distintos:
 *
 *   - `delivery`: la plata la cobra el repartidor en la puerta, cuarenta
 *     minutos después. El método que se eligió en el TPV es una suposición.
 *
 *   - `mesa`: el cliente pide, come y paga al final. La precuenta que imprime
 *     este mismo sistema es la prueba: se imprime justamente porque todavía
 *     no pagó.
 *
 * `retiro` no está acá a propósito. En Modo Sabor "retiro" es el mostrador:
 * el cliente compra, paga y se lo lleva. Ahí el cobro es simultáneo y marcarlo
 * pendiente obligaría a cerrar a mano cada venta del día.
 */
const COBRO_DIFERIDO = new Set(['delivery', 'mesa']);

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function normalizeMetodoPago(value) {
  return (
    String(value || 'efectivo')
      .trim()
      .toLowerCase() || 'efectivo'
  );
}

function isMetodoEfectivo(method) {
  return CASH_METHODS.has(normalizeMetodoPago(method));
}

function isMetodoDigital(method) {
  return !isMetodoEfectivo(method);
}

/**
 * Estado con el que nace el pago de un pedido.
 *
 * La regla vieja era "si lo cargó alguien del local, ya está cobrado". Para el
 * mostrador es cierto: se cobra y recién ahí se entrega el pedido.
 *
 * Para un delivery no. Esa plata está en el bolsillo del cliente, a cuarenta
 * minutos de ahí, y el método que se eligió en el TPV es una suposición: el
 * cliente muchas veces no dice cómo va a pagar hasta que el repartidor llega a
 * la puerta.
 *
 * Marcarlo cobrado desde el vamos tenía dos consecuencias, las dos molestas:
 *
 *   - El cierre de caja reparte efectivo contra digital según el método de
 *     cada pedido cobrado. Si la suposición salió mal, el reparto sale mal, y
 *     el efectivo que se le pide rendir al repartidor también.
 *
 *   - En la app del repartidor el selector de forma de pago aparece cuando el
 *     cobro figura pendiente. Como nunca lo estaba, el repartidor veía "Ya
 *     cobrado · Efectivo" y ningún botón para corregirlo. Sólo se le abría una
 *     ventana de cinco minutos después de marcar entregado, que en la práctica
 *     no llegaba a usar.
 *
 * Ahora un delivery interno nace pendiente, que es la verdad, y se salda solo
 * al entregarse con el método que el repartidor haya dejado puesto —eso ya lo
 * hacía `shouldAutoSettleOnEntrega`, no hubo que agregarlo—. Mostrador, mesa y
 * retiro siguen naciendo cobrados como antes.
 */
function resolveInitialPagoEstado({
  metodoPago = 'efectivo',
  origen = 'web',
  tipoEntrega = '',
  pagoEstado = undefined,
} = {}) {
  if (pagoEstado !== undefined && String(pagoEstado || '').trim() !== '') {
    return normalizePagoEstado(pagoEstado, { metodoPago, origen });
  }

  const normalizedMethod = normalizeMetodoPago(metodoPago);
  const normalizedOrigin = String(origen || 'web')
    .trim()
    .toLowerCase();
  const normalizedDelivery = String(tipoEntrega || '')
    .trim()
    .toLowerCase();

  if (normalizedMethod === 'mercadopago') return 'pendiente';
  if (COBRO_DIFERIDO.has(normalizedDelivery)) return 'pendiente';
  if (INTERNAL_ORIGINS.has(normalizedOrigin)) return 'pagado';
  return 'pendiente';
}

function normalizePagoEstado(
  value,
  { metodoPago = 'efectivo', origen = 'web', tipoEntrega = '' } = {}
) {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase();
  const normalizedMethod = normalizeMetodoPago(metodoPago);

  if (MISSING_STATUSES.has(normalizedValue)) {
    return resolveInitialPagoEstado({ metodoPago: normalizedMethod, origen, tipoEntrega });
  }
  if (PAID_STATUSES.has(normalizedValue)) return 'pagado';
  if (REJECTED_STATUSES.has(normalizedValue)) return 'rechazado';
  if (REFUNDED_STATUSES.has(normalizedValue)) return 'devuelto';
  if (PENDING_STATUSES.has(normalizedValue)) return 'pendiente';

  if (normalizedMethod === 'mercadopago') return 'pendiente';
  return 'pendiente';
}

function isPagoPagado(value, options = {}) {
  return normalizePagoEstado(value, options) === 'pagado';
}

function isPagoPendiente(value, options = {}) {
  return normalizePagoEstado(value, options) === 'pendiente';
}

function shouldAutoSettleOnEntrega(pedido) {
  if (!pedido) return false;
  const metodoPago = normalizeMetodoPago(pedido.metodo_pago);
  if (metodoPago === 'mercadopago') return false;
  /*
    Las mesas no se saldan al cerrarse.

    Para un delivery "entregado" y "cobrado" pasan en el mismo momento: el
    repartidor tiene la plata en la mano. Para una mesa no. Cerrar la mesa es
    una acción de servicio —se fueron, hay que liberarla— y el mozo la aprieta
    aunque el cobro lo haya hecho otro, o todavía no lo haya hecho nadie.

    Si se saldaba sola acá, el arreglo de más arriba no servía de nada: la
    mesa nacía pendiente, el mozo tocaba "Cerrar", y volvía a quedar cobrada
    con el método que se había adivinado en el TPV. El mismo error entrando
    por la puerta de atrás.

    El cobro de una mesa es explícito, con el botón de la pantalla de Mesas.
    Si nadie lo aprieta, la mesa queda pendiente y el cierre de caja la
    muestra: "hay $X en pedidos sin cobrar". Un pendiente visible es mejor
    que un cobrado inventado.
  */
  if (
    String(pedido.tipo_entrega || '')
      .trim()
      .toLowerCase() === 'mesa'
  )
    return false;
  /*
    Se pasa el tipo de entrega porque un pedido viejo puede tener la columna
    `pago_estado` vacía, y en ese caso el estado se deduce. Sin este dato un
    delivery del TPV se deducía como "ya cobrado" y no se saldaba al entregar:
    el cobro quedaba colgado justo en los pedidos que este cambio viene a
    arreglar.
  */
  return isPagoPendiente(pedido.pago_estado, {
    metodoPago,
    origen: pedido.origen,
    tipoEntrega: pedido.tipo_entrega,
  });
}

function getPedidoPaymentBreakdown(row = {}) {
  const total = Number(row.total || 0);
  const metodoPago = normalizeMetodoPago(row.metodo_pago);
  const parsedDetail = safeJsonParse(row.pago_detalle, null);
  const splitPayments = Array.isArray(parsedDetail?.split_payments)
    ? parsedDetail.split_payments
        .map((item) => ({
          metodo_pago: normalizeMetodoPago(item?.metodo || item?.metodo_pago || ''),
          monto: Number(item?.monto || 0),
        }))
        .filter((item) => item.metodo_pago && item.monto > 0)
    : [];

  if (splitPayments.length > 0) {
    return splitPayments;
  }

  return [{ metodo_pago: metodoPago, monto: total }];
}

function summarizePaymentRows(rows = []) {
  const byMethod = new Map();
  let totalCobrado = 0;
  let totalPendiente = 0;
  let efectivoCobrado = 0;
  let digitalesCobrados = 0;

  rows.forEach((row) => {
    const metodoPago = normalizeMetodoPago(row.metodo_pago);
    const pagoEstado = normalizePagoEstado(row.pago_estado, {
      metodoPago,
      origen: row.origen,
    });
    if (pagoEstado === 'pagado') {
      const breakdown = getPedidoPaymentBreakdown(row);
      breakdown.forEach((entry) => {
        const current = byMethod.get(entry.metodo_pago) || {
          metodo_pago: entry.metodo_pago,
          cantidad: 0,
          total: 0,
          cantidad_total: 0,
          total_total: 0,
          cantidad_pendiente: 0,
          total_pendiente: 0,
          cantidad_rechazada: 0,
          total_rechazado: 0,
        };

        current.cantidad_total += 1;
        current.total_total += Number(entry.monto || 0);
        current.cantidad += 1;
        current.total += Number(entry.monto || 0);
        byMethod.set(entry.metodo_pago, current);

        totalCobrado += Number(entry.monto || 0);
        if (isMetodoEfectivo(entry.metodo_pago)) efectivoCobrado += Number(entry.monto || 0);
        else digitalesCobrados += Number(entry.monto || 0);
      });
    } else if (pagoEstado === 'pendiente') {
      const total = Number(row.total || 0);
      const current = byMethod.get(metodoPago) || {
        metodo_pago: metodoPago,
        cantidad: 0,
        total: 0,
        cantidad_total: 0,
        total_total: 0,
        cantidad_pendiente: 0,
        total_pendiente: 0,
        cantidad_rechazada: 0,
        total_rechazado: 0,
      };
      current.cantidad_total += 1;
      current.total_total += total;
      current.cantidad_pendiente += 1;
      current.total_pendiente += total;
      totalPendiente += total;
      byMethod.set(metodoPago, current);
    } else if (pagoEstado === 'rechazado' || pagoEstado === 'devuelto') {
      const total = Number(row.total || 0);
      const current = byMethod.get(metodoPago) || {
        metodo_pago: metodoPago,
        cantidad: 0,
        total: 0,
        cantidad_total: 0,
        total_total: 0,
        cantidad_pendiente: 0,
        total_pendiente: 0,
        cantidad_rechazada: 0,
        total_rechazado: 0,
      };
      current.cantidad_total += 1;
      current.total_total += total;
      current.cantidad_rechazada += 1;
      current.total_rechazado += total;
      byMethod.set(metodoPago, current);
    }
  });

  return {
    totalCobrado,
    totalPendiente,
    efectivoCobrado,
    digitalesCobrados,
    byMethod: Array.from(byMethod.values()).sort(
      (a, b) =>
        b.total - a.total ||
        b.total_total - a.total_total ||
        a.metodo_pago.localeCompare(b.metodo_pago)
    ),
  };
}

module.exports = {
  normalizeMetodoPago,
  normalizePagoEstado,
  resolveInitialPagoEstado,
  isMetodoEfectivo,
  isMetodoDigital,
  isPagoPagado,
  isPagoPendiente,
  shouldAutoSettleOnEntrega,
  summarizePaymentRows,
  getPedidoPaymentBreakdown,
};
