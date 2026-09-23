const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { limpiarCacheVoz } = require('../../services/vozIa');

function run() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-voz-cache-'));
  try {
    for (let index = 0; index < 5; index += 1) {
      const file = path.join(temp, `${index}.wav`);
      fs.writeFileSync(file, Buffer.alloc(1024, index));
      const time = new Date(Date.now() - index * 60_000);
      fs.utimesSync(file, time, time);
    }
    fs.writeFileSync(path.join(temp, 'conservar.txt'), 'no es caché de voz');

    const result = limpiarCacheVoz({ carpeta: temp, maxArchivos: 2, maxBytes: 4096 });
    const wav = fs
      .readdirSync(temp)
      .filter((file) => file.endsWith('.wav'))
      .sort();

    assert.deepStrictEqual(wav, ['0.wav', '1.wav']);
    assert.strictEqual(result.retained, 2);
    assert.strictEqual(result.removed, 3);
    assert.strictEqual(result.retainedBytes, 2048);
    assert.ok(fs.existsSync(path.join(temp, 'conservar.txt')));
    console.log('vozCache.test.js OK');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (require.main === module) run();
module.exports = { run };
