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
  const paymentModal = readClient('components/TPV/TpvPaymentModal.jsx');

  assert.match(
    globalAlerts,
    /api\.post\(`\/pedidos\/\$\{pedido\.id\}\/imprimir`, \{\s*tipo: 'tpv_pack',\s*automatica: true,?\s*\}\)/
  );
  assert.doesNotMatch(pedidos, /imprimirDocumentosPedidoWeb/);
  assert.doesNotMatch(pedidos, /impresion_auto_web/);
  assert.match(
    globalAlerts,
    /window\.location\.pathname\.startsWith\('\/admin\/pedidos'\)/,
    'la pantalla Pedidos no debe abrir impresiones automáticas'
  );
  assert.match(globalAlerts, /esWeb && !estaEnPedidos/);
  assert.match(
    tpv,
    /const shouldManualPrint =\s*!ventaSinConexion && \(pedidoEditando \? imprimir : true\)/
  );
  assert.doesNotMatch(globalAlerts, /impresion_auto_tpv/);
  assert.doesNotMatch(tpv, /window\.open\('', '_blank', 'width=900,height=700'\)/);
  assert.match(tpv, /if \(shouldManualPrint\) await abrirImpresion\(pedido\.id\)/);
  assert.match(tpv, /printWindow\.addEventListener\('afterprint'/);
  assert.doesNotMatch(
    tpv,
    /setTimeout\(\(\) => iframe\.remove\(\), 1200\)/,
    'el TPV no debe destruir el documento mientras Chrome o Edge todavía lo imprimen'
  );
  assert.match(tpv, /await imprimirEnIframe\(response\.html\)/);
  assert.match(paymentModal, /useState\(true\)/);
  assert.match(paymentModal, /Al cobrar se imprimen la comanda y el ticket/);

  console.log('impresionUnica.test.js OK');
}

if (require.main === module) run();
module.exports = { run };
