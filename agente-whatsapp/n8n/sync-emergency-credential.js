const { spawnSync } = require('child_process');

const db = require('../../server/db');
const { desencriptar } = require('../../server/utils/encryptConfig');

const CONTAINER = process.env.N8N_CONTAINER || 'n8n-n8n-1';
const CREDENTIAL_ID = process.env.N8N_FALLBACK_CREDENTIAL_ID || 'ModoSaborEmergencyOpenAi1';
const PROJECT_ID = process.env.N8N_PROJECT_ID || 'PpbPwz8oCjgnJ6Z0';
const TEMP_FILE = '/tmp/modosabor-whatsapp-emergency.json';

function configValue(key) {
  return String(
    db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(key)?.valor || ''
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || 'Falló el comando').trim());
  }
  return String(result.stdout || '').trim();
}

const apiKey = desencriptar(configValue('whatsapp_emergencia_api_key'));
const baseUrl = configValue('whatsapp_emergencia_base_url').replace(/\/+$/, '');
if (!apiKey || !baseUrl) throw new Error('Faltan la clave o la dirección de la API de emergencia');

const credential = JSON.stringify([
  {
    id: CREDENTIAL_ID,
    name: 'WhatsApp Emergencia',
    type: 'openAiApi',
    data: { apiKey, url: baseUrl },
  },
]);

// La clave entra al contenedor exclusivamente por stdin y el temporal se
// elimina incluso si n8n rechaza la credencial.
run('docker', ['exec', '-i', CONTAINER, 'sh', '-c', `cat > ${TEMP_FILE}`], {
  input: credential,
});
try {
  console.log(
    run('docker', [
      'exec',
      CONTAINER,
      'n8n',
      'import:credentials',
      `--input=${TEMP_FILE}`,
      `--projectId=${PROJECT_ID}`,
    ]) || 'Credencial de emergencia sincronizada'
  );
} finally {
  run('docker', ['exec', CONTAINER, 'rm', '-f', TEMP_FILE]);
}
