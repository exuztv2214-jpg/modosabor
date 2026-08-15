const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../db/migrations');
const { crearCarritoWhatsapp } = require('../../services/carritoWhatsapp');
const { createRealOrder } = require('../../utils/systemClient');

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
  db.prepare(
    `INSERT INTO productos (nombre, precio, variantes, extras, activo, stock_directo)
     VALUES ('Producto idempotente', 500000, '[]', '[]', 1, 50)`
  ).run();
  return db;
}

function dependenciasPedido(db) {
  return {
    buildPedidoPayload: async (body) => body,
    createPedidoWithInventory: (payload) => {
      const numero = Number(
        db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 numero FROM pedidos').get().numero
      );
      const result = db
        .prepare(
          `INSERT INTO pedidos
            (numero, cliente_telefono, items, subtotal, total, origen, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'whatsapp', ?)`
        )
        .run(
          numero,
          payload.cliente_telefono,
          JSON.stringify(payload.items),
          500000,
          500000,
          payload.idempotency_key || ''
        );
      return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(result.lastInsertRowid);
    },
    hydratePedido: (pedido) => pedido,
  };
}

async function run() {
  const db = crearBase();
  const producto = db
    .prepare("SELECT * FROM productos WHERE nombre = 'Producto idempotente'")
    .get();
  const cuerpo = {
    cliente_telefono: '5493815550101',
    items: [{ producto_id: producto.id, cantidad: 1 }],
    origen: 'whatsapp',
  };

  try {
    const deps = dependenciasPedido(db);
    const primero = await createRealOrder(
      db,
      { ...cuerpo, idempotencyKey: 'whatsapp:abc:1' },
      deps
    );
    const repetido = await createRealOrder(
      db,
      { ...cuerpo, idempotencyKey: 'whatsapp:abc:1' },
      deps
    );
    assert.strictEqual(repetido.id, primero.id);
    assert.strictEqual(
      db
        .prepare("SELECT COUNT(*) cantidad FROM pedidos WHERE idempotency_key = 'whatsapp:abc:1'")
        .get().cantidad,
      1
    );

    await createRealOrder(db, cuerpo, deps);
    await createRealOrder(db, cuerpo, deps);
    assert.strictEqual(
      db.prepare("SELECT COUNT(*) cantidad FROM pedidos WHERE idempotency_key = ''").get().cantidad,
      2,
      'Sin clave se conserva el comportamiento anterior'
    );

    const telefono = '5493815550202';
    const carrito = crearCarritoWhatsapp(db);
    carrito.agregarItem(telefono, { producto_id: producto.id, cantidad: 1 });
    const creado = await carrito.confirmarCarrito(
      telefono,
      { whatsappMessageId: 'confirmacion-1' },
      { createRealOrder, ...deps }
    );
    const segundaConfirmacion = await carrito.confirmarCarrito(
      telefono,
      { whatsappMessageId: 'confirmacion-1' },
      { createRealOrder, ...deps }
    );
    assert.strictEqual(segundaConfirmacion.id, creado.id);

    const telefonoFallido = '5493815550303';
    carrito.agregarItem(telefonoFallido, { producto_id: producto.id, cantidad: 1 });
    await assert.rejects(
      () =>
        carrito.confirmarCarrito(
          telefonoFallido,
          { whatsappMessageId: 'confirmacion-fallida' },
          {
            createRealOrder,
            ...deps,
            antesDeCerrar: () => {
              throw new Error('fallo simulado al cerrar');
            },
          }
        ),
      /fallo simulado/
    );
    assert.strictEqual(
      db
        .prepare(
          "SELECT COUNT(*) cantidad FROM pedidos WHERE idempotency_key = 'whatsapp:confirmacion-fallida:2'"
        )
        .get().cantidad,
      0,
      'La creación y el cierre se revierten juntos'
    );
    assert.strictEqual(
      db
        .prepare('SELECT pedido_id FROM whatsapp_pedidos_borrador WHERE telefono = ?')
        .get(telefonoFallido).pedido_id,
      null
    );

    console.log('idempotenciaPedido.test.js OK');
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
