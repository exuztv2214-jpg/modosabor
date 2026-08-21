/**
 * La identidad adentro de la clave de un destino social.
 *
 * ── La regla que se prueba ─────────────────────────────────────────────────
 *
 * Un destino no es "un grupo de Facebook". Es "un grupo de Facebook publicando
 * con tal identidad". El mismo grupo, con el Perfil o con la Fan Page, son dos
 * destinos distintos: distintos permisos, distintos resultados, y uno puede
 * funcionar mientras el otro falla.
 *
 * ── Qué estaba mal ─────────────────────────────────────────────────────────
 *
 * La clave única de `social_destinations` era:
 *
 *     UNIQUE(provider, tipo, identificador_externo)
 *
 * sin la identidad. Con esa clave, sincronizar los grupos de la Fan Page
 * **pisaba** los del Perfil: quedaba una sola fila que cambiaba de dueño con
 * la última sincronización. La columna `cuenta_id` existía y quedaba en NULL
 * porque el alta ni siquiera la recibía.
 *
 * ── Por qué se prueba contra una base de verdad ────────────────────────────
 *
 * Porque lo que hay que probar es el comportamiento de la restricción, y una
 * restricción no se puede simular: o la base la aplica o no. Se arma una base
 * en memoria con las dos tablas y se comprueba ahí.
 */
const assert = require('assert');
const Database = require('better-sqlite3');

/* El mismo esquema que `migrations.js`, reducido a lo que hace falta acá. */
function baseDePrueba() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      nombre TEXT NOT NULL,
      identificador_externo TEXT DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'desconectada',
      metadata TEXT DEFAULT '{}',
      habilitada INTEGER DEFAULT 1
    );

    CREATE TABLE social_destinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cuenta_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      identificador_externo TEXT DEFAULT '',
      url TEXT DEFAULT '',
      habilitada INTEGER DEFAULT 1,
      UNIQUE(provider, cuenta_id, tipo, identificador_externo)
    );
  `);

  const alta = db.prepare("INSERT INTO social_accounts (provider, nombre) VALUES ('facebook', ?)");
  const perfil = Number(alta.run('Perfil Modo Sabor').lastInsertRowid);
  const page = Number(alta.run('Fan Page Modo Sabor Delivery').lastInsertRowid);
  return { db, perfil, page };
}

/* El mismo INSERT que usa createDestination. */
function guardarGrupo(db, cuentaId, idExterno, nombre) {
  db.prepare(
    `INSERT INTO social_destinations
       (cuenta_id, provider, tipo, nombre, identificador_externo, url, habilitada)
     VALUES (?, 'facebook', 'grupo', ?, ?, '', 1)
     ON CONFLICT(provider, cuenta_id, tipo, identificador_externo) DO UPDATE SET
       nombre = excluded.nombre`
  ).run(cuentaId, nombre, idExterno);
}

module.exports = {
  'el mismo grupo con dos identidades son dos destinos': () => {
    const { db, perfil, page } = baseDePrueba();

    guardarGrupo(db, perfil, 'g-compraventa', 'Compra Venta Monteros');
    guardarGrupo(db, page, 'g-compraventa', 'Compra Venta Monteros');

    const filas = db
      .prepare('SELECT cuenta_id FROM social_destinations WHERE identificador_externo = ?')
      .all('g-compraventa');

    assert.strictEqual(filas.length, 2, 'tiene que haber un destino por identidad');
    assert.deepStrictEqual(
      filas.map((f) => f.cuenta_id).sort((a, b) => a - b),
      [perfil, page].sort((a, b) => a - b)
    );
  },

  'sincronizar dos veces la misma identidad no duplica': () => {
    const { db, perfil } = baseDePrueba();

    guardarGrupo(db, perfil, 'g-delivery', 'Delivery Monteros');
    guardarGrupo(db, perfil, 'g-delivery', 'Delivery Monteros (renombrado)');

    const filas = db
      .prepare('SELECT nombre FROM social_destinations WHERE identificador_externo = ?')
      .all('g-delivery');

    assert.strictEqual(filas.length, 1, 'la segunda sincronización actualiza, no agrega');
    assert.strictEqual(
      filas[0].nombre,
      'Delivery Monteros (renombrado)',
      'y se queda con el nombre nuevo'
    );
  },

  'la Page no pisa los grupos del Perfil': () => {
    /*
      Este es el caso exacto que rompía. Se sincroniza el Perfil, después la
      Page, y se comprueba que el destino del Perfil sigue existiendo con su
      nombre original.
    */
    const { db, perfil, page } = baseDePrueba();

    guardarGrupo(db, perfil, 'g-monteros', 'Monteros — visto por el Perfil');
    guardarGrupo(db, page, 'g-monteros', 'Monteros — visto por la Page');

    const delPerfil = db
      .prepare('SELECT nombre FROM social_destinations WHERE cuenta_id = ?')
      .get(perfil);

    assert.strictEqual(
      delPerfil.nombre,
      'Monteros — visto por el Perfil',
      'el destino del Perfil no puede haber sido modificado por la Page'
    );
  },

  'un destino no puede quedar sin identidad': () => {
    const { db } = baseDePrueba();

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO social_destinations (provider, tipo, nombre, identificador_externo)
             VALUES ('facebook', 'grupo', 'Huérfano', 'g-x')`
          )
          .run(),
      /NOT NULL/i,
      'la base tiene que rechazar un destino sin identidad'
    );
  },

  'borrar una identidad se lleva sus destinos': () => {
    /*
      Un destino sin su identidad no significa nada: no se sabe con qué cuenta
      publicar. Dejarlo huérfano sería dejar basura que después falla al
      publicar sin motivo aparente.
    */
    const { db, perfil, page } = baseDePrueba();

    guardarGrupo(db, perfil, 'g-uno', 'Uno');
    guardarGrupo(db, page, 'g-uno', 'Uno');

    db.prepare('DELETE FROM social_accounts WHERE id = ?').run(perfil);

    const quedan = db.prepare('SELECT cuenta_id FROM social_destinations').all();
    assert.strictEqual(quedan.length, 1, 'sólo tiene que quedar el de la otra identidad');
    assert.strictEqual(quedan[0].cuenta_id, page);
  },
};
