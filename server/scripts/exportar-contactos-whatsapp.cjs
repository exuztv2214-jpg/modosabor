const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { dbFile, dataDir, ensureDir } = require('../utils/storagePaths');

function csvField(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function vcfField(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

const outputDir = path.join(dataDir, 'exports');
ensureDir(outputDir);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const csvPath = path.join(outputDir, `whatsapp-contactos-${stamp}.csv`);
const vcfPath = path.join(outputDir, `whatsapp-contactos-${stamp}.vcf`);

const db = new Database(dbFile, { readonly: true, fileMustExist: true });
const rows = db
  .prepare(
    `SELECT telefono, nombre, ultimo_mensaje_en, origen
       FROM wa_contactos
      WHERE COALESCE(telefono, '') <> ''
      ORDER BY LOWER(COALESCE(nombre, '')), telefono`
  )
  .all();
db.close();

const csv = [
  ['nombre_whatsapp', 'telefono', 'ultimo_mensaje_en', 'origen'].map(csvField).join(','),
  ...rows.map((row) =>
    [row.nombre || '', row.telefono, row.ultimo_mensaje_en || '', row.origen || ''].map(csvField).join(',')
  ),
].join('\r\n') + '\r\n';

const vcf = rows
  .map((row, index) => {
    const name = row.nombre || `Contacto WhatsApp ${index + 1}`;
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${vcfField(name)}`,
      `TEL;TYPE=CELL:${vcfField(row.telefono)}`,
      `NOTE:${vcfField(`Origen: WhatsApp; último mensaje: ${row.ultimo_mensaje_en || 'sin dato'}`)}`,
      'END:VCARD',
    ].join('\r\n');
  })
  .join('\r\n') + (rows.length ? '\r\n' : '');

fs.writeFileSync(csvPath, csv, 'utf8');
fs.writeFileSync(vcfPath, vcf, 'utf8');

console.log(JSON.stringify({
  ok: true,
  total: rows.length,
  conNombre: rows.filter((row) => String(row.nombre || '').trim()).length,
  csvPath,
  vcfPath,
}, null, 2));
