const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const root = path.resolve(__dirname, '../../..');
  const migrations = fs.readFileSync(path.join(root, 'server/db/migrations.js'), 'utf8');
  const seed = fs.readFileSync(path.join(root, 'server/db/seed.js'), 'utf8');

  assert.match(migrations, /CREATE TABLE IF NOT EXISTS sucursales/);
  assert.match(migrations, /multi_sucursal_activo', '0'/);
  assert.match(migrations, /sucursal_actual_codigo', 'principal'/);
  assert.match(seed, /multi_sucursal_activo:\s*'0'/);
  assert.doesNotMatch(migrations, /ensureColumn\(db, 'pedidos', 'sucursal_id'/);
}

if (require.main === module) run();

module.exports = { run };
