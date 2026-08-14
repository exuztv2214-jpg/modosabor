/**
 * Los errores de la base, en castellano y sin filtrar de más.
 *
 * ── Qué se arregló ─────────────────────────────────────────────────────────
 *
 * Cuando algo chocaba contra una regla de la base, en pantalla salía:
 *
 *     "Ya existe un registro con ese valor. Probá con otro."
 *
 * Y el detalle sólo se guardaba en desarrollo. En producción, quien estaba
 * atendiendo leía un cartel que no decía nada, y para saber qué campo estaba
 * repetido había que entrar a los registros del servidor. Pasó de verdad.
 *
 * ── La línea que este test cuida ───────────────────────────────────────────
 *
 * Un mensaje de SQLite trae dos cosas y **sólo una es sensible**:
 *
 *     UNIQUE constraint failed: personal.clock_pin
 *                               ^^^^^^^^^^^^^^^^^^  qué campo → se muestra
 *
 * El **valor** que se intentó guardar es privado, y no viaja en el mensaje de
 * SQLite. Pero si algún día alguien arma el mensaje concatenando el valor, esto
 * lo tiene que frenar: el punto 4 prueba justamente que nada que parezca un
 * dato de una persona termine en la respuesta.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { traducirErrorDeBase, camposDelError, nombreLegible } = require('../../utils/erroresDeBase');

function run() {
  console.log('\n🗣️  Errores de la base en castellano\n');

  // ── 1. Dice qué campo está repetido ───────────────────────────────────────
  const repetido = traducirErrorDeBase(new Error('UNIQUE constraint failed: personal.clock_pin'));
  assert.strictEqual(repetido.status, 409);
  assert.ok(repetido.error.includes('PIN del reloj'), `no nombra el campo: "${repetido.error}"`);
  console.log('  ✓ un valor repetido dice qué campo es');

  // Y cuando la regla abarca varios campos, los nombra a los dos.
  const combinado = traducirErrorDeBase(
    new Error('UNIQUE constraint failed: wa_envios.campana_id, wa_envios.telefono')
  );
  // Ninguno de los dos está en el diccionario, así que salen con el nombre
  // técnico legible. Es a propósito: feo pero informativo, y mucho mejor que
  // un cartel que no dice nada.
  assert.ok(
    combinado.error.includes('campana id') && combinado.error.includes('telefono'),
    `perdió uno de los dos campos: "${combinado.error}"`
  );
  console.log('  ✓ una regla sobre dos campos los nombra a los dos');

  // ── 2. Los otros tres tipos de error ──────────────────────────────────────
  const casos = [
    ['NOT NULL constraint failed: productos.nombre', 400, 'Falta completar'],
    ['FOREIGN KEY constraint failed', 400, 'ya no existe'],
    ['CHECK constraint failed: pedidos.total', 400, 'no es válido'],
  ];
  for (const [mensaje, status, esperado] of casos) {
    const salida = traducirErrorDeBase(new Error(mensaje));
    assert.ok(salida, `no reconoció: ${mensaje}`);
    assert.strictEqual(salida.status, status, `status equivocado para: ${mensaje}`);
    assert.ok(
      salida.error.includes(esperado),
      `"${salida.error}" no explica el problema de: ${mensaje}`
    );
  }
  console.log(`  ✓ reconoce los ${casos.length + 1} tipos de regla de la base`);

  // ── 3. Lo que NO es de la base sigue de largo ─────────────────────────────
  //
  // Devolver `null` es lo que deja que el manejo de siempre siga funcionando.
  // Si esto empezara a traducir cualquier error, un fallo de programación se
  // mostraría como si fuera un dato mal cargado y nadie lo investigaría.
  for (const ajeno of [
    new Error('Cannot read properties of undefined'),
    new Error('ECONNREFUSED'),
    new Error(''),
    null,
    undefined,
  ]) {
    assert.strictEqual(
      traducirErrorDeBase(ajeno),
      null,
      `tradujo un error que no es de la base: ${ajeno?.message}`
    );
  }
  console.log('  ✓ los errores que no son de la base no se tocan');

  // ── 4. El valor privado nunca sale ────────────────────────────────────────
  //
  // El punto más importante. Se simula el peor caso: un mensaje que sí trae el
  // dato de una persona. Lo que se muestra tiene que nombrar el campo y nada
  // más.
  // Un campo bien formado sí se nombra, y el nombre técnico de la tabla no sale.
  const limpio = traducirErrorDeBase(new Error('UNIQUE constraint failed: clientes.telefono'));
  assert.ok(limpio.error.includes('teléfono'), 'dejó de nombrar el campo');
  assert.ok(!limpio.error.includes('clientes.'), 'está mostrando el nombre técnico de la tabla');
  console.log('  ✓ el campo se nombra sin mostrar la tabla');

  /*
    Y el peor caso: un mensaje que trae el valor pegado al campo.

    `camposDelError` sólo acepta lo que tiene la forma exacta `tabla.columna`.
    Un pedazo como `clientes.telefono (value '3863555444')` no la cumple, así
    que **no se reconoce ningún campo** y la respuesta cae al mensaje general.

    O sea: se pierde el nombre del campo antes que arriesgarse a filtrar el
    dato de un cliente. Es la decisión correcta y conviene que quede fijada
    acá, porque aflojar esa expresión para "mejorar el mensaje" sería
    exactamente cómo se filtraría un teléfono a la pantalla.
  */
  const conDato = traducirErrorDeBase(
    new Error("UNIQUE constraint failed: clientes.telefono (value '3863555444')")
  );
  assert.ok(
    !conDato.error.includes('3863555444'),
    `el teléfono del cliente salió en pantalla: "${conDato.error}"`
  );
  assert.ok(
    conDato.error.includes('ese valor'),
    'ante un mensaje raro tiene que caer al general, no improvisar'
  );
  console.log('  ✓ ante un mensaje con el dato adentro, no filtra nada');

  // ── 5. Un campo desconocido no rompe ──────────────────────────────────────
  //
  // El diccionario tiene los campos que alguien puede chocar desde una
  // pantalla. Para el resto se muestra el nombre técnico legible, que es feo
  // pero infinitamente mejor que "ese valor".
  assert.strictEqual(nombreLegible('tabla_nueva.algun_campo'), 'algun campo');
  const desconocido = traducirErrorDeBase(
    new Error('UNIQUE constraint failed: tabla_nueva.algun_campo')
  );
  assert.ok(
    desconocido.error.includes('algun campo'),
    'un campo sin traducción dejó de decir cuál es'
  );
  console.log('  ✓ un campo sin traducción igual se nombra');

  // Y un mensaje sin campos no inventa ninguno.
  assert.deepStrictEqual(camposDelError('FOREIGN KEY constraint failed'), []);
  assert.ok(
    traducirErrorDeBase(new Error('UNIQUE constraint failed')).error.includes('ese valor'),
    'sin campo reconocible tiene que caer al mensaje general'
  );
  console.log('  ✓ sin campo reconocible cae al mensaje general');

  // ── 6. Que el servidor lo use ─────────────────────────────────────────────
  //
  // Lo de arriba prueba la función. Esto prueba que alguien la llame: sin esto
  // el traductor sería un archivo perfecto que nadie ejecuta.
  const servidor = fs
    .readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    servidor.includes('traducirErrorDeBase(error)'),
    'el manejador de errores dejó de traducir los errores de la base'
  );
  assert.ok(
    /require\(['"]\.\/utils\/erroresDeBase['"]\)/.test(servidor),
    'se perdió el import del traductor'
  );
  console.log('  ✓ el manejador de errores del servidor lo usa\n');

  console.log('✅ Errores de la base: dicen qué campo, sin filtrar el valor\n');
}

if (require.main === module) run();

module.exports = { run };
