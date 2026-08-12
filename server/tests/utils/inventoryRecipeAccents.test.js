const assert = require('assert');
const db = require('../../db');
const { applyInventoryToItems } = require('../../utils/inventory');

function run() {
  console.log('\nTests de tildes en recetas de inventario');
  db.exec('SAVEPOINT test_tildes_receta');
  try {
    const insumos = db
      .prepare('SELECT DISTINCT insumo_id FROM inventario_recetas WHERE producto_id = 2')
      .all();
    insumos.forEach(({ insumo_id }) => {
      db.prepare('UPDATE inventario_insumos SET stock_actual = 9999 WHERE id = ?').run(insumo_id);
    });
    const result = applyInventoryToItems(
      db,
      [
        {
          producto_id: 2,
          nombre: 'Común con huevo',
          cantidad: 1,
          variantes: { Presentación: 'Entera Muzza' },
          extras: [],
        },
      ],
      { dryRun: true }
    );
    assert.strictEqual(result.ok, true);
    assert.ok(result.movements >= 2);
  } finally {
    db.exec('ROLLBACK TO test_tildes_receta');
    db.exec('RELEASE test_tildes_receta');
  }
  console.log('  ✓ Presentación coincide con la receta guardada como Presentacion');
  console.log('✅ Recetas con tildes verificadas\n');
}

module.exports = { run };
