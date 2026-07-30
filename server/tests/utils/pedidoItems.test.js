const assert = require('assert');
const { scalePedidoItemsToStorage } = require('../../utils/pedidoItems');

function testScalePedidoItemsToStorage() {
  const [item] = scalePedidoItemsToStorage([
    {
      producto_id: 1,
      nombre: 'Costillita de cerdo al horno con papas',
      cantidad: 1,
      precio_unitario: 5000,
      subtotal: 5000,
      variantes: {
        Presentacion: {
          nombre: 'Unica',
          precio_extra: 0,
        },
      },
      extras: [{ nombre: 'Cheddar', precio: 1000 }],
    },
  ]);

  assert.strictEqual(item.cantidad, 1);
  assert.strictEqual(item.precio_unitario, 500000);
  assert.strictEqual(item.subtotal, 500000);
  assert.strictEqual(item.extras[0].precio, 100000);
  console.log('  ✓ scalePedidoItemsToStorage convierte importes a centavos');
}

function run() {
  console.log('\n🧪 Tests de pedidoItems.js');
  testScalePedidoItemsToStorage();
  console.log('✅ Todos los tests de pedidoItems pasaron\n');
}

run();
