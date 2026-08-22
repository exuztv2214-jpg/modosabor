const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.modosabor-social-worker.json');
const PROTOCOL = 'modosabor-social';
const DEFAULT_API_URL = 'https://modosabor.com.ar/api/social-worker';
const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';

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

  /* Una instalación ya configurada debe volver a trabajar al abrirse. */
  mainWindow.webContents.once('did-finish-load', () => {
    if (loadConfig().apiKey) startWorker();
  });

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
  let guardada = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      guardada = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Error cargando config:', e.message);
  }

  /*
    Las instalaciones anteriores sólo tenían social-worker/.env. Reutilizarlo
    evita pedir de nuevo la clave y evita volver silenciosamente a localhost.
  */
  let anterior = {};
  const envPath = path.join(__dirname, '.env');
  try {
    if (fs.existsSync(envPath)) {
      for (const linea of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
        const match = linea.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) anterior[match[1]] = match[2].trim();
      }
    }
  } catch (e) {
    console.error('Error migrando config anterior:', e.message);
  }

  const combinada = {
    apiUrl: anterior.SOCIAL_API_URL || DEFAULT_API_URL,
    apiKey: anterior.SOCIAL_WORKER_KEY || '',
    cdpUrl: anterior.SOCIAL_CHROME_CDP_URL || DEFAULT_CDP_URL,
    pollSeconds: Math.max(Number(anterior.SOCIAL_POLL_MS || 8000) / 1000, 3),
    workerCode: anterior.SOCIAL_WORKER_CODE || 'windows-local',
    captureScreenshots: anterior.SOCIAL_CAPTURE_FAILURE_SCREENSHOTS === '1',
    ...guardada,
  };
  if (!Object.keys(guardada).length && combinada.apiKey) {
    saveConfig(combinada);
  }
  return combinada;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Error guardando config:', e.message);
  }
}

function writeEnvFile(cfg) {
  if (app.isPackaged) return;
  const envPath = path.join(__dirname, '.env');
  const lines = [
    `SOCIAL_WORKER_KEY=${cfg.apiKey || ''}`,
    `SOCIAL_API_URL=${cfg.apiUrl || DEFAULT_API_URL}`,
    `SOCIAL_CHROME_CDP_URL=${cfg.cdpUrl || DEFAULT_CDP_URL}`,
    `SOCIAL_POLL_MS=${(cfg.pollSeconds || 8) * 1000}`,
    `SOCIAL_WORKER_CODE=${cfg.workerCode || 'windows-local'}`,
    `SOCIAL_CAPTURE_FAILURE_SCREENSHOTS=${cfg.captureScreenshots ? '1' : ''}`,
  ];
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
}

function workerEntryPath() {
  if (!app.isPackaged) return path.join(__dirname, 'index.js');
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'index.js');
}

function startWorker() {
  if (workerProcess) return;

  const cfg = loadConfig();
  writeEnvFile(cfg);

  send('worker-status', { status: 'starting', detail: 'Iniciando motor…' });

  workerProcess = spawn(process.execPath, [workerEntryPath()], {
    cwd: app.isPackaged ? process.resourcesPath : __dirname,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      FORCE_COLOR: '0',
      SOCIAL_WORKER_KEY: cfg.apiKey || '',
      SOCIAL_API_URL: cfg.apiUrl || DEFAULT_API_URL,
      SOCIAL_CHROME_CDP_URL: cfg.cdpUrl || DEFAULT_CDP_URL,
      SOCIAL_POLL_MS: String((cfg.pollSeconds || 8) * 1000),
      SOCIAL_WORKER_CODE: cfg.workerCode || 'windows-local',
      SOCIAL_CAPTURE_FAILURE_SCREENSHOTS: cfg.captureScreenshots ? '1' : '',
    },
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
    apiUrl: cfg.apiUrl || DEFAULT_API_URL,
    apiKey: cfg.apiKey || '',
    cdpUrl: cfg.cdpUrl || DEFAULT_CDP_URL,
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
