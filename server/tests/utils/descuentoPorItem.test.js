const assert = require('assert');
const { parsePedidoItems } = require('../../utils/pedidoItems');

/**
 * Descuento por ítem.
 *
 * Dos cosas se prueban acá, y la segunda es de seguridad.
 *
 * 1. Que el descuento se reste de verdad. Si el subtotal ignorara el descuento,
 *    el mozo lo aplicaría en la pantalla y la caja cobraría el precio entero:
 *    quedaría de mentiroso frente al cliente.
 *
 * 2. Que un descuento imposible no pueda dejar un ítem en negativo. Un ítem
 *    negativo le restaría plata al resto del pedido, así que un solo error de
 *    carga podría hacer que una mesa entera salga casi gratis.
 */
function run() {
  const soloItem = (item) => parsePedidoItems([item])[0];

  // ── 1. Un plato que salió mal, cobrado a mitad ─────────────────────────────
  let item = soloItem({
    producto_id: 7,
    nombre: 'Milanesa',
    cantidad: 1,
    precio_unitario: 1000000,
    descuento_item: 500000,
    descuento_motivo: 'salió fría',
  });
  assert.strictEqual(item.descuento_item, 500000);
  assert.strictEqual(item.subtotal, 500000, 'el subtotal tiene que salir con el descuento restado');
  assert.strictEqual(item.descuento_motivo, 'salió fría', 'el motivo se guarda');

  // ── 2. Sin descuento, todo como siempre ────────────────────────────────────
  item = soloItem({ producto_id: 7, nombre: 'Milanesa', cantidad: 2, precio_unitario: 1000000 });
  assert.strictEqual(item.descuento_item, 0);
  assert.strictEqual(item.subtotal, 2000000);

  // ── 3. Descuento mayor que el ítem: se recorta, no deja negativo ───────────
  item = soloItem({
    producto_id: 7,
    nombre: 'Milanesa',
    cantidad: 1,
    precio_unitario: 1000000,
    descuento_item: 9999999,
  });
  assert.strictEqual(item.descuento_item, 1000000, 'el descuento se recorta al valor del ítem');
  assert.strictEqual(item.subtotal, 0, 'el ítem queda en cero, nunca en negativo');

  // ── 4. Descuento negativo: se ignora ───────────────────────────────────────
  item = soloItem({
    producto_id: 7,
    nombre: 'Milanesa',
    cantidad: 1,
    precio_unitario: 1000000,
    descuento_item: -500000,
  });
  assert.strictEqual(item.descuento_item, 0, 'un descuento negativo sería un recargo encubierto');
  assert.strictEqual(item.subtotal, 1000000);

  // ── 5. Con cantidad: el descuento es de la línea, no por unidad ────────────
  item = soloItem({
    producto_id: 7,
    nombre: 'Empanada',
    cantidad: 12,
    precio_unitario: 100000,
    descuento_item: 200000,
  });
  assert.strictEqual(item.subtotal, 1000000, '12 × $1.000 = $12.000, menos $2.000 de descuento');

  // ── 6. Un subtotal recibido no puede contradecir el descuento ─────────────
  item = soloItem({
    producto_id: 7,
    nombre: 'Milanesa',
    cantidad: 1,
    precio_unitario: 1000000,
    descuento_item: 300000,
    subtotal: 1000000,
  });
  assert.strictEqual(
    item.subtotal,
    700000,
    'el servidor recalcula la línea y no confía en subtotal'
  );

  console.log('descuentoPorItem.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
