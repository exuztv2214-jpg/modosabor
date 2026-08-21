/**
 * La política de envío social.
 *
 * ── Por qué este módulo tiene tantos tests ─────────────────────────────────
 *
 * Es lo único que separa "publicar en 35 grupos con un click" de "que te
 * bloqueen la cuenta". Y a diferencia de casi todo lo demás del sistema, **no
 * se puede probar a mano**: para verificar que el cupo diario funciona habría
 * que publicar veinticinco veces de verdad.
 *
 * Por eso el módulo no toca la base ni la red: recibe el estado ya leído y
 * devuelve una decisión. Eso permite probar cada regla en aislamiento, y
 * también las combinaciones, que es donde suelen aparecer las sorpresas.
 */
const assert = require('assert');
const {
  canDispatch,
  repartirPorDia,
  intervaloConJitter,
  manana,
} = require('../../services/social/politicaEnvio');

/* Un momento fijo para que los tests no dependan del reloj. */
const AHORA = new Date('2026-08-21T23:00:00.000Z'); // 20:00 en Argentina
const haceMinutos = (m) => new Date(AHORA.getTime() - m * 60 * 1000);
const haceHoras = (h) => new Date(AHORA.getTime() - h * 3600 * 1000);

/* Sin desvío al azar, para que el intervalo sea el que dice ser. */
const sinAzar = () => 0.5;

const base = (extra = {}) => ({
  estado: { esGrupo: true, ...extra },
  config: {},
  ahora: AHORA,
  azar: sinAzar,
});

