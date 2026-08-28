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

/**
 * Vincularse con el panel usando un código de un solo uso.
 *
 * ── Qué reemplaza ──────────────────────────────────────────────────────────
 *
 * Antes había que copiar a mano, de un archivo `.env` a esta ventana: una API
 * Key, una URL del servidor, una CDP URL y un intervalo en milisegundos.
 * Ninguna de esas cuatro cosas significa algo para quien atiende un local.
 *
 * Y cuando la URL quedaba mal —apuntando a producción mientras el servidor
 * corría en la PC— no había ningún error: el Worker preguntaba "¿hay trabajo?"
 * a otro lado y todo se quedaba quieto, sin una sola pista.
 *
 * Ahora el panel manda las dos cosas que el Worker no puede saber solo: dónde
 * está el servidor y un código para pedirle la clave. Lo demás —el puerto de
 * Chrome, el intervalo— siempre fue igual y no tenía por qué preguntarse.
 *
 * ── Por qué la clave se canjea y no viene en el link ───────────────────────
 *
 * El link se abre desde el navegador y queda en el historial. Además, en
 * Windows los argumentos con los que arranca un programa los puede leer
 * cualquier otro programa de la máquina.
 *
 * El código dura cinco minutos y sirve una vez. La clave no vence nunca.
 */
async function vincularConCodigo({ servidor, codigo }) {
  send('worker-status', { status: 'vinculando', detail: 'Pidiéndole la clave al panel…' });

  let respuesta;
  try {
    respuesta = await fetch(`${servidor.replace(/\/+$/, '')}/vincular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    });
  } catch (error) {
    /*
      El caso más común de todos: el servidor no está prendido. Se dice con la
      dirección adentro, porque el error de red a secas ("fetch failed") no le
      dice nada a nadie.
    */
    throw new Error(
      `No se pudo hablar con el panel en ${servidor}. ¿Está prendido el sistema? (${error.message})`
    );
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !datos.clave) {
    throw new Error(datos.error || 'El panel no aceptó el código de vinculación.');
  }

  /*
    Se guarda todo junto y de una. Si se guardara la clave sin la dirección,
    quedaría a medio vincular: con credenciales válidas para un servidor que no
    sabe cuál es.
  */
  const cfg = {
    ...loadConfig(),
    apiUrl: servidor,
    apiKey: datos.clave,
    cdpUrl: DEFAULT_CDP_URL,
  };
  saveConfig(cfg);
  writeEnvFile(cfg);
  send('config', cfg);

  stopWorker();
  startWorker();

  send('worker-status', {
    status: 'vinculado',
    detail: 'Esta PC quedó vinculada al panel. Ahora iniciá sesión en Facebook.',
  });

  /* El paso siguiente es siempre el mismo, así que se hace solo. */
  openFacebookSession();
}

function handleProtocol(argv) {
  const requested = argv.find((item) => String(item).startsWith(`${PROTOCOL}://`));
  if (!requested) return;
  if (mainWindow) mainWindow.show();

  let url;
  try {
    url = new URL(requested);
  } catch {
    return;
  }

  /*
    `vincular` es el camino nuevo; `connect` el viejo, que sólo abría Facebook.
    Se sostienen los dos: puede haber un acceso directo guardado con el
    formato anterior, y romperlo sería un error silencioso más.
  */
  const accion = `${url.hostname || ''}${url.pathname || ''}`.replace(/\//g, '').toLowerCase();

  if (accion === 'vincular') {
    const servidor = url.searchParams.get('servidor') || '';
    const codigo = url.searchParams.get('codigo') || '';

    if (!servidor || !codigo) {
      send('worker-status', {
        status: 'error',
        detail: 'El link de vinculación está incompleto. Generá uno nuevo desde el panel.',
      });
      return;
    }

    vincularConCodigo({ servidor, codigo }).catch((error) => {
      send('worker-status', { status: 'error', detail: error.message });
    });
    return;
  }

  if (accion === 'connect') {
    try {
      openFacebookSession();
    } catch (error) {
      send('worker-status', { status: 'error', detail: error.message });
    }
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
