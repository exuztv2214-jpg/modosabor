'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { nombreArchivoFoto, vincularFotosExistentes } = require('../photo-cache');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masivos-fotos-'));
try {
  const numero = 'cliente@lid';
  fs.writeFileSync(path.join(dir, nombreArchivoFoto(numero)), 'foto');
  const items = [{ numero }, { numero: 'sin-foto@lid' }];
  assert.equal(vincularFotosExistentes(items, dir), 1);
  assert.equal(items[0].foto, 'cliente_lid.jpg');
  assert.equal(items[1].foto, undefined);
  console.log('photo cache: OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
