const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const configurar = require('../../utils/masivosLocalConfig');
function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'masivos-local-config-'));
  try {
    const api = {},
      panel = {};
    configurar(api, root);
    configurar(panel, root);
    assert.ok(api.MASIVOS_PROXY_TOKEN);
    assert.equal(api.MASIVOS_PROXY_TOKEN, panel.MASIVOS_PROXY_TOKEN);
    assert.equal(panel.MODOSABOR_API_URL, 'http://127.0.0.1:3001');
    const runtime = new Proxy(
      {},
      {
        set(target, key, value) {
          target[key] = String(value);
          return true;
        },
      }
    );
    configurar(runtime, root);
    assert.equal(runtime.MASIVOS_PROXY_TOKEN, api.MASIVOS_PROXY_TOKEN);
    const prod = { NODE_ENV: 'production' };
    configurar(prod, root);
    assert.equal(prod.MASIVOS_PROXY_TOKEN, undefined);
    fs.mkdirSync(path.join(root, 'server'));
    fs.writeFileSync(
      path.join(root, 'server', '.env'),
      'MASIVOS_PROXY_TOKEN=token-configurado\nOTRO_SECRETO=no-importar\n'
    );
    const config = {};
    configurar(config, root);
    assert.equal(config.MASIVOS_PROXY_TOKEN, 'token-configurado');
    assert.equal(config.OTRO_SECRETO, undefined);
    fs.writeFileSync(path.join(root, 'server', '.env'), 'NODE_ENV=production\n');
    const apiProd = { NODE_ENV: 'production' },
      panelProd = {};
    configurar(apiProd, root);
    configurar(panelProd, root);
    assert.equal(apiProd.MASIVOS_PROXY_TOKEN, panelProd.MASIVOS_PROXY_TOKEN);
    const apiLocal = { NODE_ENV: 'production', MASIVOS_LOCAL: '1' },
      panelLocal = { MASIVOS_LOCAL: '1' };
    configurar(apiLocal, root);
    configurar(panelLocal, root);
    assert.equal(apiLocal.MASIVOS_PROXY_TOKEN, panelLocal.MASIVOS_PROXY_TOKEN);
    assert.ok(panelLocal.MASIVOS_PROXY_TOKEN);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
module.exports = { run };
if (require.main === module) run();
