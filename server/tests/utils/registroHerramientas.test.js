const assert = require('assert');
const {
  HERRAMIENTAS_BASE,
  esConfirmacionNatural,
  exigirConfirmacionPedido,
  pidioConfirmacionExplicita,
  telefonoSeguro,
  herramientasParaPerfil,
} = require('../../services/registroHerramientas');

const sinCrear = herramientasParaPerfil('cliente', {
  permisos: ['READ_MENU', 'READ_STOCK', 'READ_CUSTOMER', 'READ_ORDER'],
});
assert.ok(!sinCrear.some((h) => h.nombre === 'crear_pedido'));
assert.throws(
  () => telefonoSeguro({ telefono: '3815551111' }, { telefono: '3815552222' }),
  /otro cliente/
);
for (const confirmacion of [
  'sí',
  'sí dale',
  'confirmar',
  'confirmalo',
  'Si por fa',
  'confirmo',
  'dale',
  'ok',
  'de una',
  'mandalo',
]) {
  assert.strictEqual(esConfirmacionNatural(confirmacion), true, confirmacion);
}
for (const respuestaAmbigua of ['sí, pero sin cebolla', 'quiero una Pepsi', 'no', 'cuánto tarda']) {
  assert.strictEqual(esConfirmacionNatural(respuestaAmbigua), false, respuestaAmbigua);
}
assert.strictEqual(pidioConfirmacionExplicita('¿Confirmás la dirección?'), false);
assert.strictEqual(
  pidioConfirmacionExplicita(
    'Resumen del pedido: milanesa y Pepsi. Total $16.500. ¿Confirmás el pedido?'
  ),
  true
);
assert.strictEqual(
  pidioConfirmacionExplicita('¿Te la mando a tu dirección de siempre o me decís otra calle?'),
  false,
  'confirmar solamente la dirección no puede crear el pedido'
);
assert.doesNotThrow(() =>
  exigirConfirmacionPedido({
    mensajeActual: 'sí por favor',
    ultimoMensajeAsistente:
      'Resumen del pedido: milanesa y Pepsi. Dirección Las Piedras 415. Total $16.500. ¿Confirmás?',
  })
);
assert.throws(
  () =>
    exigirConfirmacionPedido({
      mensajeActual: 'sí por favor',
      ultimoMensajeAsistente: '¿La dirección Las Piedras 415 está bien?',
    }),
  /resumen completo/
);
assert.ok(
  HERRAMIENTAS_BASE.every(
    (h) => h.nombre && h.parametros && h.permiso && typeof h.ejecutar === 'function'
  )
);

console.log('registroHerramientas.test.js OK');
