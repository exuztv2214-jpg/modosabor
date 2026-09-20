const path = require('path');

// Usar better-sqlite3 desde las dependencias del servidor
const betterSqlite3Path = path.join(__dirname, 'server', 'node_modules', 'better-sqlite3');
const Database = require(betterSqlite3Path);

const dbFile = path.join(__dirname, 'server', 'data', 'modosabor.db');
const db = new Database(dbFile, { readonly: true });

console.log('=== DIAGNÓSTICO DEL ASISTENTE IA ===\n');

// 1. Leer configuración
const configRows = db
  .prepare(
    "SELECT clave, valor FROM configuracion WHERE clave LIKE 'ia_%' OR clave LIKE 'gemini_%'"
  )
  .all();
const config = {};
configRows.forEach((r) => (config[r.clave] = r.valor));

console.log('Configuración guardada en la base de datos:');
console.log('  ia_proveedor:', config.ia_proveedor || '(no definido → usa gemini por defecto)');
console.log(
  '  ia_modelo:',
  config.ia_modelo || '(no definido → usa modelo por defecto del proveedor)'
);
console.log(
  '  ia_base_url:',
  config.ia_base_url || '(no definido → usa URL por defecto del proveedor)'
);
console.log('  ia_asistente_activo:', config.ia_asistente_activo || '0');
console.log(
  '  ia_api_key:',
  config.ia_api_key
    ? `${config.ia_api_key.slice(0, 8)}... (${config.ia_api_key.length} chars)`
    : '(no definida)'
);
console.log(
  '  gemini_api_key:',
  config.gemini_api_key
    ? `${config.gemini_api_key.slice(0, 8)}... (${config.gemini_api_key.length} chars)`
    : '(no definida)'
);
console.log(
  '  IA_API_KEY (env):',
  process.env.IA_API_KEY
    ? `${process.env.IA_API_KEY.slice(0, 8)}... (${process.env.IA_API_KEY.length} chars)`
    : '(no definida)'
);

