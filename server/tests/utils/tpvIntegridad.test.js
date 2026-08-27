const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { normalizeInitialPagoDetalle } = require('../../services/pedidoService');

function run() {
  console.log('\n🧪 Integridad del TPV');

  const detail = JSON.parse(
    normalizeInitialPagoDetalle(
      JSON.stringify({
        tipo: 'mixto',
        principal: 'transferencia',
        split_payments: [
          { metodo: 'efectivo', monto: 200000 },
          { metodo: 'transferencia', monto: 300000 },
        ],
      }),
      500000
    )
  );
  assert.strictEqual(detail.tipo, 'mixto');
  assert.strictEqual(detail.principal, 'transferencia');
  assert.strictEqual(detail.split_payments.length, 2);
  assert.throws(
    () =>
      normalizeInitialPagoDetalle(
        JSON.stringify({
          split_payments: [
            { metodo: 'efectivo', monto: 100000 },
            { metodo: 'transferencia', monto: 100000 },
          ],
        }),
        500000
      ),
    /no coincide/
  );
  console.log('  ✓ el cobro mixto se valida contra el total real');

  const esperaSource = fs.readFileSync(path.join(__dirname, '../../routes/tpvEspera.js'), 'utf8');
  assert.match(esperaSource, /\/espera\/:id\/reclamar/);
  assert.match(esperaSource, /db\.transaction/);
  console.log('  ✓ un pedido en espera se reclama atómicamente');

  const productModalSource = fs.readFileSync(
    path.join(__dirname, '../../../client/src/pages/Productos/ProductoFormModal.jsx'),
    'utf8'
  );
  assert.doesNotMatch(productModalSource, /event\.key === ' '/);
  assert.match(productModalSource, /role="dialog"/);
  console.log('  ✓ espacio no activa el fondo del formulario de producto');

  const variantModalSource = fs.readFileSync(
    path.join(__dirname, '../../../client/src/components/TPV/TpvVariantModal.jsx'),
    'utf8'
  );
  const paymentModalSource = fs.readFileSync(
    path.join(__dirname, '../../../client/src/components/TPV/TpvPaymentModal.jsx'),
    'utf8'
  );
  assert.match(
    variantModalSource,
    /<button\s+ref=\{agregarButtonRef\}[\s\S]{0,180}onClick=\{onAddToCart\}/
  );
  assert.match(
    paymentModalSource,
    /<button\s+ref=\{confirmarButtonRef\}[\s\S]{0,180}onClick=\{\(\) => onConfirm\(imprimir\)\}/
  );
  console.log('  ✓ Enter enfoca Agregar y Cobrar, no Cerrar ni Cancelar');

  const tpvSource = fs.readFileSync(
    path.join(__dirname, '../../../client/src/pages/TPV.jsx'),
    'utf8'
  );
  assert.match(tpvSource, /available: false/);
  assert.match(tpvSource, /status: currentItemsInStock \? 'ok' : 'block'/);
  assert.doesNotMatch(tpvSource, /slice\(0, 12\)/);
  console.log('  ✓ no cobra con una cotización fallida ni con productos inválidos');

  console.log('✅ Integridad del TPV verificada\n');
}

if (require.main === module) run();
module.exports = { run };
