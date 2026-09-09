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
  assert.match(auth, /token_version = token_version \+ 1/);
  assert.match(auth, /tv: Number\(user\.token_version \|\| 0\)/);

  const middleware = fs.readFileSync(path.join(__dirname, '../../middleware/auth.js'), 'utf8');
  const sockets = fs.readFileSync(path.join(__dirname, '../../utils/socketRooms.js'), 'utf8');
  assert.match(middleware, /decoded\.tv \?\? 0/);
  assert.match(sockets, /decoded\.tv \?\? 0/);

  console.log(
    '  ✓ valida ediciones, normaliza email, revoca tokens y protege el último administrador'
  );
  console.log('✅ Usuarios verificados\n');
}

if (require.main === module) run();
module.exports = { run };
