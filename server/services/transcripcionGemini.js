const logger = require('../utils/logger');
const { desencriptar } = require('../utils/encryptConfig');

/**
 * Pasa un audio a texto con Gemini.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Hasta ahora los audios se transcribían con Whisper corriendo dentro del
 * mismo servidor. El modelo "small" necesita cerca de 1 GB para cargarse y el
 * contenedor tiene 954 MB en total. Cuando no entraba, el sistema operativo
 * mataba el proceso sin dejar ni un mensaje de error, y el cliente recibía un
 * "no pude escuchar bien ese audio" sin que nadie supiera por qué.
 *
 * No era un error de programación: era un techo. Esto lo saca del servidor.
 *
 * ── Por qué Gemini y no otro ───────────────────────────────────────────────
 *
 * Porque la clave ya está cargada y funcionando —la usa la voz del asistente—,
 * así que no hay una cuenta nueva que abrir ni otra clave que rotar. Y el
 * volumen real del local, unos 9 audios por día, entra sobrado en la capa
 * gratuita, que permite 1.500 por día.
 *
 * ── Lo que sigue igual ─────────────────────────────────────────────────────
 *
 * Whisper local queda como respaldo. Si Gemini no contesta, se cae la conexión
 * o la clave falla, el audio se intenta con Whisper como antes. Un cliente
 * mandando un audio a las nueve de la noche no se tiene que enterar de nada
 * de esto.
 */

const MODELO_POR_DEFECTO = 'gemini-3.6-flash';
const TIMEOUT_MS = 45000;

/*
  El apunte que se le da al modelo. Sin esto transcribe "cuánto cuesta el
  lomito" como "cuánto cueste lo mito", que fue exactamente el problema que
  llevó a subir de "base" a "small" en su momento. Los nombres propios del
  local y de la zona son los que más se equivocan.
*/
const CONTEXTO =
  'Audio de un cliente de Modo Sabor, un restaurante de Monteros, Tucumán, Argentina. ' +
  'Habla en español rioplatense con voseo. Puede nombrar: lomito, hamburguesa, milanesa, ' +
  'mila, milanesa napolitana, mila napo, pizza, muzza, cremoso, empanadas, salchipapas, ' +
  'papas con cheddar, sándwich, menú del día, media docena, docena, entera, mitad, ' +
  'Monteros, Acheral, Villa Nueva.';

const INSTRUCCION =
  'Transcribí este audio literalmente, en español. ' +
  'Devolvé únicamente el texto dicho, sin comillas, sin explicaciones y sin agregar nada. ' +
  'Si no se entiende ninguna palabra, devolvé exactamente: SIN_VOZ';

function claveGemini(config = {}) {
  // La configuración almacenada es la fuente de verdad. Un .env de ejemplo
  // con el placeholder no debe pisar una clave real ni romper las pruebas.
  try {
    const configurada = String(desencriptar(config.gemini_api_key) || '').trim();
    if (configurada) return configurada;
  } catch {
    const configurada = String(config.gemini_api_key || '').trim();
    if (configurada) return configurada;
  }
  const desdeEntorno = String(process.env.GEMINI_API_KEY || '').trim();
  return /^pegá_tu|your.*key|changeme/i.test(desdeEntorno) ? '' : desdeEntorno;
}

/**
 * @param {Buffer} buffer  el audio tal como llegó
 * @param {string} mimeType  por ejemplo 'audio/ogg'
 * @param {object} config  la configuración del negocio, para sacar la clave
 * @returns {Promise<string>} el texto dicho
 */
async function transcribirConGemini(buffer, mimeType = 'audio/ogg', config = {}) {
  const clave = claveGemini(config);
  if (!clave) throw new Error('No hay clave de Gemini configurada');
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('El audio llegó vacío');

  const modelo = String(config.transcripcion_modelo || MODELO_POR_DEFECTO).trim();

  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
      {
        method: 'POST',
        signal: controlador.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `${CONTEXTO}\n\n${INSTRUCCION}` },
                { inlineData: { mimeType, data: buffer.toString('base64') } },
              ],
            },
          ],
          /*
            Temperatura en cero: esto no es una charla, es una transcripción.
            Queremos lo que dijo, no una versión mejorada de lo que dijo.
          */
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Gemini devolvió ${respuesta.status}: ${detalle.slice(0, 200)}`);
    }

    const datos = await respuesta.json();
    const texto = String(datos?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    if (!texto || texto === 'SIN_VOZ') throw new Error('No se detectó voz en el audio');

    logger.notice('Audio transcripto con Gemini', { modelo, caracteres: texto.length });
    return texto;
  } finally {
    clearTimeout(corte);
  }
}

module.exports = { transcribirConGemini };
