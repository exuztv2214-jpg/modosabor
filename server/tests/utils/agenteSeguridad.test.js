const assert = require('assert');
const fs = require('fs');
const path = require('path');

const agente = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'agente.js'), 'utf8');
const registro = fs.readFileSync(
  path.join(__dirname, '..', '..', 'services', 'registroHerramientas.js'),
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
/*
  El gateway ya no llama a n8n por webhook, así que no hay un encabezado que
  revisar: el agente corre dentro de este proceso. El candado equivalente es
  que toda herramienta del perfil cliente resuelva el teléfono contra el de la
  conversación en curso, en vez de aceptar el que mande el modelo.
*/
assert.match(registro, /function telefonoSeguro\(args, contexto\)/);
assert.match(registro, /No se puede consultar otro cliente/);
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
