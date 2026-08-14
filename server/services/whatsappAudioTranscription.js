const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const logger = require('../utils/logger');
const { dataDir } = require('../utils/storagePaths');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'transcribe-whatsapp-audio.py');
const BUNDLED_MODEL_DIR = path.join(__dirname, '..', 'whisper-models');
const MAX_AUDIO_SECONDS = 180;
const TRANSCRIPTION_TIMEOUT_MS = 120000;
let transcriptionQueue = Promise.resolve();

function pythonCandidates() {
  const serverRoot = path.join(__dirname, '..');
  return [
    String(process.env.WHISPER_PYTHON || '').trim(),
    path.join(serverRoot, '.venv-whisper', 'Scripts', 'python.exe'),
    path.join(serverRoot, '.venv-whisper', 'bin', 'python'),
    process.platform === 'win32' ? 'py' : 'python3',
    'python',
  ].filter(Boolean);
}

function runPython(python, audioPath) {
  return new Promise((resolve, reject) => {
    const args = python === 'py' ? ['-3.12', SCRIPT, audioPath] : [SCRIPT, audioPath];

    /*
      Ver el comentario largo en scripts/transcribe-whatsapp-audio.py.

      En resumen: con "base" los audios salían mal transcriptos —"cuánto cueste
      lo mito" por "cuánto cuesta el lomito"— y la IA contestaba sobre algo que
      el cliente nunca dijo. "small" lo arregla y se baja solo la primera vez.
    */
    const modelo = String(process.env.WHISPER_MODEL || 'small').trim();

    /*
      Este log existe para poder responder una pregunta concreta: después de
      reiniciar el servidor, ¿está usando el modelo nuevo o quedó el viejo?

      Whisper no se carga al arrancar sino recién cuando llega el primer audio,
      así que el arranque no dice nada. Sin esta línea la única forma de saberlo
      era mandar un audio y adivinar por la calidad de la transcripción.
    */
    logger.info(`Transcribiendo audio de WhatsApp con Whisper "${modelo}"`);

    const child = spawn(python, args, {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        WHISPER_MODEL: modelo,
        WHISPER_CACHE_DIR:
          String(process.env.WHISPER_CACHE_DIR || '').trim() ||
          (fs.existsSync(BUNDLED_MODEL_DIR)
            ? BUNDLED_MODEL_DIR
            : path.join(dataDir, 'whisper-models')),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill(), TRANSCRIPTION_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `Whisper terminó con código ${code}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        const text = String(result?.text || '').trim();
        if (!text) return reject(new Error('No se detectó voz en el audio'));
        resolve(text);
      } catch (error) {
        reject(new Error(`Respuesta inválida del transcriptor: ${error.message}`));
      }
    });
  });
}

async function transcribeFile(audioPath) {
  let lastError;
  for (const python of pythonCandidates()) {
    if (path.isAbsolute(python) && !fs.existsSync(python)) continue;
    try {
      return await runPython(python, audioPath);
    } catch (error) {
      lastError = error;
      if (!/ENOENT/i.test(String(error?.message || ''))) throw error;
    }
  }
  throw lastError || new Error('No se encontró Python con faster-whisper instalado');
}

async function transcribeWhatsappAudio(message, conexion) {
  let content = message?.message || {};
  if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
  if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
  const seconds = Number(content.audioMessage?.seconds || 0);
  if (seconds > MAX_AUDIO_SECONDS) {
    throw new Error(`El audio supera el máximo de ${MAX_AUDIO_SECONDS} segundos`);
  }

  const task = async () => {
    const buffer = await conexion.descargarAudio(message);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('WhatsApp no devolvió el contenido del audio');
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-audio-'));
    const audioPath = path.join(tempDir, 'nota.ogg');
    try {
      fs.writeFileSync(audioPath, buffer);
      return await transcribeFile(audioPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };

  // Whisper usa bastante CPU. Se procesan las notas en orden para que dos
  // clientes no congelen simultáneamente la caja de la PC del local.
  const queued = transcriptionQueue.then(task, task);
  transcriptionQueue = queued.catch((error) => {
    logger.warn('WhatsApp: no se pudo transcribir un audio', { message: error.message });
  });
  return queued;
}

module.exports = { transcribeWhatsappAudio, MAX_AUDIO_SECONDS, transcribeFile };
