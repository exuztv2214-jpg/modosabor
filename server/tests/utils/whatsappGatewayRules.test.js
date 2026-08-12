const assert = require('assert');
const {
  asksForCarta,
  usableWhatsappName,
  claimsOrderWasCreated,
} = require('../../services/whatsappGateway');

function run() {
  console.log('\nTests de reglas del gateway de WhatsApp');
  assert.strictEqual(asksForCarta('Hola, me pasás la carta?'), true);
  assert.strictEqual(asksForCarta('quiero ver el menu'), true);
  assert.strictEqual(asksForCarta('qué hay de menú del día?'), false);
  assert.strictEqual(usableWhatsappName('  Juan Pérez  '), 'Juan Pérez');
  assert.strictEqual(usableWhatsappName('+5493863000000'), '');
  assert.strictEqual(claimsOrderWasCreated('¡Listo! Pedido cargado con éxito.'), true);
  assert.strictEqual(claimsOrderWasCreated('¿Confirmás así el pedido?'), false);
  console.log('  ✓ distingue carta de menú del día y valida el nombre visible');
  console.log('✅ Reglas del gateway verificadas\n');
}

module.exports = { run };
