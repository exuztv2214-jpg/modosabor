const SAFE_CONFIG_DENY = /(token|secret|password|passwd|key|mercadopago)/i;

const BASE_TABLES = [
  'categorias',
  'productos',
  'inventario_insumos',
  'inventario_recetas',
  'personal',
  'repartidores',
];

function hasTable(db, table) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  );
}

function tableColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((col) => col.name);
}

function rowsFor(db, table) {
  if (!hasTable(db, table)) return [];
  return db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
}

function configRowsFor(db) {
  if (!hasTable(db, 'configuracion')) return [];
  return db
    .prepare('SELECT clave, valor FROM configuracion ORDER BY clave ASC')
    .all()
    .filter((row) => !SAFE_CONFIG_DENY.test(String(row.clave || '')));
}

function buildBaseDataPackage(db) {
  return {
    exported_at: new Date().toISOString(),
    source: 'modosabor-local-base-data',
    tables: {
      ...Object.fromEntries(BASE_TABLES.map((table) => [table, rowsFor(db, table)])),
      configuracion: configRowsFor(db),
    },
  };
}

function resetSequence(db, table) {
  if (!hasTable(db, 'sqlite_sequence')) return;
  const max = db.prepare(`SELECT COALESCE(MAX(id), 0) AS max FROM ${table}`).get().max;
  const exists = db.prepare('SELECT name FROM sqlite_sequence WHERE name = ?').get(table);
  if (exists) {
    db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(max, table);
  } else {
    db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, max);
  }
}

function upsertRows(db, table, rows, { preserveExisting = [], override = {} } = {}) {
  if (!hasTable(db, table) || !Array.isArray(rows)) return { table, rows: 0, skipped: true };

  const cols = tableColumns(db, table);
  const insertableCols = cols.filter((col) => rows.some((row) => Object.hasOwn(row, col)));
  if (!insertableCols.includes('id')) return { table, rows: 0, skipped: true };

  const placeholders = insertableCols.map(() => '?').join(', ');
  const updates = insertableCols
    .filter((col) => col !== 'id' && !preserveExisting.includes(col))
    .map((col) => `${col} = excluded.${col}`)
    .join(', ');
  const stmt = db.prepare(`
    INSERT INTO ${table} (${insertableCols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates || 'id = excluded.id'}
  `);

  for (const originalRow of rows) {
    const row = { ...originalRow, ...override };
    stmt.run(...insertableCols.map((col) => row[col]));
  }

  resetSequence(db, table);
  return { table, rows: rows.length, skipped: false };
}

function upsertConfigRows(db, rows) {
  if (!hasTable(db, 'configuracion') || !Array.isArray(rows)) {
    return { table: 'configuracion', rows: 0, skipped: true };
  }
  const stmt = db.prepare(`
    INSERT INTO configuracion (clave, valor)
    VALUES (?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
  `);
  let imported = 0;
  for (const row of rows) {
    const clave = String(row.clave || '').trim();
    if (!clave || SAFE_CONFIG_DENY.test(clave)) continue;
    stmt.run(clave, row.valor == null ? '' : String(row.valor));
    imported += 1;
  }
  return { table: 'configuracion', rows: imported, skipped: false };
}

function deactivateStaleProducts(db, rows) {
  if (!hasTable(db, 'productos') || !Array.isArray(rows)) {
    return { table: 'productos_stale', rows: 0, skipped: true };
  }
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return { table: 'productos_stale', rows: 0, skipped: false };

  const placeholders = ids.map(() => '?').join(', ');
  const result = db
    .prepare(`UPDATE productos SET activo = 0 WHERE id NOT IN (${placeholders}) AND activo = 1`)
    .run(...ids);
  return { table: 'productos_stale', rows: result.changes || 0, skipped: false };
}

function importBaseDataPackage(db, payload) {
  const tables = payload?.tables || {};
  db.pragma('foreign_keys = OFF');
  const run = db.transaction(() => {
    const results = [];
    results.push(upsertRows(db, 'categorias', tables.categorias || []));
    results.push(upsertRows(db, 'productos', tables.productos || []));
    results.push(deactivateStaleProducts(db, tables.productos || []));
    results.push(
      upsertRows(db, 'inventario_insumos', tables.inventario_insumos || [], {
        preserveExisting: ['stock_actual', 'actualizado_en'],
      })
    );

    if (Array.isArray(tables.inventario_recetas)) {
      db.prepare('DELETE FROM inventario_recetas').run();
      results.push(upsertRows(db, 'inventario_recetas', tables.inventario_recetas));
    }

    results.push(
      upsertRows(db, 'personal', tables.personal || [], { override: { usuario_id: null } })
    );
    results.push(upsertRows(db, 'repartidores', tables.repartidores || []));
    results.push(upsertConfigRows(db, tables.configuracion || []));

    return results;
  });

  try {
    return {
      ok: true,
      imported_at: new Date().toISOString(),
      results: run(),
    };
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

module.exports = {
  BASE_TABLES,
  buildBaseDataPackage,
  importBaseDataPackage,
};
