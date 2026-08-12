const assert = require('assert');
const db = require('../../db');
const { applyInventoryToItems } = require('../../utils/inventory');

function run() {
  console.log('\nTests de tildes en recetas de inventario');
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
  console.log('  ✓ Presentación coincide con la receta guardada como Presentacion');
  console.log('✅ Recetas con tildes verificadas\n');
}

module.exports = { run };
