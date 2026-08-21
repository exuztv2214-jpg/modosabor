/**
 * Las autolistas: contenido que se publica solo.
 *
 * ── El test que justifica todo este archivo ────────────────────────────────
 *
 * El reloj corre cada treinta segundos. Una autolista configurada para las
 * 20:00 tiene que publicar **una vez**, no ciento veinte veces entre las 20:00
 * y las 21:00.
 *
 * Es el bug más obvio de cualquier sistema de horarios y el más fácil de no
 * ver hasta que pasa — y cuando pasa, pasa en los grupos de otra gente.
 */
const assert = require('assert');
const db = require('../../db');
const autolistas = require('../../services/social/autolistas');

let n = 0;
const unico = () => `${Date.now()}-${++n}`;

/* Un jueves a las 20:00 de Argentina = 23:00 UTC. */
const JUEVES_20 = new Date('2026-08-20T23:00:00.000Z');
const JUEVES_21 = new Date('2026-08-21T00:00:00.000Z');
const VIERNES_20 = new Date('2026-08-21T23:00:00.000Z');

function armarLista(extra = {}) {
  return autolistas.crear({
    nombre: `Lista ${unico()}`,
    destinos: [1],
    dias: [4], // jueves
    horas: [20],
    ...extra,
  });
}

module.exports = {
  // ── El horario, en hora de Argentina ────────────────────────────────────
  'el día y la hora se leen en hora de Argentina': () => {
    /*
      A las 23:00 UTC del jueves, en Tucumán son las 20:00 del jueves. Si se
      leyera la hora del servidor, el sistema creería que es viernes a las 23
      y publicaría el día equivocado.
    */
    const momento = autolistas.momentoLocal(JUEVES_20);
    assert.strictEqual(momento.dia, 4, 'jueves');
    assert.strictEqual(momento.hora, 20);
  },

  'le toca cuando coinciden el día y la hora': () => {
    assert.strictEqual(autolistas.leToca(armarLista(), JUEVES_20), true);
  },

  'no le toca a otra hora del mismo día': () => {
    assert.strictEqual(autolistas.leToca(armarLista(), JUEVES_21), false);
  },

  'no le toca otro día a la misma hora': () => {
    assert.strictEqual(autolistas.leToca(armarLista(), VIERNES_20), false);
  },

  'una lista apagada no publica nunca': () => {
    const lista = armarLista();
    const apagada = autolistas.actualizar(lista.id, { activa: false });
    assert.strictEqual(autolistas.leToca(apagada, JUEVES_20), false);
  },

  'no publica dos veces en la misma hora': () => {
    /*
      ── El test que más importa ──────────────────────────────────────────────

      El reloj corre cada treinta segundos. Sin este control, una autolista de
      las 20:00 publicaría ciento veinte veces entre las 20:00 y las 21:00.
    */
    const lista = armarLista();
    assert.strictEqual(autolistas.leToca(lista, JUEVES_20), true, 'la primera vez sí');

    db.prepare('UPDATE social_autolistas SET ultima_salida = ? WHERE id = ?').run(
      JUEVES_20.toISOString().replace('T', ' ').slice(0, 19),
      lista.id
    );

    const recargada = autolistas.obtener(lista.id);
    assert.strictEqual(
      autolistas.leToca(recargada, new Date(JUEVES_20.getTime() + 30_000)),
      false,
      'treinta segundos después, no'
    );
    assert.strictEqual(
      autolistas.leToca(recargada, new Date(JUEVES_20.getTime() + 59 * 60_000)),
      false,
      'ni cincuenta y nueve minutos después'
    );
  },

  'la semana siguiente vuelve a tocarle': () => {
    const lista = armarLista();
    db.prepare('UPDATE social_autolistas SET ultima_salida = ? WHERE id = ?').run(
      JUEVES_20.toISOString().replace('T', ' ').slice(0, 19),
      lista.id
    );

    const dentroDeUnaSemana = new Date(JUEVES_20.getTime() + 7 * 24 * 3600 * 1000);
    assert.strictEqual(autolistas.leToca(autolistas.obtener(lista.id), dentroDeUnaSemana), true);
  },

  // ── La fila circular ────────────────────────────────────────────────────
  'la primera pieza de la fila es la que sale': () => {
    const lista = armarLista();
    autolistas.agregarPieza(lista.id, { texto: 'Primera' });
    autolistas.agregarPieza(lista.id, { texto: 'Segunda' });

    assert.strictEqual(autolistas.proximaPieza(lista.id).texto, 'Primera');
  },

  'al publicarse, la pieza vuelve al final': () => {
    /*
      Es el corazón del modo circular. Con diez piezas y tres salidas por
      semana, la misma vuelve a aparecer recién a las tres semanas y media.
    */
    const lista = armarLista();
    autolistas.agregarPieza(lista.id, { texto: 'Primera' });
    autolistas.agregarPieza(lista.id, { texto: 'Segunda' });
    autolistas.agregarPieza(lista.id, { texto: 'Tercera' });

    const sale = autolistas.proximaPieza(lista.id);
    autolistas.mandarAlFinal(sale);

    assert.strictEqual(autolistas.proximaPieza(lista.id).texto, 'Segunda');

    /* Y después de dar la vuelta entera, vuelve la primera. */
    autolistas.mandarAlFinal(autolistas.proximaPieza(lista.id));
    autolistas.mandarAlFinal(autolistas.proximaPieza(lista.id));
    assert.strictEqual(autolistas.proximaPieza(lista.id).texto, 'Primera');
  },

  'se cuenta cuántas veces salió cada pieza': () => {
    const lista = armarLista();
    autolistas.agregarPieza(lista.id, { texto: 'Única' });

    autolistas.mandarAlFinal(autolistas.proximaPieza(lista.id));
    autolistas.mandarAlFinal(autolistas.proximaPieza(lista.id));

    const pieza = autolistas.obtener(lista.id).piezas[0];
    assert.strictEqual(Number(pieza.veces_publicada), 2);
    assert.ok(pieza.ultima_vez, 'y cuándo fue la última');
  },

  'sin modo circular, cada pieza sale una sola vez': () => {
    /*
      Sirve para una campaña con principio y fin: las fiestas, una promoción de
      dos semanas. Cuando se acaban las piezas, la lista se queda quieta.
    */
    const lista = armarLista({ circular: false });
    autolistas.agregarPieza(lista.id, { texto: 'Sale una vez' });

    autolistas.mandarAlFinal(autolistas.proximaPieza(lista.id));

    assert.strictEqual(
      autolistas.proximaPieza(lista.id),
      undefined,
      'ya salió: no vuelve a la fila'
    );
  },

  'una lista vacía no rompe nada': () => {
    const lista = armarLista();
    assert.strictEqual(autolistas.proximaPieza(lista.id), undefined);
  },

  // ── Validaciones ────────────────────────────────────────────────────────
  'una lista sin nombre no se crea': () => {
    assert.throws(() => autolistas.crear({ nombre: '   ', dias: [1], horas: [10] }), /nombre/);
  },

  'una lista sin días no se crea': () => {
    /*
      Se acota al crear y no al publicar. Un día 9 guardado en la base es una
      bomba que explota semanas después, cuando nadie se acuerde de dónde salió
      ese número.
    */
    assert.throws(() => autolistas.crear({ nombre: 'X', dias: [], horas: [10] }), /día/);
    assert.throws(() => autolistas.crear({ nombre: 'X', dias: [9, 15], horas: [10] }), /día/);
  },

  'una hora imposible se descarta': () => {
    assert.throws(() => autolistas.crear({ nombre: 'X', dias: [1], horas: [47] }), /hora/);
  },

  'los días repetidos se guardan una sola vez y ordenados': () => {
    const lista = autolistas.crear({
      nombre: `Orden ${unico()}`,
      dias: [5, 1, 5, 3],
      horas: [20, 11, 20],
    });
    assert.deepStrictEqual(lista.dias, [1, 3, 5]);
    assert.deepStrictEqual(lista.horas, [11, 20]);
  },

  'una pieza sin texto ni imagen no se agrega': () => {
    const lista = armarLista();
    assert.throws(() => autolistas.agregarPieza(lista.id, { texto: '  ' }), /texto o una imagen/);
  },

  'borrar la lista borra sus piezas': () => {
    const lista = armarLista();
    autolistas.agregarPieza(lista.id, { texto: 'Algo' });
    autolistas.eliminar(lista.id);

    const quedan = db
      .prepare('SELECT COUNT(*) AS n FROM social_autolista_piezas WHERE autolista_id = ?')
      .get(lista.id).n;
    assert.strictEqual(Number(quedan), 0);
  },
};
