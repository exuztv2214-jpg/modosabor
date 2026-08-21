const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'services', 'whatsappMasivo', 'conexion.js'),
    'utf8'
  );
  assert.match(source, /pino\(\{ level: 'silent' \}\)/);
  assert.match(source, /logger:\s*BAILEYS_LOGGER/);
  console.log('whatsappLogging.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
