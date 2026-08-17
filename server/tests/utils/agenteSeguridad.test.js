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
const workflowGenerado = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'agente-whatsapp',
      'n8n',
      'workflow-9-tools.generated.json'
    ),
    'utf8'
  )
)[0];
const agenteRouter = require('../../routes/agente');

assert.match(agente, /req\.headers\['x-agent-telefono'\]/);
assert.match(agente, /resolveConversationPhone\(req\)/);
assert.match(gateway, /'x-agent-telefono': String\(payload\?\.telefono/);
assert.match(workflow, /name: 'x-agent-telefono'/);
assert.match(workflow, /workflow-9-tools\.generated\.json/);
const tool = (id) => workflowGenerado.nodes.find((node) => node.id === id);
assert.strictEqual(tool('tool-cliente').parameters.parametersQuery, undefined);
assert.strictEqual(tool('tool-pedido-actual').parameters.parametersQuery, undefined);
assert.deepStrictEqual(tool('tool-derivar').parameters.parametersBody.values, [
  { name: 'motivo', valueProvider: 'modelRequired' },
]);

const contextoCliente = {
  headers: { 'x-agent-telefono': '5493811111111' },
  params: {},
  query: {},
  body: {},
};
assert.strictEqual(agenteRouter.resolveConversationPhone(contextoCliente), '5493811111111');
assert.throws(
  () =>
    agenteRouter.resolveConversationPhone({
      ...contextoCliente,
      query: { telefono: '5493812222222' },
    }),
  (error) => error.statusCode === 403 && /no pertenece/.test(error.message)
);
assert.throws(
  () => agenteRouter.resolveConversationPhone({ headers: {}, params: {}, query: {}, body: {} }),
  (error) => error.statusCode === 403 && /Falta el teléfono/.test(error.message)
);

console.log('agenteSeguridad.test.js OK');
