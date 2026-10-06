const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'client', 'src', 'App.jsx'), 'utf8');
const routeStart = app.indexOf('function MasivosPathRoutes()');
const routeEnd = app.indexOf('\nfunction SocialPathRoutes()', routeStart);
assert.ok(routeStart >= 0, 'No se encontró MasivosPathRoutes');
assert.ok(routeEnd > routeStart, 'No se pudo delimitar MasivosPathRoutes');
const route = app.slice(routeStart, routeEnd);

assert.match(app, /MASIVOS_STITCH_URL\s*=\s*['"]http:\/\/127\.0\.0\.1:3867['"]/);
assert.match(app, /window\.location\.replace\(MASIVOS_STITCH_URL\)/);
assert.doesNotMatch(route, /<WhatsAppMasivo\s*\/>/);

console.log('Masivos cutover estático: OK');
