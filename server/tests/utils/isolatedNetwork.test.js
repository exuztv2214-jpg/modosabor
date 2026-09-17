const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const child = spawnSync(
  process.execPath,
  [
    '--require',
    path.resolve(__dirname, '../../scripts/isolated-network.js'),
    '-e',
    `
const assert = require('assert');
for (const module of ['http', 'https']) {
  assert.throws(() => require(module).get(module + '://example.invalid'), /externa bloqueada/);
}
assert.throws(() => fetch('https://example.invalid'), /externa bloqueada/);
assert.throws(() => require('net').connect(443, '192.0.2.1'), /externa bloqueada/);
const server = require('http').createServer((req, res) => res.end('local'));
server.listen(0, '127.0.0.1', async () => {
  try {
    const result = await fetch('http://127.0.0.1:' + server.address().port);
    assert.equal(await result.text(), 'local');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { server.close(); }
});
`,
  ],
  { encoding: 'utf8', timeout: 15000 }
);
assert.equal(child.status, 0, child.stderr || child.error?.message);
console.log('✓ Verificaciones permiten loopback y bloquean HTTP/fetch externos');
