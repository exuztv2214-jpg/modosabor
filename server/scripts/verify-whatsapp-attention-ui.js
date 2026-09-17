// Navegador local, build real y API ficticia: nunca conecta WhatsApp ni producción.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
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
    const mime = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.TEST_BROWSER_CHANNEL || 'msedge',
      headless: true,
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const chat = {
      id: 1,
      nombre: 'Cliente ficticio',
      telefono: '5491100000099',
      bot_silenciado: 1,
      escalado_humano: 1,
    };
    const messages = [
      {
        id: 1,
        contenido: 'Necesito ayuda con mi pedido',
        direccion: 'entrante',
        creado_en: '2026-09-16 10:00:00',
      },
    ];
    let failSend = true;
    let sent = 0;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (!url.pathname.startsWith('/api/')) {
        if (url.pathname.startsWith('/socket.io')) return route.abort();
        return route.continue();
      }
      let body = {};
      let status = 200;
      const pathname = url.pathname;
      if (pathname === '/api/auth/me') body = { id: 1, nombre: 'Caja prueba', rol: 'caja' };
      else if (pathname === '/api/whatsapp/conversaciones') body = { items: [chat], total: 1 };
      else if (pathname.endsWith('/1/mensajes')) body = { conversation: chat, mensajes: messages };
      else if (pathname.endsWith('/1/control')) {
        chat.bot_silenciado = route.request().postDataJSON().accion === 'tomar' ? 1 : 0;
      } else if (pathname === '/api/whatsapp/responder') {
        if (failSend) {
          status = 409;
          body = { error: 'WhatsApp no está conectado' };
        } else {
          sent++;
          messages.push({
            id: 3,
            contenido: route.request().postDataJSON().texto,
            direccion: 'saliente',
            creado_en: '2026-09-16 10:02:00',
          });
        }
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(
      `http://127.0.0.1:${server.address().port}/admin/atencion-whatsapp?conversacion=1`
    );
    await page.getByText('Necesito ayuda con mi pedido', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Devolver a Chispita' }).click();
    await page.getByText('Chispita activa', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tomar chat' }).click();
    await page.getByText('Atención humana / bot pausado', { exact: true }).waitFor();
    messages.push({
      id: 2,
      contenido: 'Mensaje recibido sin recargar',
      direccion: 'entrante',
      creado_en: '2026-09-16 10:01:00',
    });
    await page.getByText('Mensaje recibido sin recargar', { exact: true }).waitFor();
    await page.getByLabel('Tu respuesta').fill('Ya te ayudo');
    await page.getByRole('button', { name: 'Enviar respuesta' }).click();
    await page.getByRole('alert').filter({ hasText: 'WhatsApp no está conectado' }).waitFor();
    assert.equal(await page.getByLabel('Tu respuesta').inputValue(), 'Ya te ayudo');
    failSend = false;
    await page.getByRole('button', { name: 'Enviar respuesta' }).click();
    await page.locator('article').filter({ hasText: 'Ya te ayudo' }).waitFor();
    assert.equal(await page.getByLabel('Tu respuesta').inputValue(), '');
    assert.equal(sent, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    );
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'Sin desborde horizontal en móvil'
    );
    assert.deepEqual(errors, []);
    console.log(
      'OK UI: Caja accede, toma/devuelve, recibe sin recargar, conserva borrador al fallar y envía una vez; móvil sin desborde'
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
