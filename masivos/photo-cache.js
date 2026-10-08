'use strict';

const fs = require('node:fs');
const path = require('node:path');

function nombreArchivoFoto(numero) {
  return String(numero || '').replace(/[^a-zA-Z0-9]/g, '_') + '.jpg';
}

function vincularFotosExistentes(items, dirFotos) {
  let vinculadas = 0;
  for (const item of items || []) {
    if (!item?.numero) continue;
    const archivo = nombreArchivoFoto(item.numero);
    if (!fs.existsSync(path.join(dirFotos, archivo))) continue;
    item.foto = archivo;
    vinculadas++;
  }
  return vinculadas;
}

module.exports = { nombreArchivoFoto, vincularFotosExistentes };
