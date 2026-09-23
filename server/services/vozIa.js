const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../db');
const { uploadsDir } = require('../utils/storagePaths');
const logger = require('../utils/logger');
const { desencriptar } = require('../utils/encryptConfig');

/**
 * Voz de los avisos, generada con IA.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * Los avisos ("Nuevo pedido número 42") los dice el navegador con
 * `speechSynthesis`, o sea la voz del sistema operativo. En Android suena
 * robótica y en una cocina con ruido cuesta entenderla.
 *
 * ── Por qué se genera una vez y se guarda ──────────────────────────────────
 *
 * La tentación es pedirle el audio a la API cada vez que entra un pedido. Sería
 * un error: la alarma tiene que sonar **ya**, y entre ir a la API, generar,
 * bajar y reproducir se van segundos. Con el wifi flojo de una cocina, a veces
 * directamente no sonaría.
 *
 * Las frases son casi siempre las mismas, así que cada texto se genera una sola
 * vez y queda guardado en disco. La segunda vez que entra un pedido número 42,
 * el audio ya está y suena al instante, sin internet.
 *
 * El costo es ridículo: la API cobra por segundo de audio generado, y estamos
 * hablando de unos pocos minutos en total, una sola vez.
 *
 * ── Por qué nunca se espera ────────────────────────────────────────────────
 *
 * El texto del aviso incluye el nombre del cliente, así que la primera vez que
 * pide alguien nuevo el audio no existe todavía. Si el navegador se quedara
 * esperando a que se genere, habría dos segundos de silencio justo cuando entra
 * el pedido. Inaceptable en una cocina.
 *
 * Entonces la consulta **nunca genera nada**: responde al instante con el audio
 * si ya existe, o con `null` si no. Cuando devuelve `null`, el navegador habla
 * con la voz de siempre (sin demora) y el servidor se pone a generar el audio
 * por atrás, para que la próxima vez que venga ese cliente ya esté listo.
 *
 * O sea: el sistema se va afinando solo. Los clientes habituales terminan todos
 * con voz de IA a los pocos días, sin que nadie haga nada.
 *
 * ── Si algo falla, no pasa nada ────────────────────────────────────────────
 *
 * Sin clave configurada, con la función apagada, o si la API no responde, esto
 * devuelve `null` y el navegador usa la voz del sistema como siempre. Nunca
 * puede dejar a la cocina sin aviso por culpa de un servicio externo.
 */

const CARPETA_VOZ = path.join(uploadsDir, 'voz');
const MODELO_POR_DEFECTO = 'gemini-2.5-flash-preview-tts';
const TIMEOUT_MS = 15000;
const COOLDOWN_429_MS = 15 * 60 * 1000;
const CACHE_MAX_ARCHIVOS = 160;
const CACHE_MAX_BYTES = 48 * 1024 * 1024;
let proveedorBloqueadoHasta = 0;

function asegurarCarpeta() {
  if (!fs.existsSync(CARPETA_VOZ)) fs.mkdirSync(CARPETA_VOZ, { recursive: true });
}

/**
 * La voz es un caché regenerable, no un archivo operativo.
 *
 * El nombre del cliente vuelve casi todas las frases únicas y el directorio
 * crecía sin límite: en Railway llegó a ocupar más de 140 MB y dejó al volumen
 * sin lugar hasta para crear un backup. Se conservan los audios más recientes
 * dentro de dos límites; si uno falta, el navegador habla normalmente y el
 * servidor lo vuelve a generar en segundo plano.
 */
