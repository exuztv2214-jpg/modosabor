const assert = require('assert');
const { createPedidoSchema } = require('../../schemas');

function basePayload(overrides = {}) {
  return {
    cliente_nombre: 'Cliente Test',
    cliente_telefono: '3810000000',
    cliente_direccion: 'Direccion 123',
    subtotal: 6000,
    costo_envio: 0,
    descuento: 0,
    total: 6000,
    tipo_entrega: 'delivery',
    metodo_pago: 'efectivo',
    origen: 'web',
    ...overrides,
  };
}

function testAceptaItemsComoString() {
  assert.doesNotThrow(() =>
    createPedidoSchema.parse(
      basePayload({
        items: JSON.stringify([
          {
            producto_id: 1,
            nombre: 'Smash Simple',
            cantidad: 1,
            precio_unitario: 6000,
          },
        ]),
      })
    )
  );
  console.log('  ✓ createPedidoSchema acepta items serializados');
}

function testAceptaItemsComoArray() {
  assert.doesNotThrow(() =>
    createPedidoSchema.parse(
      basePayload({
        items: [
          {
            producto_id: 1,
            nombre: 'Smash Simple',
            cantidad: 1,
            precio_unitario: 6000,
            variantes: { Presentacion: 'Simple' },
            extras: [],
            descripcion: '',
          },
        ],
      })
    )
  );
  console.log('  ✓ createPedidoSchema acepta items como array');
}

function run() {
  console.log('\n🧪 Tests de createPedidoSchema');
  testAceptaItemsComoString();
  testAceptaItemsComoArray();
  console.log('✅ Todos los tests de createPedidoSchema pasaron\n');
}

run();
