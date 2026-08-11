const crypto = require('crypto');

const db = require('../db');
const { getJwtSecret } = require('./authConfig');

/**
 * Firma de las propuestas del asistente.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * El asistente propone un cambio, el navegador lo muestra, el usuario confirma
 * y el servidor lo ejecuta. La pregunta es: cuando llega la confirmación, ¿cómo
 * sabe el servidor que está ejecutando lo mismo que el usuario vio?
 *
 * Si el navegador mandara de vuelta la propuesta en JSON, cualquiera con la
 * consola abierta podría cambiarla entre que se muestra y se confirma. La
 * pantalla diría "subir el stock de carne a 32 kilos" y lo que se ejecuta sería
 * otra cosa. La confirmación del usuario dejaría de significar nada.
 *
 * ── La solución ────────────────────────────────────────────────────────────
 *
 * La propuesta viaja firmada. El navegador la guarda y la devuelve tal cual,
 * pero no puede modificarla sin romper la firma, porque no tiene la clave.
 *
 * La firma incluye el id del usuario: una propuesta generada para uno no la
 * puede confirmar otro. Y vence a los diez minutos, para que no quede dando
 * vueltas una confirmación de ayer.
 *
 * ── Anti-replay ────────────────────────────────────────────────────────────
 *
 * Además, cada token se registra en la base al ser consumido. Un token ya
 * usado no se puede volver a usar, ni siquiera dentro de la ventana de 10
 * minutos.
 */

const VIGENCIA_MS = 10 * 60 * 1000;

function calcularFirma(cuerpoBase64) {
  return crypto.createHmac('sha256', getJwtSecret()).update(cuerpoBase64).digest('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Empaqueta y firma una propuesta.
 *
 * @param {object} propuesta  Qué acción y con qué argumentos.
 * @param {number|string} usuarioId  Quién la puede confirmar.
 * @returns {string} Token para devolver al confirmar.
 */
function firmarPropuesta(propuesta, usuarioId) {
  const cuerpo = {
    ...propuesta,
    usuarioId: String(usuarioId ?? ''),
    vence: Date.now() + VIGENCIA_MS,
  };
  const cuerpoBase64 = Buffer.from(JSON.stringify(cuerpo)).toString('base64url');
  return `${cuerpoBase64}.${calcularFirma(cuerpoBase64)}`;
}

/**
 * Devuelve la propuesta si el token es legítimo, o `null` si no.
 *
 * Nunca lanza: un token roto o manipulado es una respuesta de rechazo normal,
 * no una excepción.
 */
function verificarPropuesta(token, usuarioId) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2) return null;

  const [cuerpoBase64, firma] = partes;
  const esperada = calcularFirma(cuerpoBase64);

  /*
    Comparación en tiempo constante.

    Con un `===` común, el tiempo que tarda en fallar delata cuántos caracteres
    del principio acertó, y con suficientes intentos se puede reconstruir una
    firma válida. Es un ataque difícil, pero evitarlo cuesta una línea.
  */
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let cuerpo;
  try {
    cuerpo = JSON.parse(Buffer.from(cuerpoBase64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!cuerpo || typeof cuerpo !== 'object') return null;
  if (Number(cuerpo.vence || 0) < Date.now()) return null;
  // Una propuesta armada para otro usuario no vale, aunque la firma sea buena.
  if (String(cuerpo.usuarioId) !== String(usuarioId ?? '')) return null;

  // Anti-replay: ¿ya fue consumido?
  const tokenHash = hashToken(token);
  const yaConsumido = db
    .prepare('SELECT 1 FROM tokens_propuesta WHERE token_hash = ?')
    .get(tokenHash);
  if (yaConsumido) return null;

  // Marcar como consumido para evitar reutilización.
  db.prepare('INSERT INTO tokens_propuesta (token_hash, usuario_id, accion) VALUES (?, ?, ?)').run(
    tokenHash,
    String(usuarioId ?? ''),
    cuerpo.accion || ''
  );

  return cuerpo;
}

module.exports = { firmarPropuesta, verificarPropuesta, VIGENCIA_MS };
