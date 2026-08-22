const assert = require('assert');
const path = require('path');
const Module = require('module');
const Database = require('better-sqlite3');

function crearBase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE wa_contactos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT UNIQUE NOT NULL, telefono TEXT DEFAULT '',
      nombre TEXT DEFAULT '', foto TEXT DEFAULT '', ultimo_mensaje_en DATETIME, excluido INTEGER DEFAULT 0,
      origen TEXT DEFAULT '', creado_en DATETIME DEFAULT CURRENT_TIMESTAMP, actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE wa_excluidos (telefono TEXT PRIMARY KEY, motivo TEXT DEFAULT '', creado_en DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE wa_envios (id INTEGER PRIMARY KEY, telefono TEXT NOT NULL, estado TEXT DEFAULT 'pendiente');
    CREATE TABLE wa_respuestas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, telefono TEXT NOT NULL, texto TEXT DEFAULT '', es_baja INTEGER DEFAULT 0,
      mensaje_id TEXT DEFAULT '', recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_wa_respuestas_mensaje_id ON wa_respuestas(mensaje_id) WHERE mensaje_id <> '';
    CREATE TABLE whatsapp_conversaciones (
      id INTEGER PRIMARY KEY, telefono TEXT UNIQUE NOT NULL, nombre TEXT DEFAULT '',
      escalado_humano INTEGER DEFAULT 0, bot_silenciado INTEGER DEFAULT 0,
      bot_silenciado_hasta DATETIME, ultimo_mensaje_en DATETIME
    );
    CREATE TABLE whatsapp_mensajes (
      id INTEGER PRIMARY KEY, conversacion_id INTEGER, telefono TEXT NOT NULL,
      direccion TEXT NOT NULL, contenido TEXT DEFAULT '', creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

function cargarAgenda(db) {
  const root = path.resolve(__dirname, '../..');
  const rutaAgenda = `${root}/services/whatsappMasivo/agenda.js`;
  try {
    delete require.cache[require.resolve(rutaAgenda)];
  } catch {
    /* primera carga */
  }
  const original = Module._resolveFilename;
  Module._resolveFilename = function (requested, ...rest) {
    if (requested === '../../db') return 'db-agenda-falsa';
    return original.call(this, requested, ...rest);
  };
  require.cache['db-agenda-falsa'] = {
    id: 'db-agenda-falsa',
    filename: 'db-agenda-falsa',
    loaded: true,
    exports: db,
  };
  try {
    return require(rutaAgenda);
  } finally {
    Module._resolveFilename = original;
  }
}

function run() {
  const db = crearBase();
  const {
    audiencia,
    contarConversacionesEsperandoPersona,
    recuperarAgendaDesdeConversaciones,
    resumenSegmentos,
    sincronizarHistorial,
  } = cargarAgenda(db);
  const now = Math.floor(Date.now() / 1000);
  const historial = {
    chats: [{ id: '778899001122@lid', name: 'Ana desde chat', conversationTimestamp: now }],
    contacts: [
      {
        id: '778899001122@lid',
        lid: '778899001122@lid',
        phoneNumber: '5493815550001@s.whatsapp.net',
        name: 'Ana',
      },
    ],
    lidPnMappings: [{ lid: '778899001122@lid', pn: '5493815550001@s.whatsapp.net' }],
    messages: [
      {
        key: { id: 'historial-unico-1', remoteJid: '778899001122@lid', fromMe: false },
        messageTimestamp: now,
        message: { conversation: 'Hola, quiero pedir una milanesa' },
      },
    ],
  };

  const primero = sincronizarHistorial(historial, db);
  assert.strictEqual(primero.respuestas, 1, 'debe importar el mensaje entrante del historial');
  const contacto = db.prepare('SELECT * FROM wa_contactos').get();
  assert.strictEqual(contacto.telefono, '5493815550001', 'debe resolver @lid al teléfono real');
  assert.strictEqual(contacto.nombre, 'Ana', 'debe conservar el nombre del contacto');
  const item = audiencia(db).find((row) => row.telefono === '5493815550001');
  assert(item.segmentos.includes('pidio'), 'el historial debe construir segmento de pedido');
  assert(item.segmentos.includes('activo'), 'el chat reciente debe quedar activo');
  assert.strictEqual(resumenSegmentos(db).find((row) => row.id === 'pidio').total, 1);

  const segundo = sincronizarHistorial(historial, db);
  assert.strictEqual(segundo.respuestas, 0, 'un history sync repetido no duplica respuestas');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS total FROM wa_respuestas').get().total, 1);

  db.prepare(
    `INSERT INTO whatsapp_conversaciones
       (id, telefono, nombre, escalado_humano, bot_silenciado, bot_silenciado_hasta, ultimo_mensaje_en)
     VALUES
       (1, '3815550002', 'Carla', 1, 1, datetime('now', '-1 minute'), CURRENT_TIMESTAMP),
       (2, '5493815550003', 'Modo Sabor', 1, 1, NULL, CURRENT_TIMESTAMP),
       (3, 'numero-invalido', 'Inválido', 1, 1, datetime('now', '+10 minutes'), CURRENT_TIMESTAMP)`
  ).run();
  db.prepare(
    `INSERT INTO whatsapp_mensajes (id, conversacion_id, telefono, direccion, contenido)
     VALUES (9, 1, '3815550002', 'entrante', 'Quiero una pizza')`
  ).run();

  const recuperado = recuperarAgendaDesdeConversaciones(db);
  assert.strictEqual(recuperado.contactos, 2, 'debe recuperar sólo teléfonos válidos');
  assert.strictEqual(recuperado.omitidos, 1, 'debe informar los teléfonos dudosos omitidos');
  assert.strictEqual(recuperado.respuestas, 1, 'debe recuperar mensajes entrantes para segmentos');
  const sinNombreFalso = db
    .prepare("SELECT nombre FROM wa_contactos WHERE telefono = '5493815550003'")
    .get();
  assert.strictEqual(
    sinNombreFalso.nombre,
    '',
    'no debe publicar Modo Sabor como nombre del cliente'
  );
  assert.strictEqual(
    contarConversacionesEsperandoPersona(db),
    2,
    'el badge debe ignorar la pausa vencida y conservar las pausas futura e indefinida'
  );
  const repetido = recuperarAgendaDesdeConversaciones(db);
  assert.strictEqual(repetido.respuestas, 0, 'la recuperación repetida no duplica respuestas');
  console.log('OK agenda WhatsApp: historial, @lid, segmentos e idempotencia');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
