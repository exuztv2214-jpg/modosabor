const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const root = path.join(__dirname, '..', '..', '..');
  const route = fs.readFileSync(path.join(root, 'server', 'routes', 'configuracion.js'), 'utf8');
  const context = fs.readFileSync(
    path.join(root, 'client', 'src', 'context', 'AppConfigContext.jsx'),
    'utf8'
  );

  assert.match(
    route,
    /const PUBLIC_CONFIG_KEYS = new Set/,
    'la configuración pública usa allowlist'
  );
  assert.match(
    route,
    /key\.startsWith\('web_'\) \|\| PUBLIC_CONFIG_KEYS\.has\(key\)/,
    'sólo salen claves web o públicas explícitas'
  );
  assert.match(
    route,
    /router\.get\('\/panel', auth,/,
    'la configuración operativa exige autenticación'
  );
  assert.doesNotMatch(
    route.match(/const PUBLIC_CONFIG_KEYS[\s\S]*?\]\);/)?.[0] || '',
    /ia_api_key|whatsapp_|modulo_|impresion_|social_/,
    'la allowlist pública no contiene reglas ni configuración interna'
  );
  assert.match(
    context,
    /isAuth \? '\/configuracion\/panel' : '\/configuracion'/,
    'el bootstrap usa el contrato operativo sólo después de autenticar'
  );

  console.log('OK configuración pública mínima y bootstrap autenticado');
}

if (require.main === module) run();

module.exports = { run };
