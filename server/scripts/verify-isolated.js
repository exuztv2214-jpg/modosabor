/*
 * Ejecuta las verificaciones HTTP contra una copia temporal de la base real.
 * Los scripts de operación crean pedidos, usuarios y movimientos: hacerlo
 * contra el proceso local podía dejar residuos si el test se interrumpía.
 */
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const { dbFile } = require('../utils/storagePaths');

const targetScript = String(process.argv[2] || '').trim();
if (!targetScript) {
  throw new Error('Uso: node scripts/verify-isolated.js scripts/verify-core.js');
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      });
      request.on('error', retry);
      request.setTimeout(1500, () => request.destroy());
    };
    const retry = () => {
      if (Date.now() >= deadline) {
        return reject(new Error('El servidor temporal no respondió /api/health'));
      }
      setTimeout(attempt, 200);
    };
    attempt();
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(' ')} terminó con ${signal || `código ${code}`}`));
    });
  });
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-verify-'));
  const testDbFile = path.join(tempDir, 'modosabor-test.db');
  const port = await reservePort();
  let api = null;
  let apiExit = null;

  try {
    const source = new Database(dbFile, { readonly: true, fileMustExist: true });
    await source.backup(testDbFile);
    source.close();

    const env = {
      ...process.env,
      PORT: String(port),
      DB_FILE: testDbFile,
      DATA_DIR: path.join(tempDir, 'data'),
      UPLOADS_DIR: path.join(tempDir, 'uploads'),
      BACKUPS_DIR: path.join(tempDir, 'backups'),
      NODE_ENV: 'test',
      ISOLATED_OPERATIONAL_TEST: '1',
    };
    api = spawn(process.execPath, ['index.js'], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'pipe',
    });
    apiExit = new Promise((resolve) => api.once('exit', resolve));
    api.stderr.on('data', (chunk) => process.stderr.write(chunk));
    await waitForHealth(port);
    await run(process.execPath, [targetScript], { cwd: path.join(__dirname, '..'), env });
  } finally {
    if (api && !api.killed) api.kill();
    if (apiExit) await apiExit;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message || error}`);
  process.exitCode = 1;
});
