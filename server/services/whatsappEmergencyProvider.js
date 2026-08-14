const { spawnSync } = require('child_process');
const path = require('path');

const db = require('../db');
const { desencriptar } = require('../utils/encryptConfig');

const projectRoot = path.resolve(__dirname, '..', '..');
const n8nDir = path.join(projectRoot, 'agente-whatsapp', 'n8n');

function configValue(key) {
  return String(
    db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(key)?.valor || ''
  );
}

function emergencyConfig() {
  return {
    activa: configValue('whatsapp_emergencia_activa') === '1',
    proveedor: configValue('whatsapp_emergencia_proveedor') || 'Emergencia',
    baseUrl: configValue('whatsapp_emergencia_base_url').replace(/\/+$/, ''),
    modelo: configValue('whatsapp_emergencia_modelo'),
    apiKey: desencriptar(configValue('whatsapp_emergencia_api_key')),
  };
}

function validateConfig(config) {
  if (!config.baseUrl) throw new Error('Falta la dirección de la API de emergencia');
  if (!config.modelo) throw new Error('Falta el modelo de emergencia');
  if (!config.apiKey) throw new Error('Falta la clave de la API de emergencia');
}

async function testEmergencyProvider() {
  const config = emergencyConfig();
  validateConfig(config);
  const startedAt = Date.now();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelo,
      messages: [{ role: 'user', content: 'Respondé solamente OK' }],
      max_tokens: 8,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`El proveedor respondió ${response.status}: ${raw.slice(0, 180)}`);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error('El proveedor no devolvió JSON compatible con OpenAI');
  }
  const answer = String(body?.choices?.[0]?.message?.content || '').trim();
  if (!answer) throw new Error('El proveedor respondió sin contenido');
  return {
    ok: true,
    proveedor: config.proveedor,
    modelo: config.modelo,
    duracion_ms: Date.now() - startedAt,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || 'Falló la sincronización').trim());
  }
}

function applyEmergencyProvider() {
  const config = emergencyConfig();
  validateConfig(config);
  run(process.execPath, [path.join(n8nDir, 'sync-emergency-credential.js')]);
  run(process.execPath, [path.join(n8nDir, 'build-agent-workflow.js')]);
  run('docker', [
    'cp',
    path.join(n8nDir, 'workflow-agent-fallback.generated.json'),
    'n8n-n8n-1:/tmp/workflow-agent-fallback.generated.json',
  ]);
  run('docker', [
    'exec',
    'n8n-n8n-1',
    'n8n',
    'import:workflow',
    '--input=/tmp/workflow-agent-fallback.generated.json',
  ]);
  run('docker', [
    'exec',
    'n8n-n8n-1',
    'n8n',
    'update:workflow',
    '--id=ModoSaborFallbackNvidia1',
    '--active=true',
  ]);
  run('docker', ['restart', 'n8n-n8n-1']);
  return {
    ok: true,
    activa: config.activa,
    proveedor: config.proveedor,
    modelo: config.modelo,
  };
}

module.exports = {
  emergencyConfig,
  testEmergencyProvider,
  applyEmergencyProvider,
};
