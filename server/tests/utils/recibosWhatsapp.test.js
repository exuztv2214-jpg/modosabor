/**
 * Recibos de WhatsApp: entregado y leído.
 *
 * ── Por qué importa ────────────────────────────────────────────────────────
 *
 * Hasta ahora "enviado" sólo quería decir que el mensaje salió del servidor.
 * Un número al que WhatsApp empezó a frenar se veía igual que uno sano: los
 * dos mostraban todo enviado. Los recibos son lo único que distingue "salió"
 * de "llegó".
 *
 * ── Qué se prueba acá ──────────────────────────────────────────────────────
 *
 * La regla de traducción: qué número de estado significa qué, y qué pasa
 * cuando los recibos llegan repetidos o al revés — que es lo normal, no la
 * excepción.
 *
 * La escritura en la base se prueba aparte; acá interesa la decisión, que es
 * donde estuvo siempre el error.
 */
const assert = require('assert');

/*
  La misma traducción que hace conexion.js. Se replica porque importar la
  conexión levanta Baileys entero, y esto es una regla de dos líneas.

  Los números los define WhatsApp:
    2 · el servidor de WhatsApp lo recibió
    3 · le llegó al teléfono
    4 · lo abrió
    5 · escuchó el audio
*/
function leerRecibo(estado) {
  const n = Number(estado);
  if (!Number.isFinite(n) || n < 3) return null;
  return { entregado: n >= 3, leido: n >= 4 };
}

/*
  Y la regla de escritura: la primera hora gana, las siguientes se descartan.
  Es lo que hace COALESCE en el UPDATE.
*/
function aplicar(actual, recibo) {
  if (!recibo) return actual;
  return {
    entregadoEn: recibo.entregado ? (actual.entregadoEn ?? 'ahora') : actual.entregadoEn,
    leidoEn: recibo.leido ? (actual.leidoEn ?? 'ahora') : actual.leidoEn,
  };
}

module.exports = {
  'salir del servidor no es haber llegado': () => {
    /*
      El estado 2 dice que el servidor de WhatsApp tomó el mensaje. No dice
      nada del teléfono del cliente. Contarlo como entregado es exactamente el
      error que hacía que un número frenado puntuara como sano.
    */
    assert.strictEqual(leerRecibo(2), null, 'el estado 2 no es entrega');
    assert.strictEqual(leerRecibo(1), null, 'pendiente tampoco');
    assert.strictEqual(leerRecibo(0), null, 'error tampoco');
  },

  'entregado y leído se leen bien': () => {
    assert.deepStrictEqual(leerRecibo(3), { entregado: true, leido: false });
    assert.deepStrictEqual(leerRecibo(4), { entregado: true, leido: true });
    assert.deepStrictEqual(leerRecibo(5), { entregado: true, leido: true });
  },

  'leído implica entregado aunque no haya llegado el recibo de entrega': () => {
    /*
      Pasa seguido: el cliente abre el mensaje enseguida y WhatsApp manda un
      solo recibo, el de leído. Si "leído" no marcara también entregado,
      quedaría un mensaje leído que figura como no entregado.
    */
    const r = leerRecibo(4);
    assert.strictEqual(r.entregado, true, 'no se puede leer algo que no llegó');
  },

  'un estado raro no rompe nada': () => {
    assert.strictEqual(leerRecibo(undefined), null);
    assert.strictEqual(leerRecibo(null), null);
    assert.strictEqual(leerRecibo('hola'), null);
  },

  'la primera hora manda: el segundo recibo no la pisa': () => {
    let fila = { entregadoEn: null, leidoEn: null };

    fila = aplicar(fila, leerRecibo(3));
    assert.strictEqual(fila.entregadoEn, 'ahora');

    /* Llega otra vez el mismo recibo, cosa que pasa. */
    fila = { ...fila, entregadoEn: 'las 20:15' };
    fila = aplicar(fila, leerRecibo(3));
    assert.strictEqual(
      fila.entregadoEn,
      'las 20:15',
      'el recibo repetido no puede correr la hora original'
    );
  },

  'los recibos desordenados no dejan huecos': () => {
    /*
      Llega primero el de leído y después el de entregado. Con este orden, un
      UPDATE ingenuo dejaría la entrega marcada más tarde que la lectura.
    */
    let fila = { entregadoEn: null, leidoEn: null };

    fila = aplicar(fila, leerRecibo(4));
    assert.strictEqual(fila.leidoEn, 'ahora');
    assert.strictEqual(fila.entregadoEn, 'ahora', 'leído tiene que marcar entrega también');

    fila = { entregadoEn: 'las 20:10', leidoEn: 'las 20:12' };
    fila = aplicar(fila, leerRecibo(3));
    assert.strictEqual(fila.entregadoEn, 'las 20:10', 'no se retrocede');
    assert.strictEqual(fila.leidoEn, 'las 20:12', 'ni se borra la lectura');
  },
};
