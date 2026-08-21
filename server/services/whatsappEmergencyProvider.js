const { spawnSync } = require('child_process');
const path = require('path');

const db = require('../db');
const { desencriptar } = require('../utils/encryptConfig');
const { conversarConProveedor } = require('./iaProveedor');

const projectRoot = path.resolve(__dirname, '..', '..');
const n8nDir = path.join(projectRoot, 'agente-whatsapp', 'n8n');

function configValue(key) {
  return String(
    db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(key)?.valor || ''
  );
}

function emergencyConfig() {
  const proveedor = configValue('whatsapp_emergencia_proveedor') || 'Emergencia';
  const usaGemini = /\b(?:google\s+)?gemini\b/i.test(proveedor);
  const baseConfigurada = configValue('whatsapp_emergencia_base_url').replace(/\/+$/, '');
  const modeloConfigurado = configValue('whatsapp_emergencia_modelo');
  const clavePropia = desencriptar(configValue('whatsapp_emergencia_api_key'));
  return {
    activa: configValue('whatsapp_emergencia_activa') === '1',
    proveedor,
    familia: usaGemini ? 'gemini' : 'openai',
    baseUrl: usaGemini
      ? /generativelanguage\.googleapis\.com/i.test(baseConfigurada)
        ? baseConfigurada
        : 'https://generativelanguage.googleapis.com/v1beta'
      : baseConfigurada,
    modelo: usaGemini && !/^gemini-/i.test(modeloConfigurado)
      ? 'gemini-2.5-flash'
      : modeloConfigurado,
    apiKey: usaGemini ? clavePropia || desencriptar(configValue('gemini_api_key')) : clavePropia,
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
  const response = await conversarConProveedor({
    sistema: 'Respondé solamente OK.',
    mensajes: [{ rol: 'usuario', texto: 'Probá la conexión.' }],
    herramientas: [],
    proveedor: {
      id: config.familia === 'gemini' ? 'gemini_whatsapp_emergencia' : 'whatsapp_emergencia',
      nombre: config.proveedor,
      familia: config.familia,
      baseUrl: config.baseUrl,
      modelo: config.modelo,
      clave: config.apiKey,
    },
  });
  const answer = String(response?.texto || '').trim();
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
  if (config.familia === 'gemini') {
    throw new Error(
      'Gemini ya queda listo para el motor propio de Chispita; no hace falta aplicarlo en n8n.'
    );
  }
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
