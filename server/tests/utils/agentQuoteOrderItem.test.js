const assert = require('assert');
const db = require('../../db');
const {
  quoteProduct,
  enrichOrderItemsWithCatalog,
  getMenuOverview,
} = require('../../utils/systemClient');

function run() {
  console.log('\nTests de cotización a pedido del agente');
  db.exec('SAVEPOINT test_cotizacion_agente');
  const insumos = db
    .prepare('SELECT DISTINCT insumo_id FROM inventario_recetas WHERE producto_id = 2')
    .all();
  insumos.forEach(({ insumo_id }) => {
    db.prepare('UPDATE inventario_insumos SET stock_actual = 9999 WHERE id = ?').run(insumo_id);
  });
  try {
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
    assert.strictEqual(defaultPizza.price_total_pesos, 8000);
    assert.strictEqual(defaultPizza.money_text, '$8.000');

    const configurable = db
      .prepare(
        `SELECT p.nombre
           FROM productos p
           JOIN categorias c ON c.id = p.categoria_id
          WHERE p.activo = 1
            AND p.variantes NOT IN ('', '[]')
            AND lower(c.nombre) NOT LIKE '%pizza%'
          ORDER BY p.id LIMIT 1`
      )
      .get();
    assert.ok(configurable?.nombre, 'hace falta un producto no pizza con opciones');
    const needsChoice = quoteProduct(db, configurable.nombre);
    assert.strictEqual(needsChoice.status, 'needs_clarification');
    assert.ok(needsChoice.missing_groups[0]?.opciones?.length > 1);
    needsChoice.missing_groups[0].opciones.forEach((option) => {
      assert.ok(option.nombre);
      assert.ok(option.precio_total > 0);
      assert.strictEqual(option.precio_total_pesos, option.precio_total / 100);
      assert.match(option.precio_texto, /^\$/);
    });
    assert.ok(
      !Object.hasOwn(needsChoice.product, 'precio_base'),
      'el modelo no debe recibir un precio base crudo y confundirlo con el precio final'
    );

    const pizzaMenu = getMenuOverview(db, { categoryQuery: 'pizzas' });
    const common = pizzaMenu.products.find((item) => item.nombre === 'Común');
    assert.strictEqual(common.precio_desde, 800000);
    assert.strictEqual(common.precio_desde_texto, '$8.000');
    assert.strictEqual(common.precio_referencia, 'Entera con cremoso');
  } finally {
    db.exec('ROLLBACK TO test_cotizacion_agente');
    db.exec('RELEASE test_cotizacion_agente');
  }
  console.log('  ✓ conserva y recupera la variante cotizada antes de crear el pedido');
  console.log('  ✓ pizza sin aclaración usa entera con cremoso y muestra su precio real');
  console.log('  ✓ una opción pendiente lleva cada precio final listo para informar');
  console.log('✅ Cotización del agente verificada\n');
}

module.exports = { run };
