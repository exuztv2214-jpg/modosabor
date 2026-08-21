const assert = require('assert');
const db = require('../../db');
const { replacePedidoItems, scalePedidoItemsToStorage } = require('../../utils/pedidoItems');

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

function testReplacePedidoItemsGuardaTodosLosCampos() {
  const pedidoId = db
    .prepare(
      "INSERT INTO pedidos (numero, items, subtotal, total) VALUES (999998, '[]', 500000, 500000)"
    )
    .run().lastInsertRowid;

  try {
    replacePedidoItems(db, pedidoId, [
      {
        producto_id: null,
        nombre: 'Renglón de prueba',
        cantidad: 1,
        precio_unitario: 500000,
        subtotal: 500000,
        variantes: {},
        extras: [],
        descripcion: 'Sin agregados',
        descuento_item: 0,
        descuento_motivo: '',
      },
    ]);

    const item = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').get(pedidoId);
    assert.ok(item, 'el renglón del pedido debe guardarse');
    assert.strictEqual(item.nombre, 'Renglón de prueba');
    assert.strictEqual(item.subtotal, 500000);
    console.log('  ✓ replacePedidoItems guarda las 14 columnas sin desfasar valores');
  } finally {
    db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedidoId);
  }
}

function run() {
  console.log('\n🧪 Tests de pedidoItems.js');
  testScalePedidoItemsToStorage();
  testReplacePedidoItemsGuardaTodosLosCampos();
  console.log('✅ Todos los tests de pedidoItems pasaron\n');
}

run();
