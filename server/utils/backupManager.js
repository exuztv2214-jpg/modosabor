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

const DEFAULT_MAX_BACKUP_BYTES = 64 * 1024 * 1024;

function esBackupVisible(fullPath, stats = null) {
  try {
    const info = stats || fs.statSync(fullPath);
    // VACUUM INTO puede alcanzar a crear el archivo antes de quedarse sin
    // espacio. Un archivo vacío no es un respaldo y no debe aparecer como el
    // "último backup" en el panel.
    if (!info.isFile() || info.size < 100) return false;
    const descriptor = fs.openSync(fullPath, 'r');
    try {
      const header = Buffer.alloc(16);
      if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) return false;
      return header.toString('utf8') === 'SQLite format 3\u0000';
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return false;
  }
}

function validarBackupCreado(fullPath) {
  if (!esBackupVisible(fullPath)) {
    throw new Error('El backup generado no es una base SQLite válida');
  }
  const backup = new Database(fullPath, { readonly: true, fileMustExist: true });
  try {
    const check = backup.prepare('PRAGMA quick_check').pluck().get();
    const tables = Number(
      backup
        .prepare(
          "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
        .pluck()
        .get() || 0
    );
    if (check !== 'ok' || tables === 0) {
      throw new Error('El backup generado no pasó la verificación de integridad');
    }
  } finally {
    backup.close();
  }
}

function normalizeRetention(options = {}) {
  if (typeof options === 'number') {
    return {
      maxFiles: Math.max(3, Number(options || 14)),
      maxTotalBytes: DEFAULT_MAX_BACKUP_BYTES,
      minFiles: 3,
    };
  }

  const configuredBytes = Number(
    options.maxTotalBytes ||
      (Number(process.env.BACKUP_MAX_TOTAL_MB || 0) > 0
        ? Number(process.env.BACKUP_MAX_TOTAL_MB) * 1024 * 1024
        : DEFAULT_MAX_BACKUP_BYTES)
  );
  return {
    maxFiles: Math.max(3, Number(options.maxFiles || 14)),
    maxTotalBytes: Math.max(16 * 1024 * 1024, configuredBytes),
    minFiles: Math.max(1, Math.min(3, Number(options.minFiles || 3))),
  };
}

function cleanupOldBackups(options = {}) {
  ensureBackupsDir();
  const retention = normalizeRetention(options);
  const encontrados = fs
    .readdirSync(backupsDir)
    .filter((file) => file.endsWith('.sqlite'))
    .map((file) => {
      const fullPath = path.join(backupsDir, file);
      const stats = fs.statSync(fullPath);
      return { file, fullPath, mtimeMs: stats.mtimeMs, size: stats.size };
    });
  const invalidos = encontrados.filter((entry) => !esBackupVisible(entry.fullPath));
  invalidos.forEach((entry) => fs.unlinkSync(entry.fullPath));
  const files = encontrados
    .filter((entry) => esBackupVisible(entry.fullPath))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const retained = [];
  const removed = [];
  let retainedBytes = 0;

  files.forEach((entry) => {
    const keepForMinimum = retained.length < retention.minFiles;
    const keepForLimits =
      retained.length < retention.maxFiles && retainedBytes + entry.size <= retention.maxTotalBytes;
    if (keepForMinimum || keepForLimits) {
      retained.push(entry);
      retainedBytes += entry.size;
      return;
    }
    fs.unlinkSync(entry.fullPath);
    removed.push(entry);
  });

  return {
    retained: retained.length,
    retainedBytes,
    removed: [...invalidos, ...removed].map((entry) => entry.file),
    removedInvalid: invalidos.map((entry) => entry.file),
    maxFiles: retention.maxFiles,
    maxTotalBytes: retention.maxTotalBytes,
  };
}

function listBackups() {
  ensureBackupsDir();
  return fs
    .readdirSync(backupsDir)
    .filter((file) => file.endsWith('.sqlite'))
    .map((file) => {
      const fullPath = path.join(backupsDir, file);
      const stats = fs.statSync(fullPath);
      return esBackupVisible(fullPath, stats)
        ? {
            file,
            size: stats.size,
            created_at: stats.mtime.toISOString(),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function backupStorageSummary(backups = listBackups(), options = {}) {
  const retention = normalizeRetention(options);
  const totalBytes = backups.reduce((total, entry) => total + Number(entry.size || 0), 0);
  return {
    files: backups.length,
    totalBytes,
    maxFiles: retention.maxFiles,
    maxTotalBytes: retention.maxTotalBytes,
    percentUsed: retention.maxTotalBytes
      ? Math.round((totalBytes / retention.maxTotalBytes) * 100)
      : 0,
  };
}

function createDatabaseBackup(db, options = {}) {
  ensureBackupsDir();
  const reason = options.reason || 'manual';
  const file = `modosabor-${reason}-${timestampForFile()}.sqlite`;
  const outputPath = path.join(backupsDir, file);
  const escapedPath = normalizePathForSql(outputPath);

  try {
    db.exec(`VACUUM INTO '${escapedPath}'`);
    validarBackupCreado(outputPath);
    const retention = cleanupOldBackups(options);

    const stats = fs.statSync(outputPath);
    return {
      file,
      fullPath: outputPath,
      size: stats.size,
      created_at: stats.mtime.toISOString(),
      retention,
    };
  } catch (error) {
    // No dejar un .sqlite vacío que el panel pueda confundir con un backup
    // reciente y restaurable.
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {}
    throw error;
  }
}

function getBackupPath(file) {
  ensureBackupsDir();
  const safeFile = path.basename(String(file || ''));
  const fullPath = path.join(backupsDir, safeFile);
  if (
    !fs.existsSync(fullPath) ||
    path.extname(fullPath) !== '.sqlite' ||
    !esBackupVisible(fullPath)
  ) {
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
    WHERE clave IN (
      'backup_automatico_activo',
      'backup_intervalo_horas',
      'backup_max_archivos',
      'backup_max_total_mb'
    )
  `
    )
    .all();
  const config = Object.fromEntries(configRows.map((row) => [row.clave, row.valor || '']));

  if (config.backup_automatico_activo !== '1') {
    return null;
  }

  const intervalHours = Math.max(1, Number(config.backup_intervalo_horas || 24));
  const maxFiles = Math.max(3, Number(config.backup_max_archivos || 14));
  const maxTotalBytes = Math.max(16, Number(config.backup_max_total_mb || 64)) * 1024 * 1024;

  try {
    createDatabaseBackup(db, { reason: 'startup', maxFiles, maxTotalBytes });
  } catch (error) {
    logger.error('No se pudo crear el backup automatico inicial', { message: error.message });
  }

  return setInterval(
    () => {
      try {
        createDatabaseBackup(db, { reason: 'auto', maxFiles, maxTotalBytes });
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
  cleanupOldBackups,
  getBackupPath,
  listBackups,
  backupStorageSummary,
  createDatabaseBackup,
  restoreDatabaseBackup,
  resetOperationalData,
  startAutomaticBackups,
};
