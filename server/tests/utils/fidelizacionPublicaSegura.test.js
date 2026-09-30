const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('\n🎫 Seguridad del club público');
  const route = fs.readFileSync(path.join(__dirname, '../../routes/fidelizacion.js'), 'utf8');
  const service = fs.readFileSync(
    path.join(__dirname, '../../services/fidelizacionService.js'),
    'utf8'
  );

  assert.match(route, /clubLookupRateLimit/);
  assert.match(route, /includePrivate: Boolean\(byCode\)/);
  assert.match(
    route,
    /getClubPayload\(cliente, \{ includePrivate: false \}\)/,
    'la ficha pública por código no debe devolver datos privados'
  );
  assert.match(
    route,
    /codigo_tarjeta: cliente\.codigo_tarjeta \|\| ''/,
    'la ficha pública debe conservar el código necesario para mostrar la tarjeta'
  );
  assert.match(route, /TRIM\(COALESCE\(email, ''\)\) = ''/);
  assert.match(service, /for \(let i = 0; i < 12; i\+\+\)/);
  assert.match(service, /crypto\.randomInt/);

  console.log('  ✓ limita búsquedas, no expone PII por teléfono y no pisa datos existentes');
  console.log('✅ Club público verificado\n');
}

if (require.main === module) run();
module.exports = { run };
