/**
 * El modo seguro del compositor.
 *
 * ── El bug que esto documenta ──────────────────────────────────────────────
 *
 * Esta regla existía y funcionaba. El problema era otro: la casilla que la
 * prende **no estaba en ninguna pantalla** y venía prendida de fábrica. Así
 * que cualquier intento de publicar en más de un lugar moría contra un cartel
 * rojo que decía "Modo de prueba: elegí manualmente un único destino", sin
 * decir qué era el modo de prueba ni dónde se apagaba.
 *
 * Un seguro sin manija no es un seguro: es una pared.
 *
 * ── Por qué hay tests de una regla que ya andaba ───────────────────────────
 *
 * Porque al sacarla de adentro de `createCampaign` para poder mostrarla y
 * apagarla desde la pantalla, se pudo haber cambiado sin querer. Y porque
 * ahora la usan dos lados —el servidor y el compositor— y tienen que decidir
 * igual: si divergen, el botón deja publicar algo que el servidor rechaza tres
 * segundos después.
 */
const assert = require('assert');
const { porQueFrenaElModoSeguro, MOTIVO } = require('../../services/social/modoSeguro');

module.exports = {
  'apagado no frena nada': () => {
    assert.strictEqual(porQueFrenaElModoSeguro({ modoSeguro: false, cantidadDestinos: 27 }), '');
  },

  'prendido, un destino solo pasa': () => {
    assert.strictEqual(porQueFrenaElModoSeguro({ modoSeguro: true, cantidadDestinos: 1 }), '');
  },

  'prendido, dos destinos frena': () => {
    assert.strictEqual(porQueFrenaElModoSeguro({ modoSeguro: true, cantidadDestinos: 2 }), MOTIVO);
  },

  'prendido, ningún destino frena': () => {
    /*
      Cero no es uno. Sin este caso, `!== 1` se podría relajar a `> 1` y una
      publicación sin destinos pasaría el seguro para morir más adelante con
      un error distinto y peor.
    */
    assert.strictEqual(porQueFrenaElModoSeguro({ modoSeguro: true, cantidadDestinos: 0 }), MOTIVO);
  },

  'un ensayo nunca se frena, publique donde publique': () => {
    /*
      El ensayo recorre todo y no publica nada. Limitarlo a un destino sería
      impedir justamente lo que sirve mirar: cómo queda el reparto entre los 27
      grupos, cuáles caen por las reglas y cuáles por el cupo del día. Con un
      solo grupo no se ve nada de eso.
    */
    assert.strictEqual(
      porQueFrenaElModoSeguro({
        modoSeguro: true,
        ensayo: true,
        cantidadDestinos: 27,
        cantidadConjuntos: 3,
      }),
      ''
    );
  },

  'un conjunto frena aunque el resto esté bien': () => {
    /*
      Los conjuntos crecen. Si el seguro contara los destinos de adentro,
      dejaría pasar un conjunto de uno hoy y frenaría el martes cuando alguien
      le agregue seis, sin que nadie haya tocado la publicación.
    */
    assert.strictEqual(
      porQueFrenaElModoSeguro({ modoSeguro: true, cantidadConjuntos: 1, cantidadDestinos: 1 }),
      MOTIVO
    );
  },

  'el motivo dice dónde se apaga': () => {
    /*
      Esto no es cosmética: era el bug. Un mensaje que nombra el problema y no
      la salida deja a la persona mirando una pantalla sin saber qué tocar.
    */
    assert.ok(MOTIVO.includes('Modo seguro'), 'nombra la casilla tal cual se ve');
    assert.ok(MOTIVO.includes('Más opciones'), 'y dice dónde está');
  },

  'sin argumentos no frena': () => {
    /*
      El caso de una campaña vieja, guardada antes de que esto existiera, que
      no tiene `personalizaciones`. Frenarla sería inventarle un seguro que
      nunca tuvo.
    */
    assert.strictEqual(porQueFrenaElModoSeguro(), '');
    assert.strictEqual(porQueFrenaElModoSeguro({}), '');
  },
};
