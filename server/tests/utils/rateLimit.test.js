const assert = require('assert');
const Database = require('better-sqlite3');
const {
  createRateLimiter,
  createSqliteRateLimitStore,
  clientKey,
} = require('../../utils/rateLimit');

function testClientKey() {
  const req1 = {
    headers: { 'x-forwarded-for': '192.168.1.1' },
    socket: { remoteAddress: '10.0.0.1' },
    ip: '203.0.113.10',
  };
  assert.strictEqual(clientKey(req1), '203.0.113.10', 'Debe usar req.ip configurada por Express');

  const req2 = { headers: {}, socket: { remoteAddress: '10.0.0.1' }, ip: '127.0.0.1' };
  assert.strictEqual(clientKey(req2), '127.0.0.1', 'Debe usar req.ip antes del socket');

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

function testPersistentRateLimiter() {
  const db = new Database(':memory:');
  const store = createSqliteRateLimitStore(db, 'test');
  const req = { ip: '1.2.3.4', socket: {} };
  const res = {
    status: (code) => ({ json: (data) => ({ code, data }) }),
    set: () => {},
  };
  const firstProcess = createRateLimiter({ windowMs: 1000, max: 1, store });
  firstProcess(req, res, () => {});

  const secondProcess = createRateLimiter({
    windowMs: 1000,
    max: 1,
    message: 'Persisted limit exceeded',
    store: createSqliteRateLimitStore(db, 'test'),
  });
  const result = secondProcess(req, res, () => {});
  assert.strictEqual(result.code, 429, 'El límite persiste al recrear el limiter');
  assert.strictEqual(result.data.error, 'Persisted limit exceeded');
  db.close();
  console.log('  ✓ Rate limiter persiste entre procesos');
}

function run() {
  console.log('\n🧪 Tests de rateLimit.js');
  testClientKey();
  testRateLimiter();
  testPersistentRateLimiter();
  console.log('✅ Todos los tests de rateLimit pasaron\n');
}

run();