// 2. Determinar proveedor activo
const proveedores = {
  gemini: {
    nombre: 'Google Gemini',
    familia: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modeloPorDefecto: 'gemini-2.5-flash',
    modelos: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  },
  anthropic: {
    nombre: 'Anthropic Claude',
    familia: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modeloPorDefecto: 'claude-sonnet-4-20250514',
    modelos: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
  },
  moonshot: {
    nombre: 'Kimi (Moonshot)',
    familia: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    modeloPorDefecto: 'kimi-k2-0711-preview',
    modelos: ['kimi-k2-0711-preview', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  deepseek: {
    nombre: 'DeepSeek',
    familia: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    modeloPorDefecto: 'deepseek-chat',
    modelos: ['deepseek-chat', 'deepseek-reasoner'],
  },
  groq: {
    nombre: 'Groq',
    familia: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    modeloPorDefecto: 'llama-3.3-70b-versatile',
    modelos: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  openrouter: {
    nombre: 'OpenRouter',
    familia: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    modeloPorDefecto: 'anthropic/claude-3.5-sonnet',
    modelos: [
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'deepseek/deepseek-chat',
    ],
  },
  xai: {
    nombre: 'xAI (Grok)',
    familia: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    modeloPorDefecto: 'grok-2-latest',
    modelos: ['grok-2-latest', 'grok-2-vision-latest'],
  },
  mistral: {
    nombre: 'Mistral',
    familia: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    modeloPorDefecto: 'mistral-small-latest',
    modelos: ['mistral-small-latest', 'mistral-large-latest', 'pixtral-12b-2409'],
  },
  together: {
    nombre: 'Together AI',
    familia: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    modeloPorDefecto: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    modelos: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
  },
  personalizado: {
    nombre: 'Otro (compatible con OpenAI)',
    familia: 'openai',
    baseUrl: '',
    modeloPorDefecto: '',
    modelos: [],
  },
};

const proveedorId = String(config.ia_proveedor || 'gemini').toLowerCase();
const proveedor = proveedores[proveedorId] || proveedores.gemini;

const clave = process.env.IA_API_KEY || config.ia_api_key || '';
const modelo = config.ia_modelo || proveedor.modeloPorDefecto;
const baseUrl = (() => {
  const guardada = String(config.ia_base_url || '').trim();
  const esDireccion = /^https?:\/\/.+/i.test(guardada);
  return (esDireccion ? guardada : proveedor.baseUrl || '').replace(/\/+$/, '');
})();

console.log('\n--- Proveedor activo ---');
console.log('  ID:', proveedorId);
console.log('  Nombre:', proveedor.nombre);
console.log('  Familia:', proveedor.familia);
console.log('  Modelo usado:', modelo);
console.log('  Base URL:', baseUrl);
console.log('  Clave presente:', clave ? 'SÍ' : 'NO');
console.log('  Asistente activo:', String(config.ia_asistente_activo || '0') === '1' ? 'SÍ' : 'NO');

// 3. Validaciones
console.log('\n=== VALIDACIONES ===');
let errores = 0;

if (!clave) {
  console.log('❌ ERROR: No hay clave de API configurada. Cargá una en Configuración → Asistente.');
  errores++;
} else if (clave.length < 20) {
  console.log('❌ ERROR: La clave parece demasiado corta (< 20 caracteres). Revisala.');
  errores++;
}

if (!baseUrl) {
  console.log('❌ ERROR: No hay dirección de API configurada.');
  errores++;
}

if (!modelo) {
  console.log('❌ ERROR: No hay modelo configurado.');
  errores++;
}

if (String(config.ia_asistente_activo || '0') !== '1') {
  console.log('⚠️  ADVERTENCIA: El asistente está apagado (ia_asistente_activo = 0).');
}

if (errores === 0) {
  console.log('✅ Todos los campos obligatorios están presentes.');
}

// 4. Probar conexión directamente
async function probarConexion() {
  console.log('\n=== PRUEBA DE CONEXIÓN DIRECTA ===');
  console.log('Haciendo request a', proveedor.nombre, '...');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let url, body, headers;

    if (proveedor.familia === 'gemini') {
      url = `${baseUrl}/models/${modelo}:generateContent`;
      body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Decí listo.' }] }],
        systemInstruction: { parts: [{ text: 'Respondé únicamente con la palabra: listo' }] },
      });
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': clave };
    } else if (proveedor.familia === 'anthropic') {
      url = `${baseUrl}/messages`;
      body = JSON.stringify({
        model: modelo,
        max_tokens: 10,
        system: 'Respondé únicamente con la palabra: listo',
        messages: [{ role: 'user', content: 'Decí listo.' }],
      });
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
      };
    } else {
      // openai-style (Kimi, DeepSeek, Groq, OpenRouter, etc.)
      url = `${baseUrl}/chat/completions`;
      body = JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: 'Respondé únicamente con la palabra: listo' },
          { role: 'user', content: 'Decí listo.' },
        ],
      });
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` };
    }

    const resp = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      const texto = await resp.text();
      console.log(`❌ ERROR: ${proveedor.nombre} respondió ${resp.status}`);
      console.log('  Respuesta:', texto.slice(0, 500));
      return;
    }

    const datos = await resp.json();
    let textoRespuesta = '';

    if (proveedor.familia === 'gemini') {
      const partes = datos?.candidates?.[0]?.content?.parts || [];
      textoRespuesta = partes
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('')
        .trim();
    } else if (proveedor.familia === 'anthropic') {
      const bloques = datos?.content || [];
      textoRespuesta = bloques
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    } else {
      textoRespuesta = String(datos?.choices?.[0]?.message?.content || '').trim();
    }

    console.log('✅ CONEXIÓN OK');
    console.log('  Respuesta del modelo:', textoRespuesta || '(vacía)');
    console.log('\n✅ El asistente debería funcionar desde el panel si guardás la configuración.');
  } catch (err) {
    clearTimeout(timeout);
    console.log('❌ ERROR de conexión:', err.message);
    if (
      err.message.includes('fetch failed') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('ECONNREFUSED')
    ) {
      console.log('  → Posible problema de red. Verificá que la URL de la API sea correcta.');
    }
    if (err.message.includes('abort')) {
      console.log('  → Timeout: el proveedor no respondió en 30 segundos.');
    }
  }
}

probarConexion().then(() => {
  console.log('\n=== FIN DEL DIAGNÓSTICO ===');
  process.exit(0);
});
