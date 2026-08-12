const assert = require('assert');
const db = require('../../db');
const {
  quoteProduct,
  enrichOrderItemsWithCatalog,
  getMenuOverview,
} = require('../../utils/systemClient');

function run() {
  console.log('\nTests de cotización a pedido del agente');
  const quote = quoteProduct(db, 'pizza común con huevo entera muzza');
  assert.strictEqual(quote.status, 'ok');
  assert.strictEqual(quote.order_item.producto_id, 2);
  assert.strictEqual(quote.order_item.variantes.Presentación.nombre, 'Entera Muzza');

  const [fromQuote] = enrichOrderItemsWithCatalog(db, [quote.order_item]);
  assert.strictEqual(fromQuote.variantes.Presentación, 'Entera Muzza');

  const [recovered] = enrichOrderItemsWithCatalog(db, [
    {
      producto_id: 2,
      cantidad: 1,
      seleccion_texto: 'pizza común con huevo entera muzza',
    },
  ]);
  assert.strictEqual(recovered.variantes.Presentación, 'Entera Muzza');

  const defaultPizza = quoteProduct(db, 'pizza común');
  assert.strictEqual(defaultPizza.status, 'ok');
  assert.strictEqual(defaultPizza.order_item.variantes.Presentación.nombre, 'Entera Cremoso');
  assert.strictEqual(defaultPizza.price_total, 800000);
  assert.strictEqual(defaultPizza.money_text, '$8.000');

  const pizzaMenu = getMenuOverview(db, { categoryQuery: 'pizzas' });
  const common = pizzaMenu.products.find((item) => item.nombre === 'Común');
  assert.strictEqual(common.precio_desde, 800000);
  assert.strictEqual(common.precio_desde_texto, '$8.000');
  assert.strictEqual(common.precio_referencia, 'Entera con cremoso');
  console.log('  ✓ conserva y recupera la variante cotizada antes de crear el pedido');
  console.log('  ✓ pizza sin aclaración usa entera con cremoso y muestra su precio real');
  console.log('✅ Cotización del agente verificada\n');
}

module.exports = { run };
