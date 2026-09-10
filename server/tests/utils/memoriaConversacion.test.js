const assert = require('assert');
const Database = require('better-sqlite3');
const { crearMemoriaConversacion } = require('../../services/memoriaConversacion');

function crearBase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE whatsapp_conversaciones (
      id INTEGER PRIMARY KEY,
      telefono TEXT UNIQUE,
      resumen_texto TEXT DEFAULT '',
      resumen_hasta_mensaje_id INTEGER DEFAULT 0,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE whatsapp_mensajes (
      id INTEGER PRIMARY KEY,
      conversacion_id INTEGER,
      direccion TEXT,
      contenido TEXT,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

async function run() {
  const db = crearBase();
  let resumentes = 0;
  const memoria = crearMemoriaConversacion(db, {
    resumir: async ({ mensajes, telefono }) => {
      resumentes += 1;
      return `resumen ${telefono}: ${mensajes.length}`;
    },
  });

  try {
    db.prepare(
      "INSERT INTO whatsapp_conversaciones (id, telefono) VALUES (1, '111'), (2, '222'), (3, '333')"
    ).run();
    const insertar = db.prepare(
      'INSERT INTO whatsapp_mensajes (conversacion_id, direccion, contenido, creado_en) VALUES (?, ?, ?, ?)'
    );
    for (let i = 1; i <= 13; i += 1) {
      insertar.run(1, 'entrante', `mensaje A ${i}`, '2099-01-01 00:00:00');
    }
    insertar.run(2, 'entrante', 'mensaje B', '2099-01-01 00:00:00');
    insertar.run(3, 'entrante', 'mensaje viejo', '2020-01-01 00:00:00');

    const contextoA = await memoria.obtenerContexto('111', { maxMensajes: 12 });
    assert.strictEqual(contextoA.mensajes.length, 12);
    assert.strictEqual(contextoA.resumen, 'resumen 111: 13');
    assert.strictEqual(resumentes, 1);
    assert.ok(contextoA.mensajes.every((m) => m.texto.includes('mensaje A')));

    await memoria.obtenerContexto('111', { maxMensajes: 12 });
    assert.strictEqual(resumentes, 1, 'El resumen guardado no se recalcula sin otro bloque nuevo');

    const contextoB = await memoria.obtenerContexto('222', { maxMensajes: 12 });
    assert.deepStrictEqual(
      contextoB.mensajes.map((m) => m.texto),
      ['mensaje B']
    );
    assert.strictEqual(contextoB.resumen, '');

    const inactiva = await memoria.obtenerContexto('333', {
      maxMensajes: 12,
      minutosInactividad: 120,
    });
    assert.strictEqual(inactiva.nueva, true);
    assert.deepStrictEqual(inactiva.mensajes, []);
    insertar.run(3, 'entrante', 'hola hoy', new Date().toISOString());
    const reinicio = await memoria.obtenerContexto('333');
    assert.deepStrictEqual(
      reinicio.mensajes.map((m) => m.texto),
      ['hola hoy']
    );

    console.log('memoriaConversacion.test.js OK');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
