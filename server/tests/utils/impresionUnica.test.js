const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readClient(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'client', 'src', relativePath),
    'utf8'
  );
}

function run() {
  const globalAlerts = readClient('components/GlobalOrderAlerts.jsx');
  const pedidos = readClient('pages/Pedidos/index.jsx');
  const tpv = readClient('pages/TPV.jsx');

  assert.match(
    globalAlerts,
    /api\.post\(`\/pedidos\/\$\{pedido\.id\}\/imprimir`, \{ tipo: 'tpv_pack' \}\)/
  );
  assert.doesNotMatch(pedidos, /imprimirDocumentosPedidoWeb/);
  assert.doesNotMatch(pedidos, /impresion_auto_web/);
  assert.match(
    tpv,
    /const shouldManualPrint = !ventaSinConexion && imprimir && !autoPrintConfigured/
  );
  assert.match(tpv, /if \(shouldManualPrint\) \{\s*popup = window\.open/);
  assert.match(tpv, /if \(shouldManualPrint\) await abrirImpresion\(pedido\.id, popup\)/);

  console.log('impresionUnica.test.js OK');
}

if (require.main === module) run();
module.exports = { run };