function limpiarCacheVoz({
  carpeta = CARPETA_VOZ,
  maxArchivos = CACHE_MAX_ARCHIVOS,
  maxBytes = CACHE_MAX_BYTES,
} = {}) {
  if (!fs.existsSync(carpeta)) return { retained: 0, removed: 0, retainedBytes: 0 };
  const archivos = fs
    .readdirSync(carpeta)
    .filter((archivo) => archivo.toLowerCase().endsWith('.wav'))
    .map((archivo) => {
      const ruta = path.join(carpeta, archivo);
      const stats = fs.statSync(ruta);
      return { archivo, ruta, size: stats.size, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  let retained = 0;
  let retainedBytes = 0;
  let removed = 0;
  for (const entry of archivos) {
    const entra =
      retained < Math.max(1, Number(maxArchivos) || 1) &&
      retainedBytes + entry.size <= Math.max(1, Number(maxBytes) || 1);
    if (entra) {
      retained += 1;
      retainedBytes += entry.size;
    } else {
      fs.unlinkSync(entry.ruta);
      removed += 1;
    }
  }
  return { retained, removed, retainedBytes };
}

function leerConfig() {
  const filas = db.prepare('SELECT clave, valor FROM configuracion').all();
  return filas.reduce((acc, f) => {
    acc[f.clave] = f.valor;
    return acc;
  }, {});
}

/**
 * Nombre de archivo estable para un texto.
 *
 * Se incluye la voz en el hash: si mañana se cambia de voz, los audios viejos
 * no se reutilizan con la voz nueva.
 */
function nombreArchivo(texto, voz) {
  const hash = crypto.createHash('sha1').update(`${voz}::${texto}`).digest('hex').slice(0, 20);
  return `${hash}.wav`;
}

/** ¿Está habilitada la voz por IA y hay con qué generarla? */
function vozIaHabilitada(config = null) {
  const cfg = config || leerConfig();
  const activa = String(cfg.voz_ia_activa ?? '0') === '1';
  const clave = process.env.GEMINI_API_KEY || cfg.gemini_api_key || '';
  return Boolean(activa && clave);
}

/**
 * El audio que devuelve Gemini es PCM crudo de 24 kHz. Los navegadores no lo
 * reproducen así como viene, hace falta ponerle la cabecera WAV.
 */
function envolverEnWav(pcm, muestreo = 24000, canales = 1, bitsPorMuestra = 16) {
  const bytesPorMuestra = bitsPorMuestra / 8;
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + pcm.length, 4);
  cabecera.write('WAVE', 8);
  cabecera.write('fmt ', 12);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20); // PCM
  cabecera.writeUInt16LE(canales, 22);
  cabecera.writeUInt32LE(muestreo, 24);
  cabecera.writeUInt32LE(muestreo * canales * bytesPorMuestra, 28);
  cabecera.writeUInt16LE(canales * bytesPorMuestra, 32);
  cabecera.writeUInt16LE(bitsPorMuestra, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cabecera, pcm]);
}

/**
 * Busca el audio ya generado para un texto. Nunca espera ni genera nada.
 *
 * Si no lo encuentra, dispara la generación por atrás y devuelve `null` en el
 * acto, para que el navegador hable con la voz del sistema sin demora.
 *
 * @returns {string|null} URL pública del audio, o `null`.
 */
function obtenerAudio(texto) {
  const limpio = String(texto || '').trim();
  if (!limpio || limpio.length > 300) return null;

  const config = leerConfig();
  if (!vozIaHabilitada(config)) return null;
  if (Date.now() < proveedorBloqueadoHasta) return null;

  const voz = config.voz_ia_nombre || 'Kore';
  const archivo = nombreArchivo(limpio, voz);

  if (fs.existsSync(path.join(CARPETA_VOZ, archivo))) return `/uploads/voz/${archivo}`;

  // No lo tenemos: que se genere para la próxima. El error ya queda logueado
  // adentro, y acá no hay nadie esperando el resultado.
  generarAudio(limpio, config).catch(() => {});
  return null;
}

/*
  Dos pedidos seguidos del mismo cliente dispararían dos generaciones idénticas
  en paralelo, pagando la API dos veces por el mismo audio. Con esto, el segundo
  ve que ya hay una generación en curso y no hace nada.
*/
const generandoAhora = new Set();

/** Genera el audio y lo deja guardado. No lo llama nadie que esté esperando. */
async function generarAudio(limpio, config) {
  const voz = config.voz_ia_nombre || 'Kore';
  const archivo = nombreArchivo(limpio, voz);
  const rutaDisco = path.join(CARPETA_VOZ, archivo);
  const rutaPublica = `/uploads/voz/${archivo}`;

  if (fs.existsSync(rutaDisco)) return rutaPublica;
  if (generandoAhora.has(archivo)) return null;
  generandoAhora.add(archivo);

  const clave = process.env.GEMINI_API_KEY || desencriptar(config.gemini_api_key);
  const modelo = config.voz_ia_modelo || MODELO_POR_DEFECTO;

  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
      {
        method: 'POST',
        signal: controlador.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': clave,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: limpio }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } },
            },
          },
        }),
      }
    );

    if (!respuesta.ok) {
      if (respuesta.status === 429) {
        const retryAfterSeconds = Number(respuesta.headers.get('retry-after') || 0);
        proveedorBloqueadoHasta =
          Date.now() + (retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : COOLDOWN_429_MS);
      }
      logger.warn('[vozIa] La API no devolvió audio', { estado: respuesta.status });
      return null;
    }

    const datos = await respuesta.json();
    const base64 = datos?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) return null;

    asegurarCarpeta();
    fs.writeFileSync(rutaDisco, envolverEnWav(Buffer.from(base64, 'base64')));
    logger.info('[vozIa] Audio generado y guardado', { archivo });
    return rutaPublica;
  } catch (error) {
    // Sin internet, servicio caído o demasiado lento: que hable el navegador.
    logger.warn('[vozIa] No se pudo generar el audio', {
      mensaje: error?.message || String(error),
    });
    return null;
  } finally {
    clearTimeout(corte);
    generandoAhora.delete(archivo);
  }
}

module.exports = { obtenerAudio, generarAudio, vozIaHabilitada, limpiarCacheVoz };
