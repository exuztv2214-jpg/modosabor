const assert = require('assert');
const { hoyArgentina } = require('../../utils/fechaLocal');

assert.strictEqual(
  hoyArgentina(new Date('2026-08-12T00:30:00.000Z')),
  '2026-08-11',
  'a las 21:30 de Argentina el dashboard debe seguir usando el día local'
);

console.log('dashboardFechas.test.js OK');
