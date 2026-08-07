const assert = require('assert');
const { pesosToCents, centsToPesos } = require('../../utils/moneyConversion');
const { createProductoSchema } = require('../../schemas');

/**
 * Tests de la unidad de los recargos (extras y variantes).
 *
 * ── Qué se rompió ──────────────────────────────────────────────────────────
 *
 * `productos.variantes` y `productos.extras` guardan JSON como TEXTO, y el
 * conversor de plata no puede ver adentro de un string. Los recargos quedaban
 * afuera del sistema de unidades mientras `precio` —en la misma fila— sí se
 * convertía.
 *
 * La base siempre estuvo bien: 128 recargos, todos en centavos. Lo que estaba
 * roto era la pantalla. El TPV mostraba "+$100.000" donde había $1.000, y el
 * editor de extras del panel mostraba el número crudo.
 *
 * Eso también explica por qué nadie lo detectó antes: el panel no manda un
 * importe nuevo, reenvía el mismo string que recibió. Como la respuesta
 * tampoco convertía, el operador veía centavos, tipeaba centavos y guardaba
 * centavos. El círculo se cerraba solo y la base nunca se ensució.
 *
 * Estos tests fijan las dos puntas: centavos en la base, pesos en pantalla.
 */

const PESOS_EXTRA = 1200;
const PESOS_VARIANTE = 1500;

function extraDe(texto) {
  return JSON.parse(texto)[0].precio;
}
function varianteDe(texto) {
  return JSON.parse(texto)[0].opciones[0].precio_extra;
}

function testElPanelGuardaEnCentavos() {
  /*
    El panel manda FormData: todo llega como texto y `extras` sobrevive al
    schema como string. Si el conversor no entra a esa columna, el recargo se
    guarda en pesos y queda cien veces por debajo del resto de la fila.
  */
  let body = createProductoSchema.parse({
    nombre: 'Papas Full Cheddar',
    precio: '4000',
    variantes: JSON.stringify([
      { nombre: 'Tamaño', opciones: [{ nombre: 'Grande', precio_extra: PESOS_VARIANTE }] },
    ]),
    extras: JSON.stringify([{ nombre: 'Bacon', precio: PESOS_EXTRA }]),
  });
  body = pesosToCents(body);

  assert.strictEqual(body.precio, 400000, 'el precio del producto tiene que quedar en centavos');
  assert.strictEqual(
    extraDe(body.extras),
    PESOS_EXTRA * 100,
    'el extra tiene que guardarse en centavos, igual que el precio de la misma fila'
  );
  assert.strictEqual(
    varianteDe(body.variantes),
    PESOS_VARIANTE * 100,
    'el recargo de la variante también es plata y va en centavos'
  );

  console.log('  OK el panel guarda los recargos en centavos');
}

function testLaPantallaVeLosPesos() {
  /*
    Y a la vuelta el mismo string se convierte para el otro lado, así el mozo
    ve "+$1.200" y no "+$120.000".
  */
  const fila = {
    nombre: 'Papas Full Cheddar',
    precio: 400000,
    extras: JSON.stringify([{ nombre: 'Bacon', precio: PESOS_EXTRA * 100 }]),
    variantes: JSON.stringify([
      { nombre: 'Tamaño', opciones: [{ nombre: 'Grande', precio_extra: PESOS_VARIANTE * 100 }] },
    ]),
  };
  const alCliente = centsToPesos(fila);

  assert.strictEqual(alCliente.precio, 4000);
  assert.strictEqual(extraDe(alCliente.extras), PESOS_EXTRA, 'el TPV tiene que mostrar $1.200');
  assert.strictEqual(varianteDe(alCliente.variantes), PESOS_VARIANTE);

  console.log('  OK el TPV muestra los recargos en pesos');
}

function testIdaYVueltaNoPierdePlata() {
  const original = {
    precio: 4000,
    extras: JSON.stringify([{ nombre: 'Bacon', precio: PESOS_EXTRA }]),
  };
  const vuelta = centsToPesos(pesosToCents(original));
  assert.strictEqual(vuelta.precio, original.precio);
  assert.strictEqual(extraDe(vuelta.extras), PESOS_EXTRA);

  console.log('  OK guardar y volver a leer devuelve el mismo importe');
}

function testColumnaRotaNoRompeLaRespuesta() {
  /*
    Un `extras` con JSON inválido no puede voltear la respuesta entera: sin
    esto, un solo producto mal guardado dejaría el TPV sin catálogo.
  */
  const roto = centsToPesos({ precio: 400000, extras: '{no es json' });
  assert.strictEqual(roto.extras, '{no es json');
  assert.strictEqual(roto.precio, 4000);

  const vacio = centsToPesos({ extras: '', variantes: null });
  assert.strictEqual(vacio.extras, '');
  assert.strictEqual(vacio.variantes, null);

  console.log('  OK una columna corrupta no voltea la respuesta');
}

function testElPostreDelMenuDelDia() {
  /*
    La config del menú del día viaja en JSON, así que `extraPostrePrecio` ya
    se guarda en centavos. Ese mismo número se copia dentro del extra del
    plato, y ahora que la columna entra al conversor sale bien por pantalla.
  */
  const guardado = pesosToCents({ extraPostrePrecio: 1000 });
  assert.strictEqual(guardado.extraPostrePrecio, 100000);

  const plato = { extras: JSON.stringify([{ nombre: 'Postre', precio: 100000 }]) };
  assert.strictEqual(
    extraDe(centsToPesos(plato).extras),
    1000,
    'el postre tiene que verse $1.000 en el TPV, no $100.000'
  );

  console.log('  OK el postre del menú del día se muestra $1.000');
}

function testPrecioSugeridoLlegaEnPesos() {
  /*
    Estaba anidado como `precioSugerido: { economico, ejecutivo }`. El
    conversor reconoce "precioSugerido" pero el valor es un objeto, y adentro
    "economico" no lo reconoce nadie: el modal de plato nuevo prellenaba
    $500.000. Aplanado en claves que contienen "precio" se convierte solo.
  */
  const respuesta = centsToPesos({
    precioSugeridoEconomico: 500000,
    precioSugeridoEjecutivo: 700000,
  });
  assert.strictEqual(respuesta.precioSugeridoEconomico, 5000);
  assert.strictEqual(respuesta.precioSugeridoEjecutivo, 7000);

  const anidadoViejo = centsToPesos({ precioSugerido: { economico: 500000 } });
  assert.strictEqual(
    anidadoViejo.precioSugerido.economico,
    500000,
    'la forma vieja seguía sin convertirse: por eso se aplanó'
  );

  console.log('  OK el precio sugerido llega en pesos');
}

function run() {
  console.log('\nTests de la unidad de los recargos');
  testElPanelGuardaEnCentavos();
  testLaPantallaVeLosPesos();
  testIdaYVueltaNoPierdePlata();
  testColumnaRotaNoRompeLaRespuesta();
  testElPostreDelMenuDelDia();
  testPrecioSugeridoLlegaEnPesos();
  console.log('Todos los tests de la unidad de los recargos pasaron\n');
}

run();
