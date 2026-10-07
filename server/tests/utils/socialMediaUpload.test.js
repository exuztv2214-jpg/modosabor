const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extensionParaMime, firmaCompatible } = require('../../utils/socialMediaUpload');

module.exports = {
  'la extensión guardada sale del MIME permitido y no del nombre enviado': () => {
    assert.strictEqual(extensionParaMime('image/jpeg'), '.jpg');
    assert.strictEqual(extensionParaMime('text/html'), null);
  },

  'un HTML disfrazado de imagen se rechaza por su firma': () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-media-'));
    const falsa = path.join(dir, 'falsa.png');
    const real = path.join(dir, 'real.png');
    try {
      fs.writeFileSync(falsa, '<script>alert(1)</script>');
      fs.writeFileSync(real, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
      assert.strictEqual(firmaCompatible(falsa, 'image/png'), false);
      assert.strictEqual(firmaCompatible(real, 'image/png'), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
