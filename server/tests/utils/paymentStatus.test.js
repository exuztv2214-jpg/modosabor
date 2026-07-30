const assert = require('assert');
const {
  normalizeMetodoPago,
  normalizePagoEstado,
  resolveInitialPagoEstado,
  isMetodoEfectivo,
  isMetodoDigital,
  isPagoPagado,
  isPagoPendiente,
  shouldAutoSettleOnEntrega,
} = require('../../utils/paymentStatus');

function testNormalizeMetodoPago() {
  assert.strictEqual(normalizeMetodoPago('  Efectivo  '), 'efectivo');
  assert.strictEqual(normalizeMetodoPago('mercadopago'), 'mercadopago');
  assert.strictEqual(normalizeMetodoPago('MERCADO_PAGO'), 'mercado_pago');
  assert.strictEqual(normalizeMetodoPago(null), 'efectivo');
  assert.strictEqual(normalizeMetodoPago(''), 'efectivo');
  console.log('  ✓ normalizeMetodoPago funciona correctamente');
  assert.strictEqual(normalizeMetodoPago(null), 'efectivo');
  assert.strictEqual(normalizeMetodoPago(''), 'efectivo');
  console.log('  ✓ normalizeMetodoPago funciona correctamente');
}

function testNormalizePagoEstado() {
  assert.strictEqual(normalizePagoEstado('pagado'), 'pagado');
  assert.strictEqual(normalizePagoEstado('approved'), 'pagado');
  assert.strictEqual(normalizePagoEstado('pendiente'), 'pendiente');
  assert.strictEqual(normalizePagoEstado('pending'), 'pendiente');
  assert.strictEqual(normalizePagoEstado('rechazado'), 'rechazado');
  assert.strictEqual(normalizePagoEstado('rejected'), 'rechazado');
  assert.strictEqual(normalizePagoEstado('devuelto'), 'devuelto');
  assert.strictEqual(normalizePagoEstado('refunded'), 'devuelto');
  console.log('  ✓ normalizePagoEstado funciona correctamente');
}

function testResolveInitialPagoEstado() {
  assert.strictEqual(resolveInitialPagoEstado({ metodoPago: 'efectivo', origen: 'tpv' }), 'pagado');
  assert.strictEqual(
    resolveInitialPagoEstado({ metodoPago: 'efectivo', origen: 'web' }),
    'pendiente'
  );
  assert.strictEqual(
    resolveInitialPagoEstado({ metodoPago: 'mercadopago', origen: 'web' }),
    'pendiente'
  );
  assert.strictEqual(
    resolveInitialPagoEstado({ metodoPago: 'efectivo', origen: 'tpv', pagoEstado: 'pagado' }),
    'pagado'
  );
  console.log('  ✓ resolveInitialPagoEstado funciona correctamente');
}

function testIsMetodoEfectivo() {
  assert.strictEqual(isMetodoEfectivo('efectivo'), true);
  assert.strictEqual(isMetodoEfectivo('mercadopago'), false);
  console.log('  ✓ isMetodoEfectivo funciona correctamente');
}

function testIsMetodoDigital() {
  assert.strictEqual(isMetodoDigital('mercadopago'), true);
  assert.strictEqual(isMetodoDigital('efectivo'), false);
  console.log('  ✓ isMetodoDigital funciona correctamente');
}

function testIsPagoPagado() {
  assert.strictEqual(isPagoPagado('pagado'), true);
  assert.strictEqual(isPagoPagado('pendiente'), false);
  console.log('  ✓ isPagoPagado funciona correctamente');
}

function testIsPagoPendiente() {
  assert.strictEqual(isPagoPendiente('pendiente'), true);
  assert.strictEqual(isPagoPendiente('pagado'), false);
  console.log('  ✓ isPagoPendiente funciona correctamente');
}

function testShouldAutoSettleOnEntrega() {
  assert.strictEqual(
    shouldAutoSettleOnEntrega({ metodo_pago: 'efectivo', pago_estado: 'pendiente', origen: 'web' }),
    true
  );
  assert.strictEqual(
    shouldAutoSettleOnEntrega({
      metodo_pago: 'mercadopago',
      pago_estado: 'pendiente',
      origen: 'web',
    }),
    false
  );
  assert.strictEqual(
    shouldAutoSettleOnEntrega({ metodo_pago: 'efectivo', pago_estado: 'pagado', origen: 'web' }),
    false
  );
  console.log('  ✓ shouldAutoSettleOnEntrega funciona correctamente');
}

function run() {
  console.log('\n🧪 Tests de paymentStatus.js');
  testNormalizeMetodoPago();
  testNormalizePagoEstado();
  testResolveInitialPagoEstado();
  testIsMetodoEfectivo();
  testIsMetodoDigital();
  testIsPagoPagado();
  testIsPagoPendiente();
  testShouldAutoSettleOnEntrega();
  console.log('✅ Todos los tests de paymentStatus pasaron\n');
}

run();
