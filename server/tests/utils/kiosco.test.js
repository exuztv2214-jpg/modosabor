const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function run() {
  const app = read('client/src/App.jsx');
  const web = read('client/src/pages/WebPublica.jsx');
  const service = read('server/services/pedidoService.js');

  assert.match(app, /path="\/kiosco"[\s\S]*?<WebPublica mode="kiosco"/);
  assert.match(web, /origen:\s*modoKiosco\s*\?\s*'kiosco'\s*:\s*'web'/);
  assert.match(web, /tipoEntrega:\s*modoKiosco\s*\?\s*'retiro'/);
  assert.match(web, /metodoPago:\s*modoKiosco\s*\?\s*'efectivo'/);
  assert.match(
    web,
    /browseAll = !catActiva && !busqueda && !subcategoriaFiltro && quickFilter === 'all'/
  );
  assert.match(service, /\['web', 'canal_publico', 'whatsapp', 'kiosco'\]\.includes\(origen\)/);
}

if (require.main === module) run();

module.exports = { run };
