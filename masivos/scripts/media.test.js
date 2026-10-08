const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { moverMediosAlVolumen } = require('../media');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'masivos-media-'));
const media = path.join(raiz, 'data', 'media');
try {
  fs.writeFileSync(path.join(raiz, 'promo.png'), 'flyer viejo');
  fs.writeFileSync(path.join(raiz, 'promo-2.jpg'), 'flyer 2');
  fs.writeFileSync(path.join(raiz, 'menu.pdf'), 'menu');
  fs.writeFileSync(path.join(raiz, 'server.js'), 'no es un medio');
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, 'promo-2.jpg'), 'flyer 2 ya subido');

  const movidos = moverMediosAlVolumen(raiz, media);

  assert.deepEqual(movidos.sort(), ['menu.pdf', 'promo.png']);
  assert.equal(fs.readFileSync(path.join(media, 'promo.png'), 'utf8'), 'flyer viejo');
  assert.equal(fs.existsSync(path.join(raiz, 'promo.png')), false, 'mueve, no duplica');
  assert.equal(
    fs.readFileSync(path.join(media, 'promo-2.jpg'), 'utf8'),
    'flyer 2 ya subido',
    'no pisa lo que ya está en el volumen'
  );
  assert.equal(fs.existsSync(path.join(raiz, 'server.js')), true, 'no toca otros archivos');
  assert.deepEqual(moverMediosAlVolumen(raiz, media), [], 'segunda pasada no hace nada');
  console.log('media en volumen: OK');
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
