const assert = require('assert');
const http = require('http');
const express = require('express');
const sanitizeMiddleware = require('../../middleware/sanitize');

// Reproduce el orden de server/index.js: /masivos antes de express.json y sanitize.
async function run() {
  let recibido = null;
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      recibido = { headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
      res.setHeader('content-type', 'application/json');
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  const proxyMasivos = require('../../utils/masivosProxy');
  const app = express();
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
  app.use('/masivos', (req, res) => {
    req.user = { id: 7 };
    return proxyMasivos(req, res, upstreamUrl, 'token-proxy');
  });
  app.use(express.json({ limit: '10mb' }));
  app.use(sanitizeMiddleware);
  const panel = await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });

  try {
    // 12 MB de base64: supera los 10 MB de express.json y los 5000 caracteres de sanitize.
    const imagen = `data:image/png;base64,${'A'.repeat(12 * 1024 * 1024)}`;
    const cuerpo = JSON.stringify({ texto: 'Milanesa & papas <3', data: imagen });
    const respuesta = await fetch(`http://127.0.0.1:${panel.address().port}/masivos/api/imagen`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer jwt-del-usuario',
        'x-masivos-user-id': '999',
      },
      body: cuerpo,
    });

    assert.equal(respuesta.status, 200);
    assert.equal(recibido.body, cuerpo, 'el cuerpo llega intacto: sin escapar & ni truncar');
    assert.equal(recibido.headers['x-masivos-proxy-token'], 'token-proxy');
    assert.equal(
      recibido.headers['x-masivos-user-id'],
      '7',
      'el usuario del perfil viene de la sesión, nunca del navegador'
    );
    assert.equal(recibido.headers.authorization, undefined, 'no reenvía el JWT del usuario');
    assert.equal(recibido.headers['content-type'], 'application/json');
  } finally {
    await new Promise((resolve) => panel.close(resolve));
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
