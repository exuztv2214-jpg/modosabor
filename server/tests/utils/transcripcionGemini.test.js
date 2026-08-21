const assert = require('assert');

const { transcribirConGemini } = require('../../services/transcripcionGemini');

/**
 * Transcripción de audio con Gemini.
 *
 * Se prueba sin salir a internet: se reemplaza `fetch` por uno de mentira.
 * Lo que importa no es que Google conteste —eso es problema de Google— sino
 * que nosotros armemos bien el pedido y leamos bien la respuesta.
 *
 * Los cuatro casos son los que se vieron o se van a ver en producción:
 *
 * 1. Un audio normal, que devuelve el texto limpio.
 * 2. Un audio sin voz, que no puede devolver cadena vacía como si fuera texto
 *    válido: el agente contestaría sobre algo que nadie dijo.
 * 3. Sin clave configurada, que tiene que fallar claro y no mandar un pedido
 *    con la clave vacía.
 * 4. Que el audio viaje de verdad en el cuerpo del pedido. Es la falla que más
 *    caro sale: todo parece andar y el modelo transcribe el silencio.
 */
function run() {
  console.log('\nTests de transcripción con Gemini');

  const fetchOriginal = global.fetch;
  const audio = Buffer.from('un audio cualquiera');
  const config = { gemini_api_key: 'clave-de-prueba' };

  const respuestaCon = (texto) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
  });

  try {
    /* ── 1. Un audio normal ──────────────────────────────────────────── */
    let pedido = null;
    global.fetch = async (url, opciones) => {
      pedido = { url, opciones };
      return respuestaCon('  Quiero dos milanesas napolitanas  ');
    };

    return transcribirConGemini(audio, 'audio/ogg', config)
      .then(async (texto) => {
        assert.strictEqual(
          texto,
          'Quiero dos milanesas napolitanas',
          'devuelve el texto sin espacios de sobra'
        );

        /* ── 4. El audio viaja en el pedido ──────────────────────────── */
        const cuerpo = JSON.parse(pedido.opciones.body);
        const partes = cuerpo.contents[0].parts;
        const conAudio = partes.find((p) => p.inlineData);

        assert.ok(conAudio, 'el audio tiene que ir en el cuerpo del pedido');
        assert.strictEqual(
          conAudio.inlineData.data,
          audio.toString('base64'),
          'y tiene que ser el audio que nos dieron, no otro'
        );
        assert.strictEqual(conAudio.inlineData.mimeType, 'audio/ogg');
        assert.strictEqual(
          pedido.opciones.headers['x-goog-api-key'],
          'clave-de-prueba',
          'la clave va en el encabezado'
        );
        assert.match(
          pedido.url,
          /models\/gemini-3\.6-flash:generateContent$/,
          'usa el modelo de Gemini disponible actualmente'
        );
        assert.strictEqual(
          cuerpo.generationConfig.temperature,
          0,
          'temperatura en cero: se transcribe, no se redacta'
        );
        assert.match(
          partes[0].text,
          /Monteros/,
          'el apunte nombra el lugar, que es lo que más se transcribe mal'
        );
        console.log('  ✓ manda el audio y devuelve el texto limpio');

        /* ── 2. Un audio sin voz ─────────────────────────────────────── */
        global.fetch = async () => respuestaCon('SIN_VOZ');
        await assert.rejects(
          () => transcribirConGemini(audio, 'audio/ogg', config),
          /No se detectó voz/,
          'un audio mudo no puede pasar como transcripción vacía'
        );
        console.log('  ✓ un audio sin voz falla en vez de devolver vacío');

        /* ── 3. Sin clave ────────────────────────────────────────────── */
        let salio = false;
        global.fetch = async () => {
          salio = true;
          return respuestaCon('algo');
        };
        const sinClave = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        await assert.rejects(
          () => transcribirConGemini(audio, 'audio/ogg', {}),
          /clave de Gemini/,
          'sin clave tiene que decirlo'
        );
        if (sinClave !== undefined) process.env.GEMINI_API_KEY = sinClave;
        assert.strictEqual(salio, false, 'y no debe salir a la red sin clave');
        console.log('  ✓ sin clave avisa y no sale a la red');

        console.log('✅ Transcripción con Gemini verificada\n');
      })
      .finally(() => {
        global.fetch = fetchOriginal;
      });
  } catch (error) {
    global.fetch = fetchOriginal;
    throw error;
  }
}

if (require.main === module) run();

module.exports = { run };
