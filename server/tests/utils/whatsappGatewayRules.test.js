const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  asksForCarta,
  usableWhatsappName,
  claimsOrderWasCreated,
  safeWebhookUrl,
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
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.strictEqual(
    safeWebhookUrl('http://127.0.0.1:5678/webhook/incorrecto', 'https://n8n.example/webhook/ok'),
    'https://n8n.example/webhook/ok'
  );
  assert.strictEqual(
    safeWebhookUrl('https://n8n.example/webhook/principal', 'https://fallback.example'),
    'https://n8n.example/webhook/principal'
  );
  process.env.NODE_ENV = previousNodeEnv;
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
  assert.match(workflow, /ofrecé solamente el menú del día/i);
  console.log('  ✓ distingue carta de menú del día, valida el nombre y evita localhost');
  console.log('✅ Reglas del gateway verificadas\n');
}

module.exports = { run };
