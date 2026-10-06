const { Readable } = require('stream');
const logger = require('./logger');

async function proxyMasivos(req, res, upstreamUrl, proxyToken) {
  const targetPath = req.originalUrl.replace(/^\/masivos(?=\/|$)/, '') || '/';
  const target = `${upstreamUrl}${targetPath}`;
  const headers = { ...req.headers, 'x-masivos-proxy-token': proxyToken };
  delete headers.host;
  delete headers.cookie;
  delete headers.connection;
  delete headers['content-length'];

  let body;
  if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
    body = JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
  }

  try {
    const upstream = await fetch(target, { method: req.method, headers, body });
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (
        !['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(key)
      ) {
        res.setHeader(key, value);
      }
    });
    if (!upstream.body) return res.end();
    return Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    logger.error('Proxy de Masivos no disponible', { message: error.message, target });
    return res.status(502).json({ error: 'Centro Masivos no disponible' });
  }
}

module.exports = proxyMasivos;
