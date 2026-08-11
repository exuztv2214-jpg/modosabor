const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-backup-'));
process.env.BACKUPS_DIR = path.join(tempDir, 'backups');

const { createDatabaseBackup, restoreDatabaseBackup } = require('../utils/backupManager');
const db = new Database(path.join(tempDir, 'origen.sqlite'));

try {
  db.exec('CREATE TABLE prueba_backup (id INTEGER PRIMARY KEY, valor TEXT NOT NULL)');
  db.prepare('INSERT INTO prueba_backup (id, valor) VALUES (?, ?)').run(1, 'estado original');

  const backup = createDatabaseBackup(db, { reason: 'verificacion', maxFiles: 3 });
  db.prepare('UPDATE prueba_backup SET valor = ? WHERE id = 1').run('dato alterado');
  db.prepare('INSERT INTO prueba_backup (id, valor) VALUES (?, ?)').run(2, 'dato extra');

  const resultado = restoreDatabaseBackup(db, backup.file, { mode: 'verification' });
  const rows = db.prepare('SELECT id, valor FROM prueba_backup ORDER BY id').all();

  assert.strictEqual(resultado.ok, true);
  assert.deepStrictEqual(rows, [{ id: 1, valor: 'estado original' }]);
  console.log('backupRestore.test.js OK');
} finally {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
