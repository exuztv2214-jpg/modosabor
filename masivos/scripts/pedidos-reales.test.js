const assert = require('node:assert/strict');
const { nacionalWhatsApp, formasPedido, cruzarPedidos } = require('../pedidos-reales');

assert.equal(nacionalWhatsApp('5493863412345'), '3863412345');
assert.equal(nacionalWhatsApp('543863412345'), '3863412345');
assert.equal(nacionalWhatsApp('5215512345678'), '', 'otros países no se cruzan');
assert.equal(nacionalWhatsApp(''), '');

assert.deepEqual(formasPedido('3863412345').candidatos, ['3863412345']);
assert.deepEqual(formasPedido('03863-15-412345').candidatos, ['3863412345']);
assert.deepEqual(formasPedido('+54 9 3863 41-2345').candidatos, ['3863412345']);
assert.deepEqual(formasPedido('0381 15 555-1234').candidatos, ['3815551234']);
assert.equal(formasPedido('412345').sufijo, '412345', 'número local sin característica');

const contactos = [
  { numero: 'ana@lid', telefono: '5493863412345' },
  { numero: 'beto@lid', telefono: '5493815551234' },
  { numero: 'carla@lid', telefono: '5493863998877' },
  { numero: 'dani@lid', telefono: '5491166998877' },
  { numero: 'sin-tel@lid' },
];
const cruce = cruzarPedidos(contactos, [
  { telefono: '3863412345', pedidos: 2, ultimoPedido: '2026-10-01' },
  { telefono: '03863-15-412345', pedidos: 1, ultimoPedido: '2026-10-07' },
  { telefono: '0381 15 555-1234', pedidos: 4, ultimoPedido: '2026-09-01' },
  { telefono: '998877', pedidos: 9, ultimoPedido: '2026-10-07' },
  { telefono: '123', pedidos: 3, ultimoPedido: '2026-10-07' },
]);

assert.deepEqual(
  cruce.get('ana@lid'),
  { pedidos: 3, ultimoPedido: '2026-10-07' },
  'suma las distintas formas de escribir el mismo teléfono'
);
assert.deepEqual(cruce.get('beto@lid'), { pedidos: 4, ultimoPedido: '2026-09-01' });
assert.equal(cruce.has('carla@lid'), false, 'un número local ambiguo no se asigna');
assert.equal(cruce.has('dani@lid'), false);
assert.equal(cruce.size, 2);

console.log('pedidos reales: OK');
