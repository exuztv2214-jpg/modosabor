const assert = require('assert');
const fs = require('fs');
const path = require('path');

const agente = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'agente.js'), 'utf8');
const gateway = fs.readFileSync(
  path.join(__dirname, '..', '..', 'services', 'whatsappGateway.js'),
  'utf8'
);
const workflow = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'agente-whatsapp', 'n8n', 'build-agent-workflow.js'),
  'utf8'
);

assert.match(agente, /req\.headers\['x-agent-telefono'\]/);
assert.match(agente, /status\(403\)/);
assert.match(agente, /telefonoSolicitado.*comparable/s);
assert.match(gateway, /'x-agent-telefono': String\(payload\?\.telefono/);
assert.match(workflow, /name: 'x-agent-telefono'/);
assert.match(workflow, /workflow-9-tools\.generated\.json/);

console.log('agenteSeguridad.test.js OK');
