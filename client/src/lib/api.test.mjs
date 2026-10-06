import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});
after(() => vite.close());
const { default: api } = await vite.ssrLoadModule('/src/lib/api.js');
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

test('un 401 no recarga los formularios de acceso de Marketing', async () => {
  for (const pathname of ['/masivos/admin', '/social/admin']) {
    let redirects = 0;
    const location = { pathname, set href(_value) { redirects += 1; } };
    globalThis.window = { location };
    await assert.rejects(api.get('/auth/me', {
      adapter: () => Promise.reject({ response: { status: 401, data: { error: 'Sin sesión' } } }),
    }), (error) => error._httpStatus === 401);
    assert.equal(redirects, 0, `${pathname} no debe redirigirse a sí mismo`);
  }
});
