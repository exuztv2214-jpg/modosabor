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
  const parsed = createPedidoSchema.parse(
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
          descuento_item: 500,
          descuento_motivo: 'Cortesía',
        },
      ],
      puntos_a_canjear: 20,
      pago_detalle: JSON.stringify({
        tipo: 'mixto',
        split_payments: [
          { metodo: 'efectivo', monto: 3000 },
          { metodo: 'transferencia', monto: 2500 },
        ],
      }),
      cupon_codigo: 'PROMO',
      marketing_source: 'whatsapp',
    })
  );
  assert.strictEqual(parsed.items[0].descuento_item, 500);
  assert.strictEqual(parsed.items[0].descuento_motivo, 'Cortesía');
  assert.strictEqual(parsed.puntos_a_canjear, 20);
  assert.ok(parsed.pago_detalle.includes('split_payments'));
  assert.strictEqual(parsed.cupon_codigo, 'PROMO');
  assert.strictEqual(parsed.marketing_source, 'whatsapp');
  console.log('  ✓ createPedidoSchema conserva descuentos, puntos, pago mixto y atribución');
}

function run() {
  console.log('\n🧪 Tests de createPedidoSchema');
  testAceptaItemsComoString();
  testAceptaItemsComoArray();
  console.log('✅ Todos los tests de createPedidoSchema pasaron\n');
}

run();
