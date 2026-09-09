const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const root = path.join(__dirname, '..', '..');
  const route = fs.readFileSync(path.join(root, 'routes', 'pedidos.js'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
  const migrations = fs.readFileSync(path.join(root, 'db', 'migrations.js'), 'utf8');

  assert.match(schema, /motivo_cancelacion TEXT DEFAULT ''/);
  assert.match(migrations, /'motivo_cancelacion'/);
  assert.match(route, /Indicá el motivo de la cancelación/);
  assert.match(route, /motivo_cancelacion = CASE WHEN/);
  assert.match(route, /motivo_cancelacion: motivoCancelacion/);
  console.log('cancelacionPedido.test.js OK');
}

if (require.main === module) run();
module.exports = { run };
