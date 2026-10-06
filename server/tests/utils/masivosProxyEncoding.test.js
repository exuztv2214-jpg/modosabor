const assert = require('assert');
const http = require('http');
const { PassThrough } = require('stream');
const { gzipSync } = require('zlib');

async function run() {
  const upstream = http.createServer((_req, res) => {
    res.setHeader('content-encoding', 'gzip');
    res.setHeader('content-type', 'text/html');
    res.end(gzipSync('<main>Masivos</main>'));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  try {
    const proxyMasivos = require('../../utils/masivosProxy');
    const headers = new Map();
    const response = new PassThrough();
    response.status = () => response;
    response.setHeader = (key, value) => headers.set(key, value);
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve) => response.on('end', resolve));

    await proxyMasivos(
      { originalUrl: '/masivos', headers: { 'accept-encoding': 'gzip' }, method: 'GET' },
      response,
      `http://127.0.0.1:${upstream.address().port}`,
      'test-token'
    );
    await finished;

    assert.equal(Buffer.concat(chunks).toString(), '<main>Masivos</main>');
    assert.equal(headers.has('content-encoding'), false, 'No anunciar gzip tras descomprimir');
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
