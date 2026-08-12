const { spawnSync } = require('child_process');
const db = require('../../server/db');
const { desencriptar } = require('../../server/utils/encryptConfig');

const CONTAINER = process.env.N8N_CONTAINER || 'n8n-n8n-1';
const CREDENTIAL_ID = process.env.N8N_MODEL_CREDENTIAL_ID || 'GeminiModoSabor1';
const PROJECT_ID = process.env.N8N_PROJECT_ID || 'PpbPwz8oCjgnJ6Z0';
const TEMP_FILE = '/tmp/modosabor-gemini-credential.json';

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

const row = db.prepare("SELECT valor FROM configuracion WHERE clave = 'gemini_api_key'").get();
const apiKey = desencriptar(row?.valor || '');
if (!apiKey) throw new Error('Gemini no tiene una API key configurada');

const credential = JSON.stringify([
  {
    id: CREDENTIAL_ID,
    name: 'Gemini Modo Sabor',
    type: 'googlePalmApi',
    data: {
      apiKey,
    },
  },
]);

// La clave viaja por stdin directamente al contenedor. Nunca se imprime ni
// se agrega al repositorio y el archivo temporal se elimina al terminar.
run('docker', ['exec', '-i', CONTAINER, 'sh', '-c', `cat > ${TEMP_FILE}`], {
  input: credential,
});
try {
  const output = run('docker', [
    'exec',
    CONTAINER,
    'n8n',
    'import:credentials',
    `--input=${TEMP_FILE}`,
    `--projectId=${PROJECT_ID}`,
  ]);
  console.log(output || 'Credencial Gemini sincronizada');
} finally {
  run('docker', ['exec', CONTAINER, 'rm', '-f', TEMP_FILE]);
}
