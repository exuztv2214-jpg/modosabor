const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  MAX_AUDIO_SECONDS,
  transcribeFile,
  contenidoInterno,
  transcriptionErrorCode,
} = require('../../services/whatsappAudioTranscription');

function run() {
  console.log('\nTests de transcripción de audios de WhatsApp');
  assert.strictEqual(MAX_AUDIO_SECONDS, 180);
  assert.strictEqual(typeof transcribeFile, 'function');
  assert.ok(
    fs.existsSync(path.join(__dirname, '..', '..', 'scripts', 'transcribe-whatsapp-audio.py'))
  );
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /WhisperModel\('small'/);
  assert.doesNotMatch(dockerfile, /WhisperModel\('base'/);
  assert.ok(
    contenidoInterno({
      message: { viewOnceMessageV2: { message: { audioMessage: { seconds: 12 } } } },
    }).audioMessage,
    'debe detectar un audio dentro de view-once v2'
  );
  assert.strictEqual(
    transcriptionErrorCode({ code: 'WHATSAPP_AUDIO_DOWNLOAD' }),
    'media_download',
    'debe diferenciar una descarga fallida de una transcripción fallida'
  );
  console.log('  ✓ transcriptor presente, duración acotada y modelo small precargado');
  console.log('✅ Base de audios de WhatsApp verificada\n');
}

module.exports = { run };
