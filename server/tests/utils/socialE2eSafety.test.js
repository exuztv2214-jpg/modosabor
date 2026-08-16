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

/*
  Antes esto pedía el texto literal `'requires_approval', 'ambiguous'`, los dos
  en la misma línea. El formateador partió el array en varias líneas y el test
  empezó a fallar sin que nada del comportamiento hubiera cambiado.

  Un test que verifica **cómo está escrito** el código y no qué hace es peor que
  no tenerlo: falla por un espacio y entrena a ignorar el rojo. Y cuando algo se
  ignora por costumbre, el día que falle de verdad tampoco lo va a mirar nadie.

  Ahora se chequea cada estado por separado. Sigue siendo una prueba sobre el
  texto —no hay forma de ejecutar esto sin levantar el worker— pero al menos no
  se rompe si alguien corre Prettier.
*/
/*
  Se busca adentro del bloque `TARGET_STATES` y no en todo el archivo.

  Buscar en todo el archivo no sirve: `'ambiguous'` también aparece más abajo,
  en el cálculo del nivel de alerta. Con esa comprobación floja, alguien podía
  borrar el estado del listado y el test seguía en verde — lo probé sacándolo y
  no se enteró.
*/
const bloqueEstados = (service.match(/TARGET_STATES = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
assert.ok(bloqueEstados, 'no encontré la lista de estados: ¿le cambiaron el nombre?');
assert.ok(
  bloqueEstados.includes("'requires_approval'"),
  'requires_approval salió de los estados: una publicación podría irse sin aprobar'
);
assert.ok(
  bloqueEstados.includes("'ambiguous'"),
  'ambiguous salió de los estados: no habría forma de marcar una publicación dudosa'
);
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
