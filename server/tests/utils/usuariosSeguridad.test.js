const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('\n🔐 Seguridad de usuarios');
  const auth = fs.readFileSync(path.join(__dirname, '../../routes/auth.js'), 'utf8');

  assert.match(auth, /validateBody\(updateUserSchema\)/);
  assert.match(auth, /lower\(email\) = \? AND id != \?/);
  assert.match(auth, /último administrador activo/);
  assert.match(auth, /String\(req\.body\.email\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(auth, /contrasena actual es obligatoria/);

  console.log('  ✓ valida ediciones, normaliza email y protege el último administrador');
  console.log('✅ Usuarios verificados\n');
}

if (require.main === module) run();
module.exports = { run };
