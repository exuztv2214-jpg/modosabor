const assert = require('assert');

const { parseCsv, toCsv } = require('../../utils/csv');

function run() {
  const csv = toCsv(
    ['nombre', 'descripcion', 'precio'],
    [
      { nombre: 'Lasaña', descripcion: 'Salsa roja; blanca o "mixta"', precio: 7000 },
      { nombre: 'Ñoquis', descripcion: 'Fileto\ncon pollo', precio: 5000 },
    ]
  );
  const rows = parseCsv(csv);

  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], {
    nombre: 'Lasaña',
    descripcion: 'Salsa roja; blanca o "mixta"',
    precio: '7000',
  });
  assert.strictEqual(rows[1].descripcion, 'Fileto\ncon pollo');

  const commaRows = parseCsv('nombre,telefono\r\nHernán,3815988735\r\n');
  assert.deepStrictEqual(commaRows, [{ nombre: 'Hernán', telefono: '3815988735' }]);
  console.log('csvIntercambio.test.js OK');
}

if (require.main === module) run();
module.exports = { run };
