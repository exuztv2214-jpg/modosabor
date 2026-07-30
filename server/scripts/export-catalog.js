#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const db = require('../db');

const outPath =
  process.argv[2] || path.join(__dirname, '..', '..', 'deploy', 'catalog-export.json');
const tables = ['categorias', 'productos', 'inventario_insumos', 'inventario_recetas'];

function rowsFor(table) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
}

const payload = {
  exported_at: new Date().toISOString(),
  source: 'modosabor-local-catalog',
  tables: Object.fromEntries(tables.map((table) => [table, rowsFor(table)])),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

for (const table of tables) {
  console.log(`${table}: ${payload.tables[table].length}`);
}
console.log(`Catalogo exportado en ${outPath}`);
