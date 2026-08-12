const assert = require('assert');
const {
  asksForCarta,
  usableWhatsappName,
  claimsOrderWasCreated,
} = require('../../services/whatsappGateway');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('\nTests de reglas del gateway de WhatsApp');
  assert.strictEqual(asksForCarta('Hola, me pasás la carta?'), true);
  assert.strictEqual(asksForCarta('quiero ver el menu'), true);
  assert.strictEqual(asksForCarta('qué hay de menú del día?'), false);
  assert.strictEqual(usableWhatsappName('  Juan Pérez  '), 'Juan Pérez');
  assert.strictEqual(usableWhatsappName('+5493863000000'), '');
  assert.strictEqual(claimsOrderWasCreated('¡Listo! Pedido cargado con éxito.'), true);
  assert.strictEqual(claimsOrderWasCreated('¿Confirmás así el pedido?'), false);
  const agentRoute = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'agente.js'),
    'utf8'
  );
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'agente-whatsapp', 'n8n', 'build-agent-workflow.js'),
    'utf8'
  );
  assert.match(agentRoute, /\/pedido-actual/);
  assert.match(agentRoute, /\/derivar/);
  assert.match(workflow, /consultar_pedido_actual/);
  assert.match(workflow, /derivar_a_persona/);
  console.log('  ✓ distingue carta de menú del día y valida el nombre visible');
  console.log('✅ Reglas del gateway verificadas\n');
}

module.exports = { run };
