const assert = require('assert');
const { applyMenuDiaPricing } = require('../../utils/menuDiaPricing');

function run() {
  const producto = applyMenuDiaPricing({
    nombre: 'Suprema napolitana',
    precio: 999999,
    variantes: '[]',
    menu_dia_precio_economico: 500000,
    menu_dia_precio_ejecutivo: 700000,
  });
  assert.strictEqual(producto.precio, 500000);
  assert.deepStrictEqual(JSON.parse(producto.variantes)[0], {
    nombre: 'Tamaño',
    obligatorio: true,
    opciones: [
      { nombre: 'Económico', precio_extra: 0 },
      { nombre: 'Ejecutivo', precio_extra: 200000 },
    ],
  });

  const soloEjecutivo = applyMenuDiaPricing({
    precio: 1,
    variantes: '[]',
    menu_dia_precio_economico: null,
    menu_dia_precio_ejecutivo: 700000,
  });
  assert.strictEqual(soloEjecutivo.precio, 700000);
  assert.deepStrictEqual(JSON.parse(soloEjecutivo.variantes), []);
  console.log('menuDiaPricing.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
