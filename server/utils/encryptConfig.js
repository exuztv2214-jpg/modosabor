const crypto = require('crypto');
const { getJwtSecret } = require('./authConfig');

/**
 * Encriptación de configuraciones sensibles en la base de datos.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * Las claves de API (IA_API_KEY, GEMINI_API_KEY) se guardan en la tabla
 * `configuracion` en texto plano. Cualquiera con acceso al archivo SQLite
 * puede leerlas.
 *
 * ── La solución ────────────────────────────────────────────────────────────
 *
 * Encriptar las claves sensibles con AES-256-GCM antes de guardarlas.
 * La clave de encriptación se deriva del JWT_SECRET, que ya debe ser fuerte.
 *
 * Formato del valor encriptado:
 *   enc:<base64(iv+authTag+ciphertext)>
 *
 * Esto permite detectar fácilmente si un valor está encriptado (prefijo `enc:`)
 * y desencriptarlo cuando el servidor lo necesita.
 */

const PREFIX = 'enc:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function deriveKey() {
  const secret = getJwtSecret();
  return crypto.createHash('sha256').update(secret).digest();
}

function encriptar(textoPlano) {
  if (!textoPlano) return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(textoPlano), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return `${PREFIX}${combined.toString('base64')}`;
}

function desencriptar(textoEncriptado) {
  if (!textoEncriptado || !String(textoEncriptado).startsWith(PREFIX)) {
    // No está encriptado: devolver tal cual (compatibilidad hacia atrás)
    return textoEncriptado || '';
  }
  const key = deriveKey();
  const combined = Buffer.from(String(textoEncriptado).slice(PREFIX.length), 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function estaEncriptado(valor) {
  return String(valor || '').startsWith(PREFIX);
}

module.exports = {
  encriptar,
  desencriptar,
  estaEncriptado,
  PREFIX,
};
