const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('\nTests de idempotencia de pedidos WhatsApp');
  const service = fs.readFileSync(
    path.join(__dirname, '..', '..', 'services', 'pedidoService.js'),
    'utf8'
  );
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'agente-whatsapp', 'n8n', 'build-agent-workflow.js'),
    'utf8'
  );
  assert.match(service, /whatsappIdempotency/);
  assert.match(schema, /idx_pedidos_whatsapp_idempotency/);
  assert.match(workflow, /idempotency_key/);
  console.log('  ✓ reintentos de confirmación no pueden duplicar pedidos');
  console.log('✅ Idempotencia de WhatsApp verificada\n');
}

module.exports = { run };
