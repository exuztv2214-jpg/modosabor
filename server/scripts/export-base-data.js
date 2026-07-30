#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { buildBaseDataPackage } = require('../utils/dataPackage');

const outPath =
  process.argv[2] || path.join(__dirname, '..', '..', 'deploy', 'base-data-export.json');
const payload = buildBaseDataPackage(db);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

for (const [table, rows] of Object.entries(payload.tables)) {
  console.log(`${table}: ${rows.length}`);
}
console.log(`Datos base exportados en ${outPath}`);
