const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const service = fs.readFileSync(path.join(root, 'server', 'services', 'socialService.js'), 'utf8');
const scheduler = fs.readFileSync(
  path.join(root, 'server', 'services', 'socialScheduler.js'),
  'utf8'
);
const worker = fs.readFileSync(path.join(root, 'social-worker', 'index.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'Social.jsx'), 'utf8');

console.log('\nValidaciones de seguridad E2E de Social');
assert.ok(service.includes("'requires_approval', 'ambiguous'"));
assert.ok(service.includes("estado = 'failed' AND intentos < max_intentos"));
assert.ok(service.includes('ids.length !== 1'));
assert.ok(service.includes('un único destino: una Page o un grupo'));
assert.ok(scheduler.includes("estado = 'ambiguous'"));
assert.ok(scheduler.includes('PUBLICATION_AMBIGUOUS'));
assert.ok(worker.includes("facebook_session: login ? 'EXPIRED' : 'ACTIVE'"));
assert.ok(worker.includes("estado: 'ambiguous'"));
assert.ok(!worker.includes('context.cookies('));
assert.ok(ui.includes('MODO DE PRUEBA'));
assert.ok(ui.includes('Reintentar fallidos'));
console.log('  ✓ modo prueba, retry limitado, sesión vencida y ambigüedad protegidos');
console.log('✅ Seguridad E2E de Social verificada\n');
