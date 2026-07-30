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

function resolveInitialPagoEstado({
  metodoPago = 'efectivo',
  origen = 'web',
  pagoEstado = undefined,
} = {}) {
  if (pagoEstado !== undefined && String(pagoEstado || '').trim() !== '') {
    return normalizePagoEstado(pagoEstado, { metodoPago, origen });
  }

  const normalizedMethod = normalizeMetodoPago(metodoPago);
  const normalizedOrigin = String(origen || 'web')
    .trim()
    .toLowerCase();

  if (normalizedMethod === 'mercadopago') return 'pendiente';
  if (INTERNAL_ORIGINS.has(normalizedOrigin)) return 'pagado';
  return 'pendiente';
}

function normalizePagoEstado(value, { metodoPago = 'efectivo', origen = 'web' } = {}) {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase();
  const normalizedMethod = normalizeMetodoPago(metodoPago);

  if (MISSING_STATUSES.has(normalizedValue)) {
    return resolveInitialPagoEstado({ metodoPago: normalizedMethod, origen });
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
  return isPagoPendiente(pedido.pago_estado, {
    metodoPago,
    origen: pedido.origen,
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
