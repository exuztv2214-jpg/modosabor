/**
 * Salud del número de WhatsApp.
 *
 * ── Qué pasó ───────────────────────────────────────────────────────────────
 *
 * El tablero de WhatsApp Masivo mostraba "Crítico" en rojo con cero mensajes
 * enviados. No era un dato mal calculado: con todo en cero la fórmula daba 30
 * fijo, y 30 cae debajo del corte de 50, así que salía riesgo alto.
 *
 * El primer test de acá es ese caso exacto. Los demás cuidan que arreglarlo no
 * haya roto la medición cuando sí hay datos.
 */
const assert = require('assert');
const { evaluarSalud } = require('../../services/whatsappMasivo/reglas');

module.exports = {
  'sin envíos no hay diagnóstico, hay ausencia de datos': () => {
    const r = evaluarSalud({ enviados: 0, exitosos: 0, respuestas: 0, bajas: 0 });

    assert.strictEqual(r.sinDatos, true, 'tiene que avisar que no hay nada medido');
    assert.strictEqual(r.score, null, 'sin envíos no puede haber puntaje');
    assert.strictEqual(r.riesgo, null, 'sin envíos no puede haber riesgo');
    assert.strictEqual(r.tasaExito, null);
    assert.strictEqual(r.tasaRespuesta, null);
    assert.strictEqual(r.tasaBaja, null);
  },

  'sin argumentos tampoco inventa un puntaje': () => {
    const r = evaluarSalud();
    assert.strictEqual(r.sinDatos, true);
    assert.strictEqual(r.riesgo, null);
  },

  'un número sano da riesgo bajo': () => {
    /* 100 mandados, todos entregados, 25 contestaron, ninguna baja. */
    const r = evaluarSalud({ enviados: 100, exitosos: 100, respuestas: 25, bajas: 0 });

    assert.strictEqual(r.sinDatos, false);
    assert.strictEqual(r.tasaExito, 100);
    assert.strictEqual(r.tasaRespuesta, 25);
    assert.strictEqual(r.tasaBaja, 0);
    /* 100×0,4 + min(50,30) + max(0,30−0) = 100 */
    assert.strictEqual(r.score, 100);
    assert.strictEqual(r.riesgo, 'bajo');
  },

  'muchas bajas y pocas respuestas dan riesgo alto': () => {
    /* 100 mandados, 60 entregados, 3 contestaron, 12 pidieron la baja. */
    const r = evaluarSalud({ enviados: 100, exitosos: 60, respuestas: 3, bajas: 12 });

    assert.strictEqual(r.sinDatos, false);
    assert.strictEqual(r.tasaExito, 60);
    assert.strictEqual(r.tasaRespuesta, 5);
    assert.strictEqual(r.tasaBaja, 20);
    /* 60×0,4 + min(10,30) + max(0,30−200) = 24 + 10 + 0 = 34 */
    assert.strictEqual(r.score, 34);
    assert.strictEqual(r.riesgo, 'alto', 'este sí es un número para preocuparse');
  },

  /*
    Acá había un test que decía "el puntaje nunca se va de 0 a 100" y no
    probaba nada: se rompió a propósito el tope —subiéndolo a 100.000— y el
    test siguió en verde.

    El motivo es que los tres términos ya están acotados por separado: la tasa
    de entrega aporta como mucho 40, las respuestas 30 y las bajas 30. El
    máximo posible es exactamente 100 y el mínimo 0, así que el Math.min/max
    de afuera no puede dispararse nunca. Es red de seguridad, no una regla.

    Un test que no puede fallar es peor que ninguno: cuenta como cobertura y
    no cubre. Por eso no está.
  */

  'entregar poco de lo que se manda baja el puntaje': () => {
    /*
      Mismo comportamiento de la gente, distinta entrega. El que entrega la
      mitad tiene que puntuar peor: si los mensajes no llegan, algo pasa con
      el número.
    */
    const entregaTodo = evaluarSalud({ enviados: 100, exitosos: 100, respuestas: 20, bajas: 0 });
    const entregaMitad = evaluarSalud({ enviados: 100, exitosos: 50, respuestas: 10, bajas: 0 });

    assert.ok(
      entregaMitad.score < entregaTodo.score,
      'entregar la mitad tiene que puntuar peor que entregar todo'
    );
  },
};