module.exports = {
  // ── Regla 1: pausa manual ───────────────────────────────────────────────
  'la pausa general frena todo': () => {
    const r = canDispatch(base({ pausaGlobal: true }));
    assert.strictEqual(r.permitido, false);
    assert.strictEqual(r.codigo, 'PAUSA_GLOBAL');
  },

  'la pausa de una identidad no depende del reloj': () => {
    /*
      `reintentarEn` en null significa "no vuelvas a preguntar dentro de un
      rato": esto lo levanta una persona, no el tiempo. Devolver una fecha
      haría que el motor reintentara solo y la pausa no serviría de nada.
    */
    const r = canDispatch(base({ identidadPausada: true }));
    assert.strictEqual(r.permitido, false);
    assert.strictEqual(r.codigo, 'PAUSA_IDENTIDAD');
    assert.strictEqual(r.reintentarEn, null);
  },

  'la pausa manual gana sobre cualquier otra regla': () => {
    /*
      El orden importa para el mensaje. Con todo mal a la vez, tiene que decir
      que está pausado a mano y no "faltan 40 segundos", que mandaría a esperar
      algo que no va a pasar solo.
    */
    const r = canDispatch(
      base({
        pausaGlobal: true,
        fallosSeguidos: 99,
        enviadosHoyIdentidad: 999,
        ultimoEnvioIdentidad: AHORA,
      })
    );
    assert.strictEqual(r.codigo, 'PAUSA_GLOBAL');
  },

  // ── Regla 2: fallos seguidos ────────────────────────────────────────────
  'se frena sola después de varios fallos seguidos': () => {
    const r = canDispatch(base({ fallosSeguidos: 5 }));
    assert.strictEqual(r.permitido, false);
    assert.strictEqual(r.codigo, 'DEMASIADOS_FALLOS');
  },

  'con menos fallos que el tope sigue andando': () => {
    const r = canDispatch(base({ fallosSeguidos: 4 }));
    assert.strictEqual(r.permitido, true);
  },

  'los fallos se evalúan antes que el cupo': () => {
    /*
      Gastar cupo en intentos que van a fallar es tirar cupo. Si algo se rompió
      del otro lado, hay que decir eso y no "te quedaste sin cupo".
    */
    const r = canDispatch(base({ fallosSeguidos: 9, enviadosHoyIdentidad: 999 }));
    assert.strictEqual(r.codigo, 'DEMASIADOS_FALLOS');
  },

  // ── Regla 3: cupo diario por identidad ──────────────────────────────────
  'el cupo diario frena al llegar al tope': () => {
    const r = canDispatch(base({ enviadosHoyIdentidad: 25 }));
    assert.strictEqual(r.permitido, false);
    assert.strictEqual(r.codigo, 'CUPO_DIARIO');
  },

  'uno antes del tope todavía pasa': () => {
    const r = canDispatch(base({ enviadosHoyIdentidad: 24 }));
    assert.strictEqual(r.permitido, true);
  },

  'el cupo se reinicia al día siguiente en hora argentina': () => {
    /*
      A las 20:00 de Argentina ya es el día siguiente en UTC. Si el corte fuera
      por día UTC, el cupo se reiniciaría a las nueve de la noche — en plena
      hora de venta — y se podría publicar el doble sin querer.
    */
    const r = canDispatch(base({ enviadosHoyIdentidad: 25 }));
    const reinicio = r.reintentarEn;
    assert.ok(reinicio > AHORA, 'tiene que ser en el futuro');

    /* Medianoche argentina = 03:00 UTC. */
    assert.strictEqual(reinicio.getUTCHours(), 3);
  },

  'el cupo es configurable': () => {
    const r = canDispatch({
      ...base({ enviadosHoyIdentidad: 5 }),
      config: { cupoDiario: 5 },
    });
    assert.strictEqual(r.codigo, 'CUPO_DIARIO');
  },

  // ── Regla 4: cupo de Instagram ──────────────────────────────────────────
  'Instagram tiene su propio techo': () => {
    const r = canDispatch(base({ esInstagram: true, esGrupo: false, enviadosHoyInstagram: 50 }));
    assert.strictEqual(r.codigo, 'CUPO_INSTAGRAM');
  },

  'el techo de Instagram no afecta a Facebook': () => {
    const r = canDispatch(base({ esInstagram: false, enviadosHoyInstagram: 999 }));
    assert.strictEqual(r.permitido, true);
  },

  // ── Regla 5: descanso del grupo ─────────────────────────────────────────
  'no se publica dos veces seguidas en el mismo grupo': () => {
    const r = canDispatch(base({ ultimoEnvioAlDestino: haceHoras(3) }));
    assert.strictEqual(r.permitido, false);
    assert.strictEqual(r.codigo, 'GRUPO_EN_DESCANSO');
    assert.ok(r.reintentarEn > AHORA);
  },

  'pasadas las 24 horas el grupo vuelve a estar disponible': () => {
    const r = canDispatch(base({ ultimoEnvioAlDestino: haceHoras(25) }));
    assert.strictEqual(r.permitido, true);
  },

  'el descanso es sólo para grupos': () => {
    /*
      El feed de la página o de Instagram se puede usar más de una vez por día
      sin que nadie se moleste. El límite de los grupos es social, no técnico.
    */
    const r = canDispatch(base({ esGrupo: false, ultimoEnvioAlDestino: haceHoras(1) }));
    assert.strictEqual(r.permitido, true);
  },

  // ── Regla 6: intervalo con desvío ───────────────────────────────────────
  'hay que esperar entre un destino y el siguiente': () => {
    const r = canDispatch(base({ ultimoEnvioIdentidad: haceMinutos(0.5) }));
    assert.strictEqual(r.permitido, false);
    assert.strictEqual(r.codigo, 'ESPERANDO_INTERVALO');
  },

  'pasado el intervalo se puede seguir': () => {
    const r = canDispatch(base({ ultimoEnvioIdentidad: haceMinutos(5) }));
    assert.strictEqual(r.permitido, true);
  },

  'el primero de la tanda sale sin esperar': () => {
    const r = canDispatch(base({ ultimoEnvioIdentidad: null }));
    assert.strictEqual(r.permitido, true);
  },

  'el desvío mueve el intervalo para los dos lados': () => {
    /*
      Un intervalo exacto es la firma más obvia de un programa. Con ±40% sobre
      90 segundos, tiene que poder dar tanto 54 como 126.
    */
    const config = { intervaloSegundos: 90, jitter: 0.4 };
    assert.strictEqual(
      intervaloConJitter(config, () => 0),
      54,
      'el mínimo'
    );
    assert.strictEqual(
      intervaloConJitter(config, () => 1),
      126,
      'el máximo'
    );
    assert.strictEqual(
      intervaloConJitter(config, () => 0.5),
      90,
      'el centro'
    );
  },

  'sin desvío el intervalo es exacto': () => {
    const config = { intervaloSegundos: 60, jitter: 0 };
    assert.strictEqual(
      intervaloConJitter(config, () => 0),
      60
    );
    assert.strictEqual(
      intervaloConJitter(config, () => 1),
      60
    );
  },

  'el intervalo nunca queda en cero': () => {
    /* Con jitter al máximo y un intervalo chico, el piso es un segundo. */
    const config = { intervaloSegundos: 1, jitter: 0.9 };
    assert.ok(intervaloConJitter(config, () => 0) >= 1);
  },

  // ── Todo bien ───────────────────────────────────────────────────────────
  'sin nada que lo frene, se publica': () => {
    const r = canDispatch(base());
    assert.strictEqual(r.permitido, true);
    assert.strictEqual(r.codigo, 'OK');
  },

  // ── El excedente ────────────────────────────────────────────────────────
  'lo que no entra hoy queda para mañana, no falla': () => {
    const grupos = Array.from({ length: 35 }, (_, i) => `grupo-${i + 1}`);
    const reparto = repartirPorDia(grupos, { cupoDiario: 25, ahora: AHORA });

    const hoy = reparto.filter((x) => x.dia === 0);
    const manana_ = reparto.filter((x) => x.dia === 1);

    assert.strictEqual(hoy.length, 25, 'hoy entran veinticinco');
    assert.strictEqual(manana_.length, 10, 'los diez restantes quedan para mañana');
    assert.strictEqual(reparto.length, 35, 'no se pierde ninguno');
  },

  'el reparto respeta lo que ya se publicó hoy': () => {
    const grupos = Array.from({ length: 10 }, (_, i) => `g${i}`);
    const reparto = repartirPorDia(grupos, {
      cupoDiario: 25,
      yaEnviadosHoy: 20,
      ahora: AHORA,
    });

    assert.strictEqual(
      reparto.filter((x) => x.dia === 0).length,
      5,
      'quedaban cinco de cupo, entran cinco'
    );
    assert.strictEqual(reparto.filter((x) => x.dia === 1).length, 5);
  },

  'una tanda muy grande se reparte en varios días': () => {
    const grupos = Array.from({ length: 60 }, (_, i) => `g${i}`);
    const reparto = repartirPorDia(grupos, { cupoDiario: 25, ahora: AHORA });

    const dias = [...new Set(reparto.map((x) => x.dia))];
    assert.deepStrictEqual(dias, [0, 1, 2], 'veinticinco, veinticinco y diez');
  },

  'los de hoy salen ahora y los demás tienen fecha': () => {
    const reparto = repartirPorDia(['a', 'b'], { cupoDiario: 1, ahora: AHORA });

    assert.strictEqual(reparto[0].programadoPara, null, 'el de hoy sale ya');
    assert.ok(reparto[1].programadoPara instanceof Date, 'el de mañana tiene fecha');
    assert.ok(reparto[1].programadoPara > AHORA);
  },

  // ── El día del negocio ──────────────────────────────────────────────────
  'el día nuevo empieza a la medianoche argentina': () => {
    /* 21 de agosto, 23:00 UTC = 20:00 en Argentina. El día nuevo es a las 03:00 UTC del 22. */
    const proximo = manana(AHORA);
    assert.strictEqual(proximo.getUTCDate(), 22);
    assert.strictEqual(proximo.getUTCHours(), 3);
  },

  'a las diez de la noche el cupo se reinicia esa misma medianoche': () => {
    /*
      Este es el caso que importa y el único que distingue las dos versiones.

      Entre las 21:00 y la medianoche de Argentina, el servidor ya pasó de día
      en UTC pero el local todavía no cerró. Si el corte se hiciera por día UTC,
      el cupo se reiniciaría **veinticuatro horas más tarde de lo que
      corresponde**: en plena hora de venta, la campaña quedaría frenada toda la
      noche siguiente sin motivo.

      El test anterior no alcanza: a las 23:00 UTC las dos versiones dan la
      misma respuesta de casualidad. Lo comprobé rompiendo el módulo a
      propósito y el test siguió en verde.
    */
    const casiMedianocheEnTucuman = new Date('2026-08-22T01:00:00.000Z'); // 21 de agosto, 22:00
    const proximo = manana(casiMedianocheEnTucuman);

    assert.strictEqual(proximo.getUTCDate(), 22, 'es dentro de dos horas, no mañana');
    assert.strictEqual(proximo.getUTCHours(), 3);
  },
};
