const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { registrarMetricaAgente } = require('../../services/metricasAgente');

function run() {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE whatsapp_conversaciones (id INTEGER PRIMARY KEY, telefono TEXT UNIQUE);
      CREATE TABLE agente_metricas (
        id INTEGER PRIMARY KEY, conversacion_id INTEGER, telefono TEXT, mensaje_id TEXT,
        latencia_ms INTEGER, tokens_entrada INTEGER, tokens_salida INTEGER,
        proveedor TEXT, modelo TEXT, herramientas TEXT, error TEXT,
        handoff INTEGER, pedido_creado INTEGER, creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO whatsapp_conversaciones (id, telefono) VALUES (7, '5493815550000');
    `);
    registrarMetricaAgente(
      {
        telefono: '5493815550000',
        mensajeId: 'abc',
        latenciaMs: 850,
        tokensEntrada: 120,
        tokensSalida: 30,
        proveedor: 'personalizado',
        modelo: 'nvidia/test',
        herramientas: ['consultar_menu', 'agregar_item'],
        pedidoCreado: true,
      },
      db
    );
    const fila = db.prepare('SELECT * FROM agente_metricas').get();
    assert.strictEqual(fila.conversacion_id, 7);
    assert.strictEqual(fila.tokens_entrada, 120);
    assert.deepStrictEqual(JSON.parse(fila.herramientas), ['consultar_menu', 'agregar_item']);
    assert.strictEqual(fila.pedido_creado, 1);

    const route = fs.readFileSync(path.join(__dirname, '../../routes/whatsappMasivo.js'), 'utf8');
    const panel = fs.readFileSync(
      path.join(__dirname, '../../../client/src/components/Configuracion/SeccionWhatsapp.jsx'),
      'utf8'
    );
    assert.match(route, /latencia_promedio_ms/);
    assert.match(route, /herramientas_mas_usadas/);
    assert.match(panel, /Rendimiento del motor propio/);
    console.log('metricasAgente.test.js OK');
  } finally {
    db.close();
  }
}

if (require.main === module) run();

module.exports = { run };
