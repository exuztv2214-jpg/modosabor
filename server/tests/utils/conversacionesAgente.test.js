const assert = require('assert');
const { CASOS } = require('../agente/correrConversaciones');

function run() {
  assert.ok(CASOS.length >= 40);
  assert.ok(CASOS.filter((caso) => caso.origen === 'backup-anonimo').length >= 20);
  assert.ok(CASOS.every((caso) => caso.mensajes.length && caso.esperado));
  console.log('conversacionesAgente.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
