const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const routePath = path.join(__dirname, '..', '..', 'routes', 'configuracion.js');
  const source = fs.readFileSync(routePath, 'utf8');

  const backupRoute = source.match(
    /router\.post\(\s*'\/backup\/bootstrap-import',[\s\S]*?backupUpload\.single\('backup'\)/
  );
  assert.ok(backupRoute, 'la importación de backup tiene que existir');
  assert.ok(
    backupRoute[0].indexOf('bootstrapRateLimit') <
      backupRoute[0].indexOf("backupUpload.single('backup')"),
    'el rate limit debe ejecutarse antes de guardar el archivo'
  );
  assert.ok(
    backupRoute[0].indexOf('requireBootstrapKey') <
      backupRoute[0].indexOf("backupUpload.single('backup')"),
    'la clave debe validarse antes de guardar el archivo'
  );

  assert.match(source, /timingSafeEqual/, 'la comparación de la clave no debe filtrar por tiempo');
  assert.match(
    source,
    /router\.post\('\/uploads\/bootstrap-import', bootstrapRateLimit, requireBootstrapKey/,
    'la importación de uploads también debe quedar autenticada y limitada'
  );

  console.log('bootstrapImportSecurity.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
