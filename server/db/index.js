const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { dbFile, ensureStoragePaths } = require('../utils/storagePaths');
const { runMigrations } = require('./migrations');
const { runSeed } = require('./seed');

ensureStoragePaths();
const db = new Database(dbFile);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = NORMAL');

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
const indexStatements = [];
const tableStatements = schemaSQL.replace(
  /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b[\s\S]*?;\s*$/gim,
  (statement) => {
    indexStatements.push(statement);
    return '';
  }
);

db.exec(tableStatements);
runMigrations(db);
if (indexStatements.length > 0) {
  db.exec(indexStatements.join('\n'));
}
runSeed(db);

module.exports = db;
