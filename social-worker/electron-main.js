const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.modosabor-social-worker.json');
const PROTOCOL = 'modosabor-social';

let mainWindow;
let workerProcess = null;
let logs = [];

function findChrome() {
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] || '',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe'
    ),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function socialProfilePath() {
  // Perfil aislado, administrado por la aplicación. Facebook conserva acá su
  // sesión local; nunca leemos, copiamos ni enviamos cookies al servidor.
  return path.join(
    process.env.LOCALAPPDATA || app.getPath('userData'),
    'ModoSaborSocial',
    'facebook-profile'
  );
}

function openFacebookSession() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No se encontró Google Chrome en esta computadora.');

  fs.mkdirSync(socialProfilePath(), { recursive: true });
  const child = spawn(
    chrome,
    [
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=9222',
      `--user-data-dir=${socialProfilePath()}`,
      'https://www.facebook.com/',
    ],
    { detached: true, stdio: 'ignore', windowsHide: false }
  );
  child.unref();
  send('worker-status', {
    status: 'connecting',
    detail: 'Facebook abierto. Iniciá sesión una sola vez si te lo pide.',
  });
  return { opened: true, profile: 'managed', cdpUrl: 'http://127.0.0.1:9222' };
}

function handleProtocol(argv) {
  const requested = argv.find((item) => String(item).startsWith(`${PROTOCOL}://`));
  if (!requested || !/\/\/connect(?:\/|$|\?)/i.test(requested)) return;
  if (mainWindow) mainWindow.show();
  try {
    openFacebookSession();
  } catch (error) {
    send('worker-status', { status: 'error', detail: error.message });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 580,
    height: 780,
    resizable: true,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Modo Sabor Social Worker',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
  createWindow();
  handleProtocol(process.argv);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => handleProtocol(argv));
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocol([url]);
  });
}

app.on('window-all-closed', () => {
  stopWorker();
  if (process.platform !== 'darwin') app.quit();
});

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Error cargando config:', e.message);
  }
  return {};
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Error guardando config:', e.message);
  }
}

function writeEnvFile(cfg) {
  const envPath = path.join(__dirname, '.env');
  const lines = [
    `SOCIAL_WORKER_KEY=${cfg.apiKey || ''}`,
    `SOCIAL_API_URL=${cfg.apiUrl || 'http://localhost:3001/api/social-worker'}`,
    `SOCIAL_CHROME_CDP_URL=${cfg.cdpUrl || 'http://127.0.0.1:9222'}`,
    `SOCIAL_POLL_MS=${(cfg.pollSeconds || 8) * 1000}`,
    `SOCIAL_WORKER_CODE=${cfg.workerCode || 'windows-local'}`,
    `SOCIAL_CAPTURE_FAILURE_SCREENSHOTS=${cfg.captureScreenshots ? '1' : ''}`,
  ];
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
}

function startWorker() {
  if (workerProcess) return;

  const cfg = loadConfig();
  writeEnvFile(cfg);

  send('worker-status', { status: 'starting', detail: 'Iniciando motor…' });

  workerProcess = spawn('node', [path.join(__dirname, 'index.js')], {
    cwd: __dirname,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  workerProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (!text) return;
    const entry = { t: new Date().toISOString(), level: 'info', message: text };
    logs.unshift(entry);
    if (logs.length > 200) logs.pop();
    send('worker-log', entry);

    // Inferir estado del log
    if (/sesión.*venció|session.*expired|login|checkpoint/i.test(text)) {
      send('worker-status', { status: 'session_expired', detail: text });
    } else if (/publicación.*exitosa|published|success/i.test(text)) {
      send('worker-status', { status: 'online', detail: 'Publicación exitosa' });
    } else if (/error|falló|failed/i.test(text)) {
      send('worker-status', { status: 'error', detail: text });
    }
  });

  workerProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (!text) return;
    const entry = { t: new Date().toISOString(), level: 'error', message: text };
    logs.unshift(entry);
    if (logs.length > 200) logs.pop();
    send('worker-log', entry);
  });

  workerProcess.on('close', (code) => {
    workerProcess = null;
    send('worker-status', { status: 'stopped', detail: `Proceso terminado (código ${code})` });
    send('worker-log', {
      t: new Date().toISOString(),
      level: 'warn',
      message: `Worker terminado con código ${code}`,
    });
  });

  workerProcess.on('error', (err) => {
    send('worker-status', { status: 'error', detail: err.message });
    send('worker-log', { t: new Date().toISOString(), level: 'error', message: err.message });
  });
}

function stopWorker() {
  if (workerProcess) {
    workerProcess.kill('SIGTERM');
    setTimeout(() => {
      if (workerProcess && !workerProcess.killed) {
        workerProcess.kill('SIGKILL');
      }
    }, 3000);
    workerProcess = null;
  }
}

// IPC handlers
ipcMain.handle('get-config', () => {
  const cfg = loadConfig();
  return {
    apiUrl: cfg.apiUrl || 'http://localhost:3001/api/social-worker',
    apiKey: cfg.apiKey || '',
    cdpUrl: cfg.cdpUrl || 'http://127.0.0.1:9222',
    pollSeconds: cfg.pollSeconds || 8,
    workerCode: cfg.workerCode || 'windows-local',
    captureScreenshots: !!cfg.captureScreenshots,
  };
});

ipcMain.handle('set-config', (_event, cfg) => {
  saveConfig(cfg);
  return cfg;
});

ipcMain.handle('start-worker', () => {
  startWorker();
  return true;
});

ipcMain.handle('stop-worker', () => {
  stopWorker();
  return true;
});

ipcMain.handle('open-facebook-session', () => openFacebookSession());

ipcMain.handle('get-logs', () => logs.slice().reverse());

ipcMain.handle('clear-logs', () => {
  logs = [];
  return true;
});

ipcMain.handle('select-chrome-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Seleccionar carpeta de datos de Chrome',
  });
  return result.filePaths[0] || '';
});

ipcMain.handle('quit-app', () => {
  app.quit();
});
