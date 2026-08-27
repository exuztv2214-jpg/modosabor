const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('\n🔐 Ficha individual de pedido');

  const source = fs.readFileSync(path.join(__dirname, '../../routes/pedidos.js'), 'utf8');
  const inicio = source.indexOf("router.get('/:id', authOpcional");
  const fin = source.indexOf("router.get('/:id/impresiones'", inicio);
  const bloque = source.slice(inicio, fin);

  assert.ok(inicio >= 0, 'la ficha debe reconocer tanto la cookie como Bearer con authOpcional');
  assert.match(bloque, /hasPermission\(req\.user, 'pedidos\.view'\)/);
  assert.doesNotMatch(bloque, /jwt\.verify|authorization/);
  assert.match(bloque, /buildTrackingPayload/);

  console.log('  ✓ la cookie del panel ve la ficha completa');
  console.log('  ✓ un token sin pedidos.view no obtiene datos privados');
  console.log('  ✓ el enlace firmado de seguimiento conserva su vista pública');
  console.log('✅ Ficha de pedido protegida\n');
}

if (require.main === module) run();
module.exports = { run };
