/**
 * El formato de fecha con el que se guardan las campañas programadas.
 *
 * ── El bug que esto cuida ──────────────────────────────────────────────────
 *
 * SQLite no tiene tipo fecha: guarda texto y compara texto.
 * `CURRENT_TIMESTAMP` escribe `2026-08-21 14:19:13`, con un espacio;
 * `toISOString()` escribe `2026-08-21T13:19:13.931Z`, con una T. Y la T (0x54)
 * es mayor que el espacio (0x20) comparando texto.
 *
 * Las dos colas del sistema comparan la columna pelada contra
 * `CURRENT_TIMESTAMP`. Con un ISO guardado, la condición **nunca daba
 * verdadero**: programabas una campaña para las 20:00 y no salía nunca. Sin
 * error, sin log, sin nada visible.
 *
 * El test compara contra la base de verdad y no contra una constante escrita a
 * mano, porque lo que importa no es que el texto tenga cierta forma sino que
 * **SQLite lo entienda igual que a lo suyo**.
 */
const assert = require('assert');
const db = require('../../db');
const { sqlFecha, desdeSql } = require('../../utils/fechaLocal');

const haceUnaHora = () => new Date(Date.now() - 3600 * 1000);
const enUnaHora = () => new Date(Date.now() + 3600 * 1000);

/** ¿SQLite considera que esta fecha ya pasó? */
const yaPaso = (valor) =>
  Number(db.prepare('SELECT (? <= CURRENT_TIMESTAMP) AS listo').get(valor).listo) === 1;

module.exports = {
  'una fecha pasada se ve como pasada': () => {
    assert.strictEqual(yaPaso(sqlFecha(haceUnaHora())), true);
  },

  'una fecha futura se ve como futura': () => {
    assert.strictEqual(yaPaso(sqlFecha(enUnaHora())), false);
  },

  'el ISO engaña a SQLite y por eso no se usa': () => {
    /*
      Este test documenta el bug, no el arreglo. Si algún día SQLite empezara a
      entender ISO, este test se pondría rojo y habría que revisar si el
      cuidado sigue haciendo falta. Mientras tanto, deja escrito por qué
      `sqlFecha` existe.
    */
    const enIso = haceUnaHora().toISOString();
    assert.strictEqual(
      yaPaso(enIso),
      false,
      'una fecha de hace una hora guardada en ISO parece futura: ese era el bug'
    );
  },

  'el formato es el mismo que usa la base': () => {
    const deLaBase = db.prepare('SELECT CURRENT_TIMESTAMP AS ahora').get().ahora;
    const nuestro = sqlFecha(new Date());

    assert.strictEqual(nuestro.length, deLaBase.length);
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(nuestro), `raro: ${nuestro}`);
  },

  'se puede volver a leer lo que se guardó': () => {
    const momento = new Date('2026-08-21T13:19:13.000Z');
    const releido = desdeSql(sqlFecha(momento));
    assert.strictEqual(releido.getTime(), momento.getTime());
  },

  'también se leen las fechas viejas guardadas en ISO': () => {
    /*
      La migración destraba las que quedaron mal, pero mientras tanto el
      código tiene que poder leerlas sin romperse.
    */
    const momento = new Date('2026-08-21T13:19:13.000Z');
    assert.strictEqual(desdeSql(momento.toISOString()).getTime(), momento.getTime());
  },

  'una fecha vacía no revienta': () => {
    assert.strictEqual(desdeSql(null), null);
    assert.strictEqual(desdeSql(''), null);
    assert.strictEqual(desdeSql('cualquier cosa'), null);
  },

  'una fecha inválida no se guarda como texto raro': () => {
    assert.strictEqual(sqlFecha(new Date('no es una fecha')), null);
  },
};
