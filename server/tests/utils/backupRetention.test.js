const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-retencion-'));
  try {
    for (let index = 0; index < 8; index += 1) {
      const file = path.join(tempDir, `respaldo-${index}.sqlite`);
      fs.writeFileSync(file, Buffer.alloc(4 * 1024 * 1024));
      const time = new Date(Date.now() - index * 60_000);
      fs.utimesSync(file, time, time);
    }

    const managerPath = path.join(__dirname, '../../utils/backupManager.js');
    const script = `
      const manager = require(${JSON.stringify(managerPath)});
      const result = manager.cleanupOldBackups({ maxFiles: 6, maxTotalBytes: 16 * 1024 * 1024 });
      process.stdout.write(JSON.stringify(result));
    `;
    const child = spawnSync(process.execPath, ['-e', script], {
      env: { ...process.env, BACKUPS_DIR: tempDir },
      encoding: 'utf8',
    });
    assert.strictEqual(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    const remaining = fs.readdirSync(tempDir).filter((file) => file.endsWith('.sqlite'));

    assert.strictEqual(result.retained, 4);
    assert.strictEqual(remaining.length, 4);
    assert.ok(result.retainedBytes <= 16 * 1024 * 1024);
    assert.deepStrictEqual(remaining.sort(), [
      'respaldo-0.sqlite',
      'respaldo-1.sqlite',
      'respaldo-2.sqlite',
      'respaldo-3.sqlite',
    ]);
    console.log('backupRetention.test.js OK');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) run();
module.exports = { run };
