const assert = require('assert');
const {
  HERRAMIENTAS_BASE,
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
assert.ok(
  HERRAMIENTAS_BASE.every(
    (h) => h.nombre && h.parametros && h.permiso && typeof h.ejecutar === 'function'
  )
);

console.log('registroHerramientas.test.js OK');
