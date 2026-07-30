const assert = require('assert');
const sanitizeMiddleware = require('../../middleware/sanitize');

function runMiddleware(path, body) {
  const req = { path, body };
  let nextCalled = false;
  sanitizeMiddleware(req, {}, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true);
  return req.body;
}

function testAgentPedidoJsonIsNotEscaped() {
  const pedidoJson = JSON.stringify({
    cliente_nombre: 'Juan Perez',
    items: [{ nombre: 'Smash Simple', cantidad: 1 }],
  });

  const body = runMiddleware('/api/agente/pedido', {
    pedido_json: pedidoJson,
    notas: 'sin cebolla',
  });

  assert.strictEqual(body.pedido_json, pedidoJson);
  assert.doesNotThrow(() => JSON.parse(body.pedido_json));
  console.log('  OK /api/agente conserva pedido_json parseable');
}

function testNormalRoutesAreStillSanitized() {
  const body = runMiddleware('/api/clientes', {
    nombre: '  <script>"x"</script>  ',
  });

  assert.strictEqual(body.nombre, '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  console.log('  OK rutas normales siguen sanitizando HTML');
}

function testPedidoItemsJsonIsNotEscaped() {
  const items = JSON.stringify([
    {
      nombre: 'Smash Simple',
      cantidad: 1,
      precio_unitario: 6000,
      subtotal: 6000,
    },
  ]);

  const body = runMiddleware('/api/pedidos', {
    cliente_nombre: '  <b>Juan</b>  ',
    items,
  });

  assert.strictEqual(body.cliente_nombre, '&lt;b&gt;Juan&lt;/b&gt;');
  assert.strictEqual(body.items, items);
  assert.doesNotThrow(() => JSON.parse(body.items));
  console.log('  OK /api/pedidos conserva items parseable');
}

function run() {
  console.log('\nTests de sanitize.js');
  testAgentPedidoJsonIsNotEscaped();
  testNormalRoutesAreStillSanitized();
  testPedidoItemsJsonIsNotEscaped();
  console.log('Todos los tests de sanitize pasaron\n');
}

run();
