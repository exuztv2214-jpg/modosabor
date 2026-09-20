const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
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
    browser = await chromium.launch({
      channel: process.env.TEST_BROWSER_CHANNEL || 'msedge',
      headless: true,
    });
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let failLists = true;
    let assignments = null;
    let holdAlpha = false;
    let releaseAlpha;
    const writes = [];
    const lists = [
      { id: 1, nombre: 'Lista Alpha', activo: 1, tipo: 'extra', opciones: [] },
      { id: 2, nombre: 'Lista Beta', activo: 1, tipo: 'extra', opciones: [] },
    ];
    const products = ['Alpha', 'Beta'].map((nombre, i) => ({
      id: i + 1,
      nombre,
      precio: 1000 + i * 100,
      categoria_id: 1,
      categoria_nombre: 'Platos',
      subcategoria: i ? 'Especiales' : '',
      activo: 1,
      costo: 200,
      variantes: '[]',
      extras: '[]',
      stock: 10,
      stock_directo: 10,
    }));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/socket.io')) {
        return route.abort();
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let body = {},
        status = 200;
      const method = route.request().method();
      if (method !== 'GET') writes.push({ url: url.pathname, body: route.request().postData() });
      if (url.pathname === '/api/auth/me') body = { id: 1, nombre: 'Prueba', rol: 'admin' };
      if (url.pathname === '/api/categorias') {
        body = [{ id: 1, nombre: 'Platos', activo: 1, subcategorias: [{ nombre: 'Especiales' }] }];
      }
      if (url.pathname === '/api/productos/administracion') body = products;
      if (url.pathname === '/api/opcion-listas') body = lists;
      if (url.pathname === '/api/opcion-listas/producto/1') {
        if (holdAlpha) {
          await new Promise((resolve) => {
            releaseAlpha = resolve;
          });
        }
        if (failLists) {
          status = 503;
          body = { error: 'Fallo ficticio de carga' };
        } else body = [lists[0]];
      }
      if (url.pathname === '/api/opcion-listas/producto/2') body = [lists[1]];
      if (url.pathname === '/api/productos' && method === 'POST') body = { ...products[1], id: 3 };
      if (url.pathname === '/api/opcion-listas/producto/3' && method === 'PUT') {
        assignments = route.request().postDataJSON().listas;
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/productos`);
    const card = (name) =>
      page.locator('article').filter({ has: page.getByText(name, { exact: true }) });
    await card('Alpha').getByTitle('Editar', { exact: true }).click();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
    assert.ok(
      await page.getByRole('button', { name: 'Guardar cambios', exact: true }).isDisabled()
    );
    assert.equal(writes.length, 0);
    failLists = false;
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    const alpha = page.getByRole('button', { name: /Lista Alpha/ });
    await page.waitForFunction(() =>
      [...globalThis.document.querySelectorAll('button')].some(
        (b) => b.textContent.includes('Lista Alpha') && b.getAttribute('aria-pressed') === 'true'
      )
    );
    assert.equal(await alpha.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await card('Beta').getByTitle('Duplicar', { exact: true }).click();
    await page.waitForFunction(() =>
      [...globalThis.document.querySelectorAll('button')].some(
        (b) => b.textContent.includes('Lista Beta') && b.getAttribute('aria-pressed') === 'true'
      )
    );
    assert.equal(
      await page.getByRole('button', { name: /Lista Alpha/ }).getAttribute('aria-pressed'),
      'false'
    );
    assert.equal(
      await page.getByLabel('Subcategoría', { exact: true }).last().inputValue(),
      'Especiales'
    );
    await page.getByRole('button', { name: 'Crear producto', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(assignments, [2]);
    holdAlpha = true;
    await card('Alpha').getByTitle('Editar', { exact: true }).click();
    await page
      .getByText('Cargando listas asignadas. Esperá antes de guardar.', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await card('Beta').getByTitle('Editar', { exact: true }).click();
    await page.waitForFunction(() =>
      [...globalThis.document.querySelectorAll('button')].some(
        (b) => b.textContent.includes('Lista Beta') && b.getAttribute('aria-pressed') === 'true'
      )
    );
    const oldResponse = page.waitForResponse('**/opcion-listas/producto/1');
    releaseAlpha();
    await oldResponse;
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))
        )
    );
    assert.equal(
      await page.getByRole('button', { name: /Lista Alpha/ }).getAttribute('aria-pressed'),
      'false'
    );
    assert.equal(
      await page.getByRole('button', { name: /Lista Beta/ }).getAttribute('aria-pressed'),
      'true'
    );
    assert.deepEqual(errors, []);
    console.log(
      'OK productos UI: fallo de listas bloquea guardado, reintento recupera, duplicar copia sólo listas/subcategoría del origen'
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
