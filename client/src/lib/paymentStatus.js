export function normalizeMetodoPago(value) {
  return (
    String(value || 'efectivo')
      .trim()
      .toLowerCase() || 'efectivo'
  );
}

export function normalizePagoEstado(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['pagado', 'paid', 'approved'].includes(normalized)) return 'pagado';
  if (['rechazado', 'rejected', 'cancelled', 'canceled', 'denied', 'failed'].includes(normalized))
    return 'rechazado';
  if (['devuelto', 'refund', 'refunded', 'charged_back'].includes(normalized)) return 'devuelto';
  return 'pendiente';
}

export function isPagoPagado(value) {
  return normalizePagoEstado(value) === 'pagado';
}

export function paymentStatusLabel(value) {
  const normalized = normalizePagoEstado(value);
  if (normalized === 'pagado') return 'Cobrado';
  if (normalized === 'rechazado') return 'Rechazado';
  if (normalized === 'devuelto') return 'Devuelto';
  return 'Pendiente';
}

export function paymentStatusTone(value) {
  const normalized = normalizePagoEstado(value);
  if (normalized === 'pagado') return 'bg-success-50 text-success-700';
  if (normalized === 'rechazado' || normalized === 'devuelto')
    return 'bg-danger-50 text-danger-700';
  return 'bg-warning-50 text-warning-700';
}

export function paymentMethodLabel(value) {
  const normalized = normalizeMetodoPago(value);
  const labels = {
    efectivo: 'Efectivo',
    mercadopago: 'Mercado Pago',
    transferencia: 'Transferencia',
    modo: 'Modo',
    uala: 'Ualá',
    // El TPV permite cobrar en mixto pero no estaba en la tabla, asi que en
    // el tablero y los reportes aparecia como "mixto" en minuscula suelta.
    mixto: 'Pago mixto',
    // debito/credito ya no se ofrecen al cobrar, pero quedan pedidos viejos
    // guardados con esos valores y hay que saber mostrarlos.
    debito: 'Débito',
    credito: 'Crédito',
  };
  return labels[normalized] || normalized;
}
