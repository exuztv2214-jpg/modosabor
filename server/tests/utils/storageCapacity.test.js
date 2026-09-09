const assert = require('assert');

const { getStorageUsage } = require('../../utils/storagePaths');

function run() {
  const usage = getStorageUsage('/volumen', () => ({
    bsize: 1024,
    blocks: 1000,
    bavail: 250,
  }));

  assert.deepStrictEqual(usage, {
    totalBytes: 1024000,
    availableBytes: 256000,
    usedBytes: 768000,
    percentUsed: 75,
  });
  assert.strictEqual(getStorageUsage('/volumen', null), null);
  assert.strictEqual(
    getStorageUsage('/volumen', () => {
      throw new Error('filesystem no disponible');
    }),
    null
  );

  console.log('storageCapacity.test.js OK');
}

if (require.main === module) run();
module.exports = { run };
