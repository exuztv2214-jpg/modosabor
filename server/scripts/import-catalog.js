#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const db = require('../db');

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Uso: node scripts/import-catalog.js <catalog-export.json>');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf-8'));
const tables = payload.tables || {};

function tableColumns(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((col) => col.name);
}

function hasTable(table) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  );
}

function upsertRows(table, rows, { preserveExisting = [] } = {}) {
  if (!hasTable(table) || !Array.isArray(rows)) return { table, rows: 0, skipped: true };

  const cols = tableColumns(table);
  const insertableCols = cols.filter((col) => rows.some((row) => Object.hasOwn(row, col)));
  if (!insertableCols.includes('id')) return { table, rows: 0, skipped: true };

  const placeholders = insertableCols.map(() => '?').join(', ');
  const updates = insertableCols
    .filter((col) => col !== 'id' && !preserveExisting.includes(col))
    .map((col) => `${col} = excluded.${col}`)
    .join(', ');
  const sql = `
    INSERT INTO ${table} (${insertableCols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates || 'id = excluded.id'}
  `;
  const stmt = db.prepare(sql);

  for (const row of rows) {
    stmt.run(...insertableCols.map((col) => row[col]));
  }

  return { table, rows: rows.length, skipped: false };
}

function resetSequence(table) {
  if (!hasTable('sqlite_sequence')) return;
  const max = db.prepare(`SELECT COALESCE(MAX(id), 0) AS max FROM ${table}`).get().max;
  const exists = db.prepare('SELECT name FROM sqlite_sequence WHERE name = ?').get(table);
  if (exists) {
    db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(max, table);
  } else {
    db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, max);
  }
}

const run = db.transaction(() => {
  db.pragma('foreign_keys = OFF');

  const results = [];
  results.push(upsertRows('categorias', tables.categorias || []));
  results.push(upsertRows('productos', tables.productos || []));
  results.push(
    upsertRows('inventario_insumos', tables.inventario_insumos || [], {
      preserveExisting: ['stock_actual', 'actualizado_en'],
    })
  );

  if (Array.isArray(tables.inventario_recetas)) {
    db.prepare('DELETE FROM inventario_recetas').run();
    results.push(upsertRows('inventario_recetas', tables.inventario_recetas));
  }

  const sourceProductIds = new Set((tables.productos || []).map((row) => Number(row.id)));
  const staleProducts = db
    .prepare('SELECT id FROM productos')
    .all()
    .filter((row) => !sourceProductIds.has(Number(row.id)));
  const deactivateProduct = db.prepare('UPDATE productos SET activo = 0 WHERE id = ?');
  for (const row of staleProducts) deactivateProduct.run(row.id);

  for (const table of ['categorias', 'productos', 'inventario_insumos', 'inventario_recetas']) {
    if (hasTable(table)) resetSequence(table);
  }

  db.pragma('foreign_keys = ON');
  return { results, stale_products_deactivated: staleProducts.length };
});

const result = run();
console.log(
  JSON.stringify({ ok: true, imported_at: new Date().toISOString(), ...result }, null, 2)
);
