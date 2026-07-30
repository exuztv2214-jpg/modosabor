const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { backupsDir, dbFile, ensureDir } = require('./storagePaths');
const logger = require('./logger');

function ensureBackupsDir() {
  ensureDir(backupsDir);
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function normalizePathForSql(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, "''");
}

function cleanupOldBackups(maxFiles = 14) {
  ensureBackupsDir();
  const files = fs
    .readdirSync(backupsDir)
    .filter((file) => file.endsWith('.sqlite'))
    .map((file) => {
      const fullPath = path.join(backupsDir, file);
      const stats = fs.statSync(fullPath);
      return { file, fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  files.slice(Number(maxFiles || 14)).forEach((entry) => {
    fs.unlinkSync(entry.fullPath);
  });
}

function listBackups() {
  ensureBackupsDir();
  return fs
    .readdirSync(backupsDir)
    .filter((file) => file.endsWith('.sqlite'))
    .map((file) => {
      const fullPath = path.join(backupsDir, file);
      const stats = fs.statSync(fullPath);
      return {
        file,
        size: stats.size,
        created_at: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function createDatabaseBackup(db, options = {}) {
  ensureBackupsDir();
  const reason = options.reason || 'manual';
  const file = `modosabor-${reason}-${timestampForFile()}.sqlite`;
  const outputPath = path.join(backupsDir, file);
  const escapedPath = normalizePathForSql(outputPath);

  db.exec(`VACUUM INTO '${escapedPath}'`);
  cleanupOldBackups(options.maxFiles || 14);

  const stats = fs.statSync(outputPath);
  return {
    file,
    fullPath: outputPath,
    size: stats.size,
    created_at: stats.mtime.toISOString(),
  };
}

function getBackupPath(file) {
  ensureBackupsDir();
  const safeFile = path.basename(String(file || ''));
  const fullPath = path.join(backupsDir, safeFile);
  if (!fs.existsSync(fullPath) || path.extname(fullPath) !== '.sqlite') {
    throw new Error('Backup no encontrado');
  }
  return fullPath;
}

function listApplicationTables(database) {
  return database
    .prepare(
      `
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `
    )
    .all()
    .map((row) => row.name);
}

function tableColumns(database, table) {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => row.name);
}

function restoreDatabaseBackup(db, file, options = {}) {
  const backupPath = getBackupPath(file);
  const backupDb = new Database(backupPath);
  const currentTables = listApplicationTables(db);
  const backupTables = new Set(listApplicationTables(backupDb));
  const tablesToRestore = currentTables.filter((table) => backupTables.has(table));
  const restoredTables = [];

  try {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');

    tablesToRestore.forEach((table) => {
      db.exec(`DELETE FROM ${table}`);
    });

    tablesToRestore.forEach((table) => {
      const currentColumns = tableColumns(db, table);
      const backupColumns = new Set(tableColumns(backupDb, table));
      const sharedColumns = currentColumns.filter((column) => backupColumns.has(column));
      if (sharedColumns.length === 0) return;

      const selectSql = `SELECT ${sharedColumns.join(', ')} FROM ${table}`;
      const rows = backupDb.prepare(selectSql).all();
      if (rows.length === 0) {
        restoredTables.push({ table, rows: 0 });
        return;
      }

      const placeholders = sharedColumns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${table} (${sharedColumns.join(', ')}) VALUES (${placeholders})`;
      const insert = db.prepare(insertSql);
      rows.forEach((row) => {
        insert.run(...sharedColumns.map((column) => row[column]));
      });
      restoredTables.push({ table, rows: rows.length });
    });

    const backupSequenceExists =
      backupDb
        .prepare(
          `
      SELECT COUNT(*) as c
      FROM sqlite_master
      WHERE type = 'table' AND name = 'sqlite_sequence'
    `
        )
        .get().c > 0;

    if (backupSequenceExists) {
      db.exec('DELETE FROM sqlite_sequence');
      const seqRows = backupDb.prepare('SELECT name, seq FROM sqlite_sequence').all();
      if (seqRows.length) {
        const insertSeq = db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)');
        seqRows.forEach((row) => insertSeq.run(row.name, row.seq));
      }
    }

    db.exec('COMMIT');
    return {
      ok: true,
      file: path.basename(backupPath),
      restored_tables: restoredTables,
      total_tables: restoredTables.length,
      mode: options.mode || 'full',
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON');
    } catch {}
    try {
      backupDb.close();
    } catch {}
  }
}

function resetOperationalData(db) {
  try {
    db.exec('BEGIN');

    // 1. Limpieza de datos operativos y de comunicación
    db.exec(`
      DELETE FROM impresiones;
      DELETE FROM whatsapp_envios;
      DELETE FROM whatsapp_mensajes;
      DELETE FROM whatsapp_pedidos_borrador_items;
      DELETE FROM whatsapp_pedidos_borrador;
      DELETE FROM whatsapp_conversaciones;
      DELETE FROM mercadopago_eventos;
      DELETE FROM mesa_reservas;
      DELETE FROM cierres_caja;
      DELETE FROM auditoria_eventos;
      DELETE FROM pedidos;
      DELETE FROM cupones_usados;
    `);

    // 2. Limpieza de Inventario (Crucial para consistencia)
    db.exec(`
      DELETE FROM inventario_movimientos;
      UPDATE inventario_insumos SET stock_actual = 0, actualizado_en = CURRENT_TIMESTAMP;
      UPDATE productos SET stock_directo = 0;
    `);

    // 3. Reinicio de estadísticas de clientes
    db.exec(`
      UPDATE clientes
      SET total_gastado = 0,
          total_pedidos = 0,
          puntos = 0,
          sellos_actuales = 0,
          frecuencia_dias = 7,
          canjes_premio = 0,
          recompensas_pendientes = 0
    `);

    // 4. Reset de repartidores
    db.exec(`
      UPDATE repartidores
      SET disponible = 1,
          latitud = NULL,
          longitud = NULL,
          ultima_ubicacion_en = NULL
    `);

    // 5. Reset de contadores de configuración
    db.prepare(
      "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('numero_pedido_actual', '1')"
    ).run();

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  }
}

function startAutomaticBackups(db) {
  const configRows = db
    .prepare(
      `
    SELECT clave, valor
    FROM configuracion
    WHERE clave IN ('backup_automatico_activo', 'backup_intervalo_horas', 'backup_max_archivos')
  `
    )
    .all();
  const config = Object.fromEntries(configRows.map((row) => [row.clave, row.valor || '']));

  if (config.backup_automatico_activo !== '1') {
    return null;
  }

  const intervalHours = Math.max(1, Number(config.backup_intervalo_horas || 24));
  const maxFiles = Math.max(3, Number(config.backup_max_archivos || 14));

  try {
    createDatabaseBackup(db, { reason: 'startup', maxFiles });
  } catch (error) {
    logger.error('No se pudo crear el backup automatico inicial', { message: error.message });
  }

  return setInterval(
    () => {
      try {
        createDatabaseBackup(db, { reason: 'auto', maxFiles });
      } catch (error) {
        logger.error('No se pudo crear el backup automatico', { message: error.message });
      }
    },
    intervalHours * 60 * 60 * 1000
  );
}

module.exports = {
  backupsDir,
  dbFile,
  getBackupPath,
  listBackups,
  createDatabaseBackup,
  restoreDatabaseBackup,
  resetOperationalData,
  startAutomaticBackups,
};
