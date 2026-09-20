const assert = require('node:assert/strict');
const { menuDiaBenefits, INCLUDED } = require('../../utils/menuDiaBenefits');
function run() {
  const extra = { nombre: 'Queso', precio: 50000 };
  const prev = JSON.stringify([
    extra,
    { nombre: 'Postre', precio: 90000 },
    { nombre: 'Bebida + Postre', precio: 100000 },
  ]);
  assert.deepEqual(JSON.parse(menuDiaBenefits(500000, prev).extras), [
    extra,
    { nombre: 'Postre', precio: 100000 },
  ]);
  assert.deepEqual(JSON.parse(menuDiaBenefits(700000, prev).extras), [
    extra,
    { nombre: 'Bebida + Postre', precio: 100000 },
  ]);
  const premium = menuDiaBenefits(900000, prev, 'Plato casero.');
  assert.deepEqual(JSON.parse(premium.extras), [extra]);
  assert.equal(premium.descripcion, `Plato casero.\n${INCLUDED}`);
  assert.deepEqual(menuDiaBenefits(900000, premium.extras, premium.descripcion), premium);
  assert.equal(
    menuDiaBenefits(500000, premium.extras, premium.descripcion).descripcion,
    'Plato casero.'
  );
  assert.deepEqual(menuDiaBenefits(1200000, prev, 'Especial'), {
    extras: prev,
    descripcion: 'Especial',
  });
  assert.deepEqual(menuDiaBenefits(1600000, prev, 'Especial'), {
    extras: prev,
    descripcion: 'Especial',
  });
  console.log('Menu benefits: optional paid extras and included premium verified');
}
if (require.main === module) run();
module.exports = { run };
