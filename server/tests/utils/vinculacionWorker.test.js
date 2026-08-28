/**
 * Vincular el Worker con un botón.
 *
 * ── Qué se está cuidando ───────────────────────────────────────────────────
 *
 * El código de vinculación es lo único que separa a cualquiera de la clave del
 * Worker. Con esa clave se puede pedir trabajo al servidor y reportar
 * publicaciones como si uno fuera el Worker del local.
 *
 * Por eso el código dura cinco minutos, sirve una sola vez, y se borra apenas
 * se lee — incluso cuando venció. Un código reusable es un código que se saca
 * del historial del navegador y se usa mañana.
 */
const assert = require('assert');
const db = require('../../db');
const vinculacion = require('../../services/social/vinculacion');

/* Configuración de prueba. No es una credencial: es un valor inventado. */
const conClave = (fn) => {
  const antes = process.env.SOCIAL_WORKER_KEY;
  process.env.SOCIAL_WORKER_KEY = 'clave-de-prueba-no-real';
  try {
    return fn();
  } finally {
    process.env.SOCIAL_WORKER_KEY = antes || '';
  }
};

const filaDe = (codigo) =>
  db
    .prepare('SELECT valor FROM configuracion WHERE clave = ?')
    .get(`social_worker_vinculacion_${codigo}`);

module.exports = {
  'el código sirve una vez y devuelve la clave': () =>
    conClave(() => {
      const codigo = vinculacion.crearCodigo(7);
      const primera = vinculacion.canjearCodigo(codigo);

      assert.strictEqual(primera.clave, 'clave-de-prueba-no-real');
      assert.strictEqual(primera.usuarioId, 7, 'se sabe quién lo generó');
    }),

  'el segundo canje no sirve': () =>
    conClave(() => {
      const codigo = vinculacion.crearCodigo(1);
      vinculacion.canjearCodigo(codigo);

      assert.strictEqual(
        vinculacion.canjearCodigo(codigo),
        null,
        'un código reusable se saca del historial y se usa mañana'
      );
    }),

  'el código se borra de la base al usarse': () =>
    conClave(() => {
      const codigo = vinculacion.crearCodigo(1);
      assert.ok(filaDe(codigo), 'antes está');

      vinculacion.canjearCodigo(codigo);
      assert.strictEqual(filaDe(codigo), undefined, 'después no');
    }),

  'un código inventado no sirve': () =>
    conClave(() => {
      assert.strictEqual(vinculacion.canjearCodigo('cualquier-cosa'), null);
      assert.strictEqual(vinculacion.canjearCodigo(''), null);
      assert.strictEqual(vinculacion.canjearCodigo(undefined), null);
      assert.strictEqual(vinculacion.canjearCodigo(null), null);
    }),

  'un código vencido no sirve': () =>
    conClave(() => {
      const codigo = vinculacion.crearCodigo(1);

      /* Se lo envejece a mano: seis minutos, uno más que el tope. */
      db.prepare('UPDATE configuracion SET valor = ? WHERE clave = ?').run(
        JSON.stringify({ usuarioId: 1, creado: Date.now() - 6 * 60 * 1000 }),
        `social_worker_vinculacion_${codigo}`
      );

      assert.strictEqual(vinculacion.canjearCodigo(codigo), null);
    }),

  'un código vencido igual se borra al intentarlo': () =>
    conClave(() => {
      /*
        Usado es usado, aunque haya vencido. Si sólo se borrara al canjear con
        éxito, un código vencido quedaría en la base para siempre y alguien
        podría intentarlo mil veces sin costo.
      */
      const codigo = vinculacion.crearCodigo(1);
      db.prepare('UPDATE configuracion SET valor = ? WHERE clave = ?').run(
        JSON.stringify({ usuarioId: 1, creado: Date.now() - 6 * 60 * 1000 }),
        `social_worker_vinculacion_${codigo}`
      );

      vinculacion.canjearCodigo(codigo);
      assert.strictEqual(filaDe(codigo), undefined);
    }),

  'cada pedido genera un código distinto': () =>
    conClave(() => {
      const uno = vinculacion.crearCodigo(1);
      const otro = vinculacion.crearCodigo(1);

      assert.notStrictEqual(uno, otro, 'uno que se repite es uno que se adivina');
      assert.ok(uno.length >= 32, 'largo, para no poder probarlo a mano');
    }),

  'sin clave en el servidor se dice qué falta': () => {
    /*
      Este es un problema de quien instaló el sistema, no de quien apretó el
      botón. Por eso el mensaje trae el nombre de la variable.
    */
    const antes = process.env.SOCIAL_WORKER_KEY;
    process.env.SOCIAL_WORKER_KEY = '';
    try {
      const codigo = vinculacion.crearCodigo(1);
      assert.throws(() => vinculacion.canjearCodigo(codigo), /SOCIAL_WORKER_KEY/);
    } finally {
      process.env.SOCIAL_WORKER_KEY = antes || '';
    }
  },

  'los códigos viejos se limpian solos': () =>
    conClave(() => {
      /*
        Cada clic en "Vincular" que no se completa deja una fila. Sin limpieza
        la tabla de configuración se vuelve ilegible cuando hay que mirarla a
        mano.
      */
      const viejo = vinculacion.crearCodigo(1);
      db.prepare('UPDATE configuracion SET valor = ? WHERE clave = ?').run(
        JSON.stringify({ usuarioId: 1, creado: Date.now() - 60 * 60 * 1000 }),
        `social_worker_vinculacion_${viejo}`
      );

      const nuevo = vinculacion.crearCodigo(1);

      assert.strictEqual(filaDe(viejo), undefined, 'el viejo se fue');
      assert.ok(filaDe(nuevo), 'el nuevo sigue');
    }),

  // ── La dirección del servidor ───────────────────────────────────────────
  'la dirección sale del pedido, no de la configuración': () => {
    /*
      Este era el bug que tenía todo frenado: el `.env` del Worker decía
      `modosabor.com.ar` mientras el servidor corría en `localhost:3001`. El
      Worker preguntaba "¿hay trabajo?" a otro lado y nada fallaba.

      El servidor sabe su propia dirección. Preguntársela a la persona era
      pedirle que supiera algo que el programa ya sabe.
    */
    const antes = process.env.PUBLIC_API_URL;
    process.env.PUBLIC_API_URL = 'https://modosabor.com.ar';
    try {
      const url = vinculacion.direccionParaElWorker({
        protocol: 'http',
        headers: { host: 'localhost:3001' },
      });

      assert.strictEqual(url, 'http://localhost:3001/api/social-worker');
    } finally {
      process.env.PUBLIC_API_URL = antes || '';
    }
  },

  'sin host en el pedido se usa la configurada': () => {
    const antes = process.env.PUBLIC_API_URL;
    process.env.PUBLIC_API_URL = 'https://modosabor.com.ar/';
    try {
      const url = vinculacion.direccionParaElWorker({ headers: {} });
      assert.strictEqual(
        url,
        'https://modosabor.com.ar/api/social-worker',
        'y sin barra duplicada'
      );
    } finally {
      process.env.PUBLIC_API_URL = antes || '';
    }
  },
};
