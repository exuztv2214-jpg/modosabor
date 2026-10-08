const { Readable } = require('stream');
const logger = require('./logger');

async function proxyMasivos(req, res, upstreamUrl, proxyToken) {
  const targetPath = req.originalUrl.replace(/^\/masivos(?=\/|$)/, '') || '/';
  const target = `${upstreamUrl}${targetPath}`;
  const headers = { ...req.headers, 'x-masivos-proxy-token': proxyToken };
  delete headers['x-masivos-user-id'];
  if (req.user?.id) headers['x-masivos-user-id'] = String(req.user.id);
  delete headers.host;
  delete headers.cookie;
  // La sesión del usuario se valida acá; Masivos confía en el token del proxy.
  delete headers.authorization;
  for (const salto of ['connection', 'keep-alive', 'upgrade', 'transfer-encoding', 'expect']) {
    delete headers[salto];
  }
  delete headers['content-length'];

  const conCuerpo = !['GET', 'HEAD'].includes(req.method);
  let body;
  let duplex;
  if (conCuerpo && req.body !== undefined) {
    body = JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
  } else if (conCuerpo && typeof req.pipe === 'function') {
    // Cuerpo crudo, sin parsear ni sanear: llega a Masivos byte por byte.
    body = req;
    duplex = 'half';
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      ...(duplex ? { duplex } : {}),
    });
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (
        !['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(key)
      ) {
        res.setHeader(key, value);
      }
    });
    if (!upstream.body) return res.end();
    const stream = Readable.fromWeb(upstream.body);
    stream.on('error', (error) => {
      logger.error('Respuesta de Masivos interrumpida', { message: error.message, target });
      if (res.destroyed) return;
      if (res.headersSent) return res.destroy();
      return res.status(502).json({ error: 'Centro Masivos no disponible' });
    });
    res.once('close', () => stream.destroy());
    return stream.pipe(res);
  } catch (error) {
    logger.error('Proxy de Masivos no disponible', { message: error.message, target });
    return res.status(502).json({ error: 'Centro Masivos no disponible' });
  }
}

module.exports = proxyMasivos;
