const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseEnv } = require('node:util');

function configurarMasivosLocal(env = process.env, root = path.resolve(__dirname, '..', '..')) {
  if (env.NODE_ENV === 'production' && env.MASIVOS_LOCAL !== '1') return;
  let guardado = {};
  try {
    guardado = parseEnv(fs.readFileSync(path.join(root, 'server', '.env'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (guardado.NODE_ENV === 'production' && env.MASIVOS_LOCAL !== '1') return;
  env.MODOSABOR_API_URL ||= guardado.MODOSABOR_API_URL || 'http://127.0.0.1:3001';
  if (!env.MASIVOS_PROXY_TOKEN && guardado.MASIVOS_PROXY_TOKEN) {
    env.MASIVOS_PROXY_TOKEN = guardado.MASIVOS_PROXY_TOKEN;
  }
  if (env.MASIVOS_PROXY_TOKEN) return;
  const file = path.join(root, '.launcher', 'masivos-proxy-token');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  env.MASIVOS_PROXY_TOKEN = fs.readFileSync(file, 'utf8').trim();
  if (!env.MASIVOS_PROXY_TOKEN) throw new Error('El token local de Masivos está vacío.');
}
module.exports = configurarMasivosLocal;
