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
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
let transcriptionQueue = Promise.resolve();

function contenidoInterno(message = {}) {
  let content = message?.message || {};
  while (true) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message;
    if (!wrapped) return content;
    content = wrapped;
  }
}

function transcriptionErrorCode(error) {
  const message = String(error?.message || '');
  if (error?.code === 'WHATSAPP_AUDIO_DOWNLOAD') return 'media_download';
  if (/tiempo|timeout|timed out/i.test(message)) return 'timeout';
  if (/vac[ií]o|supera el m[aá]ximo|no contiene un audio/i.test(message)) return 'invalid_audio';
  if (/no se detect[oó] voz/i.test(message)) return 'no_speech';
  return 'transcriber_failure';
}

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

      Va como "notice" y no como "info" porque la IA de WhatsApp corre en
      producción, y ahí los "info" se descartan: el log habría quedado mudo
      justo donde hace falta leerlo.
    */
    logger.notice(`Transcribiendo audio de WhatsApp con Whisper "${modelo}"`);

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
    const arranque = Date.now();

    /*
      Se anota si el que corta somos nosotros. Sin esta marca, un audio
      detenido por el timeout y uno que el sistema operativo mató por falta de
      memoria llegaban con el mismo mensaje —"terminó con código null"— y no
      había forma de distinguirlos sin entrar al servidor.
    */
    let cortadoPorTiempo = false;
    const timeout = setTimeout(() => {
      cortadoPorTiempo = true;
      child.kill();
    }, TRANSCRIPTION_TIMEOUT_MS);

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
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        if (stderr.trim()) return reject(new Error(stderr.trim()));

        /*
          Código nulo significa que a Whisper lo mataron: no falló, lo cortaron.
          Quién lo hizo cambia por completo el arreglo, así que el mensaje lo
          dice en castellano en vez de dejar un número.

          · Nuestro timeout  → la máquina no llega a tiempo.
          · SIGKILL ajeno    → casi siempre memoria: el sistema operativo
            eligió a Whisper para liberar RAM. Se resuelve con más memoria en
            el servidor, no tocando el audio.
        */
        const segundos = Math.round((Date.now() - arranque) / 1000);
        if (code === null) {
          if (cortadoPorTiempo) {
            return reject(
              new Error(
                `Whisper no terminó a tiempo: lo cortamos a los ${segundos}s ` +
                  `(el límite es ${Math.round(TRANSCRIPTION_TIMEOUT_MS / 1000)}s). ` +
                  'El servidor está tardando más de lo normal en transcribir.'
              )
            );
          }
          return reject(
            new Error(
              `El sistema mató a Whisper a los ${segundos}s con ${signal || 'una señal'}, ` +
                'sin que llegara a fallar. Casi siempre es falta de memoria en el servidor: ' +
                'el modelo "small" necesita alrededor de 1 GB para cargarse.'
            )
          );
        }

        return reject(new Error(`Whisper terminó con código ${code} a los ${segundos}s`));
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
  const content = contenidoInterno(message);
  const seconds = Number(content.audioMessage?.seconds || 0);
  if (seconds > MAX_AUDIO_SECONDS) {
    throw new Error(`El audio supera el máximo de ${MAX_AUDIO_SECONDS} segundos`);
  }

  let buffer;
  try {
    buffer = await conexion.descargarAudio(message);
  } catch (error) {
    const wrapped = new Error('No se pudo descargar el audio desde WhatsApp');
    wrapped.code = 'WHATSAPP_AUDIO_DOWNLOAD';
    wrapped.cause = error;
    throw wrapped;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('WhatsApp no devolvió el contenido del audio');
  }
  return transcribeAudioBuffer(buffer, 'ogg');
}

async function transcribeAudioBuffer(buffer, extension = 'webm') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('El audio está vacío');
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error('El audio supera el máximo de 8 MB');
  }
  const safeExtension = String(extension || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm';
  const task = async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-audio-'));
    const audioPath = path.join(tempDir, `nota.${safeExtension}`);
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
    // No registramos audio, texto transcripto, teléfono ni credenciales. El
    // código permite diagnosticar descarga/Whisper sin exponer conversaciones.
    logger.warn('WhatsApp: no se pudo transcribir un audio', {
      reason: transcriptionErrorCode(error),
    });
  });
  return queued;
}

module.exports = {
  transcribeWhatsappAudio,
  transcribeAudioBuffer,
  MAX_AUDIO_SECONDS,
  MAX_AUDIO_BYTES,
  transcribeFile,
  contenidoInterno,
  transcriptionErrorCode,
};
