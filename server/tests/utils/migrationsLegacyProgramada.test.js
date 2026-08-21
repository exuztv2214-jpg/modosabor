const assert = require('assert');
const Database = require('better-sqlite3');
const { destrabarFechasProgramadas } = require('../../db/migrations');

function run() {
  const legacyDb = new Database(':memory:');
  try {
    legacyDb.exec(`
      CREATE TABLE wa_campanas (
        id INTEGER PRIMARY KEY,
        mensaje TEXT NOT NULL,
        estado TEXT DEFAULT 'borrador'
      )
    `);

    assert.doesNotThrow(
      () => destrabarFechasProgramadas(legacyDb),
      'una tabla anterior sin programada_para no debe impedir el arranque'
    );

    legacyDb.exec('ALTER TABLE wa_campanas ADD COLUMN programada_para DATETIME');
    legacyDb
      .prepare('INSERT INTO wa_campanas (id, mensaje, programada_para) VALUES (1, ?, ?)')
      .run('Prueba', '2026-08-21T20:30:00.000Z');

    destrabarFechasProgramadas(legacyDb);
    const migrated = legacyDb.prepare('SELECT programada_para FROM wa_campanas WHERE id = 1').get();
    assert.strictEqual(migrated.programada_para, '2026-08-21 20:30:00');
    console.log('migrationsLegacyProgramada.test.js OK');
  } finally {
    legacyDb.close();
  }
}

if (require.main === module) run();

module.exports = { run };
