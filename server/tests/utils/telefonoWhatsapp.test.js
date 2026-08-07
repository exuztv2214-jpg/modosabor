const assert = require('assert');

const {
  normalizarTelefono,
  aJid,
  deJid,
  formatearTelefono,
} = require('../../services/whatsappMasivo/telefono');

/**
 * Tests de la normalización de teléfonos.
 *
 * ── Por qué importa tanto ──────────────────────────────────────────────────
 *
 * Es el único lugar del envío masivo donde un error no hace ruido. Si el
 * número queda mal armado, WhatsApp no devuelve "número inválido": el
 * mensaje no llega y listo. Con ciento cincuenta destinatarios nadie se
 * entera de cuáles se perdieron.
 *
 * Y peor: un 9 mal puesto no rompe el número, lo convierte en otro número
 * válido. Ahí el mensaje sí llega, pero a un desconocido.
 *
 * Los casos de abajo son las formas reales en que el mostrador carga un
 * teléfono en `clientes.telefono`.
 */

const ESPERADO = '5493815554433';

function testLasFormasEnQueSeCarga() {
  const variantes = [
    ['3815554433', 'como lo dicta el cliente, sin nada adelante'],
    ['03815554433', 'con el 0 de larga distancia'],
    ['0381 15 555-4433', 'con 0 y 15, que es como se marca para llamar'],
    ['381 15 5554433', 'con 15 pero sin 0'],
    ['+54 9 381 555 4433', 'internacional completo'],
    ['5493815554433', 'ya normalizado: tiene que quedar igual'],
    ['543815554433', 'con 54 pero sin el 9'],
    ['(0381) 15-555-4433', 'con paréntesis y guiones'],
    ['0054 9 381 555 4433', 'con los ceros de discado internacional'],
  ];

  variantes.forEach(([entrada, porque]) => {
    assert.strictEqual(
      normalizarTelefono(entrada),
      ESPERADO,
      `"${entrada}" (${porque}) tenía que dar ${ESPERADO}`
    );
  });

  console.log(`  OK las ${variantes.length} formas de cargarlo dan el mismo número`);
}

function testCabaLlevaAreaDeDosDigitos() {
  // Buenos Aires es 11 y el abonado tiene 8 dígitos; el resto del país usa
  // áreas de 3 o 4. Si se asume un largo fijo, CABA queda mal.
  assert.strictEqual(normalizarTelefono('011 15 4123-4567'), '5491141234567');
  assert.strictEqual(normalizarTelefono('+541141234567'), '5491141234567');
  console.log('  OK los números de Buenos Aires se arman bien');
}

function testLoQueNoSeManda() {
  /*
    Cualquier cosa dudosa devuelve null y el contacto se saltea. Es preferible
    no escribirle a alguien antes que escribirle a la persona equivocada.
  */
  const invalidos = [
    ['', 'vacío'],
    [null, 'nulo'],
    ['sin número', 'texto suelto'],
    ['12345', 'muy corto'],
    ['38155544', 'incompleto'],
    ['38155544331234', 'demasiado largo'],
    ['0815554433', 'área que arranca en 0'],
    ['1235554433', 'área que arranca en 1 y no es CABA'],
  ];

  invalidos.forEach(([entrada, porque]) => {
    assert.strictEqual(
      normalizarTelefono(entrada),
      null,
      `"${entrada}" (${porque}) tenía que quedar afuera, no convertirse en un número`
    );
  });

  console.log(`  OK los ${invalidos.length} casos dudosos se saltean en vez de adivinarse`);
}

function testNoSeDuplicaElNueve() {
  /*
    El error clásico: agregar el 9 a un número que ya lo tenía. Da un número
    de trece dígitos que WhatsApp acepta como válido pero es de otra persona.
  */
  const unaVez = normalizarTelefono('5493815554433');
  const dosVeces = normalizarTelefono(unaVez);
  assert.strictEqual(dosVeces, unaVez, 'normalizar dos veces tiene que dar lo mismo');
  assert.ok(!unaVez.startsWith('5499'), 'quedó un 9 de más: ese número es de otra persona');
  console.log('  OK normalizar un número ya normalizado no lo cambia');
}

function testJid() {
  assert.strictEqual(aJid('0381 15 555-4433'), `${ESPERADO}@s.whatsapp.net`);
  assert.strictEqual(aJid('no es un número'), null, 'un teléfono inválido no puede dar un JID');
  assert.strictEqual(deJid(`${ESPERADO}@s.whatsapp.net`), ESPERADO);
  // Baileys a veces trae el JID con sufijo de dispositivo.
  assert.strictEqual(deJid(`${ESPERADO}:12@s.whatsapp.net`), ESPERADO);
  // Menos de seis dígitos no es un teléfono: mejor null que un dato basura.
  assert.strictEqual(deJid('12345@g.us'), null);
  console.log('  OK la ida y vuelta con el JID de WhatsApp');
}

function testFormato() {
  assert.strictEqual(formatearTelefono('03815554433'), '+54 9 381 555-4433');
  assert.strictEqual(formatearTelefono('011 15 4123-4567'), '+54 9 11 4123-4567');
  // Si no se puede normalizar, se muestra tal cual se cargó: esconder el dato
  // le impide al operador darse cuenta de que está mal escrito.
  assert.strictEqual(formatearTelefono('sin numero'), 'sin numero');
  console.log('  OK el formato para mostrar en pantalla');
}

function run() {
  console.log('\nTests de teléfonos para WhatsApp');
  testLasFormasEnQueSeCarga();
  testCabaLlevaAreaDeDosDigitos();
  testLoQueNoSeManda();
  testNoSeDuplicaElNueve();
  testJid();
  testFormato();
  console.log('Todos los tests de teléfonos pasaron\n');
}

run();
