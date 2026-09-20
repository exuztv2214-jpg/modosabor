const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../db/migrations');
const { crearCarritoWhatsapp } = require('../../services/carritoWhatsapp');
const { cancelarPedidoDeCliente } = require('../../services/cancelacionWhatsapp');
const {
  exigirConfirmacionCancelacion,
  pidioConfirmarCancelacion,
} = require('../../services/registroHerramientas');

const TELEFONO = '5493815551234';

function crearBase() {
  const db = new Database(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');
  const indexes = [];
  const tables = schema.replace(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b[\s\S]*?;\s*$/gim,
    (statement) => {
      indexes.push(statement);
      return '';
    }
  );
  db.exec(tables);
  runMigrations(db);
  db.exec(indexes.join('\n'));
  db.prepare("INSERT INTO whatsapp_conversaciones (telefono, nombre) VALUES (?, 'Prueba')").run(
    TELEFONO
  );
  return db;
}

function crearPedido(db, estado) {
  const numero = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 n FROM pedidos').get().n;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO pedidos (numero, cliente_telefono, items, subtotal, total, estado, origen)
       VALUES (?, ?, '[]', 100000, 100000, ?, 'whatsapp')`
    )
    .run(numero, TELEFONO, estado);
  return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(lastInsertRowid);
}

function run() {
  console.log('\nTests de cancelación y hora de retiro por WhatsApp');
  const db = crearBase();
  try {
    // ── La hora de retiro se guarda normalizada ──────────────────────────────
    const carrito = crearCarritoWhatsapp(db);
    carrito.actualizarDatos(TELEFONO, { tipo_entrega: 'retiro', hora_entrega: '13.30' });
    assert.strictEqual(
      carrito.verCarrito(TELEFONO).hora_entrega,
      '13:30',
      'la hora tiene que quedar en HH:MM para que la comanda se lea de un vistazo'
    );

    // Una hora que no se entiende no se inventa: queda vacía, o sea "cuanto antes".
    carrito.actualizarDatos(TELEFONO, { hora_entrega: 'a la tardecita' });
    assert.strictEqual(
      carrito.verCarrito(TELEFONO).hora_entrega,
      '13:30',
      'un texto ilegible no puede pisar una hora que ya estaba bien'
    );
    console.log('  ✓ la hora de retiro se guarda normalizada y no se inventa');

    // ── Cancelar exige que Chispita haya preguntado ──────────────────────────
    assert.ok(pidioConfirmarCancelacion('¿Confirmás que cancelo tu pedido?'));
    assert.ok(!pidioConfirmarCancelacion('¿Querés agregar una bebida?'));
    assert.throws(
      () =>
        exigirConfirmacionCancelacion({
          mensajeActual: 'si',
          ultimoMensajeAsistente: '¿Querés agregar una bebida?',
        }),
      /preguntá explícitamente/i,
      'un "sí" después de otra pregunta no puede cancelar un pedido'
    );
    exigirConfirmacionCancelacion({
      mensajeActual: 'si',
      ultimoMensajeAsistente: '¿Confirmás que cancelo tu pedido?',
    });
    console.log('  ✓ un "sí" suelto no alcanza para cancelar');

    // ── Se cancela mientras nadie cocinó ─────────────────────────────────────
    const nuevo = crearPedido(db, 'nuevo');
    const resultado = cancelarPedidoDeCliente(db, TELEFONO, { motivo: 'me arrepentí' });
    assert.strictEqual(resultado.ok, true);
    assert.strictEqual(resultado.numero, nuevo.numero);
    const cancelado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(nuevo.id);
    assert.strictEqual(cancelado.estado, 'cancelado');
    assert.match(cancelado.motivo_cancelacion, /arrepent/i);
    console.log('  ✓ un pedido sin empezar se cancela y deja el motivo');

    // ── Con la cocina en marcha, decide una persona ──────────────────────────
    crearPedido(db, 'preparando');
    assert.throws(
      () => cancelarPedidoDeCliente(db, TELEFONO, { motivo: 'ya no lo quiero' }),
      (error) => error.requiereHumano === true && /preparaci[oó]n/i.test(error.message),
      'con la comida en curso la IA no puede cancelar sola'
    );
    console.log('  ✓ con la cocina en marcha no cancela: deriva');

    console.log('✅ Cancelación y hora de retiro verificadas');
  } finally {
    db.close();
  }
}

if (require.main === module) run();

module.exports = { run };
