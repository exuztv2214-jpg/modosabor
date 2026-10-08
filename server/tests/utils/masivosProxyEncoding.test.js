const assert = require('assert');
const http = require('http');
const { PassThrough, Readable } = require('stream');
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

    const failedResponse = new PassThrough();
    let failureStatus = null;
    failedResponse.headersSent = false;
    failedResponse.status = (status) => {
      failureStatus = status;
      return failedResponse;
    };
    failedResponse.setHeader = () => {};
    failedResponse.json = (body) => {
      failedResponse.end(JSON.stringify(body));
      return failedResponse;
    };
    const failed = new Promise((resolve) => failedResponse.once('finish', resolve));
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      status: 200,
      headers: new Map(),
      body: Readable.toWeb(
        new Readable({
          read() {
            this.destroy(new Error('upstream socket closed'));
          },
        })
      ),
    });
    try {
      await proxyMasivos(
        { originalUrl: '/masivos/api/status', headers: {}, method: 'GET' },
        failedResponse,
        'https://masivos.invalid',
        'test-token'
      );
      await failed;
      assert.equal(failureStatus, 502, 'un corte del upstream debe responder 502 sin tumbar Node');
    } finally {
      global.fetch = originalFetch;
    }
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
