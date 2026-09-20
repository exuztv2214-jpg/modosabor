const db = require('../db');
const { desencriptar } = require('../utils/encryptConfig');
const { conversarConProveedor } = require('./iaProveedor');

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
    modelo:
      usaGemini && !/^gemini-/i.test(modeloConfigurado)
        ? 'gemini-3.5-flash-lite'
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

module.exports = {
  emergencyConfig,
  testEmergencyProvider,
};
