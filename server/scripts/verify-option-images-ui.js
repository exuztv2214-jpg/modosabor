const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
async function main() {
  const root = path.resolve(__dirname, '../../client/dist');
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      file = path.join(root, 'index.html');
    }
    res.setHeader(
      'Content-Type',
      { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] ||
        'application/octet-stream'
    );
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({
      serviceWorkers: 'block',
      viewport: { width: 1100, height: 850 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
      'base64'
    );
    let list = {
      id: 5,
      nombre: 'Guarniciones',
      tipo: 'variante',
      activo: 1,
      obligatorio: 1,
      productos: [],
      opciones: [{ id: 1, nombre: 'Arroz', precio: 0, imagen: '' }],
    };
    let writes = 0;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/socket.io')) {
        return route.abort();
      }
      if (url.pathname === '/uploads/option-test.png') {
        return route.fulfill({ contentType: 'image/png', body: png });
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let body = {};
      if (url.pathname === '/api/auth/me') body = { id: 1, nombre: 'Prueba', rol: 'admin' };
      if (['/api/categorias', '/api/productos'].includes(url.pathname)) body = [];
      if (url.pathname === '/api/opcion-listas') body = [list];
      if (url.pathname === '/api/productos/upload') body = { url: '/uploads/option-test.png' };
      if (url.pathname === '/api/opcion-listas/5' && route.request().method() === 'PUT') {
        list = { ...list, ...route.request().postDataJSON() };
        body = list;
        writes++;
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/listas-opciones`);
    await page.getByTitle('Editar', { exact: true }).click();
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'arroz.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('img', { name: 'Foto de Arroz' }).waitFor();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(writes, 1);
    assert.equal(list.opciones[0].imagen, '/uploads/option-test.png');
    assert.equal(list.opciones[0].precio, 0);
    await page.getByTitle('Editar', { exact: true }).click();
    await page.getByRole('img', { name: 'Foto de Arroz' }).waitFor();
    await page.getByRole('button', { name: 'Quitar foto' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(writes, 2);
    assert.equal(list.opciones[0].imagen, '');
    assert.deepEqual(errors, []);
    console.log('OK browser: option photo preview, upload/save, reopen, remove, unchanged price');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
