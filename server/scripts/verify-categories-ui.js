// Build real + API ficticia; no usa datos ni servicios del negocio.
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '../../client/dist');
  assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Ejecutá npm run build primero');
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
    const writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/socket.io')) {
        return route.abort();
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (route.request().method() !== 'GET') writes.push(url.pathname);
      let body = {};
      if (url.pathname === '/api/auth/me') body = { id: 1, nombre: 'Prueba', rol: 'admin' };
      if (url.pathname === '/api/categorias') {
        body = [
          {
            id: 1,
            nombre: 'Pizzas',
            activo: 1,
            orden: 1,
            icono: '🍕',
            subcategorias: [{ nombre: 'Clásicas' }],
          },
          { id: 2, nombre: 'Vacía', activo: 0, orden: 2, subcategorias: [] },
        ];
      }
      if (url.pathname === '/api/productos') {
        body = [
          { id: 10, categoria_id: '1', nombre: 'Muzzarella', precio: 5000, activo: 1 },
          { id: 11, categoria_id: 1, nombre: 'Especial oculta', precio: 6500, activo: 0 },
          { id: 12, categoria_id: 3, nombre: 'Producto ajeno', precio: 100, activo: 1 },
        ];
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/categorias`);
    await page.getByRole('button', { name: 'Ver categoría Pizzas', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Pizzas', exact: true });
    await dialog.getByText('Muzzarella', { exact: true }).waitFor();
    assert.equal(await dialog.getByText('$5.000', { exact: true }).count(), 1);
    assert.equal(await dialog.getByText('Especial oculta', { exact: true }).count(), 1);
    assert.equal(await dialog.getByText('Clásicas', { exact: true }).count(), 1);
    assert.equal(await dialog.getByText('Producto ajeno', { exact: true }).count(), 0);
    assert.equal(await dialog.locator('input,select,textarea').count(), 0);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByTitle('Ver como lista', { exact: true }).click();
    await page.getByRole('button', { name: 'Ver categoría Vacía', exact: true }).click();
    await page.getByText('Esta categoría todavía no tiene productos.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await page.getByRole('button', { name: 'Ver categoría Pizzas', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.boundingBox();
    assert.ok(
      bounds.x >= 0 && bounds.x + bounds.width <= 390,
      'Detalle dentro de la pantalla móvil'
    );
    await dialog.getByRole('button', { name: 'Editar categoría', exact: true }).click();
    await page.getByRole('dialog', { name: 'Editar categoría', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Nombre', { exact: true }).inputValue(), 'Pizzas');
    assert.deepEqual(writes, [], 'Visualizar y abrir edición no modifica datos');
    assert.deepEqual(errors, []);
    console.log(
      'OK categorías: ver desde tarjetas/lista, productos y precios, categoría vacía, Escape, móvil y edición sin escrituras'
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
