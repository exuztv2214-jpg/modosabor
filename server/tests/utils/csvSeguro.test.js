const assert = require('assert');
const { toCsv } = require('../../utils/csv');

function run() {
  console.log('\n📄 Exportación CSV segura');
  const csv = toCsv(['nombre', 'saldo'], [{ nombre: '=WEBSERVICE("malicioso")', saldo: -1500 }]);
  assert.match(csv, /'=WEBSERVICE/);
  assert.match(csv, /;-1500/);
  console.log('  ✓ neutraliza fórmulas sin alterar importes numéricos');
  console.log('✅ CSV verificado\n');
}

if (require.main === module) run();
module.exports = { run };
