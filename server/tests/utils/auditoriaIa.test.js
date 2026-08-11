const assert = require('assert');
const { whereCon } = require('../../routes/auditoria');

assert.strictEqual(whereCon([], ['fallback = 1']), 'WHERE fallback = 1');
assert.strictEqual(
  whereCon(['creado_en >= ?'], ["proveedor != ''"]),
  "WHERE creado_en >= ? AND proveedor != ''"
);
assert.strictEqual(whereCon([]), '');

console.log('auditoriaIa.test.js OK');
