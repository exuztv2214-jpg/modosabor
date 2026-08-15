const assert = require('assert');
const fs = require('fs');
const path = require('path');
const audioService = require('../../services/whatsappAudioTranscription');

function run() {
  assert.strictEqual(typeof audioService.transcribeAudioBuffer, 'function');
  const route = fs.readFileSync(path.join(__dirname, '../../routes/asistente.js'), 'utf8');
  const client = fs.readFileSync(
    path.join(__dirname, '../../../client/src/components/Asistente/AsistenteFlotante.jsx'),
    'utf8'
  );
  assert.match(route, /transcribeAudioBuffer/);
  assert.match(route, /data:audio/);
  assert.match(client, /MediaRecorder/);
  assert.match(client, /Dictar por audio/);
  console.log('audioAsistente.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
