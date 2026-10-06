/**
 * Vincular el Worker con un botón.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * Para que el Worker hablara con el servidor había que copiar a mano, desde un
 * archivo `.env` a una ventana: una "API Key", una "URL del servidor", una
 * "Chrome CDP URL" y un intervalo en milisegundos.
 *
 * Nada de eso significa algo para quien atiende un restaurante. Y el día que
 * la URL apuntaba a producción mientras el servidor corría en la PC, no había
 * ningún error: el Worker preguntaba "¿hay trabajo?" a otro lado y todo se
 * quedaba quieto, sin una sola pista de por qué.
 *
 * ── Cómo funciona ahora ────────────────────────────────────────────────────
 *
 * 1. En el panel apretás "Vincular esta PC".
 * 2. El servidor arma un código de un solo uso, que vive cinco minutos.
 * 3. El navegador abre `modosabor-social://vincular?servidor=…&codigo=…`.
 * 4. El Worker canjea el código por la clave, la guarda y arranca.
 *
 * ── Por qué un código y no la clave directamente ───────────────────────────
 *
 * Sería más corto mandar la clave en el link. Pero un link que se abre desde
 * el navegador queda en el historial, y en Windows los argumentos con los que
 * arranca un programa son visibles para cualquier otro programa de la máquina.
 *
 * La clave del Worker sirve para pedir trabajo y para reportar publicaciones:
 * no vence nunca y es la misma para todos los Workers. El código, en cambio,
 * dura cinco minutos, sirve una sola vez y no sirve para nada más. Si se
 * filtra, no pasa nada.
 *
 * Es el mismo razonamiento que el `state` del login con Facebook, y el mismo
 * que usa cualquier "vincular dispositivo" que hayas visto.
 */

const crypto = require('crypto');
const db = require('../../db');

/** Cinco minutos: lo que tarda alguien en apretar un botón y confirmar. */
const VIDA_MS = 5 * 60 * 1000;

const claveDe = (codigo) => `social_worker_vinculacion_${codigo}`;

/**
 * Un código nuevo, de un solo uso.
 *
 * Se guarda en `configuracion` y no en memoria a propósito: si el servidor se
 * reinicia entre que apretás el botón y que el Worker responde, un código en
 * memoria se habría perdido y el error sería "código inválido" sobre algo que
 * acabás de generar.
 */
function crearCodigo(usuarioId = null) {
  const codigo = crypto.randomBytes(16).toString('hex');

  db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(claveDe(codigo), JSON.stringify({ usuarioId, creado: Date.now() }));

  limpiarVencidos();
  return codigo;
}

/**
 * Canjea el código por la clave del Worker.
 *
 * Devuelve `null` si el código no existe, ya se usó o venció. Se borra apenas
 * se lee: un código que se puede usar dos veces es un código que se puede
 * robar del historial del navegador y usar después.
 */
function canjearCodigo(codigo) {
  const texto = String(codigo || '').trim();
  if (!texto) return null;

  const fila = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(claveDe(texto));
  if (!fila) return null;

  /* Se borra antes de validar la fecha: usado es usado, aunque haya vencido. */
  db.prepare('DELETE FROM configuracion WHERE clave = ?').run(claveDe(texto));

  let datos;
  try {
    datos = JSON.parse(fila.valor);
  } catch {
    return null;
  }

  if (!datos?.creado || Date.now() - Number(datos.creado) > VIDA_MS) return null;

  const clave = String(process.env.SOCIAL_WORKER_KEY || '').trim();
  if (!clave) {
    /*
      Sin clave configurada en el servidor no hay nada que entregar. Se dice
      así, con el nombre de la variable, porque este es un problema de quien
      instaló el sistema y no de quien apretó el botón.
    */
    throw new Error(
      'El servidor no tiene configurada SOCIAL_WORKER_KEY: sin eso el Worker no puede vincularse.'
    );
  }

  const ultimoComando = db
    .prepare('SELECT COALESCE(MAX(id), 0) AS id FROM social_worker_commands')
    .get();
  db.prepare(
    `INSERT INTO configuracion (clave, valor)
    VALUES ('social_worker_linked_after_command_id', ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(String(ultimoComando.id));

  return { clave, usuarioId: datos.usuarioId ?? null };
}

/**
 * Saca los códigos que ya no sirven.
 *
 * Sin esto, cada clic en "Vincular esta PC" que no se completa deja una fila
 * para siempre. No es un problema de espacio: es que la tabla de configuración
 * se vuelve ilegible cuando hace falta mirarla a mano.
 */
function limpiarVencidos() {
  const filas = db
    .prepare(
      "SELECT clave, valor FROM configuracion WHERE clave LIKE 'social_worker_vinculacion_%'"
    )
    .all();

  for (const fila of filas) {
    let creado = 0;
    try {
      creado = Number(JSON.parse(fila.valor)?.creado || 0);
    } catch {
      /* Ilegible: se borra igual, no hay forma de canjearlo. */
    }
    if (!creado || Date.now() - creado > VIDA_MS) {
      db.prepare('DELETE FROM configuracion WHERE clave = ?').run(fila.clave);
    }
  }
}

/**
 * La dirección que el Worker tiene que usar para hablar con este servidor.
 *
 * ── Por qué la decide el servidor y no el usuario ──────────────────────────
 *
 * Es el dato que estaba mal y tenía todo frenado: el `.env` del Worker decía
 * `modosabor.com.ar` mientras el servidor corría en `localhost:3001`.
 *
 * El servidor sabe su propia dirección sin que nadie se la diga. Preguntársela
 * a la persona era pedirle que supiera algo que el programa ya sabe.
 */
function direccionParaElWorker(req) {
  const configurada = String(process.env.PUBLIC_API_URL || '');

  /*
    En desarrollo `PUBLIC_API_URL` suele apuntar a la IP de la red local
    (192.168.x.x) para que el celular pueda entrar. El Worker corre en la misma
    máquina que el servidor, así que para él siempre es más confiable el host
    por el que llegó el pedido.
  */
  const delPedido = req?.headers?.host ? `${req.protocol}://${req.headers.host}` : '';

  /*
    La barra final se recorta acá y en ningún otro lado.

    Antes se recortaba dos veces —al leer la variable y al armar la dirección—
    y la segunda nunca hacía nada. Lo descubrí sacándola: los tests siguieron
    en verde, que es la definición de código que no hace falta.

    Con una sola normalización, sacarla pone un test en rojo.
  */
  const base = delPedido || configurada;
  return `${base.replace(/\/+$/, '')}/api/social-worker`;
}

module.exports = {
  crearCodigo,
  canjearCodigo,
  limpiarVencidos,
  direccionParaElWorker,
  VIDA_MS,
};
