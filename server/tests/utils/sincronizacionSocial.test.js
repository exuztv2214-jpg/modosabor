/**
 * Sincronizar grupos de Facebook por identidad.
 *
 * ── Por qué hay un test propio ─────────────────────────────────────────────
 *
 * El bug de la identidad vivía en **dos** lugares, no en uno. `createDestination`
 * era el obvio —el alta manual de un destino— pero el que importa de verdad es
 * este otro: cuando el worker vuelve con los grupos que encontró, el servidor
 * los guarda. Ese INSERT también ignoraba la identidad.
 *
 * Arreglar sólo el primero habría dejado el problema intacto justo en el camino
 * por el que van a entrar los cientos de grupos reales.
 *
 * ── La regla de quién decide la identidad ──────────────────────────────────
 *
 * La identidad se lee del **pedido** (`social_worker_commands.payload`), no de
 * lo que informa el worker. El worker cuenta qué encontró; con qué identidad
 * fue a buscarlo lo decidió el servidor cuando creó el comando. Si el worker
 * pudiera elegirla, un error suyo mezclaría los grupos del Perfil con los de la
 * Page sin que nadie se entere.
 */
const assert = require('assert');
const Database = require('better-sqlite3');

function baseDePrueba() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      nombre TEXT NOT NULL
    );

    CREATE TABLE social_destinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cuenta_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      identificador_externo TEXT DEFAULT '',
      url TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      habilitada INTEGER DEFAULT 1,
      ultimo_estado TEXT DEFAULT 'pendiente',
      UNIQUE(provider, cuenta_id, tipo, identificador_externo)
    );

    CREATE TABLE social_worker_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      estado TEXT DEFAULT 'pendiente'
    );
  `);

  const alta = db.prepare("INSERT INTO social_accounts (provider, nombre) VALUES ('facebook', ?)");
  const perfil = Number(alta.run('Perfil Modo Sabor').lastInsertRowid);
  const page = Number(alta.run('Fan Page Modo Sabor Delivery').lastInsertRowid);
  return { db, perfil, page };
}

/** Lo mismo que hace el servidor al recibir el reporte del worker. */
function guardarLoQueTrajoElWorker(db, comandoId, grupos) {
  const comando = db.prepare('SELECT * FROM social_worker_commands WHERE id = ?').get(comandoId);

  const identidad = Number(JSON.parse(comando.payload || '{}').identityId);
  if (!Number.isFinite(identidad) || identidad <= 0) {
    throw new Error('El pedido de sincronización no dice con qué identidad se hizo');
  }

  const upsert = db.prepare(
    `INSERT INTO social_destinations
       (cuenta_id, provider, tipo, nombre, identificador_externo, url, metadata, habilitada, ultimo_estado)
     VALUES (?, 'facebook', 'facebook_group', ?, ?, '', ?, 1, 'detectado')
     ON CONFLICT(provider, cuenta_id, tipo, identificador_externo) DO UPDATE SET
       nombre = excluded.nombre,
       metadata = excluded.metadata`
  );

  grupos.forEach((g) =>
    upsert.run(
      identidad,
      g.nombre,
      g.id,
      JSON.stringify({ requiereAprobacion: Boolean(g.requiereAprobacion) })
    )
  );

  return grupos.length;
}

function pedirSincronizacion(db, identityId) {
  return Number(
    db
      .prepare(
        "INSERT INTO social_worker_commands (tipo, payload) VALUES ('sync_facebook_groups', ?)"
      )
      .run(JSON.stringify({ identityId })).lastInsertRowid
  );
}

module.exports = {
  'los grupos quedan atados a la identidad que los pidió': () => {
    const { db, perfil } = baseDePrueba();

    const comando = pedirSincronizacion(db, perfil);
    guardarLoQueTrajoElWorker(db, comando, [
      { id: 'g-1', nombre: 'Compra Venta Monteros' },
      { id: 'g-2', nombre: 'Delivery Monteros' },
    ]);

    const filas = db.prepare('SELECT cuenta_id FROM social_destinations').all();
    assert.strictEqual(filas.length, 2);
    assert.ok(
      filas.every((f) => f.cuenta_id === perfil),
      'los dos grupos tienen que ser del Perfil'
    );
  },

  'sincronizar la Page no toca los grupos del Perfil': () => {
    /*
      El caso que rompía. El mismo grupo aparece en las dos sincronizaciones —
      es normal, una persona puede estar en un grupo con su perfil y su página a
      la vez— y tiene que quedar como dos destinos separados.
    */
    const { db, perfil, page } = baseDePrueba();

    guardarLoQueTrajoElWorker(db, pedirSincronizacion(db, perfil), [
      { id: 'g-compartido', nombre: 'Monteros' },
      { id: 'g-solo-perfil', nombre: 'Sólo del Perfil' },
    ]);

    guardarLoQueTrajoElWorker(db, pedirSincronizacion(db, page), [
      { id: 'g-compartido', nombre: 'Monteros' },
    ]);

    const delPerfil = db
      .prepare('SELECT COUNT(*) AS total FROM social_destinations WHERE cuenta_id = ?')
      .get(perfil);
    const deLaPage = db
      .prepare('SELECT COUNT(*) AS total FROM social_destinations WHERE cuenta_id = ?')
      .get(page);

    assert.strictEqual(delPerfil.total, 2, 'el Perfil conserva sus dos grupos');
    assert.strictEqual(deLaPage.total, 1, 'la Page tiene el suyo');
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) AS total FROM social_destinations').get().total,
      3,
      'tres destinos en total, no dos'
    );
  },

  'volver a sincronizar la misma identidad actualiza, no duplica': () => {
    const { db, perfil } = baseDePrueba();

    guardarLoQueTrajoElWorker(db, pedirSincronizacion(db, perfil), [
      { id: 'g-1', nombre: 'Nombre viejo' },
    ]);
    guardarLoQueTrajoElWorker(db, pedirSincronizacion(db, perfil), [
      { id: 'g-1', nombre: 'Nombre nuevo' },
    ]);

    const filas = db.prepare('SELECT nombre FROM social_destinations').all();
    assert.strictEqual(filas.length, 1);
    assert.strictEqual(filas[0].nombre, 'Nombre nuevo');
  },

  'un pedido sin identidad se rechaza': () => {
    /*
      No se guarda "por las dudas" contra la primera identidad que haya: un
      grupo guardado contra la identidad equivocada después falla al publicar
      sin motivo aparente, y encontrar eso lleva horas.
    */
    const { db } = baseDePrueba();

    const comando = Number(
      db
        .prepare(
          "INSERT INTO social_worker_commands (tipo, payload) VALUES ('sync_facebook_groups', '{}')"
        )
        .run().lastInsertRowid
    );

    assert.throws(
      () => guardarLoQueTrajoElWorker(db, comando, [{ id: 'g-1', nombre: 'X' }]),
      /identidad/i
    );
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) AS total FROM social_destinations').get().total,
      0,
      'no puede haber guardado nada'
    );
  },

  'se recuerda si el grupo requiere aprobación': () => {
    const { db, perfil } = baseDePrueba();

    guardarLoQueTrajoElWorker(db, pedirSincronizacion(db, perfil), [
      { id: 'g-libre', nombre: 'Libre', requiereAprobacion: false },
      { id: 'g-moderado', nombre: 'Moderado', requiereAprobacion: true },
    ]);

    const moderado = db
      .prepare('SELECT metadata FROM social_destinations WHERE identificador_externo = ?')
      .get('g-moderado');

    assert.strictEqual(
      JSON.parse(moderado.metadata).requiereAprobacion,
      true,
      'hay que saberlo antes de publicar, no después de que un admin lo frene'
    );
  },
};
