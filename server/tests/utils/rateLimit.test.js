const assert = require('assert');
const { createRateLimiter, clientKey } = require('../../utils/rateLimit');

function testClientKey() {
  const req1 = {
    headers: { 'x-forwarded-for': '192.168.1.1' },
    socket: { remoteAddress: '10.0.0.1' },
  };
  assert.strictEqual(clientKey(req1), '192.168.1.1', 'Debe preferir x-forwarded-for');

  const req2 = { headers: {}, socket: { remoteAddress: '10.0.0.1' }, ip: '127.0.0.1' };
  assert.strictEqual(
    clientKey(req2),
    '10.0.0.1',
    'Debe usar remoteAddress si no hay x-forwarded-for'
  );

  const req3 = { headers: {}, socket: {}, ip: '127.0.0.1' };
  assert.strictEqual(clientKey(req3), '127.0.0.1', 'Debe usar req.ip como fallback');

  console.log('  ✓ clientKey funciona correctamente');
}

function testRateLimiter() {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3, message: 'Limit exceeded' });
  const req = { headers: {}, socket: { remoteAddress: '1.2.3.4' } };
  const res = {
    status: (code) => ({ json: (data) => ({ code, data }) }),
    set: () => {},
  };

  assert.strictEqual(
    limiter(req, res, () => {}),
    undefined,
    'Primer request debe pasar'
  );
  assert.strictEqual(
    limiter(req, res, () => {}),
    undefined,
    'Segundo request debe pasar'
  );
  assert.strictEqual(
    limiter(req, res, () => {}),
    undefined,
    'Tercer request debe pasar'
  );

  const result = limiter(req, res, () => {});
  assert.strictEqual(result.data.error, 'Limit exceeded', 'Cuarto request debe ser bloqueado');
  assert.strictEqual(result.code, 429, 'Debe retornar 429');

  console.log('  ✓ Rate limiter bloquea despues de max requests');
}

function run() {
  console.log('\n🧪 Tests de rateLimit.js');
  testClientKey();
  testRateLimiter();
  console.log('✅ Todos los tests de rateLimit pasaron\n');
}

run();
